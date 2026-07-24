import { describe, expect, it } from "vitest";
import { executeInvoice, executePurchase, voidDoc, INVOICE_CFG } from "../src/lib/commercePosting";
import { journalTotals, newTenantDb, seedContact, seedProduct, stockLevel, WH_UTAMA } from "./helpers/memdb";

/**
 * Fase 14a — uji mesin siklus penjualan/pembelian (`lib/commercePosting.ts`)
 * terhadap SQLite in-memory beskema produksi. Ini jalur di mana SEMUA faktur &
 * pembelian membuat jurnal double-entry + menggerakkan stok; sebelumnya 0 test.
 */

async function unwrap<T extends Record<string, unknown>>(p: Promise<T | { error: string }>): Promise<T> {
  const r = await p;
  if ("error" in r) throw new Error(`tak terduga error: ${r.error}`);
  return r as T;
}

describe("executePurchase", () => {
  it("memposting pembelian: subtotal/PPN/total benar, stok masuk, jurnal seimbang", async () => {
    const db = await newTenantDb();
    const supplier = await seedContact(db, { type: "supplier" });
    const prod = await seedProduct(db, { buyPrice: 5000 });
    const res = await unwrap(
      executePurchase(db, { contactId: supplier, warehouseId: WH_UTAMA, invoiceDate: "2026-07-01", taxRate: 11, lines: [{ productId: prod, qty: 10, unitPrice: 5000 }] }, "u1"),
    );
    expect(res.total).toBe(55_500); // 50.000 + PPN 11% 5.500
    expect(res.docNo).toBe("PB-00001");

    const lvl = await stockLevel(db, prod);
    expect(lvl).toEqual({ qty: 10, avgCost: 5000 });

    const inv = await db.prepare(`SELECT subtotal, tax_amount, total, journal_entry_id FROM purchases WHERE id = ?`).bind(res.purchaseId).first<{ subtotal: number; tax_amount: number; total: number; journal_entry_id: string }>();
    expect(inv).toMatchObject({ subtotal: 50_000, tax_amount: 5_500, total: 55_500 });
    const jt = await journalTotals(db, inv!.journal_entry_id);
    expect(jt.debit).toBe(jt.credit);
    expect(jt.debit).toBe(55_500); // persediaan 50.000 + PPN masukan 5.500 = hutang 55.500
  });

  it("moving-average: pembelian kedua pada harga berbeda merata-ratakan biaya", async () => {
    const db = await newTenantDb();
    const supplier = await seedContact(db, { type: "supplier" });
    const prod = await seedProduct(db);
    await unwrap(executePurchase(db, { contactId: supplier, warehouseId: WH_UTAMA, invoiceDate: "2026-07-01", taxRate: 0, lines: [{ productId: prod, qty: 10, unitPrice: 5000 }] }, "u1"));
    await unwrap(executePurchase(db, { contactId: supplier, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 0, lines: [{ productId: prod, qty: 10, unitPrice: 7000 }] }, "u1"));
    expect(await stockLevel(db, prod)).toEqual({ qty: 20, avgCost: 6000 });
  });

  it("menolak pemasok yang bukan pemasok / kontak tak ada", async () => {
    const db = await newTenantDb();
    const customer = await seedContact(db, { type: "customer" });
    const prod = await seedProduct(db);
    const wrongType = await executePurchase(db, { contactId: customer, warehouseId: WH_UTAMA, invoiceDate: "2026-07-01", taxRate: 0, lines: [{ productId: prod, qty: 1, unitPrice: 100 }] }, "u1");
    expect(wrongType).toEqual({ error: "Kontak tersebut bukan pemasok." });
    const noContact = await executePurchase(db, { contactId: "tak-ada", warehouseId: WH_UTAMA, invoiceDate: "2026-07-01", taxRate: 0, lines: [{ productId: prod, qty: 1, unitPrice: 100 }] }, "u1");
    expect(noContact).toEqual({ error: "Kontak tidak ditemukan." });
  });
});

describe("executeInvoice", () => {
  async function withStock(qty = 10, buyPrice = 5000) {
    const db = await newTenantDb();
    const supplier = await seedContact(db, { type: "supplier", name: "Pemasok" });
    const customer = await seedContact(db, { type: "customer", name: "Pelanggan" });
    const prod = await seedProduct(db, { sellPrice: 8000, buyPrice });
    await unwrap(executePurchase(db, { contactId: supplier, warehouseId: WH_UTAMA, invoiceDate: "2026-07-01", taxRate: 0, lines: [{ productId: prod, qty, unitPrice: buyPrice }] }, "u1"));
    return { db, customer, prod };
  }

  it("menjual barang berstok: pendapatan + HPP + stok berkurang, jurnal seimbang", async () => {
    const { db, customer, prod } = await withStock();
    const res = await unwrap(executeInvoice(db, { contactId: customer, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 0, lines: [{ productId: prod, qty: 4, unitPrice: 8000 }] }, "u1"));
    expect(res.total).toBe(32_000);
    expect(res.docNo).toBe("INV-00001");
    expect((await stockLevel(db, prod)).qty).toBe(6);
    const inv = await db.prepare(`SELECT journal_entry_id FROM invoices WHERE id = ?`).bind(res.invoiceId).first<{ journal_entry_id: string }>();
    const jt = await journalTotals(db, inv!.journal_entry_id);
    // Piutang 32.000 + HPP 20.000 (debit) = Pendapatan 32.000 + Persediaan 20.000 (kredit).
    expect(jt.debit).toBe(52_000);
    expect(jt.credit).toBe(52_000);
  });

  it("diskon per baris: nilai & PPN mengikuti harga setelah diskon", async () => {
    const { db, customer, prod } = await withStock();
    const res = await unwrap(executeInvoice(db, { contactId: customer, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 11, lines: [{ productId: prod, qty: 2, unitPrice: 10_000, discountPct: 25 }] }, "u1"));
    // 2×10.000×0,75 = 15.000; PPN 11% = 1.650; total 16.650.
    expect(res.total).toBe(16_650);
    const inv = await db.prepare(`SELECT subtotal, tax_amount FROM invoices WHERE id = ?`).bind(res.invoiceId).first<{ subtotal: number; tax_amount: number }>();
    expect(inv).toMatchObject({ subtotal: 15_000, tax_amount: 1_650 });
  });

  it("produk jasa: tanpa gerakan stok & tanpa HPP", async () => {
    const db = await newTenantDb();
    const customer = await seedContact(db, { type: "customer" });
    const svc = await seedProduct(db, { isService: true, sellPrice: 100_000 });
    const res = await unwrap(executeInvoice(db, { contactId: customer, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 0, lines: [{ productId: svc, qty: 1, unitPrice: 100_000 }] }, "u1"));
    expect(res.total).toBe(100_000);
    // Tidak ada level stok untuk produk jasa.
    expect(await stockLevel(db, svc)).toEqual({ qty: 0, avgCost: 0 });
    const inv = await db.prepare(`SELECT journal_entry_id FROM invoices WHERE id = ?`).bind(res.invoiceId).first<{ journal_entry_id: string }>();
    const lineCount = await db.prepare(`SELECT COUNT(*) AS n FROM journal_lines WHERE entry_id = ?`).bind(inv!.journal_entry_id).first<{ n: number }>();
    expect(lineCount?.n).toBe(2); // hanya piutang & pendapatan
  });

  it("stok tak cukup → error, tanpa faktur & tanpa perubahan stok", async () => {
    const { db, customer, prod } = await withStock(5, 5000);
    const res = await executeInvoice(db, { contactId: customer, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 0, lines: [{ productId: prod, qty: 100, unitPrice: 8000 }] }, "u1");
    expect("error" in res).toBe(true);
    const n = await db.prepare(`SELECT COUNT(*) AS n FROM invoices`).first<{ n: number }>();
    expect(n?.n).toBe(0);
    expect((await stockLevel(db, prod)).qty).toBe(5);
  });

  it("total nol ditolak", async () => {
    const db = await newTenantDb();
    const customer = await seedContact(db, { type: "customer" });
    const svc = await seedProduct(db, { isService: true });
    const res = await executeInvoice(db, { contactId: customer, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 0, lines: [{ productId: svc, qty: 1, unitPrice: 0 }] }, "u1");
    expect(res).toEqual({ error: "Total faktur tidak boleh nol." });
  });

  it("kontak pemasok tak boleh dipakai sebagai pelanggan", async () => {
    const db = await newTenantDb();
    const supplier = await seedContact(db, { type: "supplier" });
    const prod = await seedProduct(db);
    const res = await executeInvoice(db, { contactId: supplier, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 0, lines: [{ productId: prod, qty: 1, unitPrice: 100 }] }, "u1");
    expect(res).toEqual({ error: "Kontak tersebut bukan pelanggan." });
  });

  it("valas tanpa kurs ditolak", async () => {
    const db = await newTenantDb();
    const customer = await seedContact(db, { type: "customer" });
    const svc = await seedProduct(db, { isService: true });
    const res = await executeInvoice(db, { contactId: customer, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 0, currency: "USD", lines: [{ productId: svc, qty: 1, unitPrice: 10 }] }, "u1");
    expect(res).toEqual({ error: "Kurs wajib diisi untuk faktur valas." });
  });
});

describe("voidDoc", () => {
  it("membatalkan faktur: jurnal pembalik + stok pulih persis", async () => {
    const db = await newTenantDb();
    const supplier = await seedContact(db, { type: "supplier" });
    const customer = await seedContact(db, { type: "customer" });
    const prod = await seedProduct(db, { sellPrice: 8000, buyPrice: 5000 });
    await unwrap(executePurchase(db, { contactId: supplier, warehouseId: WH_UTAMA, invoiceDate: "2026-07-01", taxRate: 0, lines: [{ productId: prod, qty: 10, unitPrice: 5000 }] }, "u1"));
    const inv = await unwrap(executeInvoice(db, { contactId: customer, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 0, lines: [{ productId: prod, qty: 4, unitPrice: 8000 }] }, "u1"));
    expect((await stockLevel(db, prod)).qty).toBe(6);

    const res = await voidDoc(db, INVOICE_CFG, inv.invoiceId, "u1");
    expect("error" in res).toBe(false);
    // Stok kembali 10, dokumen bertanda dibatalkan.
    expect((await stockLevel(db, prod)).qty).toBe(10);
    const row = await db.prepare(`SELECT voided_at FROM invoices WHERE id = ?`).bind(inv.invoiceId).first<{ voided_at: string | null }>();
    expect(row?.voided_at).toBeTruthy();
    // Total debit = total kredit di seluruh buku (asli + pembalik saling meniadakan).
    const all = await db.prepare(`SELECT COALESCE(SUM(debit),0) AS d, COALESCE(SUM(credit),0) AS c FROM journal_lines`).first<{ d: number; c: number }>();
    expect(all?.d).toBe(all?.c);
  });

  it("faktur yang sudah dibayar tak bisa di-void", async () => {
    const db = await newTenantDb();
    const supplier = await seedContact(db, { type: "supplier" });
    const customer = await seedContact(db, { type: "customer" });
    const prod = await seedProduct(db, { sellPrice: 8000, buyPrice: 5000 });
    await unwrap(executePurchase(db, { contactId: supplier, warehouseId: WH_UTAMA, invoiceDate: "2026-07-01", taxRate: 0, lines: [{ productId: prod, qty: 10, unitPrice: 5000 }] }, "u1"));
    const inv = await unwrap(executeInvoice(db, { contactId: customer, warehouseId: WH_UTAMA, invoiceDate: "2026-07-02", taxRate: 0, lines: [{ productId: prod, qty: 4, unitPrice: 8000 }] }, "u1"));
    await db.prepare(`UPDATE invoices SET paid_amount = 10000 WHERE id = ?`).bind(inv.invoiceId).run();
    const res = await voidDoc(db, INVOICE_CFG, inv.invoiceId, "u1");
    expect(res).toMatchObject({ status: 400 });
  });

  it("void dokumen tak ada → 404", async () => {
    const db = await newTenantDb();
    const res = await voidDoc(db, INVOICE_CFG, "tak-ada", "u1");
    expect(res).toMatchObject({ status: 404 });
  });
});

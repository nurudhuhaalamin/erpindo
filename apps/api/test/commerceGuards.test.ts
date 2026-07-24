import { describe, expect, it } from "vitest";
import {
  approvalThreshold,
  checkPeriodOpen,
  checkProject,
  INVOICE_CFG,
  PURCHASE_CFG,
  resolveCurrency,
  validateRefs,
} from "../src/lib/commercePosting";
import { newTenantDb, seedContact, seedProduct, WH_UTAMA } from "./helpers/memdb";

/**
 * Fase 14i — uji penjaga integritas terekspor di `lib/commercePosting.ts` yang
 * dipakai SETIAP posting faktur/pembelian tetapi belum tercakup 14a:
 * `resolveCurrency` (valas), `checkPeriodOpen` (tutup buku), `approvalThreshold`,
 * `checkProject`, dan `validateRefs` (kontak/gudang/produk). Guard yang salah
 * bisa meloloskan dokumen cacat, jadi diuji terpisah dari alur posting penuh.
 */

describe("resolveCurrency", () => {
  it("IDR atau kosong → kurs 1", async () => {
    const db = await newTenantDb();
    expect(await resolveCurrency(db)).toEqual({ currency: "IDR", rate: 1 });
    expect(await resolveCurrency(db, "idr")).toEqual({ currency: "IDR", rate: 1 }); // dinormalkan
  });

  it("valas tanpa kurs (atau kurs ≤ 0) ditolak", async () => {
    const db = await newTenantDb();
    expect(await resolveCurrency(db, "USD")).toEqual({ error: expect.stringContaining("Kurs wajib") });
    expect(await resolveCurrency(db, "USD", 0)).toEqual({ error: expect.stringContaining("Kurs wajib") });
    expect(await resolveCurrency(db, "USD", -5)).toEqual({ error: expect.stringContaining("Kurs wajib") });
  });

  it("valas belum terdaftar ditolak; terdaftar + kurs > 0 diterima", async () => {
    const db = await newTenantDb();
    expect(await resolveCurrency(db, "USD", 16000)).toEqual({
      error: expect.stringContaining("belum terdaftar"),
    });
    await db.prepare(`INSERT INTO currencies (code, name, rate) VALUES ('USD', 'Dolar AS', 16000)`).run();
    // Kurs dari input pembayaran dipakai (bukan kurs master) — dinormalkan huruf besar.
    expect(await resolveCurrency(db, "usd", 16250)).toEqual({ currency: "USD", rate: 16250 });
  });
});

describe("checkPeriodOpen", () => {
  it("tanpa tutup buku → lolos (null)", async () => {
    const db = await newTenantDb();
    expect(await checkPeriodOpen(db, "2026-07-01")).toBeNull();
  });

  it("tanggal ≤ periode terkunci ditolak; setelahnya lolos", async () => {
    const db = await newTenantDb();
    await db
      .prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('locked_before', '2026-06-30', datetime('now'))`)
      .run();
    expect(await checkPeriodOpen(db, "2026-06-30")).toContain("sudah ditutup"); // batas inklusif
    expect(await checkPeriodOpen(db, "2026-06-15")).toContain("sudah ditutup");
    expect(await checkPeriodOpen(db, "2026-07-01")).toBeNull();
  });
});

describe("approvalThreshold", () => {
  it("tanpa setelan → 0 (nonaktif)", async () => {
    const db = await newTenantDb();
    expect(await approvalThreshold(db)).toBe(0);
  });

  it("membaca angka dari settings; nilai tak valid → 0", async () => {
    const db = await newTenantDb();
    await db
      .prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('approval_threshold_purchase', '5000000', datetime('now'))`)
      .run();
    expect(await approvalThreshold(db)).toBe(5_000_000);
    await db.prepare(`UPDATE settings SET value = 'abc' WHERE key = 'approval_threshold_purchase'`).run();
    expect(await approvalThreshold(db)).toBe(0);
  });
});

describe("checkProject", () => {
  it("tanpa proyek → null; proyek tak ada → error; proyek ada → null", async () => {
    const db = await newTenantDb();
    expect(await checkProject(db)).toBeNull();
    expect(await checkProject(db, "tidak-ada")).toBe("Proyek tidak ditemukan.");
    await db
      .prepare(`INSERT INTO projects (id, code, name, created_by) VALUES ('p1', 'PRJ-1', 'Proyek A', 'u1')`)
      .run();
    expect(await checkProject(db, "p1")).toBeNull();
  });
});

describe("validateRefs", () => {
  it("kontak tak ada / salah jenis / diarsipkan ditolak", async () => {
    const db = await newTenantDb();
    const prod = await seedProduct(db);
    // Kontak tak ada.
    expect(
      await validateRefs(db, INVOICE_CFG, { contactId: "x", warehouseId: WH_UTAMA, lines: [{ productId: prod }] }),
    ).toBe("Kontak tidak ditemukan.");
    // Pemasok dipakai untuk faktur jual → bukan pelanggan.
    const supplier = await seedContact(db, { type: "supplier" });
    expect(
      await validateRefs(db, INVOICE_CFG, { contactId: supplier, warehouseId: WH_UTAMA, lines: [{ productId: prod }] }),
    ).toBe("Kontak tersebut bukan pelanggan.");
    // Pelanggan dipakai untuk pembelian → bukan pemasok.
    const customer = await seedContact(db, { type: "customer" });
    expect(
      await validateRefs(db, PURCHASE_CFG, { contactId: customer, warehouseId: WH_UTAMA, lines: [{ productId: prod }] }),
    ).toBe("Kontak tersebut bukan pemasok.");
    // Kontak diarsipkan → dianggap tak ada.
    await db.prepare(`UPDATE contacts SET is_archived = 1 WHERE id = ?`).bind(customer).run();
    expect(
      await validateRefs(db, INVOICE_CFG, { contactId: customer, warehouseId: WH_UTAMA, lines: [{ productId: prod }] }),
    ).toBe("Kontak tidak ditemukan.");
  });

  it("gudang tak ada & produk tak ada/diarsipkan ditolak; semua valid → null", async () => {
    const db = await newTenantDb();
    const customer = await seedContact(db, { type: "customer" });
    const prod = await seedProduct(db);
    // Gudang salah.
    expect(
      await validateRefs(db, INVOICE_CFG, { contactId: customer, warehouseId: "wh-x", lines: [{ productId: prod }] }),
    ).toBe("Gudang tidak ditemukan.");
    // Produk tak ada.
    expect(
      await validateRefs(db, INVOICE_CFG, { contactId: customer, warehouseId: WH_UTAMA, lines: [{ productId: "no" }] }),
    ).toBe("Ada produk yang tidak ditemukan atau diarsipkan.");
    // Produk diarsipkan.
    await db.prepare(`UPDATE products SET is_archived = 1 WHERE id = ?`).bind(prod).run();
    expect(
      await validateRefs(db, INVOICE_CFG, { contactId: customer, warehouseId: WH_UTAMA, lines: [{ productId: prod }] }),
    ).toBe("Ada produk yang tidak ditemukan atau diarsipkan.");
    // Semua valid → null. Kontak "both" sah untuk faktur & pembelian.
    const both = await seedContact(db, { type: "both" });
    const prod2 = await seedProduct(db, { sku: "SKU-OK" });
    expect(
      await validateRefs(db, INVOICE_CFG, { contactId: both, warehouseId: WH_UTAMA, lines: [{ productId: prod2 }] }),
    ).toBeNull();
  });
});

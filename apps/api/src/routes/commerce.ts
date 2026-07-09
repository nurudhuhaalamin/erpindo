import {
  createInvoiceSchema,
  createPaymentSchema,
  createPurchaseSchema,
  stockAdjustmentSchema,
  stockTransferSchema,
  type ApiCommerceDoc,
  type CreateInvoiceInput,
  type CreatePurchaseInput,
  type ApiCommerceLine,
  type ApiStockLevel,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { SqlExecutor } from "@erpindo/db";
import type { AppEnv } from "../env";
import {
  accountIdByCode,
  getLockedBefore,
  InsufficientStockError,
  nextDocNo,
  PeriodLockedError,
  postJournal,
  stockIn,
  stockOut,
  SYS_ACCOUNTS,
} from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Siklus penjualan & pembelian. Setiap dokumen otomatis:
 *  - membuat jurnal double-entry (piutang/pendapatan/PPN atau persediaan/hutang)
 *  - menggerakkan stok (keluar dengan HPP moving-average, masuk dengan biaya beli)
 * Dokumen terposting immutable, sama seperti jurnal.
 */

type DocTable = {
  table: "invoices" | "purchases";
  lineTable: "invoice_lines" | "purchase_lines";
  fk: "invoice_id" | "purchase_id";
  noColumn: "invoice_no" | "purchase_no";
  dateColumn: "invoice_date" | "purchase_date";
  prefix: string;
  contactTypes: string[];
};

const INVOICE_CFG: DocTable = {
  table: "invoices",
  lineTable: "invoice_lines",
  fk: "invoice_id",
  noColumn: "invoice_no",
  dateColumn: "invoice_date",
  prefix: "INV",
  contactTypes: ["customer", "both"],
};

const PURCHASE_CFG: DocTable = {
  table: "purchases",
  lineTable: "purchase_lines",
  fk: "purchase_id",
  noColumn: "purchase_no",
  dateColumn: "purchase_date",
  prefix: "PB",
  contactTypes: ["supplier", "both"],
};

async function listDocs(db: SqlExecutor, cfg: DocTable): Promise<ApiCommerceDoc[]> {
  const { results: docs } = await db
    .prepare(
      `SELECT d.id, d.${cfg.noColumn} AS doc_no, d.contact_id, c.name AS contact_name,
              d.${cfg.dateColumn} AS date, d.due_date, d.status, d.subtotal, d.tax_rate,
              d.tax_amount, d.total, d.paid_amount, d.returned_amount, d.currency, d.exchange_rate, d.foreign_total,
              d.voided_at
       FROM ${cfg.table} d JOIN contacts c ON c.id = d.contact_id
       ORDER BY d.created_at DESC LIMIT 200`,
    )
    .all<{
      id: string;
      doc_no: string;
      contact_id: string;
      contact_name: string;
      date: string;
      due_date: string | null;
      status: "posted" | "paid";
      subtotal: number;
      tax_rate: number;
      tax_amount: number;
      total: number;
      paid_amount: number;
      returned_amount: number;
      currency: string;
      exchange_rate: number;
      foreign_total: number;
      voided_at: string | null;
    }>();

  const { results: lines } = await db
    .prepare(
      `SELECT l.id, l.${cfg.fk} AS doc_id, l.product_id, p.name AS product_name,
              l.description, l.qty, l.unit_price, l.amount
       FROM ${cfg.lineTable} l JOIN products p ON p.id = l.product_id`,
    )
    .all<{
      id: string;
      doc_id: string;
      product_id: string;
      product_name: string;
      description: string | null;
      qty: number;
      unit_price: number;
      amount: number;
    }>();

  const byDoc = new Map<string, ApiCommerceLine[]>();
  for (const l of lines) {
    const list = byDoc.get(l.doc_id) ?? [];
    list.push({
      id: l.id,
      productId: l.product_id,
      productName: l.product_name,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unit_price,
      amount: l.amount,
    });
    byDoc.set(l.doc_id, list);
  }

  return docs.map((d) => ({
    id: d.id,
    docNo: d.doc_no,
    contactId: d.contact_id,
    contactName: d.contact_name,
    date: d.date,
    dueDate: d.due_date,
    status: d.status,
    subtotal: d.subtotal,
    taxRate: d.tax_rate,
    taxAmount: d.tax_amount,
    total: d.total,
    paidAmount: d.paid_amount,
    returnedAmount: d.returned_amount,
    currency: d.currency,
    exchangeRate: d.exchange_rate,
    foreignTotal: d.foreign_total,
    voidedAt: d.voided_at,
    lines: byDoc.get(d.id) ?? [],
  }));
}

/** Bila dokumen ditag ke proyek, pastikan proyeknya ada. */
async function checkProject(db: SqlExecutor, projectId?: string): Promise<string | null> {
  if (!projectId) return null;
  const { results } = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).all();
  return results[0] ? null : "Proyek tidak ditemukan.";
}

/**
 * Resolusi mata uang & kurs faktur. IDR (atau kosong) → kurs 1. Valas → wajib
 * kurs > 0 dan mata uang terdaftar. Mengembalikan {currency, rate} atau error.
 */
async function resolveCurrency(
  db: SqlExecutor,
  currency?: string,
  exchangeRate?: number,
): Promise<{ currency: string; rate: number } | { error: string }> {
  const code = (currency ?? "IDR").toUpperCase();
  if (code === "IDR") return { currency: "IDR", rate: 1 };
  if (!exchangeRate || exchangeRate <= 0) return { error: "Kurs wajib diisi untuk faktur valas." };
  const { results } = await db.prepare(`SELECT code FROM currencies WHERE code = ?`).bind(code).all();
  if (!results[0]) return { error: `Mata uang ${code} belum terdaftar.` };
  return { currency: code, rate: exchangeRate };
}

/** Tolak dokumen bertanggal pada periode yang sudah ditutup buku. */
async function checkPeriodOpen(db: SqlExecutor, date: string): Promise<string | null> {
  const lockedBefore = await getLockedBefore(db);
  if (lockedBefore && date <= lockedBefore) {
    return `Periode sampai ${lockedBefore} sudah ditutup — transaksi bertanggal ${date} ditolak.`;
  }
  return null;
}

/** Ambang persetujuan pembelian dari settings tenant (0 = nonaktif). */
async function approvalThreshold(db: SqlExecutor): Promise<number> {
  const { results } = await db
    .prepare(`SELECT value FROM settings WHERE key = 'approval_threshold_purchase'`)
    .all<{ value: string }>();
  return Number(results[0]?.value ?? 0) || 0;
}

/**
 * Posting faktur pembelian (jurnal + baris + stok masuk). Dipakai jalur
 * langsung maupun saat Owner menyetujui permintaan — satu implementasi.
 */
async function executePurchase(
  db: SqlExecutor,
  input: CreatePurchaseInput,
  userId: string,
): Promise<{ purchaseId: string; docNo: string; total: number } | { error: string }> {
  const refError = (await validateRefs(db, PURCHASE_CFG, input)) ?? (await checkProject(db, input.projectId));
  if (refError) return { error: refError };
  const lockError = await checkPeriodOpen(db, input.invoiceDate);
  if (lockError) return { error: lockError };

  // Produk berpelacakan kedaluwarsa wajib menyertakan tanggal exp per baris.
  const trackedIds = [...new Set(input.lines.map((l) => l.productId))];
  const { results: tracked } = await db
    .prepare(
      `SELECT id FROM products WHERE track_expiry = 1 AND id IN (${trackedIds.map(() => "?").join(",")})`,
    )
    .bind(...trackedIds)
    .all<{ id: string }>();
  const trackedSet = new Set(tracked.map((t) => t.id));
  for (const line of input.lines) {
    if (trackedSet.has(line.productId) && !line.expiryDate) {
      return { error: "Produk ini melacak kedaluwarsa — isi tanggal exp (dan lot) pada barisnya." };
    }
  }

  const cur = await resolveCurrency(db, input.currency, input.exchangeRate);
  if ("error" in cur) return { error: cur.error };

  const idrLines = input.lines.map((l) => {
    const unitIdr = Math.round(l.unitPrice * cur.rate);
    return { ...l, unitIdr, amountIdr: l.qty * unitIdr };
  });
  const foreignSubtotal = input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const foreignTotal = foreignSubtotal + Math.round((foreignSubtotal * input.taxRate) / 100);
  const subtotal = idrLines.reduce((s, l) => s + l.amountIdr, 0);
  const taxAmount = Math.round((subtotal * input.taxRate) / 100);
  const total = subtotal + taxAmount;
  if (total === 0) return { error: "Total faktur tidak boleh nol." };

  const [persediaan, ppnMasukan, hutang] = await Promise.all([
    accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
    accountIdByCode(db, SYS_ACCOUNTS.PPN_MASUKAN),
    accountIdByCode(db, SYS_ACCOUNTS.HUTANG),
  ]);

  const purchaseId = crypto.randomUUID();
  const docNo = await nextDocNo(db, "purchases", "PB");
  const journal = await postJournal(db, {
    entryDate: input.invoiceDate,
    memo: `Faktur pembelian ${docNo}`,
    createdBy: userId,
    projectId: input.projectId,
    lines: [
      { accountId: persediaan, description: docNo, debit: subtotal, credit: 0 },
      ...(taxAmount > 0 ? [{ accountId: ppnMasukan, description: `PPN ${docNo}`, debit: taxAmount, credit: 0 }] : []),
      { accountId: hutang, description: docNo, debit: 0, credit: total },
    ],
  });

  await db
    .prepare(
      `INSERT INTO purchases (id, purchase_no, contact_id, purchase_date, due_date, status, subtotal,
                              tax_rate, tax_amount, total, paid_amount, journal_entry_id, created_by,
                              currency, exchange_rate, foreign_total)
       VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    )
    .bind(
      purchaseId,
      docNo,
      input.contactId,
      input.invoiceDate,
      input.dueDate ?? null,
      subtotal,
      input.taxRate,
      taxAmount,
      total,
      journal.id,
      userId,
      cur.currency,
      cur.rate,
      foreignTotal,
    )
    .run();
  for (const line of idrLines) {
    await db
      .prepare(
        `INSERT INTO purchase_lines (id, purchase_id, product_id, description, qty, unit_price, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        purchaseId,
        line.productId,
        line.description ?? null,
        line.qty,
        line.unitPrice,
        line.qty * line.unitPrice,
      )
      .run();
    await stockIn(db, {
      productId: line.productId,
      warehouseId: input.warehouseId,
      qty: line.qty,
      unitCost: line.unitPrice,
      refType: "purchase",
      refId: purchaseId,
      lot: line.expiryDate || line.lotNo ? { lotNo: line.lotNo ?? null, expiryDate: line.expiryDate ?? null } : undefined,
    });
  }
  return { purchaseId, docNo, total };
}

/**
 * Posting faktur penjualan (stok keluar + jurnal + baris). Dipakai jalur
 * langsung `POST /invoices` maupun konversi penawaran (CRM) — satu implementasi
 * sehingga akuntansi & pergerakan stok terjadi tepat sekali dan konsisten.
 */
export async function executeInvoice(
  db: SqlExecutor,
  input: CreateInvoiceInput,
  userId: string,
): Promise<{ invoiceId: string; docNo: string; total: number } | { error: string }> {
  const refError = (await validateRefs(db, INVOICE_CFG, input)) ?? (await checkProject(db, input.projectId));
  if (refError) return { error: refError };
  const lockError = await checkPeriodOpen(db, input.invoiceDate);
  if (lockError) return { error: lockError };

  const cur = await resolveCurrency(db, input.currency, input.exchangeRate);
  if ("error" in cur) return { error: cur.error };

  // Nilai baris dikonversi ke IDR pada kurs posting (buku selalu IDR).
  // foreign_total menyimpan total dalam mata uang faktur untuk jejak & selisih kurs.
  const idrLines = input.lines.map((l) => {
    const unitIdr = Math.round(l.unitPrice * cur.rate);
    return { ...l, unitIdr, amountIdr: l.qty * unitIdr };
  });
  const foreignSubtotal = input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const foreignTotal = foreignSubtotal + Math.round((foreignSubtotal * input.taxRate) / 100);
  const subtotal = idrLines.reduce((s, l) => s + l.amountIdr, 0);
  const taxAmount = Math.round((subtotal * input.taxRate) / 100);
  const total = subtotal + taxAmount;
  if (total === 0) return { error: "Total faktur tidak boleh nol." };

  const invoiceId = crypto.randomUUID();

  // Produk jasa tidak menggerakkan stok/HPP. Ambil daftar produk jasa dulu.
  const lineProductIds = [...new Set(input.lines.map((l) => l.productId))];
  const { results: svc } = await db
    .prepare(`SELECT id FROM products WHERE is_service = 1 AND id IN (${lineProductIds.map(() => "?").join(",")})`)
    .bind(...lineProductIds)
    .all<{ id: string }>();
  const serviceIds = new Set(svc.map((s) => s.id));

  // Stok keluar dulu (bisa gagal karena stok kurang) — sebelum jurnal dibuat.
  let totalCogs = 0;
  try {
    for (const line of input.lines) {
      if (serviceIds.has(line.productId)) continue;
      totalCogs += await stockOut(db, {
        productId: line.productId,
        warehouseId: input.warehouseId,
        qty: line.qty,
        refType: "sale",
        refId: invoiceId,
      });
    }
  } catch (err) {
    if (err instanceof InsufficientStockError) return { error: err.message };
    throw err;
  }

  const [piutang, pendapatan, ppnKeluaran, hpp, persediaan] = await Promise.all([
    accountIdByCode(db, SYS_ACCOUNTS.PIUTANG),
    accountIdByCode(db, SYS_ACCOUNTS.PENDAPATAN),
    accountIdByCode(db, SYS_ACCOUNTS.PPN_KELUARAN),
    accountIdByCode(db, SYS_ACCOUNTS.HPP),
    accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
  ]);

  const docNo = await nextDocNo(db, "invoices", "INV");
  const journal = await postJournal(db, {
    entryDate: input.invoiceDate,
    memo: `Faktur penjualan ${docNo}`,
    createdBy: userId,
    projectId: input.projectId,
    lines: [
      { accountId: piutang, description: docNo, debit: total, credit: 0 },
      { accountId: pendapatan, description: docNo, debit: 0, credit: subtotal },
      ...(taxAmount > 0 ? [{ accountId: ppnKeluaran, description: `PPN ${docNo}`, debit: 0, credit: taxAmount }] : []),
      ...(totalCogs > 0
        ? [
            { accountId: hpp, description: `HPP ${docNo}`, debit: totalCogs, credit: 0 },
            { accountId: persediaan, description: `HPP ${docNo}`, debit: 0, credit: totalCogs },
          ]
        : []),
    ],
  });

  await db
    .prepare(
      `INSERT INTO invoices (id, invoice_no, contact_id, invoice_date, due_date, status, subtotal,
                             tax_rate, tax_amount, total, paid_amount, journal_entry_id, created_by,
                             currency, exchange_rate, foreign_total)
       VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
    )
    .bind(
      invoiceId,
      docNo,
      input.contactId,
      input.invoiceDate,
      input.dueDate ?? null,
      subtotal,
      input.taxRate,
      taxAmount,
      total,
      journal.id,
      userId,
      cur.currency,
      cur.rate,
      foreignTotal,
    )
    .run();
  for (const line of idrLines) {
    await db
      .prepare(
        `INSERT INTO invoice_lines (id, invoice_id, product_id, description, qty, unit_price, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        invoiceId,
        line.productId,
        line.description ?? null,
        line.qty,
        line.unitIdr,
        line.amountIdr,
      )
      .run();
  }
  return { invoiceId, docNo, total };
}

/** Validasi rujukan bersama: kontak (jenis sesuai), gudang, produk aktif. */
async function validateRefs(
  db: SqlExecutor,
  cfg: DocTable,
  input: { contactId: string; warehouseId: string; lines: { productId: string }[] },
): Promise<string | null> {
  const { results: contacts } = await db
    .prepare(`SELECT type FROM contacts WHERE id = ? AND is_archived = 0`)
    .bind(input.contactId)
    .all<{ type: string }>();
  if (!contacts[0]) return "Kontak tidak ditemukan.";
  if (!cfg.contactTypes.includes(contacts[0].type)) {
    return cfg.table === "invoices" ? "Kontak tersebut bukan pelanggan." : "Kontak tersebut bukan pemasok.";
  }

  const { results: wh } = await db
    .prepare(`SELECT id FROM warehouses WHERE id = ? AND is_archived = 0`)
    .bind(input.warehouseId)
    .all();
  if (!wh[0]) return "Gudang tidak ditemukan.";

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const { results: products } = await db
    .prepare(
      `SELECT id FROM products WHERE is_archived = 0 AND id IN (${productIds.map(() => "?").join(",")})`,
    )
    .bind(...productIds)
    .all<{ id: string }>();
  if (products.length !== productIds.length) return "Ada produk yang tidak ditemukan atau diarsipkan.";
  return null;
}

/**
 * Pembatalan (void) dokumen: jurnal pembalik persis (debit↔kredit ditukar,
 * tanggal = tanggal dokumen asal sehingga gerbang tutup buku tetap berlaku)
 * + stok dikembalikan berdasarkan mutasi asal pada biaya asal — neraca dan
 * nilai persediaan kembali eksak seperti sebelum dokumen diposting.
 *
 * Hanya dokumen tanpa pembayaran & tanpa retur yang bisa dibatalkan; untuk
 * pembelian, stoknya juga harus belum bergerak (belum terjual/ditransfer).
 */
async function voidDoc(
  db: SqlExecutor,
  cfg: DocTable,
  docId: string,
  userId: string,
): Promise<{ docNo: string; reversalEntryNo: string } | { error: string; status: 400 | 404 }> {
  const { results: docs } = await db
    .prepare(
      `SELECT ${cfg.noColumn} AS doc_no, ${cfg.dateColumn} AS date, paid_amount, returned_amount,
              voided_at, journal_entry_id
       FROM ${cfg.table} WHERE id = ?`,
    )
    .bind(docId)
    .all<{
      doc_no: string;
      date: string;
      paid_amount: number;
      returned_amount: number;
      voided_at: string | null;
      journal_entry_id: string;
    }>();
  const doc = docs[0];
  if (!doc) return { error: "Dokumen tidak ditemukan.", status: 404 };
  if (doc.voided_at) return { error: "Dokumen sudah dibatalkan sebelumnya.", status: 400 };
  if (doc.paid_amount > 0) {
    return { error: "Dokumen sudah menerima pembayaran — batalkan lewat Retur, bukan void.", status: 400 };
  }
  if (doc.returned_amount > 0) {
    return { error: "Dokumen sudah memiliki retur — tidak bisa dibatalkan.", status: 400 };
  }

  const { results: movements } = await db
    .prepare(
      `SELECT rowid AS row_id, product_id, warehouse_id, qty, unit_cost
       FROM stock_movements WHERE ref_type = ? AND ref_id = ?`,
    )
    .bind(cfg.table === "invoices" ? "sale" : "purchase", docId)
    .all<{ row_id: number; product_id: string; warehouse_id: string; qty: number; unit_cost: number }>();

  if (cfg.table === "purchases" && movements.length > 0) {
    // Stok hasil pembelian ini harus masih utuh: tidak boleh ada mutasi lain
    // yang lebih baru pada produk+gudang yang sama (sudah terjual/ditransfer/
    // dibeli lagi → biaya rata-rata sudah tercampur, koreksi harus via retur).
    const productIds = [...new Set(movements.map((m) => m.product_id))];
    const { results: tracked } = await db
      .prepare(`SELECT id FROM products WHERE track_expiry = 1 AND id IN (${productIds.map(() => "?").join(",")})`)
      .bind(...productIds)
      .all<{ id: string }>();
    if (tracked.length > 0) {
      return { error: "Pembelian berisi produk berpelacakan lot/kedaluwarsa — gunakan Retur Pembelian.", status: 400 };
    }
    for (const m of movements) {
      const { results: later } = await db
        .prepare(
          `SELECT 1 AS x FROM stock_movements
           WHERE product_id = ? AND warehouse_id = ? AND rowid > ?
             AND NOT (ref_type = 'purchase' AND ref_id = ?) LIMIT 1`,
        )
        .bind(m.product_id, m.warehouse_id, m.row_id, docId)
        .all<{ x: number }>();
      if (later[0]) {
        return { error: "Stok dari pembelian ini sudah bergerak — gunakan Retur Pembelian untuk koreksi.", status: 400 };
      }
    }
  }

  // Jurnal pembalik: baris asal ditukar debit↔kredit, tanggal ikut dokumen
  // asal — bila periodenya sudah ditutup, PeriodLockedError memblokir void.
  const { results: origLines } = await db
    .prepare(`SELECT account_id, description, debit, credit FROM journal_lines WHERE entry_id = ?`)
    .bind(doc.journal_entry_id)
    .all<{ account_id: string; description: string | null; debit: number; credit: number }>();
  if (origLines.length < 2) return { error: "Jurnal asal dokumen tidak ditemukan.", status: 400 };

  let reversal: { id: string; entryNo: string };
  try {
    reversal = await postJournal(db, {
      entryDate: doc.date,
      memo: `Pembatalan ${doc.doc_no}`,
      createdBy: userId,
      lines: origLines.map((l) => ({
        accountId: l.account_id,
        description: `Pembatalan ${doc.doc_no}${l.description ? ` — ${l.description}` : ""}`,
        debit: l.credit,
        credit: l.debit,
      })),
    });
  } catch (err) {
    if (err instanceof PeriodLockedError) {
      return { error: `${err.message} Gunakan Retur untuk koreksi di periode berjalan.`, status: 400 };
    }
    throw err;
  }

  const voidRefId = crypto.randomUUID();
  if (cfg.table === "invoices") {
    // Kembalikan stok terjual pada biaya asal (unit_cost mutasi penjualan),
    // sehingga nilai persediaan kembali persis — bukan pada avg_cost kini.
    for (const m of movements) {
      await stockIn(db, {
        productId: m.product_id,
        warehouseId: m.warehouse_id,
        qty: -m.qty, // mutasi penjualan tercatat negatif
        unitCost: m.unit_cost,
        refType: "adjustment",
        refId: voidRefId,
      });
    }
  } else {
    // Stok pembelian masih utuh (sudah dijaga di atas) → keluarkan kembali
    // persis qty & biaya asal. Level dihitung manual agar nilai eksak.
    for (const m of movements) {
      await db
        .prepare(
          `INSERT INTO stock_movements (id, product_id, warehouse_id, ref_type, ref_id, qty, unit_cost)
           VALUES (?, ?, ?, 'adjustment', ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), m.product_id, m.warehouse_id, voidRefId, -m.qty, m.unit_cost)
        .run();
      const { results: levels } = await db
        .prepare(`SELECT qty, avg_cost FROM stock_levels WHERE product_id = ? AND warehouse_id = ?`)
        .bind(m.product_id, m.warehouse_id)
        .all<{ qty: number; avg_cost: number }>();
      const level = levels[0];
      if (level) {
        const newQty = level.qty - m.qty;
        const newValue = level.qty * level.avg_cost - m.qty * m.unit_cost;
        const newAvg = newQty > 0 ? Math.round(newValue / newQty) : 0;
        await db
          .prepare(`UPDATE stock_levels SET qty = ?, avg_cost = ? WHERE product_id = ? AND warehouse_id = ?`)
          .bind(newQty, newAvg, m.product_id, m.warehouse_id)
          .run();
      }
    }
  }

  await db
    .prepare(`UPDATE ${cfg.table} SET voided_at = datetime('now') WHERE id = ?`)
    .bind(docId)
    .run();
  return { docNo: doc.doc_no, reversalEntryNo: reversal.entryNo };
}

export const commerceRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Faktur penjualan
  // -------------------------------------------------------------------------
  .get("/:tenantId/invoices", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ docs: await listDocs(db, INVOICE_CFG) });
  })

  .post("/:tenantId/invoices", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createInvoiceSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);

    const result = await executeInvoice(db, parsed.data, c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, 400);

    await audit(c.env, {
      action: "sales.invoice_posted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo: result.docNo, total: result.total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id: result.invoiceId, docNo: result.docNo, total: result.total }, 201);
  })

  .post("/:tenantId/invoices/:id/void", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const result = await voidDoc(db, INVOICE_CFG, c.req.param("id"), c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, result.status);
    await audit(c.env, {
      action: "sales.invoice_voided",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo: result.docNo, reversalEntryNo: result.reversalEntryNo },
      ip: clientIp(c),
    });
    return c.json({ ok: true, docNo: result.docNo, reversalEntryNo: result.reversalEntryNo });
  })

  // -------------------------------------------------------------------------
  // Faktur pembelian
  // -------------------------------------------------------------------------
  .get("/:tenantId/purchases", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ docs: await listDocs(db, PURCHASE_CFG) });
  })

  .post("/:tenantId/purchases", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createPurchaseSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    // Gerbang persetujuan: pembelian ≥ ambang oleh non-Owner masuk antrean,
    // TANPA jurnal & TANPA stok — baru diposting saat Owner menyetujui.
    const threshold = await approvalThreshold(db);
    const previewTotal =
      input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) +
      Math.round((input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * input.taxRate) / 100);
    if (threshold > 0 && previewTotal >= threshold && tenant.role !== "owner") {
      const requestNo = await nextDocNo(db, "approval_requests", "APR");
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO approval_requests (id, request_no, type, payload, summary, total, requested_by)
           VALUES (?, ?, 'purchase', ?, ?, ?, ?)`,
        )
        .bind(
          id,
          requestNo,
          JSON.stringify(input),
          `Pembelian ${input.lines.length} baris`,
          previewTotal,
          c.get("user").id,
        )
        .run();
      await audit(c.env, {
        action: "approval.requested",
        userId: c.get("user").id,
        tenantId: tenant.id,
        detail: { requestNo, total: previewTotal },
        ip: clientIp(c),
      });
      return c.json({ ok: true, pendingApproval: true, requestNo, total: previewTotal }, 202);
    }

    const result = await executePurchase(db, input, c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, 400);

    await audit(c.env, {
      action: "purchase.posted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo: result.docNo, total: result.total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id: result.purchaseId, docNo: result.docNo, total: result.total }, 201);
  })

  .post("/:tenantId/purchases/:id/void", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const result = await voidDoc(db, PURCHASE_CFG, c.req.param("id"), c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, result.status);
    await audit(c.env, {
      action: "purchase.voided",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo: result.docNo, reversalEntryNo: result.reversalEntryNo },
      ip: clientIp(c),
    });
    return c.json({ ok: true, docNo: result.docNo, reversalEntryNo: result.reversalEntryNo });
  })

  // -------------------------------------------------------------------------
  // Persetujuan pembelian (Owner)
  // -------------------------------------------------------------------------
  .post("/:tenantId/approval-threshold", requireAuth, requireTenantRole("owner"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { amount?: unknown };
    const amount = Number(body.amount ?? 0);
    if (!Number.isInteger(amount) || amount < 0) return c.json({ error: "Nominal tidak valid." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    await db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('approval_threshold_purchase', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(String(amount))
      .run();
    await audit(c.env, {
      action: "approval.threshold_set",
      userId: c.get("user").id,
      tenantId: c.get("tenant").id,
      detail: { amount },
      ip: clientIp(c),
    });
    return c.json({ ok: true, amount });
  })

  .get("/:tenantId/approvals", requireAuth, requireTenantRole("owner"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT id, request_no, type, summary, total, status, requested_by, requested_at, decision_note
         FROM approval_requests ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, requested_at DESC LIMIT 100`,
      )
      .all<Record<string, unknown>>();
    return c.json({ requests: results });
  })

  .post("/:tenantId/approvals/:id/approve", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");

    const { results } = await db
      .prepare(`SELECT payload, request_no FROM approval_requests WHERE id = ? AND status = 'pending'`)
      .bind(id)
      .all<{ payload: string; request_no: string }>();
    const req = results[0];
    if (!req) return c.json({ error: "Permintaan tidak ditemukan atau sudah diputuskan." }, 404);

    const parsed = createPurchaseSchema.safeParse(JSON.parse(req.payload));
    if (!parsed.success) return c.json({ error: "Payload permintaan tidak valid." }, 400);

    const result = await executePurchase(db, parsed.data, c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, 400);

    await db
      .prepare(
        `UPDATE approval_requests SET status = 'approved', decided_by = ?, decided_at = datetime('now'),
                result_doc_id = ? WHERE id = ?`,
      )
      .bind(c.get("user").id, result.purchaseId, id)
      .run();
    await audit(c.env, {
      action: "approval.approved",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { requestNo: req.request_no, docNo: result.docNo },
      ip: clientIp(c),
    });
    return c.json({ ok: true, docNo: result.docNo, total: result.total });
  })

  .post("/:tenantId/approvals/:id/reject", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const note = String(((await c.req.json().catch(() => ({}))) as { note?: unknown }).note ?? "");

    const { results } = await db
      .prepare(`SELECT request_no FROM approval_requests WHERE id = ? AND status = 'pending'`)
      .bind(id)
      .all<{ request_no: string }>();
    if (!results[0]) return c.json({ error: "Permintaan tidak ditemukan atau sudah diputuskan." }, 404);

    await db
      .prepare(
        `UPDATE approval_requests SET status = 'rejected', decided_by = ?, decided_at = datetime('now'),
                decision_note = ? WHERE id = ?`,
      )
      .bind(c.get("user").id, note || null, id)
      .run();
    await audit(c.env, {
      action: "approval.rejected",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { requestNo: results[0].request_no, note },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // Pembayaran: terima dari pelanggan / bayar ke pemasok
  // -------------------------------------------------------------------------
  .post("/:tenantId/payments", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createPaymentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;
    const cfg = input.refType === "invoice" ? INVOICE_CFG : PURCHASE_CFG;

    const { results: docs } = await db
      .prepare(
        `SELECT ${cfg.noColumn} AS doc_no, total, paid_amount, returned_amount, currency, exchange_rate, voided_at
         FROM ${cfg.table} WHERE id = ?`,
      )
      .bind(input.refId)
      .all<{ doc_no: string; total: number; paid_amount: number; returned_amount: number; currency: string; exchange_rate: number; voided_at: string | null }>();
    const doc = docs[0];
    if (!doc) return c.json({ error: "Dokumen tidak ditemukan." }, 404);
    if (doc.voided_at) return c.json({ error: "Dokumen sudah dibatalkan — tidak bisa menerima pembayaran." }, 400);
    const lockError = await checkPeriodOpen(db, input.paymentDate);
    if (lockError) return c.json({ error: lockError }, 400);

    // Faktur valas: bayar dalam valas + kurs saat bayar → selisih kurs dijurnal.
    // Faktur IDR: pakai `amount` (IDR) seperti biasa (kurs 1, tanpa selisih).
    const isForeign = doc.currency !== "IDR";
    let counterCleared: number; // IDR yang mengurangi piutang/hutang (pada kurs faktur)
    let cashIdr: number; // IDR kas yang benar-benar berpindah (pada kurs bayar)
    let foreignAmt: number;
    let payRate: number;
    if (isForeign) {
      if (!input.foreignAmount || !input.exchangeRate) {
        return c.json({ error: `Faktur dalam ${doc.currency} — isi jumlah valas & kurs saat pembayaran.` }, 400);
      }
      foreignAmt = input.foreignAmount;
      payRate = input.exchangeRate;
      counterCleared = Math.round(foreignAmt * doc.exchange_rate);
      cashIdr = Math.round(foreignAmt * payRate);
    } else {
      if (!input.amount) return c.json({ error: "Nominal pembayaran wajib diisi." }, 400);
      foreignAmt = input.amount;
      payRate = 1;
      counterCleared = input.amount;
      cashIdr = input.amount;
    }

    const remaining = doc.total - doc.paid_amount - doc.returned_amount;
    if (counterCleared > remaining) {
      return c.json({ error: `Nominal melebihi sisa tagihan (sisa Rp ${remaining.toLocaleString("id-ID")}).` }, 400);
    }

    // Akun pembayaran harus akun kas/bank (tipe aset, tidak diarsipkan).
    const { results: accs } = await db
      .prepare(`SELECT type FROM accounts WHERE id = ? AND is_archived = 0`)
      .bind(input.accountId)
      .all<{ type: string }>();
    if (!accs[0] || accs[0].type !== "asset") {
      return c.json({ error: "Akun pembayaran harus akun kas/bank (tipe aset)." }, 400);
    }

    const direction = input.refType === "invoice" ? "receive" : "pay";
    const counterId = await accountIdByCode(db, direction === "receive" ? SYS_ACCOUNTS.PIUTANG : SYS_ACCOUNTS.HUTANG);

    const paymentNo = await nextDocNo(db, "payments", "PAY");
    const memo =
      direction === "receive" ? `Penerimaan ${doc.doc_no} (${paymentNo})` : `Pembayaran ${doc.doc_no} (${paymentNo})`;

    // Selisih kurs favorable (laba): terima IDR > piutang, atau bayar IDR < hutang.
    const forexGain = direction === "receive" ? cashIdr - counterCleared : counterCleared - cashIdr;
    const forexLine =
      forexGain === 0
        ? []
        : forexGain > 0
          ? [{ accountId: await accountIdByCode(db, "4-3000"), description: `Selisih kurs ${doc.doc_no}`, debit: 0, credit: forexGain }]
          : [{ accountId: await accountIdByCode(db, "5-6000"), description: `Selisih kurs ${doc.doc_no}`, debit: -forexGain, credit: 0 }];

    const baseLines =
      direction === "receive"
        ? [
            { accountId: input.accountId, description: memo, debit: cashIdr, credit: 0 },
            { accountId: counterId, description: memo, debit: 0, credit: counterCleared },
          ]
        : [
            { accountId: counterId, description: memo, debit: counterCleared, credit: 0 },
            { accountId: input.accountId, description: memo, debit: 0, credit: cashIdr },
          ];

    const journal = await postJournal(db, {
      entryDate: input.paymentDate,
      memo,
      createdBy: c.get("user").id,
      lines: [...baseLines, ...forexLine],
    });

    await db
      .prepare(
        `INSERT INTO payments (id, payment_no, direction, ref_type, ref_id, account_id, amount,
                               payment_date, journal_entry_id, created_by, currency, exchange_rate, foreign_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        paymentNo,
        direction,
        input.refType,
        input.refId,
        input.accountId,
        counterCleared,
        input.paymentDate,
        journal.id,
        c.get("user").id,
        doc.currency,
        payRate,
        foreignAmt,
      )
      .run();

    const newPaid = doc.paid_amount + counterCleared;
    await db
      .prepare(`UPDATE ${cfg.table} SET paid_amount = ?, status = ? WHERE id = ?`)
      .bind(newPaid, newPaid + doc.returned_amount >= doc.total ? "paid" : "posted", input.refId)
      .run();

    await audit(c.env, {
      action: "payment.recorded",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { paymentNo, refType: input.refType, docNo: doc.doc_no, amount: counterCleared, forexGain },
      ip: clientIp(c),
    });
    return c.json(
      { ok: true, paymentNo, paidAmount: newPaid, settled: newPaid + doc.returned_amount >= doc.total, forexGain },
      201,
    );
  })

  // -------------------------------------------------------------------------
  // Penyesuaian stok (opname): samakan sistem dengan hasil hitung fisik.
  // Selisih nilai dijurnal ke Beban Operasional Lain ↔ Persediaan.
  // -------------------------------------------------------------------------
  .post("/:tenantId/stock-adjustments", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = stockAdjustmentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;
    const today = new Date().toISOString().slice(0, 10);

    const lockError = await checkPeriodOpen(db, today);
    if (lockError) return c.json({ error: lockError }, 400);

    const { results: products } = await db
      .prepare(`SELECT sku, name FROM products WHERE id = ? AND is_archived = 0`)
      .bind(input.productId)
      .all<{ sku: string; name: string }>();
    const product = products[0];
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 400);

    const { results: levels } = await db
      .prepare(`SELECT qty, avg_cost FROM stock_levels WHERE product_id = ? AND warehouse_id = ?`)
      .bind(input.productId, input.warehouseId)
      .all<{ qty: number; avg_cost: number }>();
    const currentQty = levels[0]?.qty ?? 0;
    const avgCost = levels[0]?.avg_cost ?? 0;

    const delta = input.physicalQty - currentQty;
    if (delta === 0) return c.json({ error: "Tidak ada selisih — stok sistem sudah sama dengan fisik." }, 400);

    const adjustmentId = crypto.randomUUID();
    let value: number;
    if (delta > 0) {
      await stockIn(db, {
        productId: input.productId,
        warehouseId: input.warehouseId,
        qty: delta,
        unitCost: avgCost,
        refType: "adjustment",
        refId: adjustmentId,
      });
      value = delta * avgCost;
    } else {
      value = await stockOut(db, {
        productId: input.productId,
        warehouseId: input.warehouseId,
        qty: -delta,
        refType: "adjustment",
        refId: adjustmentId,
      });
    }

    let entryNo: string | null = null;
    if (value > 0) {
      const [persediaan, bebanLain] = await Promise.all([
        accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
        accountIdByCode(db, "5-4000"),
      ]);
      const memo = `Penyesuaian stok ${product.sku}: ${currentQty} → ${input.physicalQty}${input.note ? ` (${input.note})` : ""}`;
      const journal = await postJournal(db, {
        entryDate: today,
        memo,
        createdBy: c.get("user").id,
        lines:
          delta < 0
            ? [
                { accountId: bebanLain, description: memo, debit: value, credit: 0 },
                { accountId: persediaan, description: memo, debit: 0, credit: value },
              ]
            : [
                { accountId: persediaan, description: memo, debit: value, credit: 0 },
                { accountId: bebanLain, description: memo, debit: 0, credit: value },
              ],
      });
      entryNo = journal.entryNo;
    }

    await audit(c.env, {
      action: "inventory.adjusted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { sku: product.sku, from: currentQty, to: input.physicalQty, value, note: input.note },
      ip: clientIp(c),
    });
    return c.json({ ok: true, delta, value, entryNo }, 201);
  })

  // -------------------------------------------------------------------------
  // Transfer antar gudang: nilai persediaan berpindah pada biaya rata-rata —
  // total nilai perusahaan tidak berubah, jadi tidak perlu jurnal.
  // -------------------------------------------------------------------------
  .post("/:tenantId/stock-transfers", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = stockTransferSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return c.json(
        { error: flat.formErrors[0] ?? "Data tidak valid", issues: flat.fieldErrors as Record<string, string[]> },
        400,
      );
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: whs } = await db
      .prepare(`SELECT id FROM warehouses WHERE is_archived = 0 AND id IN (?, ?)`)
      .bind(input.fromWarehouseId, input.toWarehouseId)
      .all<{ id: string }>();
    if (whs.length !== 2) return c.json({ error: "Gudang asal/tujuan tidak ditemukan." }, 400);

    const transferId = crypto.randomUUID();
    let cost: number;
    try {
      cost = await stockOut(db, {
        productId: input.productId,
        warehouseId: input.fromWarehouseId,
        qty: input.qty,
        refType: "adjustment",
        refId: transferId,
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) return c.json({ error: err.message }, 400);
      throw err;
    }
    await stockIn(db, {
      productId: input.productId,
      warehouseId: input.toWarehouseId,
      qty: input.qty,
      unitCost: Math.round(cost / input.qty),
      refType: "adjustment",
      refId: transferId,
    });

    await audit(c.env, {
      action: "inventory.transferred",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { productId: input.productId, qty: input.qty, from: input.fromWarehouseId, to: input.toWarehouseId },
      ip: clientIp(c),
    });
    return c.json({ ok: true, qty: input.qty, value: cost }, 201);
  })

  // -------------------------------------------------------------------------
  // Lot & kedaluwarsa: daftar lot aktif, urut kedaluwarsa terdekat (FEFO)
  // -------------------------------------------------------------------------
  .get("/:tenantId/stock-lots", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const today = new Date().toISOString().slice(0, 10);
    const { results } = await db
      .prepare(
        `SELECT sl.id, sl.product_id, p.sku, p.name AS product_name, w.name AS warehouse_name,
                sl.lot_no, sl.expiry_date, sl.qty
         FROM stock_lots sl
         JOIN products p ON p.id = sl.product_id
         JOIN warehouses w ON w.id = sl.warehouse_id
         WHERE sl.qty > 0
         ORDER BY sl.expiry_date IS NULL, sl.expiry_date ASC`,
      )
      .all<{
        id: string;
        product_id: string;
        sku: string;
        product_name: string;
        warehouse_name: string;
        lot_no: string | null;
        expiry_date: string | null;
        qty: number;
      }>();

    const lots = results.map((r) => ({
      id: r.id,
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      warehouseName: r.warehouse_name,
      lotNo: r.lot_no,
      expiryDate: r.expiry_date,
      qty: r.qty,
      daysToExpiry: r.expiry_date ? Math.ceil((Date.parse(r.expiry_date) - Date.parse(today)) / 86_400_000) : null,
    }));
    const expiringSoon = lots.filter((l) => l.daysToExpiry !== null && l.daysToExpiry <= 30).length;
    return c.json({ lots, expiringSoon });
  })

  // -------------------------------------------------------------------------
  // Level stok per gudang
  // -------------------------------------------------------------------------
  .get("/:tenantId/stock", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT s.product_id, p.sku, p.name AS product_name, p.unit,
                s.warehouse_id, w.name AS warehouse_name, s.qty, s.avg_cost
         FROM stock_levels s
         JOIN products p ON p.id = s.product_id
         JOIN warehouses w ON w.id = s.warehouse_id
         ORDER BY p.name, w.name`,
      )
      .all<{
        product_id: string;
        sku: string;
        product_name: string;
        unit: string;
        warehouse_id: string;
        warehouse_name: string;
        qty: number;
        avg_cost: number;
      }>();

    const levels: ApiStockLevel[] = results.map((r) => ({
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      unit: r.unit,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      qty: r.qty,
      avgCost: r.avg_cost,
      value: r.qty * r.avg_cost,
    }));
    const totalValue = levels.reduce((s, l) => s + l.value, 0);
    return c.json({ levels, totalValue });
  });

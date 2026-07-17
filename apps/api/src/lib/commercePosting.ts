import type { ApiCommerceDoc, ApiCommerceLine, CreateInvoiceInput, CreatePurchaseInput } from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import {
  accountIdByCode,
  AlreadyReversedError,
  getLockedBefore,
  InsufficientStockError,
  nextDocNo,
  PeriodLockedError,
  postJournal,
  reverseJournal,
  stockIn,
  stockOut,
  SYS_ACCOUNTS,
} from "./accounting";

/**
 * Siklus penjualan & pembelian. Setiap dokumen otomatis:
 *  - membuat jurnal double-entry (piutang/pendapatan/PPN atau persediaan/hutang)
 *  - menggerakkan stok (keluar dengan HPP moving-average, masuk dengan biaya beli)
 * Dokumen terposting immutable, sama seperti jurnal.
 */

export type DocTable = {
  table: "invoices" | "purchases";
  lineTable: "invoice_lines" | "purchase_lines";
  fk: "invoice_id" | "purchase_id";
  noColumn: "invoice_no" | "purchase_no";
  dateColumn: "invoice_date" | "purchase_date";
  prefix: string;
  contactTypes: string[];
};

export const INVOICE_CFG: DocTable = {
  table: "invoices",
  lineTable: "invoice_lines",
  fk: "invoice_id",
  noColumn: "invoice_no",
  dateColumn: "invoice_date",
  prefix: "INV",
  contactTypes: ["customer", "both"],
};

export const PURCHASE_CFG: DocTable = {
  table: "purchases",
  lineTable: "purchase_lines",
  fk: "purchase_id",
  noColumn: "purchase_no",
  dateColumn: "purchase_date",
  prefix: "PB",
  contactTypes: ["supplier", "both"],
};

export async function listDocs(
  db: SqlExecutor,
  cfg: DocTable,
  opts: { q?: string; limit?: number; offset?: number } = {},
): Promise<{ docs: ApiCommerceDoc[]; total: number; limit: number; offset: number }> {
  const q = (opts.q ?? "").trim();
  const limit = Math.min(Math.max(opts.limit || 100, 1), 500);
  const offset = Math.max(opts.offset || 0, 0);

  // Cari pada nomor dokumen atau nama kontak; wildcard di-escape jadi literal.
  const binds: (string | number)[] = [];
  let whereSql = "";
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    whereSql = `WHERE (d.${cfg.noColumn} LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')`;
    binds.push(like, like);
  }

  const [{ results: docs }, { results: countRows }] = await Promise.all([
    db
      .prepare(
        `SELECT d.id, d.${cfg.noColumn} AS doc_no, d.contact_id, c.name AS contact_name,
              d.${cfg.dateColumn} AS date, d.due_date, d.status, d.subtotal, d.tax_rate,
              d.tax_amount, d.total, d.paid_amount, d.returned_amount, d.currency, d.exchange_rate, d.foreign_total,
              d.voided_at
       FROM ${cfg.table} d JOIN contacts c ON c.id = d.contact_id
       ${whereSql}
       ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(...binds, limit, offset)
      .all<DocListRow>(),
    db
      .prepare(`SELECT COUNT(*) AS n FROM ${cfg.table} d JOIN contacts c ON c.id = d.contact_id ${whereSql}`)
      .bind(...binds)
      .all<{ n: number }>(),
  ]);
  const total = countRows[0]?.n ?? docs.length;
  if (docs.length === 0) return { docs: [], total, limit, offset };

  const { results: lines } = await db
    .prepare(
      `SELECT l.id, l.${cfg.fk} AS doc_id, l.product_id, p.name AS product_name,
              l.description, l.qty, l.unit_price, l.discount_pct, l.amount
       FROM ${cfg.lineTable} l JOIN products p ON p.id = l.product_id
       WHERE l.${cfg.fk} IN (${docs.map(() => "?").join(",")})`,
    )
    .bind(...docs.map((d) => d.id))
    .all<{
      id: string;
      doc_id: string;
      product_id: string;
      product_name: string;
      description: string | null;
      qty: number;
      unit_price: number;
      discount_pct: number;
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
      discountPct: l.discount_pct,
      amount: l.amount,
    });
    byDoc.set(l.doc_id, list);
  }

  return {
    docs: docs.map((d) => ({
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
    })),
    total,
    limit,
    offset,
  };
}

export type DocListRow = {
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
};

/** Bila dokumen ditag ke proyek, pastikan proyeknya ada. */
export async function checkProject(db: SqlExecutor, projectId?: string): Promise<string | null> {
  if (!projectId) return null;
  const { results } = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).all();
  return results[0] ? null : "Proyek tidak ditemukan.";
}

/**
 * Resolusi mata uang & kurs faktur. IDR (atau kosong) → kurs 1. Valas → wajib
 * kurs > 0 dan mata uang terdaftar. Mengembalikan {currency, rate} atau error.
 */
export async function resolveCurrency(
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
export async function checkPeriodOpen(db: SqlExecutor, date: string): Promise<string | null> {
  const lockedBefore = await getLockedBefore(db);
  if (lockedBefore && date <= lockedBefore) {
    return `Periode sampai ${lockedBefore} sudah ditutup — transaksi bertanggal ${date} ditolak.`;
  }
  return null;
}

/** Ambang persetujuan pembelian dari settings tenant (0 = nonaktif). */
export async function approvalThreshold(db: SqlExecutor): Promise<number> {
  const { results } = await db
    .prepare(`SELECT value FROM settings WHERE key = 'approval_threshold_purchase'`)
    .all<{ value: string }>();
  return Number(results[0]?.value ?? 0) || 0;
}

/**
 * Posting faktur pembelian (jurnal + baris + stok masuk). Dipakai jalur
 * langsung maupun saat Owner menyetujui permintaan — satu implementasi.
 */
export async function executePurchase(
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

  // Nilai baris = qty × harga × (1 − diskon/100), dibulatkan per baris; PPN &
  // jurnal mengikuti nilai setelah diskon.
  const idrLines = input.lines.map((l) => {
    const disc = l.discountPct ?? 0;
    const unitIdr = Math.round(l.unitPrice * cur.rate);
    return { ...l, disc, unitIdr, amountIdr: Math.round(l.qty * unitIdr * (1 - disc / 100)) };
  });
  const foreignSubtotal = input.lines.reduce(
    (s, l) => s + Math.round(l.qty * l.unitPrice * (1 - (l.discountPct ?? 0) / 100)),
    0,
  );
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
        `INSERT INTO purchase_lines (id, purchase_id, product_id, description, qty, unit_price, discount_pct, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        purchaseId,
        line.productId,
        line.description ?? null,
        line.qty,
        line.unitPrice,
        line.disc,
        Math.round(line.qty * line.unitPrice * (1 - line.disc / 100)),
      )
      .run();
    // Biaya persediaan = harga satuan IDR setelah diskon (senilai jurnal Persediaan).
    await stockIn(db, {
      productId: line.productId,
      warehouseId: input.warehouseId,
      qty: line.qty,
      unitCost: Math.round(line.unitIdr * (1 - line.disc / 100)),
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
  opts?: { skipStock?: boolean },
): Promise<{ invoiceId: string; docNo: string; total: number } | { error: string }> {
  const refError = (await validateRefs(db, INVOICE_CFG, input)) ?? (await checkProject(db, input.projectId));
  if (refError) return { error: refError };
  const lockError = await checkPeriodOpen(db, input.invoiceDate);
  if (lockError) return { error: lockError };

  const cur = await resolveCurrency(db, input.currency, input.exchangeRate);
  if ("error" in cur) return { error: cur.error };

  // Nilai baris dikonversi ke IDR pada kurs posting (buku selalu IDR), setelah
  // diskon per baris. foreign_total = total dalam mata uang faktur.
  const idrLines = input.lines.map((l) => {
    const disc = l.discountPct ?? 0;
    const unitIdr = Math.round(l.unitPrice * cur.rate);
    return { ...l, disc, unitIdr, amountIdr: Math.round(l.qty * unitIdr * (1 - disc / 100)) };
  });
  const foreignSubtotal = input.lines.reduce(
    (s, l) => s + Math.round(l.qty * l.unitPrice * (1 - (l.discountPct ?? 0) / 100)),
    0,
  );
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
  // skipStock: barang sudah dikeluarkan & HPP sudah diakui di Surat Jalan (alur SO→DO→Faktur).
  let totalCogs = 0;
  if (!opts?.skipStock) {
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
        `INSERT INTO invoice_lines (id, invoice_id, product_id, description, qty, unit_price, discount_pct, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        invoiceId,
        line.productId,
        line.description ?? null,
        line.qty,
        line.unitIdr,
        line.disc,
        line.amountIdr,
      )
      .run();
  }
  return { invoiceId, docNo, total };
}

/** Validasi rujukan bersama: kontak (jenis sesuai), gudang, produk aktif. */
export async function validateRefs(
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
export async function voidDoc(
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

  // Jurnal pembalik via helper bersama (Fase 10c): baris asal ditukar
  // debit↔kredit, tanggal ikut dokumen asal — bila periodenya sudah ditutup,
  // PeriodLockedError memblokir void; tautan dua arah dicatat di jurnal.
  let reversal: { id: string; entryNo: string };
  try {
    reversal = await reverseJournal(db, doc.journal_entry_id, {
      memo: `Pembatalan ${doc.doc_no}`,
      userId,
    });
  } catch (err) {
    if (err instanceof PeriodLockedError) {
      return { error: `${err.message} Gunakan Retur untuk koreksi di periode berjalan.`, status: 400 };
    }
    if (err instanceof AlreadyReversedError) return { error: err.message, status: 400 };
    if (err instanceof Error && err.message === "Jurnal asal dokumen tidak ditemukan.") {
      return { error: err.message, status: 400 };
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

import type { SqlExecutor } from "@erpindo/db";

/**
 * Helper akuntansi & stok yang dipakai lintas modul (jurnal manual, penjualan,
 * pembelian, pembayaran). Semua nominal INTEGER rupiah.
 */

/** Kode akun sistem (disemai migrasi 0002) yang menjadi sasaran jurnal otomatis. */
export const SYS_ACCOUNTS = {
  KAS: "1-1000",
  BANK: "1-1100",
  PIUTANG: "1-1200",
  PERSEDIAAN: "1-1300",
  PPN_MASUKAN: "1-1400",
  HUTANG: "2-1000",
  PPN_KELUARAN: "2-1100",
  PENDAPATAN: "4-1000",
  HPP: "5-1000",
} as const;

export async function accountIdByCode(db: SqlExecutor, code: string): Promise<string> {
  const { results } = await db.prepare(`SELECT id FROM accounts WHERE code = ?`).bind(code).all<{ id: string }>();
  const row = results[0];
  if (!row) throw new Error(`Akun sistem ${code} tidak ditemukan`);
  return row.id;
}

/** Nomor dokumen berurutan per tenant: PREFIX-00001, PREFIX-00002, ... */
export async function nextDocNo(db: SqlExecutor, table: string, prefix: string): Promise<string> {
  const { results } = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).all<{ n: number }>();
  return `${prefix}-${String((results[0]?.n ?? 0) + 1).padStart(5, "0")}`;
}

export type JournalLineInput = {
  accountId: string;
  description?: string | null;
  debit: number;
  credit: number;
};

/**
 * Posting jurnal double-entry. Menolak jurnal tidak seimbang — benteng terakhir
 * setelah validasi Zod di endpoint (jalur otomatis juga lewat sini).
 */
export class PeriodLockedError extends Error {}

/** Tanggal tutup buku (settings key 'locked_before'); transaksi ≤ tanggal ini terkunci. */
export async function getLockedBefore(db: SqlExecutor): Promise<string | null> {
  const { results } = await db
    .prepare(`SELECT value FROM settings WHERE key = 'locked_before'`)
    .all<{ value: string }>();
  return results[0]?.value ?? null;
}

export async function postJournal(
  db: SqlExecutor,
  input: { entryDate: string; memo?: string | null; createdBy: string; lines: JournalLineInput[] },
): Promise<{ id: string; entryNo: string }> {
  const debit = input.lines.reduce((s, l) => s + l.debit, 0);
  const credit = input.lines.reduce((s, l) => s + l.credit, 0);
  if (debit !== credit || debit === 0 || input.lines.length < 2) {
    throw new Error(`Jurnal tidak seimbang (debit ${debit}, kredit ${credit})`);
  }

  // Gerbang tutup buku: semua jalur posting (manual, faktur, pembayaran)
  // lewat sini, jadi periode terkunci tidak bisa ditembus dari mana pun.
  const lockedBefore = await getLockedBefore(db);
  if (lockedBefore && input.entryDate <= lockedBefore) {
    throw new PeriodLockedError(
      `Periode sampai ${lockedBefore} sudah ditutup — transaksi bertanggal ${input.entryDate} ditolak.`,
    );
  }

  const entryNo = await nextDocNo(db, "journal_entries", "JRN");
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO journal_entries (id, entry_no, entry_date, memo, status, created_by)
       VALUES (?, ?, ?, ?, 'posted', ?)`,
    )
    .bind(id, entryNo, input.entryDate, input.memo ?? null, input.createdBy)
    .run();
  for (const line of input.lines) {
    await db
      .prepare(
        `INSERT INTO journal_lines (id, entry_id, account_id, description, debit, credit)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), id, line.accountId, line.description ?? null, line.debit, line.credit)
      .run();
  }
  return { id, entryNo };
}

/**
 * Barang masuk: catat mutasi dan perbarui level stok dengan moving average:
 * avg_baru = (qty_lama×avg_lama + qty_masuk×biaya_masuk) / (qty_lama+qty_masuk)
 */
export async function stockIn(
  db: SqlExecutor,
  input: {
    productId: string;
    warehouseId: string;
    qty: number;
    unitCost: number;
    refType: string;
    refId: string;
    /** Opsional: lot/batch + tanggal kedaluwarsa (produk berpelacakan). */
    lot?: { lotNo: string | null; expiryDate: string | null };
  },
): Promise<void> {
  if (input.lot) {
    const { results } = await db
      .prepare(
        `SELECT id FROM stock_lots WHERE product_id = ? AND warehouse_id = ?
           AND COALESCE(lot_no,'') = COALESCE(?,'') AND COALESCE(expiry_date,'') = COALESCE(?,'')`,
      )
      .bind(input.productId, input.warehouseId, input.lot.lotNo, input.lot.expiryDate)
      .all<{ id: string }>();
    if (results[0]) {
      await db.prepare(`UPDATE stock_lots SET qty = qty + ? WHERE id = ?`).bind(input.qty, results[0].id).run();
    } else {
      await db
        .prepare(
          `INSERT INTO stock_lots (id, product_id, warehouse_id, lot_no, expiry_date, qty) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), input.productId, input.warehouseId, input.lot.lotNo, input.lot.expiryDate, input.qty)
        .run();
    }
  }
  await db
    .prepare(
      `INSERT INTO stock_movements (id, product_id, warehouse_id, ref_type, ref_id, qty, unit_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), input.productId, input.warehouseId, input.refType, input.refId, input.qty, input.unitCost)
    .run();

  const { results } = await db
    .prepare(`SELECT qty, avg_cost FROM stock_levels WHERE product_id = ? AND warehouse_id = ?`)
    .bind(input.productId, input.warehouseId)
    .all<{ qty: number; avg_cost: number }>();
  const level = results[0];

  if (!level) {
    await db
      .prepare(`INSERT INTO stock_levels (product_id, warehouse_id, qty, avg_cost) VALUES (?, ?, ?, ?)`)
      .bind(input.productId, input.warehouseId, input.qty, input.unitCost)
      .run();
    return;
  }
  const newQty = level.qty + input.qty;
  const newAvg = Math.round((level.qty * level.avg_cost + input.qty * input.unitCost) / newQty);
  await db
    .prepare(`UPDATE stock_levels SET qty = ?, avg_cost = ? WHERE product_id = ? AND warehouse_id = ?`)
    .bind(newQty, newAvg, input.productId, input.warehouseId)
    .run();
}

export class InsufficientStockError extends Error {}

/**
 * Barang keluar dengan biaya rata-rata berjalan. Mengembalikan total HPP.
 * Menolak bila stok tidak mencukupi.
 */
export async function stockOut(
  db: SqlExecutor,
  input: { productId: string; warehouseId: string; qty: number; refType: string; refId: string },
): Promise<number> {
  const { results } = await db
    .prepare(`SELECT qty, avg_cost FROM stock_levels WHERE product_id = ? AND warehouse_id = ?`)
    .bind(input.productId, input.warehouseId)
    .all<{ qty: number; avg_cost: number }>();
  const level = results[0];
  if (!level || level.qty < input.qty) {
    throw new InsufficientStockError(
      `Stok tidak mencukupi (tersedia ${level?.qty ?? 0}, diminta ${input.qty}).`,
    );
  }

  await db
    .prepare(
      `INSERT INTO stock_movements (id, product_id, warehouse_id, ref_type, ref_id, qty, unit_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.productId,
      input.warehouseId,
      input.refType,
      input.refId,
      -input.qty,
      level.avg_cost,
    )
    .run();
  await db
    .prepare(`UPDATE stock_levels SET qty = qty - ? WHERE product_id = ? AND warehouse_id = ?`)
    .bind(input.qty, input.productId, input.warehouseId)
    .run();

  // Konsumsi lot secara FEFO (kedaluwarsa terdekat lebih dulu; tanpa tanggal
  // di akhir). Bila sebagian stok tidak berlot, sisa konsumsi dibiarkan.
  let remaining = input.qty;
  const { results: lots } = await db
    .prepare(
      `SELECT id, qty FROM stock_lots
       WHERE product_id = ? AND warehouse_id = ? AND qty > 0
       ORDER BY expiry_date IS NULL, expiry_date ASC, created_at ASC`,
    )
    .bind(input.productId, input.warehouseId)
    .all<{ id: string; qty: number }>();
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.qty, remaining);
    await db.prepare(`UPDATE stock_lots SET qty = qty - ? WHERE id = ?`).bind(take, lot.id).run();
    remaining -= take;
  }

  return input.qty * level.avg_cost;
}

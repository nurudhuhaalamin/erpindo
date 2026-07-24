import {
  closeShiftSchema,
  holdSaleSchema,
  openShiftSchema,
  posRefundSchema,
  posSaleSchema,
  type ApiHeldSale,
  type ApiPosReceipt,
  type ApiPosRecap,
  type ApiPosShift,
  type PosPaymentMethod,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { SqlExecutor } from "@erpindo/db";
import type { AppEnv } from "../env";
import {
  accountIdByCode,
  getLockedBefore,
  InsufficientStockError,
  nextDocNo,
  postJournal,
  stockIn,
  stockOut,
  SYS_ACCOUNTS,
} from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";
import { docLineAggregates, returnedQtyPerProduct } from "./returns";

export type PosTender = { method: PosPaymentMethod; amount: number };
export type PosApplied = { method: PosPaymentMethod; tendered: number; amount: number };

/** Hitung subtotal (diskon per baris, dibulatkan), PPN, dan total penjualan POS. */
export function computePosTotals(
  lines: { qty: number; unitPrice: number; discountPct?: number }[],
  taxRate: number,
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = lines.reduce(
    (s, l) => s + Math.round(l.qty * l.unitPrice * (1 - (l.discountPct ?? 0) / 100)),
    0,
  );
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

/**
 * Resolusi pembayaran POS (murni): validasi cukup-bayar, hitung kembalian (hanya
 * dari tunai), dan nilai yang masuk pembukuan per metode (non-tunai persis;
 * tunai = diserahkan − kembalian). Kembalikan `{ error }` bila kurang bayar atau
 * kembalian melebihi tunai yang diterima.
 */
export function computePosTenders(
  total: number,
  tenders: PosTender[],
): { error: string } | { change: number; cashApplied: number; nonCashApplied: number; applied: PosApplied[] } {
  const tenderedTotal = tenders.reduce((s, p) => s + p.amount, 0);
  if (tenderedTotal < total) return { error: "Total pembayaran kurang dari total belanja." };
  const change = tenderedTotal - total;
  // Kembalian hanya dari tunai — pastikan tunai yang diserahkan cukup menutupnya.
  const cashTendered = tenders.filter((p) => p.method === "tunai").reduce((s, p) => s + p.amount, 0);
  if (change > cashTendered) return { error: "Kembalian melebihi uang tunai yang diterima." };
  const applied = tenders.map((p) => ({
    method: p.method,
    tendered: p.amount,
    amount: p.method === "tunai" ? p.amount - change : p.amount,
  }));
  const cashApplied = applied.filter((p) => p.method === "tunai").reduce((s, p) => s + p.amount, 0);
  const nonCashApplied = applied.filter((p) => p.method !== "tunai").reduce((s, p) => s + p.amount, 0);
  return { change, cashApplied, nonCashApplied, applied };
}

/**
 * POS / Kasir di atas mesin faktur yang sama:
 * penjualan POS = faktur tunai (pelanggan "Pelanggan Umum") yang langsung lunas.
 * Jurnal: Dr Kas / Cr Pendapatan (+PPN Keluaran) + Dr HPP / Cr Persediaan.
 * Shift dibuka dengan kas awal dan ditutup dengan hitung fisik; selisih kas
 * (lebih/kurang) otomatis dijurnal.
 */

const WALKIN_NAME = "Pelanggan Umum";

async function walkInCustomerId(db: SqlExecutor): Promise<string> {
  const { results } = await db
    .prepare(`SELECT id FROM contacts WHERE name = ? AND type = 'customer'`)
    .bind(WALKIN_NAME)
    .all<{ id: string }>();
  if (results[0]) return results[0].id;
  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO contacts (id, type, name) VALUES (?, 'customer', ?)`)
    .bind(id, WALKIN_NAME)
    .run();
  return id;
}

/**
 * Rekap shift: jumlah & total penjualan (semua metode) + total TUNAI yang masuk laci.
 * Total tunai dihitung dari `pos_sale_payments` (metode tunai); faktur POS lama tanpa
 * baris pembayaran diperlakukan sebagai tunai penuh (kompatibilitas).
 */
async function shiftTotals(db: SqlExecutor, shiftId: string): Promise<{ count: number; salesTotal: number; cashTotal: number }> {
  const { results } = await db
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM invoices WHERE pos_shift_id = ?`)
    .bind(shiftId)
    .all<{ n: number; total: number }>();
  const { results: cashRows } = await db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS c FROM pos_sale_payments WHERE shift_id = ? AND method = 'tunai'`)
    .bind(shiftId)
    .all<{ c: number }>();
  const { results: legacyRows } = await db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS c FROM invoices
       WHERE pos_shift_id = ? AND id NOT IN (SELECT invoice_id FROM pos_sale_payments)`,
    )
    .bind(shiftId)
    .all<{ c: number }>();
  return {
    count: results[0]?.n ?? 0,
    salesTotal: results[0]?.total ?? 0,
    cashTotal: (cashRows[0]?.c ?? 0) + (legacyRows[0]?.c ?? 0),
  };
}

export const posRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Shift kasir
  // -------------------------------------------------------------------------
  .get("/:tenantId/pos/shift", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const user = c.get("user");
    const { results } = await db
      .prepare(`SELECT * FROM pos_shifts WHERE status = 'open' AND opened_by = ? LIMIT 1`)
      .bind(user.id)
      .all<{
        id: string;
        shift_no: string;
        warehouse_id: string;
        status: "open" | "closed";
        opening_cash: number;
        opened_at: string;
      }>();
    const shift = results[0];
    if (!shift) return c.json({ shift: null });

    const totals = await shiftTotals(db, shift.id);
    const body: ApiPosShift = {
      id: shift.id,
      shiftNo: shift.shift_no,
      warehouseId: shift.warehouse_id,
      status: shift.status,
      openingCash: shift.opening_cash,
      openedAt: shift.opened_at,
      salesCount: totals.count,
      cashSalesTotal: totals.cashTotal,
      expectedCash: shift.opening_cash + totals.cashTotal,
    };
    return c.json({ shift: body });
  })

  // -------------------------------------------------------------------------
  // Rekap penjualan harian (Fase 12e): per jam, per shift, per metode — untuk
  // analisis jam ramai & kinerja shift. Jam dikembalikan dalam UTC; klien yang
  // mengonversi ke jam lokal perangkat (Indonesia punya 3 zona waktu).
  // -------------------------------------------------------------------------
  .get("/:tenantId/pos/recap", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const q = c.req.query("date");
    const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10);

    const [totalRows, hourRows, shiftRows, methodRows, legacyRows] = await Promise.all([
      db
        .prepare(
          `SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM invoices
           WHERE pos_shift_id IS NOT NULL AND voided_at IS NULL AND invoice_date = ?`,
        )
        .bind(date)
        .all<{ n: number; total: number }>(),
      db
        .prepare(
          `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS h, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total
           FROM invoices
           WHERE pos_shift_id IS NOT NULL AND voided_at IS NULL AND invoice_date = ?
           GROUP BY h ORDER BY h`,
        )
        .bind(date)
        .all<{ h: number; n: number; total: number }>(),
      db
        .prepare(
          `SELECT s.shift_no, s.status, COUNT(i.id) AS n, COALESCE(SUM(i.total), 0) AS total,
                  COALESCE((SELECT SUM(p.amount) FROM pos_sale_payments p
                            JOIN invoices pi ON pi.id = p.invoice_id
                            WHERE p.shift_id = s.id AND p.method = 'tunai'
                              AND pi.voided_at IS NULL AND pi.invoice_date = ?), 0) AS cash
           FROM pos_shifts s
           JOIN invoices i ON i.pos_shift_id = s.id AND i.voided_at IS NULL AND i.invoice_date = ?
           GROUP BY s.id ORDER BY s.shift_no`,
        )
        .bind(date, date)
        .all<{ shift_no: string; status: "open" | "closed"; n: number; total: number; cash: number }>(),
      db
        .prepare(
          `SELECT p.method AS method, COALESCE(SUM(p.amount), 0) AS amount
           FROM pos_sale_payments p JOIN invoices i ON i.id = p.invoice_id
           WHERE i.pos_shift_id IS NOT NULL AND i.voided_at IS NULL AND i.invoice_date = ?
           GROUP BY p.method`,
        )
        .bind(date)
        .all<{ method: string; amount: number }>(),
      // Faktur POS lama tanpa baris pembayaran = tunai penuh (kompatibilitas, pola shiftTotals).
      db
        .prepare(
          `SELECT COALESCE(SUM(total), 0) AS c FROM invoices
           WHERE pos_shift_id IS NOT NULL AND voided_at IS NULL AND invoice_date = ?
             AND id NOT IN (SELECT invoice_id FROM pos_sale_payments)`,
        )
        .bind(date)
        .all<{ c: number }>(),
    ]);

    const byMethod = new Map(methodRows.results.map((r) => [r.method, r.amount]));
    const legacyCash = legacyRows.results[0]?.c ?? 0;
    if (legacyCash > 0) byMethod.set("tunai", (byMethod.get("tunai") ?? 0) + legacyCash);

    const body: ApiPosRecap = {
      date,
      salesCount: totalRows.results[0]?.n ?? 0,
      salesTotal: totalRows.results[0]?.total ?? 0,
      byHour: hourRows.results.map((r) => ({ hourUtc: r.h, count: r.n, total: r.total })),
      byShift: shiftRows.results.map((r) => ({
        shiftNo: r.shift_no,
        status: r.status,
        count: r.n,
        total: r.total,
        cashTotal: r.cash,
      })),
      byMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })),
    };
    return c.json(body);
  })

  .post("/:tenantId/pos/shift/open", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = openShiftSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const user = c.get("user");

    const { results: open } = await db
      .prepare(`SELECT id FROM pos_shifts WHERE status = 'open' AND opened_by = ?`)
      .bind(user.id)
      .all();
    if (open.length > 0) return c.json({ error: "Anda masih punya shift yang terbuka — tutup dulu." }, 400);

    const { results: wh } = await db
      .prepare(`SELECT id FROM warehouses WHERE id = ? AND is_archived = 0`)
      .bind(parsed.data.warehouseId)
      .all();
    if (!wh[0]) return c.json({ error: "Gudang tidak ditemukan." }, 400);

    const id = crypto.randomUUID();
    const shiftNo = await nextDocNo(db, "pos_shifts", "SHF");
    await db
      .prepare(
        `INSERT INTO pos_shifts (id, shift_no, warehouse_id, opening_cash, opened_by) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, shiftNo, parsed.data.warehouseId, parsed.data.openingCash, user.id)
      .run();

    await audit(c.env, {
      action: "pos.shift_opened",
      userId: user.id,
      tenantId: tenant.id,
      detail: { shiftNo, openingCash: parsed.data.openingCash },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, shiftNo }, 201);
  })

  // -------------------------------------------------------------------------
  // Penjualan tunai POS
  // -------------------------------------------------------------------------
  .post("/:tenantId/pos/sales", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = posSaleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;
    const today = new Date().toISOString().slice(0, 10);

    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && today <= lockedBefore) {
      return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);
    }

    const { results: shifts } = await db
      .prepare(`SELECT id, warehouse_id FROM pos_shifts WHERE id = ? AND status = 'open'`)
      .bind(input.shiftId)
      .all<{ id: string; warehouse_id: string }>();
    const shift = shifts[0];
    if (!shift) return c.json({ error: "Shift tidak ditemukan atau sudah ditutup." }, 400);

    const { subtotal, taxAmount, total } = computePosTotals(input.lines, input.taxRate);
    if (total === 0) return c.json({ error: "Total tidak boleh nol." }, 400);

    // Pembayaran: pakai `payments` bila ada, jika tidak fallback ke tunai tunggal (legacy).
    const tenders: PosTender[] =
      input.payments && input.payments.length > 0
        ? input.payments
        : [{ method: "tunai", amount: input.cashReceived ?? 0 }];
    const tender = computePosTenders(total, tenders);
    if ("error" in tender) return c.json({ error: tender.error }, 400);
    const { change, cashApplied, nonCashApplied, applied } = tender;

    const invoiceId = crypto.randomUUID();
    let totalCogs = 0;
    try {
      for (const line of input.lines) {
        totalCogs += await stockOut(db, {
          productId: line.productId,
          warehouseId: shift.warehouse_id,
          qty: line.qty,
          refType: "sale",
          refId: invoiceId,
        });
      }
    } catch (err) {
      if (err instanceof InsufficientStockError) return c.json({ error: err.message }, 400);
      throw err;
    }

    const [kas, bank, pendapatan, ppnKeluaran, hpp, persediaan] = await Promise.all([
      accountIdByCode(db, SYS_ACCOUNTS.KAS),
      accountIdByCode(db, SYS_ACCOUNTS.BANK),
      accountIdByCode(db, SYS_ACCOUNTS.PENDAPATAN),
      accountIdByCode(db, SYS_ACCOUNTS.PPN_KELUARAN),
      accountIdByCode(db, SYS_ACCOUNTS.HPP),
      accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
    ]);

    const docNo = await nextDocNo(db, "invoices", "INV", { docType: "invoice", column: "invoice_no", date: today });
    const memo = `Penjualan POS ${docNo}`;
    const journal = await postJournal(db, {
      entryDate: today,
      memo,
      createdBy: c.get("user").id,
      lines: [
        // Kas untuk porsi tunai; Bank untuk porsi non-tunai (QRIS/kartu/e-wallet).
        ...(cashApplied > 0 ? [{ accountId: kas, description: memo, debit: cashApplied, credit: 0 }] : []),
        ...(nonCashApplied > 0 ? [{ accountId: bank, description: `${memo} (non-tunai)`, debit: nonCashApplied, credit: 0 }] : []),
        { accountId: pendapatan, description: memo, debit: 0, credit: subtotal },
        ...(taxAmount > 0 ? [{ accountId: ppnKeluaran, description: memo, debit: 0, credit: taxAmount }] : []),
        ...(totalCogs > 0
          ? [
              { accountId: hpp, description: memo, debit: totalCogs, credit: 0 },
              { accountId: persediaan, description: memo, debit: 0, credit: totalCogs },
            ]
          : []),
      ],
    });

    const customerId = await walkInCustomerId(db);
    await db
      .prepare(
        `INSERT INTO invoices (id, invoice_no, contact_id, invoice_date, status, subtotal, tax_rate, tax_amount,
                               total, paid_amount, journal_entry_id, created_by, pos_shift_id)
         VALUES (?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        invoiceId,
        docNo,
        customerId,
        today,
        subtotal,
        input.taxRate,
        taxAmount,
        total,
        total,
        journal.id,
        c.get("user").id,
        input.shiftId,
      )
      .run();
    for (const line of input.lines) {
      const disc = line.discountPct ?? 0;
      await db
        .prepare(
          `INSERT INTO invoice_lines (id, invoice_id, product_id, qty, unit_price, discount_pct, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          invoiceId,
          line.productId,
          line.qty,
          line.unitPrice,
          disc,
          Math.round(line.qty * line.unitPrice * (1 - disc / 100)),
        )
        .run();
    }
    // Catat pembayaran akuntansi per akun (kas & bank) + rincian metode POS.
    for (const [acct, amt] of [
      [kas, cashApplied],
      [bank, nonCashApplied],
    ] as const) {
      if (amt <= 0) continue;
      const paymentNo = await nextDocNo(db, "payments", "PAY", { docType: "payment", column: "payment_no", date: today });
      await db
        .prepare(
          `INSERT INTO payments (id, payment_no, direction, ref_type, ref_id, account_id, amount, payment_date,
                                 journal_entry_id, created_by)
           VALUES (?, ?, 'receive', 'invoice', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), paymentNo, invoiceId, acct, amt, today, journal.id, c.get("user").id)
        .run();
    }
    for (const p of applied) {
      if (p.amount <= 0) continue;
      await db
        .prepare(`INSERT INTO pos_sale_payments (id, invoice_id, shift_id, method, amount, tendered) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), invoiceId, input.shiftId, p.method, p.amount, p.tendered)
        .run();
    }

    await audit(c.env, {
      action: "pos.sale",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo, total, methods: applied.map((p) => p.method).join("+") },
      ip: clientIp(c),
    });
    return c.json({ ok: true, invoiceNo: docNo, total, change }, 201);
  })

  // -------------------------------------------------------------------------
  // Struk & Refund (Fase 10c). Struk POS lunas tidak bisa di-void (uang sudah
  // berpindah) — koreksinya refund: barang kembali ke gudang shift terbuka,
  // uang tunai keluar dari laci, jurnal pembalik proporsional HARI INI.
  // -------------------------------------------------------------------------
  .get("/:tenantId/pos/receipts", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const q = (c.req.query("q") ?? "").trim();
    const binds: string[] = [];
    let where = "WHERE i.pos_shift_id IS NOT NULL AND i.voided_at IS NULL";
    if (q) {
      where += ` AND i.invoice_no LIKE ? ESCAPE '\\'`;
      binds.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    }
    const { results: invs } = await db
      .prepare(
        `SELECT i.id, i.invoice_no, i.invoice_date, i.total, i.returned_amount
         FROM invoices i ${where}
         ORDER BY i.invoice_date DESC, i.invoice_no DESC LIMIT 20`,
      )
      .bind(...binds)
      .all<{ id: string; invoice_no: string; invoice_date: string; total: number; returned_amount: number }>();

    const receipts: ApiPosReceipt[] = [];
    for (const inv of invs) {
      const docLines = await docLineAggregates(db, "invoice_lines", "invoice_id", inv.id);
      const returned = await returnedQtyPerProduct(db, "invoice", inv.id);
      const { results: names } = await db
        .prepare(
          `SELECT il.product_id, p.name FROM invoice_lines il JOIN products p ON p.id = il.product_id
           WHERE il.invoice_id = ? GROUP BY il.product_id`,
        )
        .bind(inv.id)
        .all<{ product_id: string; name: string }>();
      const nameById = new Map(names.map((n) => [n.product_id, n.name]));
      receipts.push({
        id: inv.id,
        invoiceNo: inv.invoice_no,
        invoiceDate: inv.invoice_date,
        total: inv.total,
        returnedAmount: inv.returned_amount,
        lines: [...docLines.entries()].map(([productId, agg]) => ({
          productId,
          productName: nameById.get(productId) ?? "",
          qty: agg.qty,
          qtyReturnable: Math.max(agg.qty - (returned.get(productId) ?? 0), 0),
          unitPrice: Math.round(agg.amount / agg.qty),
        })),
      });
    }
    return c.json({ receipts });
  })

  .post("/:tenantId/pos/refunds", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = posRefundSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const user = c.get("user");
    const input = parsed.data;
    const today = new Date().toISOString().slice(0, 10);

    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && today <= lockedBefore) {
      return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);
    }

    // Refund tunai keluar dari laci — kasir harus punya shift terbuka.
    const { results: shifts } = await db
      .prepare(`SELECT id, warehouse_id FROM pos_shifts WHERE status = 'open' AND opened_by = ? LIMIT 1`)
      .bind(user.id)
      .all<{ id: string; warehouse_id: string }>();
    const shift = shifts[0];
    if (!shift) return c.json({ error: "Buka shift kasir terlebih dahulu untuk memproses refund." }, 400);

    const { results: invs } = await db
      .prepare(
        `SELECT id, invoice_no, tax_rate, total, paid_amount, returned_amount, voided_at, pos_shift_id
         FROM invoices WHERE id = ?`,
      )
      .bind(input.invoiceId)
      .all<{
        id: string;
        invoice_no: string;
        tax_rate: number;
        total: number;
        paid_amount: number;
        returned_amount: number;
        voided_at: string | null;
        pos_shift_id: string | null;
      }>();
    const inv = invs[0];
    if (!inv) return c.json({ error: "Struk tidak ditemukan." }, 404);
    if (!inv.pos_shift_id) return c.json({ error: "Bukan struk POS — gunakan Retur Penjualan biasa." }, 400);
    if (inv.voided_at) return c.json({ error: "Struk sudah dibatalkan." }, 400);

    // Qty per produk ≤ sisa yang bisa di-refund (pola mesin retur).
    const docLines = await docLineAggregates(db, "invoice_lines", "invoice_id", inv.id);
    const alreadyReturned = await returnedQtyPerProduct(db, "invoice", inv.id);
    let subtotal = 0;
    const pricedLines: { productId: string; qty: number; unitPrice: number; amount: number }[] = [];
    for (const line of input.lines) {
      const docLine = docLines.get(line.productId);
      if (!docLine) return c.json({ error: "Ada produk yang tidak terdapat pada struk." }, 400);
      const available = docLine.qty - (alreadyReturned.get(line.productId) ?? 0);
      if (line.qty > available) {
        return c.json({ error: `Qty refund melebihi sisa yang bisa direfund (maks ${available}).` }, 400);
      }
      const unitPrice = Math.round(docLine.amount / docLine.qty);
      const amount = line.qty * unitPrice;
      subtotal += amount;
      pricedLines.push({ productId: line.productId, qty: line.qty, unitPrice, amount });
    }
    const taxAmount = Math.round((subtotal * inv.tax_rate) / 100);
    const total = subtotal + taxAmount;
    if (total <= 0) return c.json({ error: "Nilai refund tidak boleh nol." }, 400);

    // Barang kembali ke gudang shift yang terbuka pada biaya rata-rata kini.
    const refundId = crypto.randomUUID();
    let inventoryValue = 0;
    for (const line of pricedLines) {
      const { results: levels } = await db
        .prepare(`SELECT avg_cost FROM stock_levels WHERE product_id = ? AND warehouse_id = ?`)
        .bind(line.productId, shift.warehouse_id)
        .all<{ avg_cost: number }>();
      const avgCost = levels[0]?.avg_cost ?? 0;
      await stockIn(db, {
        productId: line.productId,
        warehouseId: shift.warehouse_id,
        qty: line.qty,
        unitCost: avgCost,
        refType: "sale",
        refId: refundId,
      });
      inventoryValue += line.qty * avgCost;
    }

    const returnNo = await nextDocNo(db, "returns", "RTN");
    const memo = `Refund POS ${inv.invoice_no} (${returnNo})${input.memo ? ` — ${input.memo}` : ""}`;
    const [kas, pendapatan, ppnKeluaran, hpp, persediaan] = await Promise.all([
      accountIdByCode(db, SYS_ACCOUNTS.KAS),
      accountIdByCode(db, SYS_ACCOUNTS.PENDAPATAN),
      accountIdByCode(db, SYS_ACCOUNTS.PPN_KELUARAN),
      accountIdByCode(db, SYS_ACCOUNTS.HPP),
      accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
    ]);
    const journal = await postJournal(db, {
      entryDate: today,
      memo,
      createdBy: user.id,
      lines: [
        { accountId: pendapatan, description: memo, debit: subtotal, credit: 0 },
        ...(taxAmount > 0 ? [{ accountId: ppnKeluaran, description: memo, debit: taxAmount, credit: 0 }] : []),
        { accountId: kas, description: memo, debit: 0, credit: total },
        ...(inventoryValue > 0
          ? [
              { accountId: persediaan, description: memo, debit: inventoryValue, credit: 0 },
              { accountId: hpp, description: memo, debit: 0, credit: inventoryValue },
            ]
          : []),
      ],
    });

    await db
      .prepare(
        `INSERT INTO returns (id, return_no, ref_type, ref_id, return_date, memo, subtotal, tax_amount, total,
                              journal_entry_id, created_by)
         VALUES (?, ?, 'invoice', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(refundId, returnNo, inv.id, today, input.memo ?? null, subtotal, taxAmount, total, journal.id, user.id)
      .run();
    for (const line of pricedLines) {
      await db
        .prepare(`INSERT INTO return_lines (id, return_id, product_id, qty, unit_price, amount) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), refundId, line.productId, line.qty, line.unitPrice, line.amount)
        .run();
    }
    await db
      .prepare(`UPDATE invoices SET returned_amount = returned_amount + ? WHERE id = ?`)
      .bind(total, inv.id)
      .run();
    // Baris pembayaran POS NEGATIF pada shift AKTIF → kas laci & rekap shift
    // menyusut persis sebesar uang yang dikembalikan.
    await db
      .prepare(`INSERT INTO pos_sale_payments (id, invoice_id, shift_id, method, amount, tendered) VALUES (?, ?, ?, 'tunai', ?, ?)`)
      .bind(crypto.randomUUID(), inv.id, shift.id, -total, -total)
      .run();

    await audit(c.env, {
      action: "pos.refund",
      userId: user.id,
      tenantId: tenant.id,
      detail: { returnNo, invoiceNo: inv.invoice_no, total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, returnNo, total, journalNo: journal.entryNo }, 201);
  })

  // -------------------------------------------------------------------------
  // Tahan transaksi (park): simpan/ambil/hapus keranjang sementara per shift.
  // -------------------------------------------------------------------------
  .get("/:tenantId/pos/held", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const shiftId = c.req.query("shiftId") ?? "";
    const { results } = await db
      .prepare(`SELECT id, label, cart, created_at FROM pos_held_sales WHERE shift_id = ? ORDER BY created_at DESC`)
      .bind(shiftId)
      .all<{ id: string; label: string; cart: string; created_at: string }>();
    const held: ApiHeldSale[] = results.map((r) => {
      const parsed = JSON.parse(r.cart) as { cart: unknown; taxRate?: number };
      return {
        id: r.id,
        label: r.label,
        cart: (parsed.cart ?? []) as ApiHeldSale["cart"],
        taxRate: parsed.taxRate ?? 0,
        createdAt: r.created_at,
      };
    });
    return c.json({ held });
  })

  .post("/:tenantId/pos/held", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = holdSaleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results: shifts } = await db
      .prepare(`SELECT id FROM pos_shifts WHERE id = ? AND status = 'open'`)
      .bind(parsed.data.shiftId)
      .all<{ id: string }>();
    if (!shifts[0]) return c.json({ error: "Shift tidak ditemukan atau sudah ditutup." }, 400);
    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO pos_held_sales (id, shift_id, label, cart) VALUES (?, ?, ?, ?)`)
      .bind(id, parsed.data.shiftId, parsed.data.label, JSON.stringify({ cart: parsed.data.cart, taxRate: parsed.data.taxRate ?? 0 }))
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .delete("/:tenantId/pos/held/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const id = c.req.param("id");
    const { results } = await db.prepare(`SELECT id FROM pos_held_sales WHERE id = ?`).bind(id).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Transaksi tahan tidak ditemukan." }, 404);
    await db.prepare(`DELETE FROM pos_held_sales WHERE id = ?`).bind(id).run();
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // Tutup shift: hitung kas fisik, selisih otomatis dijurnal.
  // -------------------------------------------------------------------------
  .post("/:tenantId/pos/shift/:shiftId/close", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = closeShiftSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const shiftId = c.req.param("shiftId");
    const today = new Date().toISOString().slice(0, 10);

    const { results: shifts } = await db
      .prepare(`SELECT id, shift_no, opening_cash FROM pos_shifts WHERE id = ? AND status = 'open'`)
      .bind(shiftId)
      .all<{ id: string; shift_no: string; opening_cash: number }>();
    const shift = shifts[0];
    if (!shift) return c.json({ error: "Shift tidak ditemukan atau sudah ditutup." }, 400);

    const totals = await shiftTotals(db, shiftId);
    const expected = shift.opening_cash + totals.cashTotal;
    const difference = parsed.data.closingCash - expected;

    let journalId: string | null = null;
    if (difference !== 0) {
      const [kas, bebanLain] = await Promise.all([
        accountIdByCode(db, SYS_ACCOUNTS.KAS),
        accountIdByCode(db, "5-4000"),
      ]);
      const memo = `Selisih kas shift ${shift.shift_no} (${difference > 0 ? "lebih" : "kurang"})`;
      const journal = await postJournal(db, {
        entryDate: today,
        memo,
        createdBy: c.get("user").id,
        lines:
          difference < 0
            ? [
                { accountId: bebanLain, description: memo, debit: -difference, credit: 0 },
                { accountId: kas, description: memo, debit: 0, credit: -difference },
              ]
            : [
                { accountId: kas, description: memo, debit: difference, credit: 0 },
                { accountId: bebanLain, description: memo, debit: 0, credit: difference },
              ],
      });
      journalId = journal.id;
    }

    await db
      .prepare(
        `UPDATE pos_shifts SET status = 'closed', expected_cash = ?, closing_cash = ?, difference = ?,
                journal_entry_id = ?, closed_by = ?, closed_at = datetime('now') WHERE id = ?`,
      )
      .bind(expected, parsed.data.closingCash, difference, journalId, c.get("user").id, shiftId)
      .run();

    await audit(c.env, {
      action: "pos.shift_closed",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { shiftNo: shift.shift_no, expected, closingCash: parsed.data.closingCash, difference },
      ip: clientIp(c),
    });
    return c.json({ ok: true, expected, closingCash: parsed.data.closingCash, difference, salesCount: totals.count });
  });

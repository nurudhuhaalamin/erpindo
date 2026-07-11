import {
  closeShiftSchema,
  holdSaleSchema,
  openShiftSchema,
  posSaleSchema,
  type ApiHeldSale,
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
  stockOut,
  SYS_ACCOUNTS,
} from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

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

    const subtotal = input.lines.reduce(
      (s, l) => s + Math.round(l.qty * l.unitPrice * (1 - (l.discountPct ?? 0) / 100)),
      0,
    );
    const taxAmount = Math.round((subtotal * input.taxRate) / 100);
    const total = subtotal + taxAmount;
    if (total === 0) return c.json({ error: "Total tidak boleh nol." }, 400);

    // Pembayaran: pakai `payments` bila ada, jika tidak fallback ke tunai tunggal (legacy).
    const tenders: { method: PosPaymentMethod; amount: number }[] =
      input.payments && input.payments.length > 0
        ? input.payments
        : [{ method: "tunai", amount: input.cashReceived ?? 0 }];
    const tenderedTotal = tenders.reduce((s, p) => s + p.amount, 0);
    if (tenderedTotal < total) return c.json({ error: "Total pembayaran kurang dari total belanja." }, 400);
    const change = tenderedTotal - total;
    // Kembalian hanya dari tunai — pastikan tunai yang diserahkan cukup menutup kembalian.
    const cashTendered = tenders.filter((p) => p.method === "tunai").reduce((s, p) => s + p.amount, 0);
    if (change > cashTendered) return c.json({ error: "Kembalian melebihi uang tunai yang diterima." }, 400);
    // Nilai masuk pembukuan per metode: non-tunai = persis; tunai = tunai diserahkan − kembalian.
    const applied = tenders.map((p) => ({
      method: p.method,
      tendered: p.amount,
      amount: p.method === "tunai" ? p.amount - change : p.amount,
    }));
    const cashApplied = applied.filter((p) => p.method === "tunai").reduce((s, p) => s + p.amount, 0);
    const nonCashApplied = applied.filter((p) => p.method !== "tunai").reduce((s, p) => s + p.amount, 0);

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

    const docNo = await nextDocNo(db, "invoices", "INV");
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
      const paymentNo = await nextDocNo(db, "payments", "PAY");
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

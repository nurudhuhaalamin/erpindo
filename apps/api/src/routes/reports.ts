import {
  AGING_BUCKETS,
  type AgingBucket,
  type ApiAgingRow,
  type ApiCashFlow,
  type ApiDashboard,
  type ApiEfakturReport,
  type ApiEfakturRow,
  type ApiStockCardRow,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { computeBalanceSheet, computeIncomeStatement } from "../lib/reports";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";

/**
 * Laporan keuangan & dashboard. Semua angka dihitung dari jurnal terposting —
 * satu sumber kebenaran, sehingga laporan otomatis konsisten dengan buku besar.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const reportRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Laba Rugi (periode)
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/income-statement", requireAuth, requireTenantRole("viewer"), async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return c.json({ error: "Parameter from/to wajib berformat YYYY-MM-DD." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json(await computeIncomeStatement(db, from, to));
  })

  // -------------------------------------------------------------------------
  // Neraca (per tanggal) — ekuitas menyertakan Laba Berjalan agar seimbang
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/balance-sheet", requireAuth, requireTenantRole("viewer"), async (c) => {
    const asOf = c.req.query("asOf") ?? "";
    if (!DATE_RE.test(asOf)) return c.json({ error: "Parameter asOf wajib berformat YYYY-MM-DD." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json(await computeBalanceSheet(db, asOf));
  })

  // -------------------------------------------------------------------------
  // Arus Kas (metode langsung sederhana): mutasi akun Kas & Bank per periode,
  // dikelompokkan berdasarkan keterangan jurnal.
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/cash-flow", requireAuth, requireTenantRole("viewer"), async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return c.json({ error: "Parameter from/to wajib berformat YYYY-MM-DD." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);

    const CASH_FILTER = `a.code IN ('1-1000', '1-1100')`;

    const { results: openRows } = await db
      .prepare(
        `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
         JOIN accounts a ON a.id = l.account_id
         WHERE ${CASH_FILTER} AND e.entry_date < ?`,
      )
      .bind(from)
      .all<{ balance: number }>();
    const openingBalance = openRows[0]?.balance ?? 0;

    // Delta kas per jurnal dalam periode; label = keterangan jurnal.
    const { results: entries } = await db
      .prepare(
        `SELECT COALESCE(e.memo, 'Lain-lain') AS label, SUM(l.debit - l.credit) AS delta
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
         JOIN accounts a ON a.id = l.account_id
         WHERE ${CASH_FILTER} AND e.entry_date >= ? AND e.entry_date <= ?
         GROUP BY e.id HAVING delta != 0
         ORDER BY e.entry_date, e.entry_no`,
      )
      .bind(from, to)
      .all<{ label: string; delta: number }>();

    const inflows = entries.filter((r) => r.delta > 0).map((r) => ({ label: r.label, amount: r.delta }));
    const outflows = entries.filter((r) => r.delta < 0).map((r) => ({ label: r.label, amount: -r.delta }));
    const totalIn = inflows.reduce((s, r) => s + r.amount, 0);
    const totalOut = outflows.reduce((s, r) => s + r.amount, 0);

    const body: ApiCashFlow = {
      from,
      to,
      openingBalance,
      inflows,
      outflows,
      totalIn,
      totalOut,
      netChange: totalIn - totalOut,
      closingBalance: openingBalance + totalIn - totalOut,
    };
    return c.json(body);
  })

  // -------------------------------------------------------------------------
  // Ekspor e-Faktur: faktur keluaran ber-PPN dalam periode (untuk impor DJP).
  // Nilai DPP/PPN dalam Rupiah (faktur valas sudah dikonversi saat posting).
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/efaktur", requireAuth, requireTenantRole("viewer"), async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return c.json({ error: "Parameter from/to wajib berformat YYYY-MM-DD." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);

    const { results } = await db
      .prepare(
        `SELECT i.invoice_no, i.invoice_date, i.subtotal, i.tax_amount, i.total,
                k.name AS buyer_name, k.npwp AS buyer_npwp
         FROM invoices i JOIN contacts k ON k.id = i.contact_id
         WHERE i.tax_amount > 0 AND i.invoice_date >= ? AND i.invoice_date <= ?
         ORDER BY i.invoice_date, i.invoice_no`,
      )
      .bind(from, to)
      .all<{
        invoice_no: string;
        invoice_date: string;
        subtotal: number;
        tax_amount: number;
        total: number;
        buyer_name: string;
        buyer_npwp: string | null;
      }>();

    const rows: ApiEfakturRow[] = results.map((r) => ({
      invoiceNo: r.invoice_no,
      invoiceDate: r.invoice_date,
      buyerNpwp: r.buyer_npwp,
      buyerName: r.buyer_name,
      dpp: r.subtotal,
      ppn: r.tax_amount,
      total: r.total,
    }));
    const body: ApiEfakturReport = {
      from,
      to,
      rows,
      totalDpp: rows.reduce((s, r) => s + r.dpp, 0),
      totalPpn: rows.reduce((s, r) => s + r.ppn, 0),
    };
    return c.json(body);
  })

  // -------------------------------------------------------------------------
  // Kartu stok: riwayat mutasi satu produk di satu gudang + saldo berjalan
  // -------------------------------------------------------------------------
  .get("/:tenantId/stock-card/:productId", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const productId = c.req.param("productId");
    const warehouseId = c.req.query("warehouseId");
    if (!warehouseId) return c.json({ error: "Parameter warehouseId wajib diisi." }, 400);

    const { results } = await db
      .prepare(
        `SELECT created_at, ref_type, qty, unit_cost FROM stock_movements
         WHERE product_id = ? AND warehouse_id = ? ORDER BY created_at, rowid`,
      )
      .bind(productId, warehouseId)
      .all<{ created_at: string; ref_type: string; qty: number; unit_cost: number }>();

    let balance = 0;
    const rows: ApiStockCardRow[] = results.map((r) => {
      balance += r.qty;
      return { date: r.created_at, refType: r.ref_type, qty: r.qty, unitCost: r.unit_cost, balance };
    });
    return c.json({ rows, balance });
  })

  // -------------------------------------------------------------------------
  // Umur piutang/hutang (aging) per kontak, berdasarkan tanggal jatuh tempo
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/aging", requireAuth, requireTenantRole("viewer"), async (c) => {
    const kind = c.req.query("type");
    if (kind !== "receivable" && kind !== "payable") {
      return c.json({ error: "Parameter type harus 'receivable' atau 'payable'." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const table = kind === "receivable" ? "invoices" : "purchases";
    const dateCol = kind === "receivable" ? "invoice_date" : "purchase_date";

    const { results } = await db
      .prepare(
        `SELECT d.contact_id, k.name AS contact_name, d.total - d.paid_amount - d.returned_amount AS outstanding,
                COALESCE(d.due_date, d.${dateCol}) AS due
         FROM ${table} d JOIN contacts k ON k.id = d.contact_id
         WHERE d.status != 'paid' AND d.total > d.paid_amount + d.returned_amount`,
      )
      .all<{ contact_id: string; contact_name: string; outstanding: number; due: string }>();

    const today = new Date().toISOString().slice(0, 10);
    const byContact = new Map<string, ApiAgingRow>();
    for (const r of results) {
      const days = Math.floor((Date.parse(today) - Date.parse(r.due)) / 86_400_000);
      const bucket: AgingBucket =
        days <= 0 ? "current" : days <= 30 ? "d1_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90_plus";
      const row =
        byContact.get(r.contact_id) ??
        ({
          contactId: r.contact_id,
          contactName: r.contact_name,
          buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>,
          total: 0,
        } satisfies ApiAgingRow);
      row.buckets[bucket] += r.outstanding;
      row.total += r.outstanding;
      byContact.set(r.contact_id, row);
    }

    const rows = [...byContact.values()].sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    return c.json({ rows, grandTotal });
  })

  // -------------------------------------------------------------------------
  // Dashboard: ringkasan angka nyata
  // -------------------------------------------------------------------------
  .get("/:tenantId/dashboard", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM

    const [cashRows, salesRows, arRows, apRows, stockRows, leadRows] = await Promise.all([
      db
        .prepare(
          `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
           FROM journal_lines l
           JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
           JOIN accounts a ON a.id = l.account_id
           WHERE a.code IN ('1-1000', '1-1100')`,
        )
        .all<{ balance: number }>(),
      db
        .prepare(`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS n FROM invoices WHERE invoice_date LIKE ?`)
        .bind(`${monthPrefix}%`)
        .all<{ total: number; n: number }>(),
      db
        .prepare(`SELECT COALESCE(SUM(total - paid_amount - returned_amount), 0) AS outstanding FROM invoices WHERE status != 'paid'`)
        .all<{ outstanding: number }>(),
      db
        .prepare(`SELECT COALESCE(SUM(total - paid_amount - returned_amount), 0) AS outstanding FROM purchases WHERE status != 'paid'`)
        .all<{ outstanding: number }>(),
      db.prepare(`SELECT COALESCE(SUM(qty * avg_cost), 0) AS value FROM stock_levels`).all<{ value: number }>(),
      db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE status = 'open'`).all<{ n: number }>(),
    ]);

    const body: ApiDashboard = {
      cashAndBank: cashRows.results[0]?.balance ?? 0,
      salesThisMonth: salesRows.results[0]?.total ?? 0,
      salesCountThisMonth: salesRows.results[0]?.n ?? 0,
      receivableOutstanding: arRows.results[0]?.outstanding ?? 0,
      payableOutstanding: apRows.results[0]?.outstanding ?? 0,
      inventoryValue: stockRows.results[0]?.value ?? 0,
      openLeadsCount: leadRows.results[0]?.n ?? 0,
    };
    return c.json(body);
  });

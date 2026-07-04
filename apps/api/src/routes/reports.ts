import {
  AGING_BUCKETS,
  type AgingBucket,
  type ApiAgingRow,
  type ApiBalanceSheet,
  type ApiCashFlow,
  type ApiDashboard,
  type ApiIncomeStatement,
  type ApiStockCardRow,
  type AccountType,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { SqlExecutor } from "@erpindo/db";
import type { AppEnv } from "../env";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";

/**
 * Laporan keuangan & dashboard. Semua angka dihitung dari jurnal terposting —
 * satu sumber kebenaran, sehingga laporan otomatis konsisten dengan buku besar.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type BalanceRow = { id: string; code: string; name: string; type: AccountType; debit: number; credit: number };

async function accountBalances(
  db: SqlExecutor,
  opts: { from?: string; to: string; types: AccountType[] },
): Promise<BalanceRow[]> {
  const conds = [`a.type IN (${opts.types.map(() => "?").join(",")})`];
  const params: unknown[] = [...opts.types];
  if (opts.from) {
    conds.push("e.entry_date >= ?");
    params.push(opts.from);
  }
  conds.push("e.entry_date <= ?");
  params.push(opts.to);

  const { results } = await db
    .prepare(
      `SELECT a.id, a.code, a.name, a.type,
              COALESCE(SUM(l.debit), 0) AS debit, COALESCE(SUM(l.credit), 0) AS credit
       FROM accounts a
       JOIN journal_lines l ON l.account_id = a.id
       JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
       WHERE ${conds.join(" AND ")}
       GROUP BY a.id ORDER BY a.code`,
    )
    .bind(...params)
    .all<BalanceRow>();
  return results;
}

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
    const rows = await accountBalances(db, { from, to, types: ["income", "expense"] });

    const income = rows
      .filter((r) => r.type === "income")
      .map((r) => ({ accountId: r.id, code: r.code, name: r.name, amount: r.credit - r.debit }));
    const expense = rows
      .filter((r) => r.type === "expense")
      .map((r) => ({ accountId: r.id, code: r.code, name: r.name, amount: r.debit - r.credit }));

    const totalIncome = income.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expense.reduce((s, r) => s + r.amount, 0);

    const body: ApiIncomeStatement = {
      from,
      to,
      income,
      expense,
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
    };
    return c.json(body);
  })

  // -------------------------------------------------------------------------
  // Neraca (per tanggal) — ekuitas menyertakan Laba Berjalan agar seimbang
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/balance-sheet", requireAuth, requireTenantRole("viewer"), async (c) => {
    const asOf = c.req.query("asOf") ?? "";
    if (!DATE_RE.test(asOf)) return c.json({ error: "Parameter asOf wajib berformat YYYY-MM-DD." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);

    const rows = await accountBalances(db, { to: asOf, types: ["asset", "liability", "equity", "income", "expense"] });

    const section = (type: AccountType, debitNormal: boolean) =>
      rows
        .filter((r) => r.type === type)
        .map((r) => ({
          accountId: r.id,
          code: r.code,
          name: r.name,
          amount: debitNormal ? r.debit - r.credit : r.credit - r.debit,
        }))
        .filter((r) => r.amount !== 0);

    const assets = section("asset", true);
    const liabilities = section("liability", false);
    const equity = section("equity", false);

    // Laba berjalan (pendapatan - beban s.d. tanggal neraca) masuk ke ekuitas.
    const totalIncome = rows.filter((r) => r.type === "income").reduce((s, r) => s + r.credit - r.debit, 0);
    const totalExpense = rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.debit - r.credit, 0);
    const retainedEarnings = totalIncome - totalExpense;
    if (retainedEarnings !== 0) {
      equity.push({ accountId: "laba-berjalan", code: "—", name: "Laba (Rugi) Berjalan", amount: retainedEarnings });
    }

    const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
    const totalEquity = equity.reduce((s, r) => s + r.amount, 0);

    const body: ApiBalanceSheet = {
      asOf,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: totalAssets === totalLiabilities + totalEquity,
    };
    return c.json(body);
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

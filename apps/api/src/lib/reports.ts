import type { AccountType, ApiBalanceSheet, ApiIncomeStatement } from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";

/**
 * Perhitungan laporan keuangan inti (Laba Rugi & Neraca) dari jurnal terposting.
 *
 * Diekstrak agar bisa dipakai ulang oleh laporan per-tenant (routes/reports.ts)
 * maupun konsolidasi lintas perusahaan (routes/consolidation.ts) — satu sumber
 * kebenaran, sehingga angka konsolidasi otomatis konsisten dengan laporan tunggal.
 */

export type BalanceRow = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
};

export async function accountBalances(
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

/** Laba Rugi satu perusahaan untuk periode [from, to]. */
export async function computeIncomeStatement(
  db: SqlExecutor,
  from: string,
  to: string,
): Promise<ApiIncomeStatement> {
  const rows = await accountBalances(db, { from, to, types: ["income", "expense"] });

  const income = rows
    .filter((r) => r.type === "income")
    .map((r) => ({ accountId: r.id, code: r.code, name: r.name, amount: r.credit - r.debit }));
  const expense = rows
    .filter((r) => r.type === "expense")
    .map((r) => ({ accountId: r.id, code: r.code, name: r.name, amount: r.debit - r.credit }));

  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expense.reduce((s, r) => s + r.amount, 0);

  return { from, to, income, expense, totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
}

/** Neraca satu perusahaan per tanggal `asOf` (ekuitas termasuk laba berjalan). */
export async function computeBalanceSheet(db: SqlExecutor, asOf: string): Promise<ApiBalanceSheet> {
  const rows = await accountBalances(db, {
    to: asOf,
    types: ["asset", "liability", "equity", "income", "expense"],
  });

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

  return {
    asOf,
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity,
  };
}

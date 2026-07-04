import { setBudgetSchema, type ApiBudgetReport, type ApiBudgetRow } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Anggaran (Fase 2n): target pendapatan/beban per akun per bulan. Realisasi
 * dihitung langsung dari jurnal terposting — tabel budgets hanya menyimpan
 * target, jadi laporan varians selalu konsisten dengan buku besar.
 */

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const budgetRoutes = new Hono<AppEnv>()

  // Laporan anggaran vs realisasi untuk satu bulan (YYYY-MM).
  .get("/:tenantId/budgets/:period", requireAuth, requireTenantRole("viewer"), async (c) => {
    const period = c.req.param("period");
    if (!PERIOD_RE.test(period)) return c.json({ error: "Periode harus berformat YYYY-MM." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);

    // "YYYY-MM-31" aman sebagai batas atas leksikografis untuk bulan apa pun.
    const from = `${period}-01`;
    const to = `${period}-31`;

    const { results } = await db
      .prepare(
        `SELECT a.id, a.code, a.name, a.type,
                COALESCE(b.amount, 0) AS budget,
                COALESCE((
                  SELECT SUM(l.debit - l.credit)
                  FROM journal_lines l
                  JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
                  WHERE l.account_id = a.id AND e.entry_date >= ? AND e.entry_date <= ?
                ), 0) AS net_debit
         FROM accounts a
         LEFT JOIN budgets b ON b.account_id = a.id AND b.period = ?
         WHERE a.type IN ('income', 'expense') AND a.is_archived = 0
         ORDER BY a.code`,
      )
      .bind(from, to, period)
      .all<{ id: string; code: string; name: string; type: "income" | "expense"; budget: number; net_debit: number }>();

    const rows: ApiBudgetRow[] = results.map((r) => {
      // income: nilai = kredit - debit = -net_debit; beban: nilai = debit - kredit = net_debit.
      const actual = r.type === "income" ? -r.net_debit : r.net_debit;
      const variance = r.type === "income" ? actual - r.budget : r.budget - actual;
      return { accountId: r.id, code: r.code, name: r.name, type: r.type, budget: r.budget, actual, variance };
    });

    const sum = (t: "income" | "expense", k: "budget" | "actual") =>
      rows.filter((r) => r.type === t).reduce((s, r) => s + r[k], 0);

    const body: ApiBudgetReport = {
      period,
      rows,
      totalBudgetIncome: sum("income", "budget"),
      totalActualIncome: sum("income", "actual"),
      totalBudgetExpense: sum("expense", "budget"),
      totalActualExpense: sum("expense", "actual"),
    };
    return c.json(body);
  })

  // Tetapkan/ubah anggaran satu akun untuk satu bulan (upsert).
  .put("/:tenantId/budgets", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = setBudgetSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: accs } = await db
      .prepare(`SELECT type FROM accounts WHERE id = ? AND is_archived = 0`)
      .bind(input.accountId)
      .all<{ type: string }>();
    if (!accs[0]) return c.json({ error: "Akun tidak ditemukan." }, 400);
    if (!["income", "expense"].includes(accs[0].type)) {
      return c.json({ error: "Anggaran hanya untuk akun pendapatan atau beban." }, 400);
    }

    await db
      .prepare(
        `INSERT INTO budgets (id, account_id, period, amount) VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id, period) DO UPDATE SET amount = excluded.amount, updated_at = datetime('now')`,
      )
      .bind(crypto.randomUUID(), input.accountId, input.period, input.amount)
      .run();

    await audit(c.env, {
      action: "budget.set",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { accountId: input.accountId, period: input.period, amount: input.amount },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

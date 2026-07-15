import {
  bankMatchRuleSchema,
  costCenterSchema,
  type ApiBankMatchRule,
  type ApiCostCenter,
  type ApiDimensionReport,
  type ApiDimensionRow,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole, resolvePermissions } from "../middleware/auth";
import { clientIp } from "./auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Akuntansi dimensi (Fase 7f): cost center / departemen opsional per baris jurnal +
 * laporan laba/rugi terfilter dimensi. Plus aturan auto-match rekonsiliasi bank v2.
 * Semua ADDITIVE — jurnal & laporan lama tak berubah (dimensi nullable).
 */
export const dimensionRoutes = new Hono<AppEnv>()
  // --- Cost center (master) -------------------------------------------------
  .get("/:tenantId/cost-centers", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(`SELECT id, code, name, created_at FROM cost_centers WHERE is_archived = 0 ORDER BY code`)
      .all<{ id: string; code: string; name: string; created_at: string }>();
    // RBAC berdimensi (Fase 8d): peran ber-scope hanya melihat cost center-nya.
    const resolved = await resolvePermissions(c.env, c.get("user").id, c.get("tenant").id);
    const scope = resolved?.scopeCostCenterIds ?? null;
    const visible = scope ? results.filter((r) => scope.includes(r.id)) : results;
    const items: ApiCostCenter[] = visible.map((r) => ({ id: r.id, code: r.code, name: r.name, createdAt: r.created_at }));
    return c.json({ items });
  })

  .post("/:tenantId/cost-centers", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = costCenterSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const dup = await db.prepare(`SELECT id FROM cost_centers WHERE code = ?`).bind(parsed.data.code).all<{ id: string }>();
    if (dup.results[0]) return c.json({ error: `Kode '${parsed.data.code}' sudah dipakai.` }, 409);
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO cost_centers (id, code, name) VALUES (?, ?, ?)`).bind(id, parsed.data.code, parsed.data.name).run();
    await audit(c.env, { action: "dimension.cost_center.created", userId: c.get("user").id, tenantId: tenant.id, detail: { code: parsed.data.code }, ip: clientIp(c) });
    return c.json({ ok: true, id }, 201);
  })

  .post("/:tenantId/cost-centers/:id/archive", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    await db.prepare(`UPDATE cost_centers SET is_archived = 1 WHERE id = ?`).bind(c.req.param("id")).run();
    await audit(c.env, { action: "dimension.cost_center.archived", userId: c.get("user").id, tenantId: tenant.id, detail: { id: c.req.param("id") }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  // --- Laporan per dimensi (laba/rugi per cost center) ----------------------
  .get("/:tenantId/reports/dimension", requireAuth, requireTenantRole("viewer"), async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return c.json({ error: "Parameter from/to wajib YYYY-MM-DD." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    // Income = kredit − debit (akun income); Expense = debit − kredit (akun expense).
    const { results } = await db
      .prepare(
        `SELECT l.cost_center_id AS cc_id, cc.code AS cc_code, cc.name AS cc_name,
                COALESCE(SUM(CASE WHEN a.type = 'income' THEN l.credit - l.debit ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN a.type = 'expense' THEN l.debit - l.credit ELSE 0 END), 0) AS expense
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN accounts a ON a.id = l.account_id
         LEFT JOIN cost_centers cc ON cc.id = l.cost_center_id
         WHERE e.status = 'posted' AND e.entry_date >= ? AND e.entry_date <= ? AND a.type IN ('income','expense')
         GROUP BY l.cost_center_id
         HAVING income <> 0 OR expense <> 0
         ORDER BY (income - expense) DESC`,
      )
      .bind(from, to)
      .all<{ cc_id: string | null; cc_code: string | null; cc_name: string | null; income: number; expense: number }>();
    // RBAC berdimensi (Fase 8d): peran ber-scope hanya melihat baris dimensi
    // dalam scope-nya (termasuk menyembunyikan baris "tanpa dimensi").
    const resolvedDim = await resolvePermissions(c.env, c.get("user").id, c.get("tenant").id);
    const scopeDim = resolvedDim?.scopeCostCenterIds ?? null;
    const visibleRows = scopeDim ? results.filter((r) => r.cc_id && scopeDim.includes(r.cc_id)) : results;
    const rows: ApiDimensionRow[] = visibleRows.map((r) => ({
      costCenterId: r.cc_id,
      code: r.cc_code ?? "—",
      name: r.cc_name ?? "(Tanpa dimensi)",
      income: r.income,
      expense: r.expense,
      net: r.income - r.expense,
    }));
    const body: ApiDimensionReport = { from, to, rows };
    return c.json(body);
  })

  // --- Rekonsiliasi bank v2: aturan auto-match tersimpan --------------------
  .get("/:tenantId/bank-match-rules", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(`SELECT id, account_id, keyword, date_tolerance, active, created_at FROM bank_match_rules ORDER BY created_at DESC`)
      .all<{ id: string; account_id: string; keyword: string; date_tolerance: number; active: number; created_at: string }>();
    const rules: ApiBankMatchRule[] = results.map((r) => ({ id: r.id, accountId: r.account_id, keyword: r.keyword, dateTolerance: r.date_tolerance, active: r.active === 1, createdAt: r.created_at }));
    return c.json({ rules });
  })

  .post("/:tenantId/bank-match-rules", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = bankMatchRuleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const acc = await db.prepare(`SELECT id FROM accounts WHERE id = ? AND is_archived = 0`).bind(parsed.data.accountId).all<{ id: string }>();
    if (!acc.results[0]) return c.json({ error: "Akun bank tidak ditemukan." }, 400);
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO bank_match_rules (id, account_id, keyword, date_tolerance) VALUES (?, ?, ?, ?)`).bind(id, parsed.data.accountId, parsed.data.keyword, parsed.data.dateTolerance).run();
    await audit(c.env, { action: "dimension.bank_rule.created", userId: c.get("user").id, tenantId: tenant.id, detail: { keyword: parsed.data.keyword }, ip: clientIp(c) });
    return c.json({ ok: true, id }, 201);
  })

  .delete("/:tenantId/bank-match-rules/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    await db.prepare(`DELETE FROM bank_match_rules WHERE id = ?`).bind(c.req.param("id")).run();
    await audit(c.env, { action: "dimension.bank_rule.deleted", userId: c.get("user").id, tenantId: tenant.id, detail: { id: c.req.param("id") }, ip: clientIp(c) });
    return c.json({ ok: true });
  });

import type {
  ApiConsolidatedBalanceSheet,
  ApiConsolidatedIncomeStatement,
  ApiConsolidatedRow,
  ApiConsolidationCompany,
  ApiReportLine,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { computeBalanceSheet, computeIncomeStatement } from "../lib/reports";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth } from "../middleware/auth";

/**
 * Konsolidasi multi-perusahaan (Fase 2t).
 *
 * Laporan gabungan (Laba Rugi & Neraca) lintas semua tenant yang DIMILIKI —
 * peran `owner` — oleh pengguna yang login. Tidak berada di bawah prefix
 * `/:tenantId` karena secara desain menjangkau banyak tenant sekaligus; setiap
 * tenant tetap diakses lewat db_ref-nya masing-masing (isolasi data terjaga).
 *
 * Baris digabung per KODE akun (seluruh tenant memakai bagan akun yang sama),
 * dengan rincian nilai per perusahaan plus total konsolidasi.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type OwnedTenant = { id: string; name: string; db_ref: string };

/** Tenant yang dimiliki (owner) oleh user, opsional disaring ke daftar id tertentu. */
async function ownedTenants(
  db: AppEnv["Bindings"]["DB"],
  userId: string,
  filterIds?: string[],
): Promise<OwnedTenant[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.name, t.db_ref
       FROM memberships m JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = ? AND m.role = 'owner'
       ORDER BY t.created_at`,
    )
    .bind(userId)
    .all<OwnedTenant>();

  if (!filterIds || filterIds.length === 0) return results;
  const set = new Set(filterIds);
  return results.filter((t) => set.has(t.id));
}

/** Parse ?companies=id,id menjadi array id (kosong = semua). */
function parseCompanyFilter(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Gabungkan baris laporan beberapa perusahaan menjadi baris konsolidasi per
 * kode akun. `perCompany` sudah dalam urutan perusahaan; nilai akun yang sama
 * dijumlahkan ke total dan disimpan terpisah per tenant.
 */
function mergeRows(perCompany: { tenantId: string; rows: ApiReportLine[] }[]): ApiConsolidatedRow[] {
  const map = new Map<string, ApiConsolidatedRow>();
  for (const { tenantId, rows } of perCompany) {
    for (const r of rows) {
      let row = map.get(r.code);
      if (!row) {
        row = { code: r.code, name: r.name, amounts: {}, total: 0 };
        map.set(r.code, row);
      }
      row.amounts[tenantId] = (row.amounts[tenantId] ?? 0) + r.amount;
      row.total += r.amount;
    }
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export const consolidationRoutes = new Hono<AppEnv>()

  // Daftar perusahaan milik user (untuk pemilih di UI konsolidasi).
  .get("/companies", requireAuth, async (c) => {
    const tenants = await ownedTenants(c.env.DB, c.get("user").id);
    const companies: ApiConsolidationCompany[] = tenants.map((t) => ({ tenantId: t.id, name: t.name }));
    return c.json({ companies });
  })

  // Laba Rugi konsolidasi.
  .get("/income-statement", requireAuth, async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return c.json({ error: "Parameter from/to wajib berformat YYYY-MM-DD." }, 400);
    }
    const tenants = await ownedTenants(c.env.DB, c.get("user").id, parseCompanyFilter(c.req.query("companies")));
    if (tenants.length === 0) return c.json({ error: "Tidak ada perusahaan yang dapat dikonsolidasikan." }, 404);

    const companies: ApiConsolidationCompany[] = tenants.map((t) => ({ tenantId: t.id, name: t.name }));
    const totalIncomeByCompany: Record<string, number> = {};
    const totalExpenseByCompany: Record<string, number> = {};
    const netProfitByCompany: Record<string, number> = {};
    const incomeParts: { tenantId: string; rows: ApiReportLine[] }[] = [];
    const expenseParts: { tenantId: string; rows: ApiReportLine[] }[] = [];

    for (const t of tenants) {
      const stmt = await computeIncomeStatement(getTenantDb(c.env, t.db_ref), from, to);
      incomeParts.push({ tenantId: t.id, rows: stmt.income });
      expenseParts.push({ tenantId: t.id, rows: stmt.expense });
      totalIncomeByCompany[t.id] = stmt.totalIncome;
      totalExpenseByCompany[t.id] = stmt.totalExpense;
      netProfitByCompany[t.id] = stmt.netProfit;
    }

    const totalIncome = Object.values(totalIncomeByCompany).reduce((s, v) => s + v, 0);
    const totalExpense = Object.values(totalExpenseByCompany).reduce((s, v) => s + v, 0);

    const body: ApiConsolidatedIncomeStatement = {
      from,
      to,
      companies,
      income: mergeRows(incomeParts),
      expense: mergeRows(expenseParts),
      totalIncomeByCompany,
      totalExpenseByCompany,
      netProfitByCompany,
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
    };
    return c.json(body);
  })

  // Neraca konsolidasi.
  .get("/balance-sheet", requireAuth, async (c) => {
    const asOf = c.req.query("asOf") ?? "";
    if (!DATE_RE.test(asOf)) return c.json({ error: "Parameter asOf wajib berformat YYYY-MM-DD." }, 400);
    const tenants = await ownedTenants(c.env.DB, c.get("user").id, parseCompanyFilter(c.req.query("companies")));
    if (tenants.length === 0) return c.json({ error: "Tidak ada perusahaan yang dapat dikonsolidasikan." }, 404);

    const companies: ApiConsolidationCompany[] = tenants.map((t) => ({ tenantId: t.id, name: t.name }));
    const totalAssetsByCompany: Record<string, number> = {};
    const totalLiabilitiesByCompany: Record<string, number> = {};
    const totalEquityByCompany: Record<string, number> = {};
    const assetParts: { tenantId: string; rows: ApiReportLine[] }[] = [];
    const liabilityParts: { tenantId: string; rows: ApiReportLine[] }[] = [];
    const equityParts: { tenantId: string; rows: ApiReportLine[] }[] = [];

    for (const t of tenants) {
      const bs = await computeBalanceSheet(getTenantDb(c.env, t.db_ref), asOf);
      assetParts.push({ tenantId: t.id, rows: bs.assets });
      liabilityParts.push({ tenantId: t.id, rows: bs.liabilities });
      equityParts.push({ tenantId: t.id, rows: bs.equity });
      totalAssetsByCompany[t.id] = bs.totalAssets;
      totalLiabilitiesByCompany[t.id] = bs.totalLiabilities;
      totalEquityByCompany[t.id] = bs.totalEquity;
    }

    const totalAssets = Object.values(totalAssetsByCompany).reduce((s, v) => s + v, 0);
    const totalLiabilities = Object.values(totalLiabilitiesByCompany).reduce((s, v) => s + v, 0);
    const totalEquity = Object.values(totalEquityByCompany).reduce((s, v) => s + v, 0);

    const body: ApiConsolidatedBalanceSheet = {
      asOf,
      companies,
      assets: mergeRows(assetParts),
      liabilities: mergeRows(liabilityParts),
      equity: mergeRows(equityParts),
      totalAssetsByCompany,
      totalLiabilitiesByCompany,
      totalEquityByCompany,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: totalAssets === totalLiabilities + totalEquity,
    };
    return c.json(body);
  });

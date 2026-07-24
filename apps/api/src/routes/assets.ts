import {
  disposeAssetSchema,
  fixedAssetSchema,
  runDepreciationSchema,
  type ApiFixedAsset,
} from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { accountIdByCode, getLockedBefore, postJournal } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Aset Tetap (Fase 2p): register aset, penyusutan garis lurus otomatis
 * (bulanan via Cron atau manual), dan pelepasan dengan laba/rugi. Akun COA:
 * Aset Tetap 1-1500, Akumulasi Penyusutan 1-1510, Beban Penyusutan 5-5000,
 * laba pelepasan → Pendapatan Lain-lain 4-2000, rugi → Beban Operasional 5-4000.
 */

const ASET_TETAP = "1-1500";
const AKUM_PENYUSUTAN = "1-1510";
const BEBAN_PENYUSUTAN = "5-5000";
const PENDAPATAN_LAIN = "4-2000";
const BEBAN_LAIN = "5-4000";

const monthlyDep = (cost: number, residual: number, lifeMonths: number) =>
  Math.round((cost - residual) / lifeMonths);

/**
 * Jalankan penyusutan garis lurus untuk satu periode (YYYY-MM). Idempotent:
 * aset yang sudah punya entri periode itu atau sudah tersusut penuh dilewati.
 * Memposting satu jurnal gabungan Debit Beban Penyusutan / Kredit Akumulasi.
 * Dipakai endpoint manual maupun Cron bulanan.
 */
export async function runDepreciation(
  db: SqlExecutor,
  period: string,
  date: string,
  userId: string,
): Promise<{ count: number; total: number } | { error: string }> {
  const lockedBefore = await getLockedBefore(db);
  if (lockedBefore && date <= lockedBefore) {
    return { error: `Periode sampai ${lockedBefore} sudah ditutup — penyusutan ditolak.` };
  }

  const { results: assets } = await db
    .prepare(
      `SELECT id, acquisition_cost, residual_value, useful_life_months, accumulated_depreciation
       FROM fixed_assets
       WHERE status = 'active'
         AND accumulated_depreciation < (acquisition_cost - residual_value)
         AND id NOT IN (SELECT asset_id FROM depreciation_entries WHERE period = ?)`,
    )
    .bind(period)
    .all<{
      id: string;
      acquisition_cost: number;
      residual_value: number;
      useful_life_months: number;
      accumulated_depreciation: number;
    }>();

  const items = assets
    .map((a) => {
      const remaining = a.acquisition_cost - a.residual_value - a.accumulated_depreciation;
      const amount = Math.min(monthlyDep(a.acquisition_cost, a.residual_value, a.useful_life_months), remaining);
      return { id: a.id, amount };
    })
    .filter((x) => x.amount > 0);

  if (items.length === 0) return { count: 0, total: 0 };

  const total = items.reduce((s, x) => s + x.amount, 0);
  const [beban, akum] = await Promise.all([
    accountIdByCode(db, BEBAN_PENYUSUTAN),
    accountIdByCode(db, AKUM_PENYUSUTAN),
  ]);

  const journal = await postJournal(db, {
    entryDate: date,
    memo: `Penyusutan aset ${period}`,
    createdBy: userId,
    lines: [
      { accountId: beban, description: `Beban penyusutan ${period}`, debit: total, credit: 0 },
      { accountId: akum, description: `Akumulasi penyusutan ${period}`, debit: 0, credit: total },
    ],
  });

  for (const it of items) {
    await db
      .prepare(
        `INSERT INTO depreciation_entries (id, asset_id, period, amount, journal_entry_id) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), it.id, period, it.amount, journal.id)
      .run();
    await db
      .prepare(`UPDATE fixed_assets SET accumulated_depreciation = accumulated_depreciation + ? WHERE id = ?`)
      .bind(it.amount, it.id)
      .run();
  }

  return { count: items.length, total };
}

type DisposalLine = { accountId: string; description: string; debit: number; credit: number };

/**
 * Susun jurnal pelepasan aset (murni, tanpa DB — bisa diuji langsung):
 * nilai buku = perolehan − akumulasi; laba/rugi = hasil − nilai buku. Jurnal
 * membalik akumulasi & aset, mencatat kas hasil (bila ada), lalu laba (kredit
 * Pendapatan Lain) atau rugi (debit Beban Lain). Baris bernilai nol disaring
 * sehingga jurnal selalu seimbang.
 */
export function buildDisposalJournal(params: {
  assetName: string;
  acquisitionCost: number;
  accumulatedDepreciation: number;
  proceeds: number;
  accounts: { asetTetap: string; akum: string; pendLain: string; bebanLain: string; cash: string };
}): { bookValue: number; gain: number; lines: DisposalLine[] } {
  const { assetName, acquisitionCost, accumulatedDepreciation, proceeds, accounts } = params;
  const bookValue = acquisitionCost - accumulatedDepreciation;
  const gain = proceeds - bookValue; // >0 laba, <0 rugi
  const lines = [
    { accountId: accounts.akum, description: `Pelepasan ${assetName}`, debit: accumulatedDepreciation, credit: 0 },
    ...(proceeds > 0
      ? [{ accountId: accounts.cash, description: `Hasil pelepasan ${assetName}`, debit: proceeds, credit: 0 }]
      : []),
    ...(gain < 0 ? [{ accountId: accounts.bebanLain, description: `Rugi pelepasan ${assetName}`, debit: -gain, credit: 0 }] : []),
    { accountId: accounts.asetTetap, description: `Pelepasan ${assetName}`, debit: 0, credit: acquisitionCost },
    ...(gain > 0 ? [{ accountId: accounts.pendLain, description: `Laba pelepasan ${assetName}`, debit: 0, credit: gain }] : []),
  ].filter((l) => l.debit > 0 || l.credit > 0);
  return { bookValue, gain, lines };
}

async function listAssets(db: SqlExecutor): Promise<ApiFixedAsset[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, category, acquisition_date, acquisition_cost, useful_life_months, residual_value,
              accumulated_depreciation, status, disposed_date
       FROM fixed_assets ORDER BY status, acquisition_date DESC`,
    )
    .all<{
      id: string;
      name: string;
      category: string | null;
      acquisition_date: string;
      acquisition_cost: number;
      useful_life_months: number;
      residual_value: number;
      accumulated_depreciation: number;
      status: "active" | "disposed";
      disposed_date: string | null;
    }>();
  return results.map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    acquisitionDate: a.acquisition_date,
    acquisitionCost: a.acquisition_cost,
    usefulLifeMonths: a.useful_life_months,
    residualValue: a.residual_value,
    accumulatedDepreciation: a.accumulated_depreciation,
    bookValue: a.acquisition_cost - a.accumulated_depreciation,
    monthlyDepreciation: monthlyDep(a.acquisition_cost, a.residual_value, a.useful_life_months),
    status: a.status,
    disposedDate: a.disposed_date,
  }));
}

async function assertCashAccount(db: SqlExecutor, accountId: string): Promise<boolean> {
  const { results } = await db
    .prepare(`SELECT type FROM accounts WHERE id = ? AND is_archived = 0`)
    .bind(accountId)
    .all<{ type: string }>();
  return results[0]?.type === "asset";
}

export const assetRoutes = new Hono<AppEnv>()

  .get("/:tenantId/assets", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ assets: await listAssets(db) });
  })

  .post("/:tenantId/assets", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = fixedAssetSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return c.json({ error: flat.formErrors[0] ?? "Data tidak valid", issues: flat.fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    if (!(await assertCashAccount(db, input.cashAccountId))) {
      return c.json({ error: "Akun pembayar harus akun kas/bank (aset)." }, 400);
    }
    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && input.acquisitionDate <= lockedBefore) {
      return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);
    }

    // Jurnal perolehan: Debit Aset Tetap / Kredit Kas-Bank.
    const asetTetap = await accountIdByCode(db, ASET_TETAP);
    const journal = await postJournal(db, {
      entryDate: input.acquisitionDate,
      memo: `Perolehan aset: ${input.name}`,
      createdBy: c.get("user").id,
      lines: [
        { accountId: asetTetap, description: input.name, debit: input.acquisitionCost, credit: 0 },
        { accountId: input.cashAccountId, description: input.name, debit: 0, credit: input.acquisitionCost },
      ],
    });

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO fixed_assets (id, name, category, acquisition_date, acquisition_cost, useful_life_months,
                                   residual_value, journal_entry_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.name,
        input.category ?? null,
        input.acquisitionDate,
        input.acquisitionCost,
        input.usefulLifeMonths,
        input.residualValue,
        journal.id,
        c.get("user").id,
      )
      .run();

    await audit(c.env, {
      action: "asset.registered",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, name: input.name, cost: input.acquisitionCost },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .post("/:tenantId/assets/depreciation", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = runDepreciationSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const result = await runDepreciation(db, parsed.data.period, parsed.data.date, c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, 400);

    await audit(c.env, {
      action: "asset.depreciated",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { period: parsed.data.period, count: result.count, total: result.total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, ...result });
  })

  .post("/:tenantId/assets/:id/dispose", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = disposeAssetSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const input = parsed.data;

    const { results } = await db
      .prepare(`SELECT name, acquisition_cost, accumulated_depreciation, status FROM fixed_assets WHERE id = ?`)
      .bind(id)
      .all<{ name: string; acquisition_cost: number; accumulated_depreciation: number; status: string }>();
    const asset = results[0];
    if (!asset) return c.json({ error: "Aset tidak ditemukan." }, 404);
    if (asset.status === "disposed") return c.json({ error: "Aset sudah dilepas." }, 400);
    if (input.proceeds > 0 && !(await assertCashAccount(db, input.cashAccountId))) {
      return c.json({ error: "Akun penerima harus akun kas/bank (aset)." }, 400);
    }
    const lockError = await getLockedBefore(db);
    if (lockError && input.disposalDate <= lockError) {
      return c.json({ error: `Periode sampai ${lockError} sudah ditutup.` }, 400);
    }

    const [asetTetap, akum, pendLain, bebanLain] = await Promise.all([
      accountIdByCode(db, ASET_TETAP),
      accountIdByCode(db, AKUM_PENYUSUTAN),
      accountIdByCode(db, PENDAPATAN_LAIN),
      accountIdByCode(db, BEBAN_LAIN),
    ]);
    const { bookValue, gain, lines } = buildDisposalJournal({
      assetName: asset.name,
      acquisitionCost: asset.acquisition_cost,
      accumulatedDepreciation: asset.accumulated_depreciation,
      proceeds: input.proceeds,
      accounts: { asetTetap, akum, pendLain, bebanLain, cash: input.cashAccountId },
    });

    const journal = await postJournal(db, {
      entryDate: input.disposalDate,
      memo: `Pelepasan aset: ${asset.name}`,
      createdBy: c.get("user").id,
      lines,
    });

    await db
      .prepare(`UPDATE fixed_assets SET status = 'disposed', disposed_date = ? WHERE id = ?`)
      .bind(input.disposalDate, id)
      .run();

    await audit(c.env, {
      action: "asset.disposed",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, name: asset.name, proceeds: input.proceeds, gain },
      ip: clientIp(c),
    });
    return c.json({ ok: true, bookValue, gain, journalNo: journal.entryNo }, 201);
  });

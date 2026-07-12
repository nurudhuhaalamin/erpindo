import { runRecapSchema, type ApiReportSnapshot } from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Laporan terjadwal (Fase 7h). Cron harian menyusun rekap penjualan bulan lalu
 * di awal bulan dan menyimpannya sebagai snapshot (idempotent per kind+period).
 * v1 menulis snapshot in-app (dibaca di dashboard) — email berkala menyusul saat
 * domain pengirim terverifikasi. Snapshot juga dapat dipicu manual (run-now).
 */

const KIND_MONTHLY_SALES = "monthly_sales";

type RecapPayload = {
  totalRevenue: number;
  invoiceCount: number;
  topProduct: string | null;
  note?: string;
};

/**
 * Susun rekap penjualan satu bulan (YYYY-MM) dan simpan sebagai snapshot.
 * Idempotent: memakai UNIQUE(kind, period) + upsert. Dipakai Cron & pemicu manual.
 */
export async function runMonthlyRecap(
  db: SqlExecutor,
  period: string,
  userId: string | null,
): Promise<{ period: string; payload: RecapPayload }> {
  const from = `${period}-01`;
  const to = `${period}-31`;

  const totalRes = await db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS n
       FROM invoices WHERE voided_at IS NULL AND invoice_date BETWEEN ? AND ?`,
    )
    .bind(from, to)
    .all<{ total: number; n: number }>();

  const topRes = await db
    .prepare(
      `SELECT p.name AS name, SUM(il.amount) AS revenue
       FROM invoice_lines il
       JOIN invoices i ON i.id = il.invoice_id
       JOIN products p ON p.id = il.product_id
       WHERE i.voided_at IS NULL AND i.invoice_date BETWEEN ? AND ?
       GROUP BY p.id ORDER BY revenue DESC LIMIT 1`,
    )
    .bind(from, to)
    .all<{ name: string; revenue: number }>();

  const payload: RecapPayload = {
    totalRevenue: totalRes.results[0]?.total ?? 0,
    invoiceCount: totalRes.results[0]?.n ?? 0,
    topProduct: topRes.results[0]?.name ?? null,
  };
  const title = `Rekap penjualan ${period}`;

  // Upsert idempoten: perbarui payload bila periode sudah pernah direkap.
  await db
    .prepare(
      `INSERT INTO report_snapshots (id, kind, period, title, payload, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (kind, period) DO UPDATE SET
         title = excluded.title, payload = excluded.payload,
         created_by = excluded.created_by, created_at = datetime('now')`,
    )
    .bind(crypto.randomUUID(), KIND_MONTHLY_SALES, period, title, JSON.stringify(payload), userId)
    .run();

  return { period, payload };
}

/** Bulan sebelum bulan berjalan (YYYY-MM). */
export function previousMonth(nowIso: string): string {
  const now = new Date(nowIso);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return prev.toISOString().slice(0, 7);
}

async function listSnapshots(db: SqlExecutor): Promise<ApiReportSnapshot[]> {
  const { results } = await db
    .prepare(
      `SELECT id, kind, period, title, payload, created_at
       FROM report_snapshots ORDER BY period DESC, created_at DESC LIMIT 24`,
    )
    .all<{ id: string; kind: string; period: string; title: string; payload: string; created_at: string }>();

  return results.map((r) => {
    let summary: ApiReportSnapshot["summary"] = { totalRevenue: 0, invoiceCount: 0, topProduct: null };
    try {
      summary = { ...summary, ...(JSON.parse(r.payload) as RecapPayload) };
    } catch {
      summary.note = "Payload tidak dapat dibaca";
    }
    return { id: r.id, kind: r.kind, period: r.period, title: r.title, summary, createdAt: r.created_at };
  });
}

export const scheduledReportsRoutes = new Hono<AppEnv>()
  .get("/:tenantId/report-snapshots", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ snapshots: await listSnapshots(db) });
  })

  // Pemicu manual: susun/ perbarui rekap satu periode (idempotent).
  .post("/:tenantId/report-snapshots/run", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = runRecapSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const res = await runMonthlyRecap(db, parsed.data.period, c.get("user").id);

    await audit(c.env, {
      action: "report.recap_generated",
      userId: c.get("user").id,
      tenantId: c.get("tenant").id,
      detail: { period: res.period, ...res.payload },
      ip: clientIp(c),
    });
    return c.json({ ok: true, period: res.period, summary: res.payload });
  });

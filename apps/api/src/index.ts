import { applyMigrations, CONTROL_PLANE_MIGRATIONS } from "@erpindo/db";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Env } from "./env";
import { accountingRoutes } from "./routes/accounting";
import { authRoutes } from "./routes/auth";
import { commerceRoutes } from "./routes/commerce";
import { reportRoutes } from "./routes/reports";
import { returnRoutes } from "./routes/returns";
import { masterDataRoutes } from "./routes/masterdata";
import { inviteRoutes, tenantRoutes } from "./routes/tenants";

/**
 * Worker utama erpindo: API Hono di bawah /api/*, sisanya SPA dari binding
 * assets (dikonfigurasi run_worker_first di wrangler.jsonc).
 */

let migrated = false;
async function ensureMigrated(env: Env): Promise<void> {
  if (migrated) return;
  const applied = await applyMigrations(env.DB, CONTROL_PLANE_MIGRATIONS);
  if (applied.length > 0) console.log(`[db] migrasi control-plane diterapkan: ${applied.join(", ")}`);
  migrated = true;
}

const app = new Hono<AppEnv>()
  .use(
    secureHeaders({
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
      xFrameOptions: "DENY",
    }),
  )
  .use(async (c, next) => {
    await ensureMigrated(c.env);
    await next();
  })
  .get("/api/health", (c) => c.json({ ok: true, service: "erpindo", time: new Date().toISOString() }))
  .route("/api/auth", authRoutes)
  .route("/api/tenants", tenantRoutes)
  .route("/api/tenants", accountingRoutes)
  .route("/api/tenants", masterDataRoutes)
  .route("/api/tenants", commerceRoutes)
  .route("/api/tenants", reportRoutes)
  .route("/api/tenants", returnRoutes)
  .route("/api/invites", inviteRoutes)
  .notFound((c) =>
    c.req.path.startsWith("/api/")
      ? c.json({ error: "Endpoint tidak ditemukan." }, 404)
      : c.env.ASSETS.fetch(c.req.raw),
  )
  .onError((err, c) => {
    console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
    return c.json({ error: "Terjadi kesalahan pada server." }, 500);
  });

/**
 * Job terjadwal (Cron Trigger harian): siklus hidup langganan.
 * Trial yang habis → status past_due (mode baca-saja; ditegakkan middleware).
 * Saat billing gateway aktif, job ini juga akan membuat tagihan perpanjangan.
 */
async function scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
  await ensureMigrated(env);
  const nowIso = new Date().toISOString();
  const { results } = await env.DB.prepare(
    `SELECT id, name FROM tenants WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < ?`,
  )
    .bind(nowIso)
    .all<{ id: string; name: string }>();

  for (const tenant of results) {
    await env.DB.prepare(`UPDATE tenants SET status = 'past_due' WHERE id = ?`).bind(tenant.id).run();
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
       VALUES (?, ?, NULL, 'billing.trial_expired', ?, NULL, ?)`,
    )
      .bind(crypto.randomUUID(), tenant.id, JSON.stringify({ name: tenant.name }), nowIso)
      .run();
  }
  if (results.length > 0) console.log(`[cron] ${results.length} tenant trial berakhir → past_due`);
}

export default { fetch: app.fetch, scheduled };

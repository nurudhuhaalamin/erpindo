import { applyMigrations, CONTROL_PLANE_MIGRATIONS } from "@erpindo/db";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Env } from "./env";
import { authRoutes } from "./routes/auth";
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

export default app;

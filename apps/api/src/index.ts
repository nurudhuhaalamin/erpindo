import { applyMigrations, CONTROL_PLANE_MIGRATIONS } from "@erpindo/db";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Env } from "./env";
import { getMailer } from "./lib/mailer";
import { getTenantDb } from "./lib/tenantDb";
import { accountingRoutes } from "./routes/accounting";
import { aiRoutes } from "./routes/ai";
import { assetRoutes, runDepreciation } from "./routes/assets";
import { authRoutes } from "./routes/auth";
import { budgetRoutes } from "./routes/budgets";
import { commerceRoutes } from "./routes/commerce";
import { consolidationRoutes } from "./routes/consolidation";
import { contractRoutes, runBilling } from "./routes/contracts";
import { crmRoutes } from "./routes/crm";
import { currencyRoutes } from "./routes/currencies";
import { financeExtraRoutes, runScheduledTemplates } from "./routes/financeExtras";
import { helpdeskRoutes } from "./routes/helpdesk";
import { maintenanceRoutes, runMaintenance } from "./routes/maintenance";
import { manufacturingRoutes } from "./routes/manufacturing";
import { reportRoutes } from "./routes/reports";
import { posRoutes } from "./routes/pos";
import { returnRoutes } from "./routes/returns";
import { masterDataRoutes } from "./routes/masterdata";
import { payrollRoutes } from "./routes/payroll";
import { procurementRoutes } from "./routes/procurement";
import { projectRoutes } from "./routes/projects";
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
  .route("/api/tenants", financeExtraRoutes)
  .route("/api/tenants", aiRoutes)
  .route("/api/tenants", masterDataRoutes)
  .route("/api/tenants", commerceRoutes)
  .route("/api/tenants", reportRoutes)
  .route("/api/tenants", returnRoutes)
  .route("/api/tenants", posRoutes)
  .route("/api/tenants", crmRoutes)
  .route("/api/tenants", budgetRoutes)
  .route("/api/tenants", payrollRoutes)
  .route("/api/tenants", assetRoutes)
  .route("/api/tenants", projectRoutes)
  .route("/api/tenants", procurementRoutes)
  .route("/api/tenants", currencyRoutes)
  .route("/api/tenants", contractRoutes)
  .route("/api/tenants", manufacturingRoutes)
  .route("/api/tenants", maintenanceRoutes)
  .route("/api/tenants", helpdeskRoutes)
  .route("/api/consolidation", consolidationRoutes)
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

/** Email semua Owner sebuah tenant. */
async function ownerEmails(env: Env, tenantId: string): Promise<{ email: string; name: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT u.email, u.name FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.tenant_id = ? AND m.role = 'owner'`,
  )
    .bind(tenantId)
    .all<{ email: string; name: string }>();
  return results;
}

/**
 * Job terjadwal (Cron Trigger harian): siklus hidup langganan.
 * - Trial habis → status past_due (baca-saja) + email pemberitahuan ke Owner.
 * - Trial akan berakhir ≤3 hari → email pengingat (sekali, ditandai via KV).
 * Saat billing gateway aktif, job ini juga akan membuat tagihan perpanjangan.
 */
async function scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
  await ensureMigrated(env);
  const mailer = getMailer(env);
  const nowIso = new Date().toISOString();

  // 1) Trial berakhir → past_due + email.
  const { results: expired } = await env.DB.prepare(
    `SELECT id, name FROM tenants WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < ?`,
  )
    .bind(nowIso)
    .all<{ id: string; name: string }>();

  for (const tenant of expired) {
    await env.DB.prepare(`UPDATE tenants SET status = 'past_due' WHERE id = ?`).bind(tenant.id).run();
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
       VALUES (?, ?, NULL, 'billing.trial_expired', ?, NULL, ?)`,
    )
      .bind(crypto.randomUUID(), tenant.id, JSON.stringify({ name: tenant.name }), nowIso)
      .run();

    const settingsUrl = env.APP_URL ? `\n\nAktifkan langganan untuk kembali mencatat transaksi:\n${env.APP_URL}/app/pengaturan` : "\n\nAktifkan langganan untuk kembali mencatat transaksi lewat menu Pengaturan.";
    for (const owner of await ownerEmails(env, tenant.id)) {
      await mailer.send({
        to: owner.email,
        subject: `Masa trial ${tenant.name} telah berakhir`,
        text: `Halo ${owner.name},\n\nMasa trial ${tenant.name} di erpindo telah berakhir. Akun kini dalam mode baca-saja — seluruh data Anda tetap aman dan bisa dilihat.${settingsUrl}\n\n— Tim erpindo`,
      });
    }
  }
  if (expired.length > 0) console.log(`[cron] ${expired.length} tenant trial berakhir → past_due`);

  // 2) Pengingat trial akan berakhir dalam ≤3 hari (sekali per tenant).
  const in3Days = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const { results: expiring } = await env.DB.prepare(
    `SELECT id, name, trial_ends_at FROM tenants
     WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at >= ? AND trial_ends_at <= ?`,
  )
    .bind(nowIso, in3Days)
    .all<{ id: string; name: string; trial_ends_at: string }>();

  for (const tenant of expiring) {
    const kvKey = `notified:trial-reminder:${tenant.id}`;
    if (await env.RATE_KV.get(kvKey)) continue;
    const daysLeft = Math.max(Math.ceil((Date.parse(tenant.trial_ends_at) - Date.now()) / 86_400_000), 0);
    for (const owner of await ownerEmails(env, tenant.id)) {
      await mailer.send({
        to: owner.email,
        subject: `Trial ${tenant.name} berakhir ${daysLeft} hari lagi`,
        text: `Halo ${owner.name},\n\nMasa trial ${tenant.name} di erpindo akan berakhir dalam ${daysLeft} hari. Setelah itu akun menjadi baca-saja (data tetap aman).\n\nAktifkan langganan agar operasional tidak terputus.\n\n— Tim erpindo`,
      });
    }
    await env.RATE_KV.put(kvKey, "1", { expirationTtl: 4 * 86_400 });
  }

  // 3) Penyusutan aset tetap — jalankan sekali di awal bulan untuk bulan lalu.
  //    Idempotent (unik per aset+periode), aman bila cron terpicu berulang.
  const now = new Date();
  if (now.getUTCDate() === 1) {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const period = prev.toISOString().slice(0, 7); // YYYY-MM bulan lalu
    const date = nowIso.slice(0, 10); // dijalankan hari ini (periode berjalan sudah terbuka)
    const { results: tenants } = await env.DB.prepare(
      `SELECT id, db_ref FROM tenants WHERE status IN ('active', 'trial')`,
    ).all<{ id: string; db_ref: string }>();

    let depTenants = 0;
    for (const t of tenants) {
      try {
        const db = getTenantDb(env, t.db_ref);
        const res = await runDepreciation(db, period, date, "system");
        if ("count" in res && res.count > 0) {
          depTenants++;
          await env.DB.prepare(
            `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
             VALUES (?, ?, NULL, 'asset.depreciated', ?, NULL, ?)`,
          )
            .bind(crypto.randomUUID(), t.id, JSON.stringify({ period, count: res.count, total: res.total }), nowIso)
            .run();
        }
      } catch (err) {
        console.error(`[cron] penyusutan tenant ${t.id} gagal:`, err);
      }
    }
    if (depTenants > 0) console.log(`[cron] penyusutan ${period} diposting untuk ${depTenants} tenant`);
  }

  // 4) Tagihan berulang — setiap hari terbitkan faktur kontrak yang jatuh tempo.
  const todayDate = nowIso.slice(0, 10);
  const { results: billTenants } = await env.DB.prepare(
    `SELECT id, db_ref FROM tenants WHERE status IN ('active', 'trial')`,
  ).all<{ id: string; db_ref: string }>();
  let billed = 0;
  for (const t of billTenants) {
    try {
      const db = getTenantDb(env, t.db_ref);
      // Template jurnal berulang terjadwal (Fase 5d) — harian, idempotent
      // karena next_run_date selalu dimajukan sebulan setelah diproses.
      const tpl = await runScheduledTemplates(db, todayDate, "system");
      if (tpl.posted > 0) console.log(`[cron] ${tpl.posted} jurnal template diposting untuk tenant ${t.id}`);
      const res = await runBilling(db, todayDate, "system");
      if (res.issued > 0) {
        billed += res.issued;
        await env.DB.prepare(
          `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
           VALUES (?, ?, NULL, 'contract.billed', ?, NULL, ?)`,
        )
          .bind(crypto.randomUUID(), t.id, JSON.stringify(res), nowIso)
          .run();
      }
    } catch (err) {
      console.error(`[cron] tagihan berulang tenant ${t.id} gagal:`, err);
    }
  }
  if (billed > 0) console.log(`[cron] ${billed} faktur kontrak diterbitkan`);

  // 5) Servis aset — terbitkan work order untuk jadwal servis yang jatuh tempo.
  let woGenerated = 0;
  for (const t of billTenants) {
    try {
      const db = getTenantDb(env, t.db_ref);
      const res = await runMaintenance(db, todayDate, "system");
      if (res.generated > 0) {
        woGenerated += res.generated;
        await env.DB.prepare(
          `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
           VALUES (?, ?, NULL, 'maintenance.generated', ?, NULL, ?)`,
        )
          .bind(crypto.randomUUID(), t.id, JSON.stringify(res), nowIso)
          .run();
      }
    } catch (err) {
      console.error(`[cron] servis aset tenant ${t.id} gagal:`, err);
    }
  }
  if (woGenerated > 0) console.log(`[cron] ${woGenerated} work order servis diterbitkan`);
}

export default { fetch: app.fetch, scheduled };

import { applyMigrations, CONTROL_PLANE_MIGRATIONS } from "@erpindo/db";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Env } from "./env";
import { getMailer } from "./lib/mailer";
import { getTenantDb, migrateAllTenants } from "./lib/tenantDb";
import { accountingRoutes } from "./routes/accounting";
import { aiRoutes } from "./routes/ai";
import { approvalEngineRoutes } from "./routes/approvalsEngine";
import { assetRoutes, runDepreciation } from "./routes/assets";
import { adminRoutes, feedbackRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { billingRoutes, billingWebhookRoutes } from "./routes/billing";
import { blogRoutes } from "./routes/blog";
import { googleAuthRoutes } from "./routes/authGoogle";
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
import { salesOrderRoutes } from "./routes/salesOrders";
import { stockAdvancedRoutes } from "./routes/stockAdvanced";
import { taxRoutes } from "./routes/tax";
import { dimensionRoutes } from "./routes/dimensions";
import { manufacturingRoutingRoutes } from "./routes/manufacturingRouting";
import { projectRoutes } from "./routes/projects";
import { driveCallbackRoutes, driveRoutes, runDriveBackup } from "./routes/drive";
import { exportRoutes } from "./routes/export";
import { orgStructureRoutes } from "./routes/orgStructure";
import { previousMonth, runMonthlyRecap, scheduledReportsRoutes } from "./routes/scheduledReports";
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
    // Pengerasan header keamanan (Fase 10h). CSP dirancang agar TIDAK memutus:
    // SPA (skrip & gaya self, gaya inline React), blog SSR (gaya inline),
    // Workers AI & seluruh API (connect self), login Google (redirect 302).
    // CATATAN: JANGAN aktifkan upgrade-insecure-requests — dev/CI berjalan di
    // http://127.0.0.1 dan akan rusak bila permintaan dipaksa ke https.
    secureHeaders({
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
      xFrameOptions: "DENY",
      referrerPolicy: "strict-origin-when-cross-origin",
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
    }),
  )
  .use(async (c, next) => {
    await ensureMigrated(c.env);
    await next();
  })
  .get("/api/health", (c) => c.json({ ok: true, service: "erpindo", time: new Date().toISOString() }))
  .route("/api/auth/google", googleAuthRoutes)
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
  .route("/api/tenants", approvalEngineRoutes)
  .route("/api/tenants", salesOrderRoutes)
  .route("/api/tenants", stockAdvancedRoutes)
  .route("/api/tenants", taxRoutes)
  .route("/api/tenants", dimensionRoutes)
  .route("/api/tenants", currencyRoutes)
  .route("/api/tenants", contractRoutes)
  .route("/api/tenants", manufacturingRoutes)
  .route("/api/tenants", manufacturingRoutingRoutes)
  .route("/api/tenants", maintenanceRoutes)
  .route("/api/tenants", scheduledReportsRoutes)
  .route("/api/tenants", exportRoutes)
  .route("/api/tenants", orgStructureRoutes)
  .route("/api/tenants", driveRoutes)
  .route("/api/drive", driveCallbackRoutes)
  .route("/api/tenants", billingRoutes)
  .route("/api/billing", billingWebhookRoutes)
  .route("/api/admin", adminRoutes)
  .route("/api/feedback", feedbackRoutes)
  .route("/", blogRoutes)
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
/** Grup stagger 0–2 per tenant: beban tugas bulanan disebar ke tanggal 1–3. */
function monthlyGroup(tenantId: string): number {
  let acc = 0;
  for (const ch of tenantId) acc = (acc + ch.charCodeAt(0)) % 3;
  return acc;
}

/** Marker idempoten tugas bulanan per tenant (KV): run yang mati di tengah
 *  akan dilanjutkan hari berikutnya tanpa mengulang tenant yang sudah beres. */
async function monthlyDone(env: Env, task: string, tenantId: string, month: string): Promise<boolean> {
  return Boolean(await env.RATE_KV.get(`cron:m:${task}:${tenantId}:${month}`));
}
async function markMonthlyDone(env: Env, task: string, tenantId: string, month: string): Promise<void> {
  await env.RATE_KV.put(`cron:m:${task}:${tenantId}:${month}`, "1", { expirationTtl: 40 * 86_400 });
}

async function scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
  await ensureMigrated(env);

  // Sapu migrasi skema tenant: pastikan SETIAP tenant — termasuk yang jarang
  // dibuka dan hanya disentuh cron — memakai skema terkini sebelum tugas bisnis
  // di bawah menyentuh database mereka. Murah bila semua sudah mutakhir (hanya
  // satu SELECT + banding versi). Melengkapi auto-migrasi malas di middleware.
  try {
    const migr = await migrateAllTenants(env);
    const bumped = migr.filter((r) => r.applied.length > 0);
    const failed = migr.filter((r) => !r.ok);
    if (bumped.length > 0) console.log(`[cron] migrasi skema tenant: ${bumped.length} tenant dimutakhirkan`);
    if (failed.length > 0) console.error(`[cron] migrasi skema gagal untuk ${failed.length} tenant: ${failed.map((r) => r.slug).join(", ")}`);
  } catch (err) {
    console.error(`[cron] sapu migrasi skema tenant galat:`, err);
  }

  const mailer = getMailer(env);
  const nowIso = new Date().toISOString();
  // Anggaran wall-clock lunak: Worker punya batas waktu/subrequest — lebih baik
  // berhenti rapi (tenant sisa dilanjutkan run berikutnya via marker/idempotensi).
  const startedMs = Date.now();
  const overBudget = () => Date.now() - startedMs > 20_000;

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

  // 1b) Langganan berbayar habis (Fase 11b): active → past_due saat
  //     subscription_ends_at lewat. Comped (subscription_ends_at NULL) tak
  //     tersentuh. Bayar via Midtrans mengembalikan ke 'active' lewat webhook.
  const { results: lapsed } = await env.DB.prepare(
    `SELECT id, name FROM tenants WHERE status = 'active' AND subscription_ends_at IS NOT NULL AND subscription_ends_at < ?`,
  )
    .bind(nowIso)
    .all<{ id: string; name: string }>();
  for (const tenant of lapsed) {
    await env.DB.prepare(`UPDATE tenants SET status = 'past_due' WHERE id = ?`).bind(tenant.id).run();
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
       VALUES (?, ?, NULL, 'billing.subscription_lapsed', ?, NULL, ?)`,
    )
      .bind(crypto.randomUUID(), tenant.id, JSON.stringify({ name: tenant.name }), nowIso)
      .run();
    for (const owner of await ownerEmails(env, tenant.id)) {
      await mailer.send({
        to: owner.email,
        subject: `Langganan ${tenant.name} telah berakhir`,
        text: `Halo ${owner.name},\n\nLangganan ${tenant.name} di ERPindo telah berakhir dan akun kini dalam mode baca-saja. Perpanjang langganan lewat menu Pengaturan agar operasional kembali normal — data Anda tetap aman.\n\n— Tim ERPindo`,
      });
    }
  }
  if (lapsed.length > 0) console.log(`[cron] ${lapsed.length} langganan berakhir → past_due`);

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

  // 3) Tugas bulanan (penyusutan, rekap, backup Drive) — jendela tanggal 1–3.
  //    Fase 9a: beban disebar per grup tenant (tanggal 1/2/3) + marker KV
  //    idempoten, sehingga run yang mati di tengah dilanjutkan tanpa mengulang
  //    dan puncak subrequest hari-1 turun ~1/3. Semua tugas tetap idempoten di
  //    lapis DB (unik per periode), marker hanya penghemat kerja ulang.
  const now = new Date();
  const day = now.getUTCDate();
  if (day >= 1 && day <= 3) {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const period = prev.toISOString().slice(0, 7); // YYYY-MM bulan lalu
    const date = nowIso.slice(0, 10); // dijalankan hari ini (periode berjalan sudah terbuka)
    const { results: tenants } = await env.DB.prepare(
      `SELECT id, db_ref FROM tenants WHERE status IN ('active', 'trial')`,
    ).all<{ id: string; db_ref: string }>();
    // Grup 0 diproses mulai tanggal 1, grup 1 mulai tanggal 2, grup 2 tanggal 3;
    // tanggal 3 sekaligus menyapu semua yang belum bertanda (resume).
    const dueTenants = tenants.filter((t) => day >= monthlyGroup(t.id) + 1);

    let depTenants = 0;
    for (const t of dueTenants) {
      if (overBudget()) {
        console.log(`[cron] anggaran waktu habis — penyusutan dilanjutkan run berikutnya`);
        break;
      }
      try {
        if (await monthlyDone(env, "dep", t.id, period)) continue;
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
        await markMonthlyDone(env, "dep", t.id, period);
      } catch (err) {
        console.error(`[cron] penyusutan tenant ${t.id} gagal:`, err);
      }
    }
    if (depTenants > 0) console.log(`[cron] penyusutan ${period} diposting untuk ${depTenants} tenant`);

    // 3b) Laporan terjadwal (Fase 7h): rekap penjualan bulan lalu per tenant.
    //     Idempotent (UNIQUE kind+period), aman bila cron terpicu berulang.
    const recapPeriod = previousMonth(nowIso);
    let recapTenants = 0;
    for (const t of dueTenants) {
      if (overBudget()) {
        console.log(`[cron] anggaran waktu habis — rekap dilanjutkan run berikutnya`);
        break;
      }
      try {
        if (await monthlyDone(env, "recap", t.id, recapPeriod)) continue;
        const db = getTenantDb(env, t.db_ref);
        await runMonthlyRecap(db, recapPeriod, null);
        recapTenants++;
        await env.DB.prepare(
          `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
           VALUES (?, ?, NULL, 'report.recap_generated', ?, NULL, ?)`,
        )
          .bind(crypto.randomUUID(), t.id, JSON.stringify({ period: recapPeriod }), nowIso)
          .run();
        await markMonthlyDone(env, "recap", t.id, recapPeriod);
      } catch (err) {
        console.error(`[cron] rekap penjualan tenant ${t.id} gagal:`, err);
      }
    }
    if (recapTenants > 0) console.log(`[cron] rekap penjualan ${recapPeriod} disusun untuk ${recapTenants} tenant`);

    // 3c) Backup Google Drive bulanan (Fase 8b) — hanya tenant yang tersambung
    //     dan hanya bila integrasi dikonfigurasi. Backup = operasi baca, tetap
    //     dijalankan untuk tenant past_due (data milik pengguna).
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      const { results: connected } = await env.DB.prepare(
        `SELECT t.id, t.name, t.slug, t.db_ref FROM drive_connections dc JOIN tenants t ON t.id = dc.tenant_id`,
      ).all<{ id: string; name: string; slug: string; db_ref: string }>();
      let backedUp = 0;
      for (const t of connected.filter((t) => day >= monthlyGroup(t.id) + 1)) {
        if (overBudget()) {
          console.log(`[cron] anggaran waktu habis — backup Drive dilanjutkan run berikutnya`);
          break;
        }
        try {
          if (await monthlyDone(env, "drive", t.id, period)) continue;
          const res = await runDriveBackup(env, { id: t.id, name: t.name, slug: t.slug, dbRef: t.db_ref });
          if (res.ok) {
            backedUp++;
            await markMonthlyDone(env, "drive", t.id, period);
          } else console.error(`[cron] backup Drive tenant ${t.id} gagal: ${res.error}`);
        } catch (err) {
          console.error(`[cron] backup Drive tenant ${t.id} galat:`, err);
        }
      }
      if (backedUp > 0) console.log(`[cron] backup Drive bulanan sukses untuk ${backedUp} tenant`);
    }
  }

  // 4) Tugas harian per tenant dalam SATU loop (Fase 9a — sebelumnya dua loop
  //    terpisah menggandakan koneksi tenant): template jurnal terjadwal,
  //    tagihan kontrak berulang, dan work order servis. Semuanya idempoten
  //    (next_run_date / next_due_date dimajukan setelah diproses).
  const todayDate = nowIso.slice(0, 10);
  const { results: billTenants } = await env.DB.prepare(
    `SELECT id, db_ref FROM tenants WHERE status IN ('active', 'trial')`,
  ).all<{ id: string; db_ref: string }>();
  let billed = 0;
  let woGenerated = 0;
  for (const t of billTenants) {
    if (overBudget()) {
      console.log(`[cron] anggaran waktu habis — tugas harian dilanjutkan run berikutnya`);
      break;
    }
    try {
      const db = getTenantDb(env, t.db_ref);
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
      const wo = await runMaintenance(db, todayDate, "system");
      if (wo.generated > 0) {
        woGenerated += wo.generated;
        await env.DB.prepare(
          `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
           VALUES (?, ?, NULL, 'maintenance.generated', ?, NULL, ?)`,
        )
          .bind(crypto.randomUUID(), t.id, JSON.stringify(wo), nowIso)
          .run();
      }
    } catch (err) {
      console.error(`[cron] tugas harian tenant ${t.id} gagal:`, err);
    }
  }
  if (billed > 0) console.log(`[cron] ${billed} faktur kontrak diterbitkan`);
  if (woGenerated > 0) console.log(`[cron] ${woGenerated} work order servis diterbitkan`);
}

export default { fetch: app.fetch, scheduled };

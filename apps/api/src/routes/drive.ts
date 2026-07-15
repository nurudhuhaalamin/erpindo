import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { audit } from "../lib/audit";
import { decryptText, encryptText, sha256Hex } from "../lib/crypto";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";
import { buildTenantExportZip } from "./export";

/**
 * Backup Google Drive (Fase 8b, lapis 2). Pengguna menyambungkan akun Google
 * (OAuth 2.0, scope drive.file — hanya berkas buatan aplikasi ini), lalu bisa
 * mencadangkan ZIP ekspor penuh secara manual atau otomatis (Cron bulanan).
 * Refresh token disimpan terenkripsi AES-GCM di control-plane.
 *
 * Butuh secret GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Workers dashboard).
 * Tanpa secret: /drive/status membalas configured=false dan UI menampilkan
 * instruksi — fitur ekspor mandiri (lapis 1) tidak terpengaruh.
 */

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name";
const SCOPE = "openid email https://www.googleapis.com/auth/drive.file";

function driveConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function appOrigin(env: Env, reqUrl: string): string {
  return (env.APP_URL ?? new URL(reqUrl).origin).replace(/\/$/, "");
}

async function stateSig(env: Env, tenantId: string): Promise<string> {
  return (await sha256Hex(`drive-state|${tenantId}|${env.GOOGLE_CLIENT_SECRET}`)).slice(0, 32);
}

/** Payload JWT tanpa verifikasi tanda tangan — hanya untuk menampilkan email
 *  akun; token diterima langsung dari Google lewat TLS. */
function jwtEmail(idToken: string | undefined): string | null {
  try {
    if (!idToken) return null;
    const payload = JSON.parse(
      atob(idToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

/**
 * Jalankan backup Drive untuk satu tenant: susun ZIP ekspor penuh → refresh
 * access token → upload multipart. Dipakai endpoint manual & Cron bulanan.
 */
export async function runDriveBackup(
  env: Env,
  tenant: { id: string; name: string; slug: string; dbRef: string },
): Promise<{ ok: true; fileName: string; bytes: number } | { ok: false; error: string }> {
  const conn = await env.DB.prepare(`SELECT refresh_token_enc FROM drive_connections WHERE tenant_id = ?`)
    .bind(tenant.id)
    .first<{ refresh_token_enc: string }>();
  if (!conn) return { ok: false, error: "Google Drive belum tersambung." };
  if (!driveConfigured(env)) return { ok: false, error: "Integrasi Google Drive belum dikonfigurasi." };

  const setStatus = (status: string, ok: boolean) =>
    env.DB.prepare(
      `UPDATE drive_connections SET last_backup_status = ?${ok ? ", last_backup_at = datetime('now')" : ""} WHERE tenant_id = ?`,
    )
      .bind(status, tenant.id)
      .run();

  try {
    const refreshToken = await decryptText(conn.refresh_token_enc, env.GOOGLE_CLIENT_SECRET!);
    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const token = (await tokenRes.json()) as TokenResponse;
    if (!token.access_token) {
      const msg = token.error_description ?? token.error ?? `HTTP ${tokenRes.status}`;
      await setStatus(`gagal: ${msg}`.slice(0, 200), false);
      return { ok: false, error: `Gagal menyegarkan akses Google: ${msg}` };
    }

    const db = getTenantDb(env, tenant.dbRef);
    const { zip } = await buildTenantExportZip(db, { tenantName: tenant.name, tenantSlug: tenant.slug });
    const fileName = `erpindo-backup-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.zip`;

    const boundary = `erpindo${crypto.randomUUID().replace(/-/g, "")}`;
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: fileName, mimeType: "application/zip" }) +
        `\r\n--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + zip.length + tail.length);
    body.set(head, 0);
    body.set(zip, head.length);
    body.set(tail, head.length + zip.length);

    const upload = await fetch(DRIVE_UPLOAD, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!upload.ok) {
      const text = (await upload.text()).slice(0, 160);
      await setStatus(`gagal: HTTP ${upload.status} ${text}`.slice(0, 200), false);
      return { ok: false, error: `Unggah ke Drive gagal (HTTP ${upload.status}).` };
    }

    await setStatus("ok", true);
    return { ok: true, fileName, bytes: zip.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "kesalahan tak dikenal";
    await setStatus(`gagal: ${msg}`.slice(0, 200), false);
    return { ok: false, error: msg };
  }
}

export const driveRoutes = new Hono<AppEnv>()
  .get("/:tenantId/drive/status", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    if (!driveConfigured(c.env)) return c.json({ configured: false, connected: false });
    const row = await c.env.DB.prepare(
      `SELECT account_email, last_backup_at, last_backup_status FROM drive_connections WHERE tenant_id = ?`,
    )
      .bind(tenant.id)
      .first<{ account_email: string | null; last_backup_at: string | null; last_backup_status: string | null }>();
    return c.json({
      configured: true,
      connected: Boolean(row),
      accountEmail: row?.account_email ?? null,
      lastBackupAt: row?.last_backup_at ?? null,
      lastBackupStatus: row?.last_backup_status ?? null,
    });
  })

  // Mulai alur OAuth: redirect ke halaman izin Google.
  .get("/:tenantId/drive/connect", requireAuth, requireTenantRole("owner"), async (c) => {
    if (!driveConfigured(c.env)) {
      return c.json({ error: "Integrasi Google Drive belum dikonfigurasi oleh operator." }, 503);
    }
    const tenant = c.get("tenant");
    const params = new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${appOrigin(c.env, c.req.url)}/api/drive/callback`,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state: `${tenant.id}.${await stateSig(c.env, tenant.id)}`,
    });
    return c.redirect(`${GOOGLE_AUTH}?${params.toString()}`, 302);
  })

  // Cadangkan sekarang (manual).
  .post("/:tenantId/drive/backup-now", requireAuth, requireTenantRole("owner"), async (c) => {
    if (!driveConfigured(c.env)) {
      return c.json({ error: "Integrasi Google Drive belum dikonfigurasi oleh operator." }, 503);
    }
    const tenant = c.get("tenant");
    const res = await runDriveBackup(c.env, {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      dbRef: tenant.dbRef,
    });
    if (!res.ok) return c.json({ error: res.error }, 502);

    await audit(c.env, {
      action: "tenant.drive_backup",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { fileName: res.fileName, bytes: res.bytes },
      ip: clientIp(c),
    });
    return c.json({ ok: true, fileName: res.fileName });
  })

  .delete("/:tenantId/drive/disconnect", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    await c.env.DB.prepare(`DELETE FROM drive_connections WHERE tenant_id = ?`).bind(tenant.id).run();
    await audit(c.env, {
      action: "tenant.drive_disconnected",
      userId: c.get("user").id,
      tenantId: tenant.id,
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

/**
 * Callback OAuth Google — dipasang di jalur tetap /api/drive/callback (tanpa
 * :tenantId karena redirect URI harus statis). Sesi cookie tetap terkirim
 * (same-origin) sehingga pengguna terautentikasi; keanggotaan owner atas
 * tenant di `state` diverifikasi ulang ke control-plane.
 */
export const driveCallbackRoutes = new Hono<AppEnv>().get("/callback", requireAuth, async (c) => {
  const back = (msg: string) => c.redirect(`/app/pengaturan?drive=${encodeURIComponent(msg)}`, 302);
  if (!driveConfigured(c.env)) return back("belum-dikonfigurasi");

  const code = c.req.query("code");
  const state = c.req.query("state") ?? "";
  const [tenantId, sig] = state.split(".");
  if (!code || !tenantId || sig !== (await stateSig(c.env, tenantId))) return back("state-tidak-valid");

  const member = await c.env.DB.prepare(
    `SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?`,
  )
    .bind(tenantId, c.get("user").id)
    .first<{ role: string }>();
  if (!member || member.role !== "owner") return back("bukan-owner");

  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${appOrigin(c.env, c.req.url)}/api/drive/callback`,
    }),
  });
  const token = (await tokenRes.json()) as TokenResponse;
  if (!token.refresh_token) return back("gagal-tukar-token");

  const encToken = await encryptText(token.refresh_token, c.env.GOOGLE_CLIENT_SECRET!);
  await c.env.DB.prepare(
    `INSERT INTO drive_connections (tenant_id, refresh_token_enc, account_email, connected_by, connected_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT (tenant_id) DO UPDATE SET
       refresh_token_enc = excluded.refresh_token_enc, account_email = excluded.account_email,
       connected_by = excluded.connected_by, connected_at = datetime('now')`,
  )
    .bind(tenantId, encToken, jwtEmail(token.id_token), c.get("user").id)
    .run();

  await audit(c.env, {
    action: "tenant.drive_connected",
    userId: c.get("user").id,
    tenantId,
    detail: { accountEmail: jwtEmail(token.id_token) },
    ip: clientIp(c),
  });
  return back("tersambung");
});

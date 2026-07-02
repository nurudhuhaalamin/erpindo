import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  toSlug,
  TRIAL_DAYS,
  type MeResponse,
  type Role,
  type TenantStatus,
} from "@erpindo/shared";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { AppEnv, Env } from "../env";
import { audit } from "../lib/audit";
import { generateToken, hashPassword, sha256Hex, verifyPassword } from "../lib/crypto";
import { getMailer } from "../lib/mailer";
import { provisionTenantDb, TENANT_SCHEMA_VERSION } from "../lib/tenantDb";
import { requireAuth, SESSION_COOKIE } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";

const SESSION_DAYS = 30;
const TOKEN_HOURS = 24;

function now(): string {
  return new Date().toISOString();
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function inHours(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function clientIp(c: { req: { header(name: string): string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
}

async function createSession(env: Env, userId: string): Promise<string> {
  const raw = generateToken();
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(await sha256Hex(raw), userId, now(), inDays(SESSION_DAYS))
    .run();
  return raw;
}

function setSessionCookie(c: Parameters<typeof setCookie>[0], raw: string, appUrl: string): void {
  setCookie(c, SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: appUrl.startsWith("https://"),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

async function createEmailToken(
  env: Env,
  input: { type: "verify" | "reset" | "invite"; email: string; userId?: string; tenantId?: string; role?: Role },
): Promise<string> {
  const raw = generateToken();
  await env.DB.prepare(
    `INSERT INTO tokens (id, token_hash, type, email, user_id, tenant_id, role, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      await sha256Hex(raw),
      input.type,
      input.email,
      input.userId ?? null,
      input.tenantId ?? null,
      input.role ?? null,
      inHours(TOKEN_HOURS),
      now(),
    )
    .run();
  return raw;
}

type TokenRow = {
  id: string;
  type: string;
  email: string;
  user_id: string | null;
  tenant_id: string | null;
  role: string | null;
  expires_at: string;
  used_at: string | null;
};

async function consumeToken(env: Env, raw: string, type: string): Promise<TokenRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM tokens WHERE token_hash = ? AND type = ?`)
    .bind(await sha256Hex(raw), type)
    .first<TokenRow>();
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return null;
  await env.DB.prepare(`UPDATE tokens SET used_at = ? WHERE id = ?`).bind(now(), row.id).run();
  return row;
}

export const authRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Registrasi: buat user + tenant + provisioning database tenant.
  // -------------------------------------------------------------------------
  .post("/register", rateLimit({ key: "register", limit: 5, windowSeconds: 300 }), async (c) => {
    const parsed = registerSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const { companyName, name, email, password } = parsed.data;

    const existing = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
    if (existing) return c.json({ error: "Email sudah terdaftar. Silakan login." }, 409);

    // Slug unik untuk subdomain tenant.
    const base = toSlug(companyName);
    let slug = base;
    for (let i = 2; ; i++) {
      const taken = await c.env.DB.prepare(`SELECT id FROM tenants WHERE slug = ?`).bind(slug).first();
      if (!taken) break;
      slug = `${base}-${i}`;
    }

    const { results: refRows } = await c.env.DB.prepare(`SELECT db_ref FROM tenants`).all<{ db_ref: string }>();
    const dbRef = await provisionTenantDb(
      c.env,
      slug,
      refRows.map((r) => r.db_ref),
    );

    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const status: TenantStatus = "trial";

    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO users (id, email, name, password_hash, email_verified, created_at) VALUES (?, ?, ?, ?, 0, ?)`,
      ).bind(userId, email, name, await hashPassword(password), now()),
      c.env.DB.prepare(
        `INSERT INTO tenants (id, name, slug, db_ref, status, plan, trial_ends_at, schema_version, created_at)
         VALUES (?, ?, ?, ?, ?, 'trial', ?, ?, ?)`,
      ).bind(tenantId, companyName, slug, dbRef, status, inDays(TRIAL_DAYS), TENANT_SCHEMA_VERSION, now()),
      c.env.DB.prepare(
        `INSERT INTO memberships (id, user_id, tenant_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
      ).bind(crypto.randomUUID(), userId, tenantId, now()),
    ]);

    // Simpan nama tampilan awal di database tenant (bukti tulis lintas DB).
    const { getTenantDb } = await import("../lib/tenantDb");
    await getTenantDb(c.env, dbRef)
      .prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('display_name', ?, ?)`)
      .bind(companyName, now())
      .run();

    const verifyToken = await createEmailToken(c.env, { type: "verify", email, userId });
    await getMailer(c.env).send({
      to: email,
      subject: "Verifikasi email erpindo Anda",
      text: `Halo ${name},\n\nSelamat datang di erpindo! Klik tautan berikut untuk memverifikasi email Anda:\n${c.env.APP_URL}/verifikasi?token=${verifyToken}\n\nTautan berlaku ${TOKEN_HOURS} jam.`,
    });

    await audit(c.env, {
      action: "auth.register",
      userId,
      tenantId,
      detail: { email, slug },
      ip: clientIp(c),
    });

    const session = await createSession(c.env, userId);
    setSessionCookie(c, session, c.env.APP_URL);
    return c.json({ ok: true, tenantId, slug }, 201);
  })

  // -------------------------------------------------------------------------
  // Login / logout / sesi
  // -------------------------------------------------------------------------
  .post("/login", rateLimit({ key: "login", limit: 10, windowSeconds: 300 }), async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const { email, password } = parsed.data;

    const user = await c.env.DB.prepare(`SELECT id, password_hash FROM users WHERE email = ?`)
      .bind(email)
      .first<{ id: string; password_hash: string }>();

    // Pesan sengaja sama untuk email tak terdaftar vs password salah.
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await audit(c.env, { action: "auth.login_failed", detail: { email }, ip: clientIp(c) });
      return c.json({ error: "Email atau password salah." }, 401);
    }

    const session = await createSession(c.env, user.id);
    setSessionCookie(c, session, c.env.APP_URL);
    await audit(c.env, { action: "auth.login", userId: user.id, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  .post("/logout", requireAuth, async (c) => {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(c.get("user").sessionId).run();
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  })

  .get("/me", requireAuth, async (c) => {
    const user = c.get("user");
    const { results } = await c.env.DB.prepare(
      `SELECT t.id AS tenant_id, t.name, t.slug, t.status, m.role
       FROM memberships m JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = ? ORDER BY m.created_at`,
    )
      .bind(user.id)
      .all<{ tenant_id: string; name: string; slug: string; status: TenantStatus; role: Role }>();

    const body: MeResponse = {
      user: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified },
      memberships: results.map((r) => ({
        tenantId: r.tenant_id,
        tenantName: r.name,
        tenantSlug: r.slug,
        tenantStatus: r.status,
        role: r.role,
      })),
    };
    return c.json(body);
  })

  // -------------------------------------------------------------------------
  // Verifikasi email & reset password
  // -------------------------------------------------------------------------
  .post("/verify", async (c) => {
    const token = (await c.req.json().catch(() => ({}))).token;
    if (typeof token !== "string" || !token) return c.json({ error: "Token tidak valid." }, 400);

    const row = await consumeToken(c.env, token, "verify");
    if (!row || !row.user_id) return c.json({ error: "Token tidak valid atau sudah kedaluwarsa." }, 400);

    await c.env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(row.user_id).run();
    await audit(c.env, { action: "auth.email_verified", userId: row.user_id, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  .post("/forgot-password", rateLimit({ key: "forgot", limit: 5, windowSeconds: 300 }), async (c) => {
    const parsed = forgotPasswordSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Email tidak valid." }, 400);

    const user = await c.env.DB.prepare(`SELECT id, name FROM users WHERE email = ?`)
      .bind(parsed.data.email)
      .first<{ id: string; name: string }>();

    // Respons selalu sama agar tidak membocorkan keberadaan akun.
    if (user) {
      const token = await createEmailToken(c.env, { type: "reset", email: parsed.data.email, userId: user.id });
      await getMailer(c.env).send({
        to: parsed.data.email,
        subject: "Reset password erpindo",
        text: `Halo ${user.name},\n\nKlik tautan berikut untuk mengatur ulang password Anda:\n${c.env.APP_URL}/reset-password?token=${token}\n\nAbaikan email ini bila Anda tidak meminta reset.`,
      });
    }
    return c.json({ ok: true });
  })

  .post("/reset-password", async (c) => {
    const parsed = resetPasswordSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }

    const row = await consumeToken(c.env, parsed.data.token, "reset");
    if (!row || !row.user_id) return c.json({ error: "Token tidak valid atau sudah kedaluwarsa." }, 400);

    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(
        await hashPassword(parsed.data.password),
        row.user_id,
      ),
      // Semua sesi lama dicabut setelah password berubah.
      c.env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(row.user_id),
    ]);
    await audit(c.env, { action: "auth.password_reset", userId: row.user_id, ip: clientIp(c) });
    return c.json({ ok: true });
  });

export { createEmailToken, consumeToken, clientIp };

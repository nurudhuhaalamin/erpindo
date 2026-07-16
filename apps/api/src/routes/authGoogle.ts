import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { audit } from "../lib/audit";
import { generateToken, hashPassword, sha256Hex } from "../lib/crypto";
import { rateLimit } from "../middleware/rateLimit";
import { clientIp, createSession, setSessionCookie } from "./auth";

/**
 * Masuk/daftar via Google (Fase 10d) — OAuth 2.0 authorization-code, meniru
 * pola drive.ts. Butuh secret GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (sudah
 * dipakai backup Drive); tanpa keduanya /available = false dan tombol di web
 * tidak tampil — jalur email+password tidak terpengaruh.
 *
 * Alur: /api/auth/google → consent Google → /api/auth/google/callback →
 * tukar code → id_token (sub+email+nama) → (a) user ber-google_sub/email ada
 * → sesi → /app; (b) user baru → dibuat TERVERIFIKASI tanpa tenant → sesi →
 * /daftar?via=google (hanya menanyakan nama perusahaan, memakai
 * POST /api/auth/companies yang sudah ada).
 */

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const SCOPE = "openid email profile";

function googleConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function appOrigin(env: Env, reqUrl: string): string {
  return (env.APP_URL ?? new URL(reqUrl).origin).replace(/\/$/, "");
}

/** State ditandatangani rahasia klien — menolak callback yang tidak berasal
 *  dari redirect kita sendiri (pola stateSig drive.ts). */
async function loginStateSig(env: Env): Promise<string> {
  return (await sha256Hex(`google-login|${env.GOOGLE_CLIENT_SECRET}`)).slice(0, 32);
}

/** Payload id_token tanpa verifikasi tanda tangan — token diterima langsung
 *  dari endpoint token Google lewat TLS (pola jwtEmail drive.ts). */
function jwtIdentity(idToken: string | undefined): { sub: string; email: string; name: string | null } | null {
  try {
    if (!idToken) return null;
    const payload = JSON.parse(atob(idToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as {
      sub?: string;
      email?: string;
      name?: string;
    };
    if (!payload.sub || !payload.email) return null;
    return { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name ?? null };
  } catch {
    return null;
  }
}

type TokenResponse = { id_token?: string; error?: string; error_description?: string };

export const googleAuthRoutes = new Hono<AppEnv>()

  // Web menampilkan tombol "Lanjutkan dengan Google" hanya bila true.
  .get("/available", (c) => c.json({ available: googleConfigured(c.env) }))

  // Mulai alur: redirect ke halaman izin Google.
  .get("/", rateLimit({ key: "google-auth", limit: 20, windowSeconds: 300 }), async (c) => {
    if (!googleConfigured(c.env)) {
      return c.json({ error: "Masuk via Google belum dikonfigurasi." }, 503);
    }
    const params = new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${appOrigin(c.env, c.req.url)}/api/auth/google/callback`,
      response_type: "code",
      scope: SCOPE,
      state: `login.${await loginStateSig(c.env)}`,
    });
    return c.redirect(`${GOOGLE_AUTH}?${params.toString()}`, 302);
  })

  .get("/callback", rateLimit({ key: "google-cb", limit: 20, windowSeconds: 300 }), async (c) => {
    const back = (msg: string) => c.redirect(`/masuk?google=${encodeURIComponent(msg)}`, 302);
    if (!googleConfigured(c.env)) return back("belum-dikonfigurasi");
    // Pengguna menolak consent → kembali ke halaman masuk tanpa drama.
    if (c.req.query("error")) return back("dibatalkan");

    const code = c.req.query("code");
    const state = c.req.query("state") ?? "";
    if (!code || state !== `login.${await loginStateSig(c.env)}`) {
      return c.json({ error: "State OAuth tidak valid." }, 400);
    }

    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.env.GOOGLE_CLIENT_ID!,
        client_secret: c.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${appOrigin(c.env, c.req.url)}/api/auth/google/callback`,
      }),
    });
    const token = (await tokenRes.json()) as TokenResponse;
    const identity = jwtIdentity(token.id_token);
    if (!identity) return back("gagal-tukar-token");
    // Akun demo publik tidak boleh dibajak lewat jalur Google.
    if (identity.email === "demo-viewer@erpindo.id") return back("tidak-diizinkan");

    // (1) sudah pernah masuk via Google → langsung sesi.
    let user = await c.env.DB.prepare(`SELECT id, email FROM users WHERE google_sub = ?`)
      .bind(identity.sub)
      .first<{ id: string; email: string }>();

    // (2) email sudah terdaftar (akun password) → tautkan google_sub sekali.
    if (!user) {
      const byEmail = await c.env.DB.prepare(`SELECT id, email FROM users WHERE email = ?`)
        .bind(identity.email)
        .first<{ id: string; email: string }>();
      if (byEmail) {
        await c.env.DB.prepare(`UPDATE users SET google_sub = ?, email_verified = 1 WHERE id = ?`)
          .bind(identity.sub, byEmail.id)
          .run();
        user = byEmail;
        await audit(c.env, { action: "auth.google_linked", userId: user.id, detail: { email: user.email }, ip: clientIp(c) });
      }
    }

    // (3) user baru → dibuat terverifikasi TANPA tenant; perusahaan pertama
    // dibuat di langkah /daftar?via=google (POST /api/auth/companies).
    let isNew = false;
    if (!user) {
      const userId = crypto.randomUUID();
      // Hash acak yang tak pernah keluar dari proses — login password mustahil.
      await c.env.DB.prepare(
        `INSERT INTO users (id, email, name, password_hash, email_verified, google_sub, created_at)
         VALUES (?, ?, ?, ?, 1, ?, datetime('now'))`,
      )
        .bind(userId, identity.email, identity.name ?? identity.email.split("@")[0], await hashPassword(generateToken()), identity.sub)
        .run();
      user = { id: userId, email: identity.email };
      isNew = true;
      await audit(c.env, { action: "auth.google_registered", userId, detail: { email: identity.email }, ip: clientIp(c) });
    }

    const session = await createSession(c.env, user.id);
    setSessionCookie(c, session, appOrigin(c.env, c.req.url));
    await audit(c.env, { action: "auth.google_login", userId: user.id, ip: clientIp(c) });

    // Punya perusahaan → aplikasi; belum → tanya nama perusahaan saja.
    if (!isNew) {
      const member = await c.env.DB.prepare(`SELECT id FROM memberships WHERE user_id = ? LIMIT 1`)
        .bind(user.id)
        .first<{ id: string }>();
      if (member) return c.redirect("/app", 302);
    }
    return c.redirect("/daftar?via=google", 302);
  });

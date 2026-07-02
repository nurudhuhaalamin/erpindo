import { ROLE_LEVEL, type Role } from "@erpindo/shared";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { sha256Hex } from "../lib/crypto";

export const SESSION_COOKIE = "erpindo_sid";

/** Muat sesi dari cookie; 401 bila tidak ada/kedaluwarsa. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return c.json({ error: "Belum masuk. Silakan login." }, 401);

  const sessionId = await sha256Hex(raw);
  const row = await c.env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.name, u.email, u.email_verified
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
  )
    .bind(sessionId)
    .first<{
      session_id: string;
      expires_at: string;
      id: string;
      name: string;
      email: string;
      email_verified: number;
    }>();

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return c.json({ error: "Sesi berakhir. Silakan login kembali." }, 401);
  }

  c.set("user", {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.email_verified === 1,
    sessionId: row.session_id,
  });
  await next();
};

/**
 * Muat konteks tenant dari parameter :tenantId dan pastikan user adalah
 * anggota dengan peran minimal tertentu. Dipasang setelah requireAuth.
 */
export function requireTenantRole(minRole: Role): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const tenantId = c.req.param("tenantId");
    if (!tenantId) return c.json({ error: "Tenant tidak ditemukan." }, 404);

    const user = c.get("user");
    const row = await c.env.DB.prepare(
      `SELECT t.id, t.name, t.slug, t.db_ref, t.status, m.role
       FROM memberships m JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = ? AND m.tenant_id = ?`,
    )
      .bind(user.id, tenantId)
      .first<{ id: string; name: string; slug: string; db_ref: string; status: string; role: Role }>();

    if (!row) return c.json({ error: "Anda bukan anggota perusahaan ini." }, 403);
    if (row.status === "suspended") {
      return c.json({ error: "Langganan perusahaan ini sedang ditangguhkan." }, 402);
    }
    if (ROLE_LEVEL[row.role] < ROLE_LEVEL[minRole]) {
      return c.json({ error: "Anda tidak memiliki hak akses untuk aksi ini." }, 403);
    }

    c.set("tenant", {
      id: row.id,
      name: row.name,
      slug: row.slug,
      dbRef: row.db_ref,
      status: row.status,
      role: row.role,
    });
    await next();
  };
}

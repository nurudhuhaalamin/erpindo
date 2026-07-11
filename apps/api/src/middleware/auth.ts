import { PRESET_PERMISSIONS, ROLE_LEVEL, type PermissionKey, type Role } from "@erpindo/shared";
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
    // Menunggak (trial berakhir / tagihan lewat jatuh tempo): data tetap bisa
    // dibaca, tetapi semua perubahan diblokir sampai langganan aktif kembali.
    if (row.status === "past_due" && c.req.method !== "GET") {
      return c.json(
        { error: "Masa trial/langganan telah berakhir — akun dalam mode baca-saja. Silakan aktifkan langganan." },
        402,
      );
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

/**
 * Izin modul efektif seorang anggota (Fase 7e). Owner selalu penuh; anggota
 * dengan peran kustom memakai izin peran itu; selain itu memakai preset base role.
 */
export async function resolvePermissions(
  env: AppEnv["Bindings"],
  userId: string,
  tenantId: string,
): Promise<{ role: Role; roleName: string; permissions: PermissionKey[] } | null> {
  const row = await env.DB.prepare(
    `SELECT m.role, m.custom_role_id, r.name AS role_name, r.permissions
     FROM memberships m LEFT JOIN custom_roles r ON r.id = m.custom_role_id
     WHERE m.user_id = ? AND m.tenant_id = ?`,
  )
    .bind(userId, tenantId)
    .first<{ role: Role; custom_role_id: string | null; role_name: string | null; permissions: string | null }>();
  if (!row) return null;
  if (row.role === "owner") {
    return { role: "owner", roleName: "Pemilik", permissions: [...PRESET_PERMISSIONS.owner] };
  }
  if (row.custom_role_id && row.permissions) {
    let perms: PermissionKey[] = [];
    try {
      perms = JSON.parse(row.permissions) as PermissionKey[];
    } catch {
      perms = [];
    }
    return { role: row.role, roleName: row.role_name ?? "Peran kustom", permissions: perms };
  }
  return { role: row.role, roleName: row.role === "admin" ? "Admin" : "Viewer", permissions: [...PRESET_PERMISSIONS[row.role]] };
}

/**
 * Pastikan anggota punya izin modul tertentu (Fase 7e). Dipasang BERDAMPINGAN
 * setelah requireTenantRole — preset Owner/Admin/Viewer memberi semua modul
 * (kecuali admin tanpa "pengguna"), jadi jalur lama tetap lolos; peran kustom
 * bisa membatasi ke sebagian modul.
 */
export function requirePermission(module: PermissionKey): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const tenantId = c.req.param("tenantId");
    const user = c.get("user");
    if (!tenantId || !user) return c.json({ error: "Tidak diizinkan." }, 403);
    const resolved = await resolvePermissions(c.env, user.id, tenantId);
    if (!resolved || !resolved.permissions.includes(module)) {
      return c.json({ error: "Peran Anda tidak memiliki akses ke modul ini." }, 403);
    }
    await next();
  };
}

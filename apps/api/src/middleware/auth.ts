import {
  MODULE_LABELS,
  minPlanForModule,
  PLAN_LABELS,
  planIncludesModule,
  PRESET_PERMISSIONS,
  ROLE_LEVEL,
  type ModuleKey,
  type PermissionKey,
  type Plan,
  type Role,
} from "@erpindo/shared";
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { sha256Hex } from "../lib/crypto";
import { ensureTenantMigrated, TENANT_SCHEMA_VERSION } from "../lib/tenantDb";

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
 * Admin platform (Fase 10e): hanya email pada PLATFORM_ADMIN_EMAILS (pola
 * COMPED_EMAILS — dipisah koma, case-insensitive). Dipasang setelah
 * requireAuth. Tanpa var ini SEMUA orang 403.
 */
export function isPlatformAdmin(env: AppEnv["Bindings"], email: string): boolean {
  return (env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export const requirePlatformAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!isPlatformAdmin(c.env, c.get("user").email)) {
    return c.json({ error: "Halaman ini khusus admin platform." }, 403);
  }
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
      `SELECT t.id, t.name, t.slug, t.db_ref, t.status, t.plan, t.legacy_full_access, t.schema_version, m.role
       FROM memberships m JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = ? AND m.tenant_id = ?`,
    )
      .bind(user.id, tenantId)
      .first<{ id: string; name: string; slug: string; db_ref: string; status: string; plan: Plan; legacy_full_access: number; schema_version: number; role: Role }>();

    if (!row) return c.json({ error: "Anda bukan anggota perusahaan ini." }, 403);
    if (row.status === "suspended") {
      return c.json({ error: "Langganan perusahaan ini sedang ditangguhkan." }, 402);
    }

    // Auto-migrasi malas: bila database tenant ini tertinggal skema (mis. baru
    // saja rilis migrasi baru), terapkan sebelum modul menyentuhnya. Idempoten &
    // hanya bekerja saat versi tertinggal. Kegagalan migrasi tidak boleh memutus
    // akses total — dicatat lalu request lanjut (versi tetap tertinggal → dicoba
    // ulang pada request berikutnya), sehingga bersifat swasembuh.
    if (row.schema_version < TENANT_SCHEMA_VERSION) {
      try {
        await ensureTenantMigrated(c.env, { id: row.id, dbRef: row.db_ref, schemaVersion: row.schema_version });
      } catch (err) {
        console.error(`[db] auto-migrasi tenant ${row.id} gagal:`, err);
      }
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
      plan: row.plan,
      legacyFullAccess: row.legacy_full_access === 1,
    });
    await next();
  };
}

/**
 * Penegakan paket langganan (Fase 13a). Modul operasional/skala hanya terbuka
 * pada paket yang mencakupnya; di bawahnya → 403 `plan-upgrade-required` berisi
 * paket minimum (dipakai UI untuk kartu upsell, bukan error keras).
 *
 * Bersifat ADITIF & tidak membocorkan info: hanya menambahkan penolakan paket.
 * Semua urusan auth/keanggotaan/read-only diserahkan ke requireTenantRole yang
 * berjalan setelahnya (via planGated) — sesi buruk / bukan anggota jatuh ke
 * pesan standarnya, bukan ke pesan paket.
 */
export function requirePlanModule(module: ModuleKey): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const tenantId = c.req.param("tenantId");
    const raw = getCookie(c, SESSION_COOKIE);
    if (!tenantId || !raw) return next();

    const sessionId = await sha256Hex(raw);
    const row = await c.env.DB.prepare(
      `SELECT t.plan, t.legacy_full_access, s.expires_at
       FROM sessions s
       JOIN memberships m ON m.user_id = s.user_id
       JOIN tenants t ON t.id = m.tenant_id
       WHERE s.id = ? AND m.tenant_id = ?`,
    )
      .bind(sessionId, tenantId)
      .first<{ plan: Plan; legacy_full_access: number; expires_at: string }>();

    // Sesi tak valid / bukan anggota → biarkan requireTenantRole yang menjawab.
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return next();
    if (row.legacy_full_access === 1) return next();
    if (!planIncludesModule(row.plan, module)) {
      return c.json(
        {
          error: `Modul ${MODULE_LABELS[module]} tersedia mulai paket ${PLAN_LABELS[minPlanForModule(module)]}. Tingkatkan paket untuk membukanya.`,
          detail: "plan-upgrade-required",
          module,
          requiredPlan: minPlanForModule(module),
        },
        403,
      );
    }
    await next();
  };
}

/**
 * Peta segmen path pertama (setelah /api/tenants/:tenantId/) → modul berpaket.
 * Segmen yang TIDAK ada di sini = modul inti (tersedia semua paket). Sengaja
 * hanya memetakan segmen spesifik agar tidak menabrak rute inti — mis. segmen
 * "reports" milik laporan inti TIDAK dipetakan (endpoint dimensi hanya
 * cost-centers & bank-match-rules yang digerbangi).
 */
const MODULE_ROUTE_PREFIXES: Record<string, ModuleKey> = {
  // payroll (Business)
  employees: "payroll",
  "payroll-runs": "payroll",
  "payroll-adjustments": "payroll",
  "employee-loans": "payroll",
  "leave-requests": "payroll",
  attendance: "attendance",
  // operasional lain (Business)
  crm: "crm",
  leads: "crm",
  quotations: "crm",
  projects: "projects",
  requisitions: "procurement",
  "purchase-orders": "procurement",
  "goods-receipts": "procurement",
  "approval-flows": "approvals",
  "approval-rules": "approvals",
  "sales-orders": "salesStaged",
  boms: "manufacturing",
  "production-orders": "manufacturing",
  "work-centers": "manufacturing",
  maintenance: "maintenance",
  tickets: "helpdesk",
  contracts: "contracts",
  currencies: "currency",
  "report-snapshots": "scheduledReports",
  departments: "orgStructure",
  "org-chart": "orgStructure",
  drive: "driveBackup",
  // skala (Enterprise)
  "cost-centers": "dimensions",
  "bank-match-rules": "dimensions",
};

/**
 * Penegakan paket berbasis path (Fase 13b). SATU middleware global di
 * `/api/tenants/:tenantId/*`: memetakan segmen path ke modul lalu memanggil
 * requirePlanModule bila modul berpaket. Menggantikan pembungkus per-router
 * yang bocor (pola `/:tenantId/*` menangkap rute modul lain).
 */
export const enforcePlanByPath: MiddlewareHandler<AppEnv> = async (c, next) => {
  const segment = c.req.path.split("/")[4] ?? ""; // ["", "api", "tenants", id, segment, ...]
  const module = MODULE_ROUTE_PREFIXES[segment];
  if (!module) return next();
  return requirePlanModule(module)(c, next);
};

/**
 * Izin modul efektif seorang anggota (Fase 7e). Owner selalu penuh; anggota
 * dengan peran kustom memakai izin peran itu; selain itu memakai preset base role.
 */
export async function resolvePermissions(
  env: AppEnv["Bindings"],
  userId: string,
  tenantId: string,
): Promise<{ role: Role; roleName: string; permissions: PermissionKey[]; scopeCostCenterIds: string[] | null } | null> {
  const row = await env.DB.prepare(
    `SELECT m.role, m.custom_role_id, r.name AS role_name, r.permissions, r.scope_cost_center_ids
     FROM memberships m LEFT JOIN custom_roles r ON r.id = m.custom_role_id
     WHERE m.user_id = ? AND m.tenant_id = ?`,
  )
    .bind(userId, tenantId)
    .first<{
      role: Role;
      custom_role_id: string | null;
      role_name: string | null;
      permissions: string | null;
      scope_cost_center_ids: string | null;
    }>();
  if (!row) return null;
  if (row.role === "owner") {
    return { role: "owner", roleName: "Pemilik", permissions: [...PRESET_PERMISSIONS.owner], scopeCostCenterIds: null };
  }
  if (row.custom_role_id && row.permissions) {
    let perms: PermissionKey[] = [];
    try {
      perms = JSON.parse(row.permissions) as PermissionKey[];
    } catch {
      perms = [];
    }
    // Scope dimensi (Fase 8d): NULL / array kosong = tanpa batasan.
    let scope: string[] | null = null;
    try {
      const parsed = row.scope_cost_center_ids ? (JSON.parse(row.scope_cost_center_ids) as string[]) : null;
      scope = parsed && parsed.length > 0 ? parsed : null;
    } catch {
      scope = null;
    }
    return { role: row.role, roleName: row.role_name ?? "Peran kustom", permissions: perms, scopeCostCenterIds: scope };
  }
  return {
    role: row.role,
    roleName: row.role === "admin" ? "Admin" : "Viewer",
    permissions: [...PRESET_PERMISSIONS[row.role]],
    scopeCostCenterIds: null,
  };
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

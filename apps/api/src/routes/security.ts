import { tenantSecuritySchema, type ApiTenantSecurity } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/** Escape satu sel CSV (pola sama dengan routes/export.ts). */
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Keamanan enterprise (Fase 13g). Modul `advancedSecurity` (paket Enterprise,
 * digerbangi enforcePlanByPath lewat segmen "security"): pengaturan 2FA wajib +
 * pembatasan IP, plus ekspor audit log CSV. Semua endpoint khusus Owner.
 *
 * Catatan katup pengaman: requireTenantRole mengecualikan endpoint yang berakhir
 * "/security" dari pembatasan IP agar Owner yang salah mengetik CIDR tetap bisa
 * membukanya kembali. Ekspor audit (/security/audit.csv) TETAP tunduk pada IP.
 */
export const securityRoutes = new Hono<AppEnv>()
  // Baca konfigurasi keamanan perusahaan.
  .get("/:tenantId/security", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const row = await c.env.DB.prepare(`SELECT require_2fa, allowed_ips FROM tenants WHERE id = ?`)
      .bind(tenant.id)
      .first<{ require_2fa: number; allowed_ips: string | null }>();
    let allowedIps: string[] = [];
    try {
      allowedIps = row?.allowed_ips ? (JSON.parse(row.allowed_ips) as string[]) : [];
    } catch {
      allowedIps = [];
    }
    const body: ApiTenantSecurity & { currentIp: string } = {
      require2fa: row?.require_2fa === 1,
      allowedIps,
      // IP pemanggil saat ini — ditampilkan UI agar Owner tak mengunci dirinya.
      currentIp: clientIp(c),
    };
    return c.json(body);
  })

  // Simpan konfigurasi keamanan (2FA wajib + daftar IP).
  .patch("/:tenantId/security", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = tenantSecuritySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const { require2fa, allowedIps } = parsed.data;
    await c.env.DB.prepare(`UPDATE tenants SET require_2fa = ?, allowed_ips = ? WHERE id = ?`)
      .bind(require2fa ? 1 : 0, allowedIps.length > 0 ? JSON.stringify(allowedIps) : null, tenant.id)
      .run();
    await audit(c.env, {
      action: "tenant.security_updated",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { require2fa, allowedIpsCount: allowedIps.length },
      ip: clientIp(c),
    });
    const body: ApiTenantSecurity = { require2fa, allowedIps };
    return c.json(body);
  })

  // Ekspor audit log perusahaan sebagai CSV (kebijakan retensi: seluruh riwayat
  // control-plane yang tersimpan; unduhan dipakai untuk arsip eksternal).
  .get("/:tenantId/security/audit.csv", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const { results } = await c.env.DB.prepare(
      `SELECT a.created_at, a.action, a.ip, a.detail, u.name AS user_name, u.email AS user_email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 10000`,
    )
      .bind(tenant.id)
      .all<{ created_at: string; action: string; ip: string | null; detail: string | null; user_name: string | null; user_email: string | null }>();

    const header = ["waktu", "aksi", "pengguna", "email", "ip", "detail"];
    const lines = [header.join(",")];
    for (const r of results) {
      lines.push(
        [
          csvEscape(r.created_at),
          csvEscape(r.action),
          csvEscape(r.user_name),
          csvEscape(r.user_email),
          csvEscape(r.ip),
          csvEscape(r.detail),
        ].join(","),
      );
    }
    // BOM UTF-8 agar Excel membaca karakter Indonesia dengan benar.
    const csv = "﻿" + lines.join("\r\n");
    const date = new Date().toISOString().slice(0, 10);
    await audit(c.env, {
      action: "tenant.audit_exported",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { rows: results.length },
      ip: clientIp(c),
    });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="erpindo-audit-${tenant.slug}-${date}.csv"`,
      },
    });
  });

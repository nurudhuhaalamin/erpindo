import {
  acceptInviteSchema,
  assignRoleSchema,
  closeBooksSchema,
  customRoleSchema,
  inviteSchema,
  PLAN_LABELS,
  PLAN_LIMITS,
  updateMemberRoleSchema,
  updateTenantSettingsSchema,
  type ApiAuditLog,
  type ApiCustomRole,
  type ApiMember,
  type ApiMyPermissions,
  type ApiNotification,
  type PermissionKey,
  type Plan,
  type Role,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getMailer } from "../lib/mailer";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole, resolvePermissions } from "../middleware/auth";
import { appOrigin, clientIp, consumeToken, createEmailToken } from "./auth";

function now(): string {
  return new Date().toISOString();
}

function safeParsePerms(raw: string): PermissionKey[] {
  try {
    return JSON.parse(raw) as PermissionKey[];
  } catch {
    return [];
  }
}

export const tenantRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Anggota & undangan (Owner/Admin)
  // -------------------------------------------------------------------------
  .get("/:tenantId/members", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const { results } = await c.env.DB.prepare(
      `SELECT u.id AS user_id, u.name, u.email, m.role, m.custom_role_id, r.name AS role_name, m.created_at
       FROM memberships m JOIN users u ON u.id = m.user_id
       LEFT JOIN custom_roles r ON r.id = m.custom_role_id
       WHERE m.tenant_id = ? ORDER BY m.created_at`,
    )
      .bind(tenant.id)
      .all<{ user_id: string; name: string; email: string; role: Role; custom_role_id: string | null; role_name: string | null; created_at: string }>();

    const members: ApiMember[] = results.map((r) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      role: r.role,
      customRoleId: r.custom_role_id,
      roleName: r.role_name,
      joinedAt: r.created_at,
    }));
    return c.json({ members });
  })

  .post("/:tenantId/invites", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = inviteSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const user = c.get("user");
    const { email, role } = parsed.data;

    const already = await c.env.DB.prepare(
      `SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.email = ? AND m.tenant_id = ?`,
    )
      .bind(email, tenant.id)
      .first();
    if (already) return c.json({ error: "Pengguna tersebut sudah menjadi anggota." }, 409);

    // Penegakan batas anggota sesuai paket langganan.
    const planRow = await c.env.DB.prepare(`SELECT plan FROM tenants WHERE id = ?`)
      .bind(tenant.id)
      .first<{ plan: Plan }>();
    const plan: Plan = planRow?.plan ?? "trial";
    const memberCount = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ?`)
      .bind(tenant.id)
      .first<{ n: number }>();
    if ((memberCount?.n ?? 0) >= PLAN_LIMITS[plan].maxUsers) {
      return c.json(
        {
          error: `Paket ${PLAN_LABELS[plan]} maksimal ${PLAN_LIMITS[plan].maxUsers} pengguna. Upgrade paket untuk menambah anggota.`,
        },
        402,
      );
    }

    const token = await createEmailToken(c.env, { type: "invite", email, tenantId: tenant.id, role });
    const inviteUrl = `${appOrigin(c)}/undangan?token=${token}`;
    await getMailer(c.env).send({
      to: email,
      subject: `Undangan bergabung ke ${tenant.name} di erpindo`,
      text: `${user.name} mengundang Anda bergabung ke ${tenant.name} sebagai ${role}.\n\nBuka tautan berikut untuk menerima undangan:\n${inviteUrl}\n\n— Tim erpindo`,
    });

    await audit(c.env, {
      action: "tenant.invite_sent",
      userId: user.id,
      tenantId: tenant.id,
      detail: { email, role },
      ip: clientIp(c),
    });

    // inviteUrl ikut dikembalikan agar bisa disalin dari UI selama layanan
    // email produksi belum dikonfigurasi.
    return c.json({ ok: true, inviteUrl }, 201);
  })

  // Ubah peran anggota (Owner) — tak boleh menghilangkan owner terakhir.
  .patch("/:tenantId/members/:userId", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = updateMemberRoleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Peran tidak valid." }, 400);
    const tenant = c.get("tenant");
    const targetUserId = c.req.param("userId");
    const newRole = parsed.data.role;

    const target = await c.env.DB.prepare(`SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?`)
      .bind(tenant.id, targetUserId)
      .first<{ role: Role }>();
    if (!target) return c.json({ error: "Anggota tidak ditemukan." }, 404);

    // Menurunkan owner terakhir menghilangkan pemilik → tolak.
    if (target.role === "owner" && newRole !== "owner") {
      const owners = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = 'owner'`,
      )
        .bind(tenant.id)
        .first<{ n: number }>();
      if ((owners?.n ?? 0) <= 1) return c.json({ error: "Tidak bisa menurunkan pemilik terakhir." }, 400);
    }

    // Preset menghapus peran kustom (bila ada) agar izin kembali ke preset.
    await c.env.DB.prepare(`UPDATE memberships SET role = ?, custom_role_id = NULL WHERE tenant_id = ? AND user_id = ?`)
      .bind(newRole, tenant.id, targetUserId)
      .run();
    await audit(c.env, {
      action: "tenant.member_role_changed",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { targetUserId, role: newRole },
      ip: clientIp(c),
    });
    return c.json({ ok: true, role: newRole });
  })

  // Keluarkan anggota (Owner) — tak boleh diri sendiri / owner terakhir.
  .delete("/:tenantId/members/:userId", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const targetUserId = c.req.param("userId");
    if (targetUserId === c.get("user").id) return c.json({ error: "Tidak bisa mengeluarkan diri sendiri." }, 400);

    const target = await c.env.DB.prepare(`SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?`)
      .bind(tenant.id, targetUserId)
      .first<{ role: Role }>();
    if (!target) return c.json({ error: "Anggota tidak ditemukan." }, 404);
    if (target.role === "owner") {
      const owners = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = 'owner'`,
      )
        .bind(tenant.id)
        .first<{ n: number }>();
      if ((owners?.n ?? 0) <= 1) return c.json({ error: "Tidak bisa mengeluarkan pemilik terakhir." }, 400);
    }

    await c.env.DB.prepare(`DELETE FROM memberships WHERE tenant_id = ? AND user_id = ?`)
      .bind(tenant.id, targetUserId)
      .run();
    await audit(c.env, {
      action: "tenant.member_removed",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { targetUserId },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // RBAC granular (Fase 7e): peran kustom + izin efektif
  // -------------------------------------------------------------------------
  .get("/:tenantId/my-permissions", requireAuth, requireTenantRole("viewer"), async (c) => {
    const resolved = await resolvePermissions(c.env, c.get("user").id, c.get("tenant").id);
    if (!resolved) return c.json({ error: "Anda bukan anggota." }, 403);
    const body: ApiMyPermissions = resolved;
    return c.json(body);
  })

  .get("/:tenantId/roles", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const { results } = await c.env.DB.prepare(
      `SELECT r.id, r.name, r.base_role, r.permissions, r.created_at,
              (SELECT COUNT(*) FROM memberships m WHERE m.custom_role_id = r.id) AS member_count
       FROM custom_roles r WHERE r.tenant_id = ? ORDER BY r.created_at DESC`,
    )
      .bind(tenant.id)
      .all<{ id: string; name: string; base_role: "admin" | "viewer"; permissions: string; created_at: string; member_count: number }>();
    const roles: ApiCustomRole[] = results.map((r) => ({
      id: r.id,
      name: r.name,
      baseRole: r.base_role,
      permissions: safeParsePerms(r.permissions),
      memberCount: r.member_count,
      createdAt: r.created_at,
    }));
    return c.json({ roles });
  })

  .post("/:tenantId/roles", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = customRoleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`INSERT INTO custom_roles (id, tenant_id, name, base_role, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, tenant.id, parsed.data.name, parsed.data.baseRole, JSON.stringify(parsed.data.permissions), now())
      .run();
    await audit(c.env, { action: "tenant.role_created", userId: c.get("user").id, tenantId: tenant.id, detail: { name: parsed.data.name }, ip: clientIp(c) });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/roles/:roleId", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = customRoleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const roleId = c.req.param("roleId");
    const existing = await c.env.DB.prepare(`SELECT id FROM custom_roles WHERE id = ? AND tenant_id = ?`).bind(roleId, tenant.id).first<{ id: string }>();
    if (!existing) return c.json({ error: "Peran tidak ditemukan." }, 404);
    await c.env.DB.prepare(`UPDATE custom_roles SET name = ?, base_role = ?, permissions = ? WHERE id = ?`)
      .bind(parsed.data.name, parsed.data.baseRole, JSON.stringify(parsed.data.permissions), roleId)
      .run();
    // Sinkronkan base_role ke anggota yang memakai peran ini (kompat requireTenantRole).
    await c.env.DB.prepare(`UPDATE memberships SET role = ? WHERE custom_role_id = ?`).bind(parsed.data.baseRole, roleId).run();
    await audit(c.env, { action: "tenant.role_updated", userId: c.get("user").id, tenantId: tenant.id, detail: { roleId }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  .delete("/:tenantId/roles/:roleId", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const roleId = c.req.param("roleId");
    const used = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE custom_role_id = ?`).bind(roleId).first<{ n: number }>();
    if ((used?.n ?? 0) > 0) return c.json({ error: "Peran masih dipakai anggota — pindahkan dulu." }, 409);
    await c.env.DB.prepare(`DELETE FROM custom_roles WHERE id = ? AND tenant_id = ?`).bind(roleId, tenant.id).run();
    await audit(c.env, { action: "tenant.role_deleted", userId: c.get("user").id, tenantId: tenant.id, detail: { roleId }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  // Tetapkan peran (preset atau kustom) ke anggota — Owner.
  .patch("/:tenantId/members/:userId/assign", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = assignRoleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const targetUserId = c.req.param("userId");
    const target = await c.env.DB.prepare(`SELECT role FROM memberships WHERE tenant_id = ? AND user_id = ?`).bind(tenant.id, targetUserId).first<{ role: Role }>();
    if (!target) return c.json({ error: "Anggota tidak ditemukan." }, 404);

    if (parsed.data.preset) {
      // Menurunkan owner terakhir → tolak.
      if (target.role === "owner" && parsed.data.preset !== "owner") {
        const owners = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = 'owner'`).bind(tenant.id).first<{ n: number }>();
        if ((owners?.n ?? 0) <= 1) return c.json({ error: "Tidak bisa menurunkan pemilik terakhir." }, 400);
      }
      await c.env.DB.prepare(`UPDATE memberships SET role = ?, custom_role_id = NULL WHERE tenant_id = ? AND user_id = ?`).bind(parsed.data.preset, tenant.id, targetUserId).run();
    } else {
      const role = await c.env.DB.prepare(`SELECT base_role FROM custom_roles WHERE id = ? AND tenant_id = ?`).bind(parsed.data.customRoleId, tenant.id).first<{ base_role: "admin" | "viewer" }>();
      if (!role) return c.json({ error: "Peran kustom tidak ditemukan." }, 404);
      if (target.role === "owner") {
        const owners = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM memberships WHERE tenant_id = ? AND role = 'owner'`).bind(tenant.id).first<{ n: number }>();
        if ((owners?.n ?? 0) <= 1) return c.json({ error: "Tidak bisa menurunkan pemilik terakhir." }, 400);
      }
      await c.env.DB.prepare(`UPDATE memberships SET role = ?, custom_role_id = ? WHERE tenant_id = ? AND user_id = ?`).bind(role.base_role, parsed.data.customRoleId, tenant.id, targetUserId).run();
    }
    await audit(c.env, { action: "tenant.member_role_changed", userId: c.get("user").id, tenantId: tenant.id, detail: { targetUserId, ...parsed.data }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // Pengaturan perusahaan — dibaca/ditulis ke DATABASE TENANT (bukti isolasi)
  // -------------------------------------------------------------------------
  .get("/:tenantId/settings", requireAuth, requireTenantRole("viewer"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const { results } = await db.prepare(`SELECT key, value FROM settings`).all<{ key: string; value: string }>();
    const settings = Object.fromEntries(results.map((r) => [r.key, r.value]));
    return c.json({ settings });
  })

  .patch("/:tenantId/settings", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = updateTenantSettingsSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);

    const entries = Object.entries({
      display_name: parsed.data.displayName,
      address: parsed.data.address,
      npwp: parsed.data.npwp,
      logo_data_url: parsed.data.logoDataUrl,
    }).filter(([, v]) => v !== undefined) as [string, string][];

    for (const [key, value] of entries) {
      await db
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(key, value, now())
        .run();
    }

    await audit(c.env, {
      action: "tenant.settings_updated",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { keys: entries.map(([k]) => k) },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // Notifikasi operasional (lonceng topbar) — dihitung on-demand dari data
  // nyata: stok ≤ ambang minimum, faktur lewat jatuh tempo, tiket terbuka,
  // dan pembelian menunggu persetujuan. Tanpa tabel/estado tambahan.
  // -------------------------------------------------------------------------
  .get("/:tenantId/notifications", requireAuth, requireTenantRole("viewer"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const today = new Date().toISOString().slice(0, 10);

    const [lowStock, overdue, tickets, approvals] = await Promise.all([
      db
        .prepare(
          `SELECT p.sku, p.name, p.min_stock, COALESCE(SUM(s.qty), 0) AS qty
           FROM products p LEFT JOIN stock_levels s ON s.product_id = p.id
           WHERE p.is_archived = 0 AND p.is_service = 0 AND p.min_stock > 0
           GROUP BY p.id HAVING qty <= p.min_stock
           ORDER BY qty LIMIT 20`,
        )
        .all<{ sku: string; name: string; min_stock: number; qty: number }>(),
      db
        .prepare(
          `SELECT d.invoice_no, k.name AS contact_name, d.due_date,
                  d.total - d.paid_amount - d.returned_amount AS outstanding
           FROM invoices d JOIN contacts k ON k.id = d.contact_id
           WHERE d.status != 'paid' AND d.voided_at IS NULL
             AND d.total > d.paid_amount + d.returned_amount
             AND d.due_date IS NOT NULL AND d.due_date < ?
           ORDER BY d.due_date LIMIT 20`,
        )
        .bind(today)
        .all<{ invoice_no: string; contact_name: string; due_date: string; outstanding: number }>(),
      db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status IN ('open', 'in_progress')`).all<{ n: number }>(),
      db.prepare(`SELECT COUNT(*) AS n FROM approval_requests WHERE status = 'pending'`).all<{ n: number }>(),
    ]);

    // Pengingat CRM (Fase 5e): tindak lanjut ber-tenggat yang jatuh tempo dan
    // lead aktif yang tak tersentuh lebih dari 7 hari.
    const [dueFollowUps, staleLeads] = await Promise.all([
      db
        .prepare(
          `SELECT a.due_at, a.note, l.name AS lead_name
           FROM lead_activities a JOIN leads l ON l.id = a.lead_id
           WHERE a.due_at IS NOT NULL AND a.due_at <= ?
             AND l.stage NOT IN ('won', 'lost')
           ORDER BY a.due_at LIMIT 10`,
        )
        .bind(today)
        .all<{ due_at: string; note: string; lead_name: string }>(),
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM leads
           WHERE stage NOT IN ('won', 'lost') AND updated_at < datetime('now', '-7 days')`,
        )
        .all<{ n: number }>(),
    ]);

    const notifications: ApiNotification[] = [];
    for (const p of lowStock.results) {
      notifications.push({
        type: "low_stock",
        title: `Stok menipis: ${p.name}`,
        detail: `${p.sku} tersisa ${p.qty} (ambang ${p.min_stock}).`,
        href: "/app/stok",
      });
    }
    for (const d of overdue.results) {
      notifications.push({
        type: "overdue_invoice",
        title: `Faktur ${d.invoice_no} lewat jatuh tempo`,
        detail: `${d.contact_name} — sisa Rp ${d.outstanding.toLocaleString("id-ID")} (jatuh tempo ${d.due_date}).`,
        href: "/app/penjualan",
      });
    }
    const openTickets = tickets.results[0]?.n ?? 0;
    if (openTickets > 0) {
      notifications.push({
        type: "open_ticket",
        title: `${openTickets} tiket dukungan belum selesai`,
        detail: "Ada tiket berstatus terbuka/diproses yang menunggu tindak lanjut.",
        href: "/app/helpdesk",
      });
    }
    const pendingApprovals = approvals.results[0]?.n ?? 0;
    if (pendingApprovals > 0) {
      notifications.push({
        type: "pending_approval",
        title: `${pendingApprovals} pembelian menunggu persetujuan`,
        detail: "Pengajuan pembelian di atas ambang menunggu keputusan Owner.",
        href: "/app/persetujuan",
      });
    }
    for (const f of dueFollowUps.results) {
      notifications.push({
        type: "crm_followup_due",
        title: `Follow-up lead ${f.lead_name} jatuh tempo`,
        detail: `${f.note} (tenggat ${f.due_at}).`,
        href: "/app/crm/leads",
      });
    }
    const stale = staleLeads.results[0]?.n ?? 0;
    if (stale > 0) {
      notifications.push({
        type: "crm_stale_lead",
        title: `${stale} lead belum di-follow-up lebih dari 7 hari`,
        detail: "Lead aktif tanpa aktivitas baru — hubungi lagi sebelum dingin.",
        href: "/app/crm/leads",
      });
    }
    return c.json({ notifications, count: notifications.length });
  })

  // -------------------------------------------------------------------------
  // Riwayat aktivitas (audit log) — khusus Owner, 100 terakhir.
  // -------------------------------------------------------------------------
  .get("/:tenantId/audit-logs", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const { results } = await c.env.DB.prepare(
      `SELECT a.id, a.action, a.detail, a.created_at, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = ? ORDER BY a.created_at DESC LIMIT 100`,
    )
      .bind(tenant.id)
      .all<{ id: string; action: string; detail: string | null; created_at: string; user_name: string | null }>();

    const logs: ApiAuditLog[] = results.map((r) => ({
      id: r.id,
      action: r.action,
      userName: r.user_name,
      detail: r.detail,
      createdAt: r.created_at,
    }));
    return c.json({ logs });
  })

  // -------------------------------------------------------------------------
  // Tutup buku (khusus Owner): kunci semua transaksi ≤ tanggal yang dipilih.
  // Gerbang penolakan ada di postJournal + handler faktur/pembayaran.
  // -------------------------------------------------------------------------
  .post("/:tenantId/close-books", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = closeBooksSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);

    // Tanggal kunci hanya boleh maju — membuka periode lama butuh keputusan
    // eksplisit (belum difasilitasi, sesuai prinsip audit).
    const { results } = await db
      .prepare(`SELECT value FROM settings WHERE key = 'locked_before'`)
      .all<{ value: string }>();
    const current = results[0]?.value;
    if (current && parsed.data.date < current) {
      return c.json({ error: `Periode sudah terkunci sampai ${current}; tanggal kunci hanya bisa maju.` }, 400);
    }

    await db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('locked_before', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(parsed.data.date, now())
      .run();

    await audit(c.env, {
      action: "accounting.books_closed",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { lockedBefore: parsed.data.date },
      ip: clientIp(c),
    });
    return c.json({ ok: true, lockedBefore: parsed.data.date });
  });

// ---------------------------------------------------------------------------
// Terima undangan (di luar prefix /:tenantId karena user belum jadi anggota)
// ---------------------------------------------------------------------------
export const inviteRoutes = new Hono<AppEnv>().post("/accept", requireAuth, async (c) => {
  const parsed = acceptInviteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Token tidak valid." }, 400);

  const user = c.get("user");
  const row = await consumeToken(c.env, parsed.data.token, "invite");
  if (!row || !row.tenant_id || !row.role) {
    return c.json({ error: "Undangan tidak valid atau sudah kedaluwarsa." }, 400);
  }
  if (row.email !== user.email) {
    return c.json({ error: "Undangan ini ditujukan untuk alamat email lain." }, 403);
  }

  const already = await c.env.DB.prepare(`SELECT id FROM memberships WHERE user_id = ? AND tenant_id = ?`)
    .bind(user.id, row.tenant_id)
    .first();
  if (already) return c.json({ error: "Anda sudah menjadi anggota perusahaan ini." }, 409);

  await c.env.DB.prepare(
    `INSERT INTO memberships (id, user_id, tenant_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), user.id, row.tenant_id, row.role, now())
    .run();

  await audit(c.env, {
    action: "tenant.invite_accepted",
    userId: user.id,
    tenantId: row.tenant_id,
    detail: { role: row.role },
    ip: clientIp(c),
  });
  return c.json({ ok: true, tenantId: row.tenant_id });
});

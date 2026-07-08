import {
  acceptInviteSchema,
  closeBooksSchema,
  inviteSchema,
  PLAN_LABELS,
  PLAN_LIMITS,
  updateTenantSettingsSchema,
  type ApiAuditLog,
  type ApiMember,
  type Plan,
  type Role,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getMailer } from "../lib/mailer";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { appOrigin, clientIp, consumeToken, createEmailToken } from "./auth";

function now(): string {
  return new Date().toISOString();
}

export const tenantRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Anggota & undangan (Owner/Admin)
  // -------------------------------------------------------------------------
  .get("/:tenantId/members", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const { results } = await c.env.DB.prepare(
      `SELECT u.id AS user_id, u.name, u.email, m.role, m.created_at
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.tenant_id = ? ORDER BY m.created_at`,
    )
      .bind(tenant.id)
      .all<{ user_id: string; name: string; email: string; role: Role; created_at: string }>();

    const members: ApiMember[] = results.map((r) => ({
      userId: r.user_id,
      name: r.name,
      email: r.email,
      role: r.role,
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

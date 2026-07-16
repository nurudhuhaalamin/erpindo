import {
  blogPostSchema,
  FEEDBACK_STATUSES,
  feedbackSchema,
  type ApiBlogPost,
  type ApiFeedback,
  type FeedbackCategory,
  type FeedbackStatus,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth";
import { rateLimitUser } from "../middleware/rateLimit";
import { clientIp } from "./auth";

/**
 * Dashboard admin platform (Fase 10e) — khusus email pada
 * PLATFORM_ADMIN_EMAILS: pantau pendaftar & langganan, kelola masukan
 * pengguna, dan tulis artikel blog (dilayani SSR di /blog untuk SEO).
 * Semua data di control-plane (c.env.DB — punya .first()).
 */

type FeedbackRow = {
  id: string;
  category: FeedbackCategory;
  message: string;
  page_path: string | null;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  tenant_name: string | null;
};

function toApiFeedback(r: FeedbackRow): ApiFeedback {
  return {
    id: r.id,
    category: r.category,
    message: r.message,
    pagePath: r.page_path,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    userName: r.user_name,
    userEmail: r.user_email,
    tenantName: r.tenant_name,
  };
}

type BlogRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  cover_url: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function toApiBlogPost(r: BlogRow): ApiBlogPost {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt,
    bodyMd: r.body_md,
    coverUrl: r.cover_url,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Middleware dipasang PER-HANDLER (bukan .use) mengikuti gerbang struktural
// rbac-guard.test.ts — satu registrasi yang lupa penjaga langsung tertangkap.
export const adminRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Ringkasan platform: total, per status/paket, pendaftar terbaru, tren 12 bln.
  // -------------------------------------------------------------------------
  .get("/overview", requireAuth, requirePlatformAdmin, async (c) => {
    const [users, tenants, byStatus, byPlan, recent, growth, feedbackNew] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM tenants`).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM tenants GROUP BY status`).all<{ status: string; n: number }>(),
      c.env.DB.prepare(`SELECT plan, COUNT(*) AS n FROM tenants GROUP BY plan`).all<{ plan: string; n: number }>(),
      c.env.DB.prepare(
        `SELECT t.id, t.name, t.slug, t.status, t.plan, t.created_at,
                (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
                 WHERE m.tenant_id = t.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1) AS owner_email
         FROM tenants t ORDER BY t.created_at DESC LIMIT 20`,
      ).all<{ id: string; name: string; slug: string; status: string; plan: string; created_at: string; owner_email: string | null }>(),
      c.env.DB.prepare(
        `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n FROM tenants
         GROUP BY month ORDER BY month DESC LIMIT 12`,
      ).all<{ month: string; n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE status = 'baru'`).first<{ n: number }>(),
    ]);
    return c.json({
      totals: { users: users?.n ?? 0, tenants: tenants?.n ?? 0, feedbackBaru: feedbackNew?.n ?? 0 },
      byStatus: Object.fromEntries(byStatus.results.map((r) => [r.status, r.n])),
      byPlan: Object.fromEntries(byPlan.results.map((r) => [r.plan, r.n])),
      recentSignups: recent.results.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        plan: r.plan,
        createdAt: r.created_at,
        ownerEmail: r.owner_email,
      })),
      growth: growth.results.reverse(),
    });
  })

  // -------------------------------------------------------------------------
  // Daftar tenant: paginasi + filter status + pencarian nama/slug.
  // -------------------------------------------------------------------------
  .get("/tenants", requireAuth, requirePlatformAdmin, async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const status = (c.req.query("status") ?? "").trim();
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

    const conds: string[] = [];
    const binds: (string | number)[] = [];
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      conds.push(`(t.name LIKE ? ESCAPE '\\' OR t.slug LIKE ? ESCAPE '\\')`);
      binds.push(like, like);
    }
    if (status) {
      conds.push(`t.status = ?`);
      binds.push(status);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const [{ results }, count] = await Promise.all([
      c.env.DB.prepare(
        `SELECT t.id, t.name, t.slug, t.status, t.plan, t.trial_ends_at, t.created_at,
                (SELECT COUNT(*) FROM memberships m WHERE m.tenant_id = t.id) AS members,
                (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
                 WHERE m.tenant_id = t.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1) AS owner_email
         FROM tenants t ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      )
        .bind(...binds, limit, offset)
        .all<{
          id: string;
          name: string;
          slug: string;
          status: string;
          plan: string;
          trial_ends_at: string | null;
          created_at: string;
          members: number;
          owner_email: string | null;
        }>(),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM tenants t ${where}`)
        .bind(...binds)
        .first<{ n: number }>(),
    ]);
    return c.json({
      tenants: results.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        plan: r.plan,
        trialEndsAt: r.trial_ends_at,
        createdAt: r.created_at,
        members: r.members,
        ownerEmail: r.owner_email,
      })),
      total: count?.n ?? 0,
      limit,
      offset,
    });
  })

  // -------------------------------------------------------------------------
  // Masukan pengguna: daftar + ubah status/catatan.
  // -------------------------------------------------------------------------
  .get("/feedback", requireAuth, requirePlatformAdmin, async (c) => {
    const status = (c.req.query("status") ?? "").trim();
    const binds: string[] = [];
    let where = "";
    if (status) {
      where = "WHERE f.status = ?";
      binds.push(status);
    }
    const { results } = await c.env.DB.prepare(
      `SELECT f.id, f.category, f.message, f.page_path, f.status, f.admin_note, f.created_at,
              u.name AS user_name, u.email AS user_email, t.name AS tenant_name
       FROM feedback f
       JOIN users u ON u.id = f.user_id
       LEFT JOIN tenants t ON t.id = f.tenant_id
       ${where} ORDER BY f.created_at DESC LIMIT 200`,
    )
      .bind(...binds)
      .all<FeedbackRow>();
    return c.json({ feedback: results.map(toApiFeedback) });
  })

  .patch("/feedback/:id", requireAuth, requirePlatformAdmin, async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { status?: string; adminNote?: string };
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(`SELECT id FROM feedback WHERE id = ?`).bind(id).first<{ id: string }>();
    if (!row) return c.json({ error: "Masukan tidak ditemukan." }, 404);
    const status = body.status && (FEEDBACK_STATUSES as readonly string[]).includes(body.status) ? body.status : null;
    const note = typeof body.adminNote === "string" ? body.adminNote.slice(0, 500) : null;
    if (!status && note === null) return c.json({ error: "Tidak ada perubahan." }, 400);
    await c.env.DB.prepare(
      `UPDATE feedback SET status = COALESCE(?, status), admin_note = COALESCE(?, admin_note), updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(status, note, id)
      .run();
    await audit(c.env, {
      action: "admin.feedback_updated",
      userId: c.get("user").id,
      detail: { id, status: status ?? undefined },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // Blog CMS: CRUD artikel; publish = mengisi published_at.
  // -------------------------------------------------------------------------
  .get("/blog-posts", requireAuth, requirePlatformAdmin, async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM blog_posts ORDER BY COALESCE(published_at, created_at) DESC LIMIT 200`,
    ).all<BlogRow>();
    return c.json({ posts: results.map(toApiBlogPost) });
  })

  .post("/blog-posts", requireAuth, requirePlatformAdmin, async (c) => {
    const parsed = blogPostSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const input = parsed.data;
    const dupe = await c.env.DB.prepare(`SELECT id FROM blog_posts WHERE slug = ?`).bind(input.slug).first();
    if (dupe) return c.json({ error: `Slug "${input.slug}" sudah dipakai.` }, 409);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO blog_posts (id, slug, title, excerpt, body_md, cover_url) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, input.slug, input.title, input.excerpt ?? null, input.bodyMd, input.coverUrl || null)
      .run();
    await audit(c.env, {
      action: "admin.blog_created",
      userId: c.get("user").id,
      detail: { slug: input.slug },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/blog-posts/:id", requireAuth, requirePlatformAdmin, async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(`SELECT * FROM blog_posts WHERE id = ?`).bind(id).first<BlogRow>();
    if (!row) return c.json({ error: "Artikel tidak ditemukan." }, 404);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

    // Terbit/tarik: { published: true|false } — kolom lain lewat skema penuh.
    if (typeof body.published === "boolean") {
      await c.env.DB.prepare(
        `UPDATE blog_posts SET published_at = ${body.published ? "COALESCE(published_at, datetime('now'))" : "NULL"},
                updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(id)
        .run();
      await audit(c.env, {
        action: body.published ? "admin.blog_published" : "admin.blog_unpublished",
        userId: c.get("user").id,
        detail: { slug: row.slug },
        ip: clientIp(c),
      });
      return c.json({ ok: true });
    }

    const parsed = blogPostSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const input = parsed.data;
    if (input.slug !== row.slug) {
      const dupe = await c.env.DB.prepare(`SELECT id FROM blog_posts WHERE slug = ? AND id != ?`)
        .bind(input.slug, id)
        .first();
      if (dupe) return c.json({ error: `Slug "${input.slug}" sudah dipakai.` }, 409);
    }
    await c.env.DB.prepare(
      `UPDATE blog_posts SET slug = ?, title = ?, excerpt = ?, body_md = ?, cover_url = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(input.slug, input.title, input.excerpt ?? null, input.bodyMd, input.coverUrl || null, id)
      .run();
    await audit(c.env, {
      action: "admin.blog_updated",
      userId: c.get("user").id,
      detail: { slug: input.slug },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  .delete("/blog-posts/:id", requireAuth, requirePlatformAdmin, async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(`SELECT slug FROM blog_posts WHERE id = ?`).bind(id).first<{ slug: string }>();
    if (!row) return c.json({ error: "Artikel tidak ditemukan." }, 404);
    await c.env.DB.prepare(`DELETE FROM blog_posts WHERE id = ?`).bind(id).run();
    await audit(c.env, {
      action: "admin.blog_deleted",
      userId: c.get("user").id,
      detail: { slug: row.slug },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

/**
 * Masukan pengguna (halaman /app/dukungan) — semua pengguna ber-sesi boleh
 * mengirim; rate-limited agar tidak jadi saluran spam.
 */
export const feedbackRoutes = new Hono<AppEnv>()
  .post("/", requireAuth, rateLimitUser({ key: "feedback", limit: 5, windowSeconds: 300 }), async (c) => {
    const parsed = feedbackSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const user = c.get("user");
    const input = parsed.data;
    // tenantId opsional divalidasi sebagai keanggotaan agar tak bisa menautkan
    // masukan ke perusahaan orang lain.
    let tenantId: string | null = null;
    if (input.tenantId) {
      const member = await c.env.DB.prepare(`SELECT id FROM memberships WHERE user_id = ? AND tenant_id = ?`)
        .bind(user.id, input.tenantId)
        .first<{ id: string }>();
      if (member) tenantId = input.tenantId;
    }
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO feedback (id, tenant_id, user_id, category, message, page_path) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, tenantId, user.id, input.category, input.message, input.pagePath ?? null)
      .run();
    await audit(c.env, {
      action: "feedback.submitted",
      userId: user.id,
      ...(tenantId ? { tenantId } : {}),
      detail: { category: input.category },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .get("/mine", requireAuth, async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT f.id, f.category, f.message, f.page_path, f.status, f.admin_note, f.created_at,
              NULL AS user_name, NULL AS user_email, NULL AS tenant_name
       FROM feedback f WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT 50`,
    )
      .bind(c.get("user").id)
      .all<FeedbackRow>();
    return c.json({ feedback: results.map(toApiFeedback) });
  });

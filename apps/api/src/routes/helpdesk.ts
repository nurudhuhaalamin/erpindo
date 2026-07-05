import {
  createTicketSchema,
  ticketReplySchema,
  updateTicketSchema,
  type ApiTicket,
  type ApiTicketDetail,
  type ApiTicketReply,
} from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { nextDocNo } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Helpdesk / tiket dukungan (Fase 2w). Tiket pelanggan dengan prioritas & status,
 * terhubung ke kontak, dengan balasan/catatan internal dan penugasan ke anggota
 * tim. Modul operasional murni (tanpa jurnal).
 */

type TicketRow = {
  id: string;
  ticket_no: string;
  contact_id: string;
  contact_name: string;
  subject: string;
  description: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  assigned_name: string | null;
  created_at: string;
  resolved_at: string | null;
  reply_count: number;
};

function mapTicket(r: TicketRow): ApiTicket {
  return {
    id: r.id,
    ticketNo: r.ticket_no,
    contactId: r.contact_id,
    contactName: r.contact_name,
    subject: r.subject,
    description: r.description,
    priority: r.priority as ApiTicket["priority"],
    status: r.status as ApiTicket["status"],
    assignedTo: r.assigned_to,
    assignedName: r.assigned_name,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    replyCount: r.reply_count,
  };
}

const TICKET_SELECT = `SELECT t.id, t.ticket_no, t.contact_id, k.name AS contact_name, t.subject, t.description,
    t.priority, t.status, t.assigned_to, t.assigned_name, t.created_at, t.resolved_at,
    (SELECT COUNT(*) FROM ticket_replies r WHERE r.ticket_id = t.id) AS reply_count
  FROM tickets t JOIN contacts k ON k.id = t.contact_id`;

async function loadTicket(db: SqlExecutor, id: string): Promise<TicketRow | null> {
  const { results } = await db.prepare(`${TICKET_SELECT} WHERE t.id = ?`).bind(id).all<TicketRow>();
  return results[0] ?? null;
}

export const helpdeskRoutes = new Hono<AppEnv>()

  .get("/:tenantId/tickets", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `${TICKET_SELECT} ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
           CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.created_at DESC`,
      )
      .all<TicketRow>();
    return c.json({ tickets: results.map(mapTicket) });
  })

  .get("/:tenantId/tickets/:id", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const row = await loadTicket(db, c.req.param("id"));
    if (!row) return c.json({ error: "Tiket tidak ditemukan." }, 404);

    const { results: replies } = await db
      .prepare(
        `SELECT id, body, author_name, internal, created_at FROM ticket_replies
         WHERE ticket_id = ? ORDER BY created_at`,
      )
      .bind(row.id)
      .all<{ id: string; body: string; author_name: string; internal: number; created_at: string }>();

    const detail: ApiTicketDetail = {
      ...mapTicket(row),
      replies: replies.map(
        (r): ApiTicketReply => ({
          id: r.id,
          body: r.body,
          authorName: r.author_name,
          internal: r.internal === 1,
          createdAt: r.created_at,
        }),
      ),
    };
    return c.json(detail);
  })

  .post("/:tenantId/tickets", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createTicketSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: contact } = await db
      .prepare(`SELECT id FROM contacts WHERE id = ? AND is_archived = 0`)
      .bind(input.contactId)
      .all<{ id: string }>();
    if (!contact[0]) return c.json({ error: "Kontak tidak ditemukan." }, 400);

    const id = crypto.randomUUID();
    const ticketNo = await nextDocNo(db, "tickets", "TKT");
    await db
      .prepare(
        `INSERT INTO tickets (id, ticket_no, contact_id, subject, description, priority, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
      )
      .bind(id, ticketNo, input.contactId, input.subject, input.description ?? null, input.priority, c.get("user").id)
      .run();

    await audit(c.env, {
      action: "helpdesk.ticket_created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { ticketNo, priority: input.priority },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, ticketNo }, 201);
  })

  .post("/:tenantId/tickets/:id/replies", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = ticketReplySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const user = c.get("user");

    const { results: t } = await db.prepare(`SELECT id FROM tickets WHERE id = ?`).bind(id).all<{ id: string }>();
    if (!t[0]) return c.json({ error: "Tiket tidak ditemukan." }, 404);

    await db
      .prepare(
        `INSERT INTO ticket_replies (id, ticket_id, body, author_user_id, author_name, internal)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), id, parsed.data.body, user.id, user.name, parsed.data.internal ? 1 : 0)
      .run();

    await audit(c.env, {
      action: "helpdesk.ticket_replied",
      userId: user.id,
      tenantId: tenant.id,
      detail: { ticketId: id, internal: parsed.data.internal },
      ip: clientIp(c),
    });
    return c.json({ ok: true }, 201);
  })

  .patch("/:tenantId/tickets/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = updateTicketSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten().formErrors[0] ?? "Data tidak valid" }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const input = parsed.data;

    const { results: t } = await db
      .prepare(`SELECT id, status FROM tickets WHERE id = ?`)
      .bind(id)
      .all<{ id: string; status: string }>();
    if (!t[0]) return c.json({ error: "Tiket tidak ditemukan." }, 404);

    // Penugasan: assignedTo harus anggota tenant (dilihat dari control-plane).
    if (input.assignedTo !== undefined) {
      if (input.assignedTo === null) {
        await db.prepare(`UPDATE tickets SET assigned_to = NULL, assigned_name = NULL WHERE id = ?`).bind(id).run();
      } else {
        const member = await c.env.DB.prepare(
          `SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? AND m.user_id = ?`,
        )
          .bind(tenant.id, input.assignedTo)
          .first<{ name: string }>();
        if (!member) return c.json({ error: "Petugas bukan anggota perusahaan ini." }, 400);
        await db
          .prepare(`UPDATE tickets SET assigned_to = ?, assigned_name = ? WHERE id = ?`)
          .bind(input.assignedTo, member.name, id)
          .run();
      }
    }

    if (input.status !== undefined) {
      const resolvedAt = input.status === "resolved" || input.status === "closed" ? new Date().toISOString() : null;
      await db.prepare(`UPDATE tickets SET status = ?, resolved_at = ? WHERE id = ?`).bind(input.status, resolvedAt, id).run();
    }

    await audit(c.env, {
      action: "helpdesk.ticket_updated",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { ticketId: id, status: input.status, assignedTo: input.assignedTo },
      ip: clientIp(c),
    });
    const row = await loadTicket(db, id);
    return c.json({ ok: true, ticket: row ? mapTicket(row) : null });
  });

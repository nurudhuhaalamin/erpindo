import {
  projectSchema,
  projectTaskSchema,
  projectTaskStatusSchema,
  updateProjectStatusSchema,
  type ApiProject,
  type ApiProjectDetail,
  type ApiProjectTask,
  type ProjectStatus,
} from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Proyek (Fase 2q): proyek & tugas, dengan tagging biaya/pendapatan lewat
 * `journal_entries.project_id`. Profitabilitas dihitung dari jurnal terposting
 * yang ber-tag — pendapatan (akun income) vs biaya (akun expense) — sehingga
 * penjualan ber-tag otomatis membawa pendapatan sekaligus HPP-nya.
 */

// Sub-kueri korelasi: pendapatan & biaya proyek dari jurnal terposting ber-tag.
const REVENUE_SUBQ = `COALESCE((SELECT SUM(CASE WHEN a.type = 'income' THEN l.credit - l.debit ELSE 0 END)
   FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id JOIN accounts a ON a.id = l.account_id
   WHERE e.project_id = p.id AND e.status = 'posted'), 0)`;
const COST_SUBQ = `COALESCE((SELECT SUM(CASE WHEN a.type = 'expense' THEN l.debit - l.credit ELSE 0 END)
   FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id JOIN accounts a ON a.id = l.account_id
   WHERE e.project_id = p.id AND e.status = 'posted'), 0)`;

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  contact_id: string | null;
  contact_name: string | null;
  status: ProjectStatus;
  budget: number;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  revenue: number;
  cost: number;
  task_count: number;
  done_count: number;
};

function toApi(r: ProjectRow): ApiProject {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    contactId: r.contact_id,
    contactName: r.contact_name,
    status: r.status,
    budget: r.budget,
    startDate: r.start_date,
    endDate: r.end_date,
    notes: r.notes,
    revenue: r.revenue,
    cost: r.cost,
    profit: r.revenue - r.cost,
    taskCount: r.task_count,
    doneCount: r.done_count,
  };
}

async function fetchProject(db: SqlExecutor, id: string): Promise<ProjectRow | undefined> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.code, p.name, p.contact_id, c.name AS contact_name, p.status, p.budget,
              p.start_date, p.end_date, p.notes,
              ${REVENUE_SUBQ} AS revenue, ${COST_SUBQ} AS cost,
              (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id) AS task_count,
              (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count
       FROM projects p LEFT JOIN contacts c ON c.id = p.contact_id WHERE p.id = ?`,
    )
    .bind(id)
    .all<ProjectRow>();
  return results[0];
}

export const projectRoutes = new Hono<AppEnv>()

  .get("/:tenantId/projects", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT p.id, p.code, p.name, p.contact_id, c.name AS contact_name, p.status, p.budget,
                p.start_date, p.end_date, p.notes,
                ${REVENUE_SUBQ} AS revenue, ${COST_SUBQ} AS cost,
                (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id) AS task_count,
                (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count
         FROM projects p LEFT JOIN contacts c ON c.id = p.contact_id
         ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END, p.created_at DESC`,
      )
      .all<ProjectRow>();
    return c.json({ projects: results.map(toApi) });
  })

  .post("/:tenantId/projects", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = projectSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: dup } = await db
      .prepare(`SELECT id FROM projects WHERE code = ?`)
      .bind(input.code)
      .all<{ id: string }>();
    if (dup[0]) return c.json({ error: `Kode proyek ${input.code} sudah dipakai.` }, 409);

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO projects (id, code, name, contact_id, budget, start_date, end_date, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.code,
        input.name,
        input.contactId ?? null,
        input.budget,
        input.startDate ?? null,
        input.endDate ?? null,
        input.notes ?? null,
        c.get("user").id,
      )
      .run();

    await audit(c.env, {
      action: "project.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, code: input.code },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/projects/:id/status", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = updateProjectStatusSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Status tidak valid." }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");

    const { results } = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(id).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Proyek tidak ditemukan." }, 404);

    await db.prepare(`UPDATE projects SET status = ? WHERE id = ?`).bind(parsed.data.status, id).run();
    await audit(c.env, {
      action: "project.status",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, status: parsed.data.status },
      ip: clientIp(c),
    });
    return c.json({ ok: true, status: parsed.data.status });
  })

  .get("/:tenantId/projects/:id", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const id = c.req.param("id");
    const row = await fetchProject(db, id);
    if (!row) return c.json({ error: "Proyek tidak ditemukan." }, 404);

    const { results: tasks } = await db
      .prepare(`SELECT id, name, status, due_date FROM project_tasks WHERE project_id = ? ORDER BY created_at`)
      .bind(id)
      .all<{ id: string; name: string; status: ApiProjectTask["status"]; due_date: string | null }>();

    const { results: entries } = await db
      .prepare(
        `SELECT e.entry_no, e.entry_date, e.memo,
                SUM(CASE WHEN a.type = 'income' THEN l.credit - l.debit ELSE 0 END) AS revenue,
                SUM(CASE WHEN a.type = 'expense' THEN l.debit - l.credit ELSE 0 END) AS cost
         FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id JOIN accounts a ON a.id = l.account_id
         WHERE e.project_id = ? AND e.status = 'posted'
         GROUP BY e.id ORDER BY e.entry_date DESC, e.entry_no DESC`,
      )
      .bind(id)
      .all<{ entry_no: string; entry_date: string; memo: string | null; revenue: number; cost: number }>();

    const detail: ApiProjectDetail = {
      ...toApi(row),
      tasks: tasks.map((t) => ({ id: t.id, name: t.name, status: t.status, dueDate: t.due_date })),
      entries: entries.map((e) => ({
        entryNo: e.entry_no,
        entryDate: e.entry_date,
        memo: e.memo,
        revenue: e.revenue,
        cost: e.cost,
      })),
    };
    return c.json(detail);
  })

  .post("/:tenantId/projects/:id/tasks", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = projectTaskSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const projectId = c.req.param("id");

    const { results } = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Proyek tidak ditemukan." }, 404);

    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO project_tasks (id, project_id, name, due_date) VALUES (?, ?, ?, ?)`)
      .bind(id, projectId, parsed.data.name, parsed.data.dueDate ?? null)
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/projects/:id/tasks/:taskId", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = projectTaskStatusSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Status tidak valid." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const taskId = c.req.param("taskId");

    const { results } = await db.prepare(`SELECT id FROM project_tasks WHERE id = ?`).bind(taskId).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Tugas tidak ditemukan." }, 404);

    await db.prepare(`UPDATE project_tasks SET status = ? WHERE id = ?`).bind(parsed.data.status, taskId).run();
    return c.json({ ok: true, status: parsed.data.status });
  });

import {
  invoiceMilestoneSchema,
  projectBudgetSchema,
  projectMilestoneSchema,
  projectSchema,
  projectTaskSchema,
  projectTaskUpdateSchema,
  timeEntrySchema,
  updateProjectStatusSchema,
  type ApiProject,
  type ApiProjectBudget,
  type ApiProjectDetail,
  type ApiProjectMilestone,
  type ApiProjectTask,
  type ApiProjectWorkload,
  type ApiTimeEntry,
  type CreateInvoiceInput,
  type ProjectStatus,
  type ProjectTaskPriority,
} from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";
import { executeInvoice } from "./commerce";

/**
 * Pastikan ada satu produk jasa "Jasa/Termin Proyek" untuk menagih termin tanpa
 * menyentuh stok — dibuat sekali per tenant lalu dipakai ulang.
 */
async function ensureServiceProduct(db: SqlExecutor): Promise<string> {
  const { results } = await db
    .prepare(`SELECT id FROM products WHERE sku = 'JASA-PROYEK'`)
    .all<{ id: string }>();
  if (results[0]) return results[0].id;
  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO products (id, sku, name, unit, sell_price, is_service) VALUES (?, 'JASA-PROYEK', ?, 'termin', 0, 1)`)
    .bind(id, "Jasa/Termin Proyek")
    .run();
  return id;
}

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
      .prepare(
        `SELECT t.id, t.name, t.status, t.due_date, t.assignee_id, e.name AS assignee_name, t.priority, t.sort_order,
                t.start_date, t.end_date, t.predecessor_id, t.baseline_start, t.baseline_end
         FROM project_tasks t LEFT JOIN employees e ON e.id = t.assignee_id
         WHERE t.project_id = ? ORDER BY t.sort_order, t.created_at`,
      )
      .bind(id)
      .all<{
        id: string;
        name: string;
        status: ApiProjectTask["status"];
        due_date: string | null;
        assignee_id: string | null;
        assignee_name: string | null;
        priority: ProjectTaskPriority;
        sort_order: number;
        start_date: string | null;
        end_date: string | null;
        predecessor_id: string | null;
        baseline_start: string | null;
        baseline_end: string | null;
      }>();

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

    const [milestonesRes, budgetsRes, timeRes] = await Promise.all([
      db
        .prepare(
          `SELECT m.id, m.name, m.amount, m.status, m.invoice_id, i.invoice_no
           FROM project_milestones m LEFT JOIN invoices i ON i.id = m.invoice_id
           WHERE m.project_id = ? ORDER BY m.created_at`,
        )
        .bind(id)
        .all<{ id: string; name: string; amount: number; status: "planned" | "invoiced"; invoice_id: string | null; invoice_no: string | null }>(),
      db
        .prepare(`SELECT id, category, planned_amount FROM project_budgets WHERE project_id = ? ORDER BY created_at`)
        .bind(id)
        .all<{ id: string; category: string; planned_amount: number }>(),
      db
        .prepare(
          `SELECT t.id, t.employee_id, e.name AS employee_name, t.entry_date, t.hours, t.hourly_rate, t.note
           FROM time_entries t LEFT JOIN employees e ON e.id = t.employee_id
           WHERE t.project_id = ? ORDER BY t.entry_date DESC, t.created_at DESC`,
        )
        .bind(id)
        .all<{ id: string; employee_id: string | null; employee_name: string | null; entry_date: string; hours: number; hourly_rate: number; note: string | null }>(),
    ]);

    const milestones: ApiProjectMilestone[] = milestonesRes.results.map((m) => ({
      id: m.id,
      name: m.name,
      amount: m.amount,
      status: m.status,
      invoiceId: m.invoice_id,
      invoiceNo: m.invoice_no,
    }));
    const budgets: ApiProjectBudget[] = budgetsRes.results.map((b) => ({
      id: b.id,
      category: b.category,
      plannedAmount: b.planned_amount,
    }));
    const timeEntries: ApiTimeEntry[] = timeRes.results.map((t) => ({
      id: t.id,
      employeeId: t.employee_id,
      employeeName: t.employee_name,
      entryDate: t.entry_date,
      hours: t.hours,
      hourlyRate: t.hourly_rate,
      amount: Math.round(t.hours * t.hourly_rate),
      note: t.note,
    }));

    const apiTasks: ApiProjectTask[] = tasks.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      dueDate: t.due_date,
      assigneeId: t.assignee_id,
      assigneeName: t.assignee_name,
      priority: t.priority ?? "medium",
      sortOrder: t.sort_order ?? 0,
      startDate: t.start_date,
      endDate: t.end_date,
      predecessorId: t.predecessor_id,
      baselineStart: t.baseline_start,
      baselineEnd: t.baseline_end,
    }));

    // Beban kerja: kelompokkan tugas per penanggung jawab (termasuk "Belum ditugaskan").
    const workloadMap = new Map<string, ApiProjectWorkload>();
    for (const t of apiTasks) {
      const key = t.assigneeId ?? "__none__";
      let w = workloadMap.get(key);
      if (!w) {
        w = { assigneeId: t.assigneeId, assigneeName: t.assigneeName ?? "Belum ditugaskan", todo: 0, inProgress: 0, done: 0, openTasks: 0 };
        workloadMap.set(key, w);
      }
      if (t.status === "todo") w.todo += 1;
      else if (t.status === "in_progress") w.inProgress += 1;
      else w.done += 1;
      if (t.status !== "done") w.openTasks += 1;
    }
    const workload = [...workloadMap.values()].sort((a, b) => b.openTasks - a.openTasks);

    const plannedCost = budgets.reduce((s, b) => s + b.plannedAmount, 0);
    const laborCost = timeEntries.reduce((s, t) => s + t.amount, 0);
    const progressPct = row.task_count > 0 ? Math.round((row.done_count / row.task_count) * 100) : 0;

    const detail: ApiProjectDetail = {
      ...toApi(row),
      tasks: apiTasks,
      workload,
      entries: entries.map((e) => ({
        entryNo: e.entry_no,
        entryDate: e.entry_date,
        memo: e.memo,
        revenue: e.revenue,
        cost: e.cost,
      })),
      milestones,
      budgets,
      timeEntries,
      plannedCost,
      laborCost,
      progressPct,
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

    // Validasi penanggung jawab bila diisi.
    const assigneeId = parsed.data.assigneeId && parsed.data.assigneeId.length > 0 ? parsed.data.assigneeId : null;
    if (assigneeId) {
      const { results: emp } = await db.prepare(`SELECT id FROM employees WHERE id = ?`).bind(assigneeId).all<{ id: string }>();
      if (!emp[0]) return c.json({ error: "Penanggung jawab tidak ditemukan." }, 404);
    }

    // Tugas baru masuk ke akhir kolom todo (sort_order = maks + 1).
    const { results: maxRows } = await db
      .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM project_tasks WHERE project_id = ?`)
      .bind(projectId)
      .all<{ m: number }>();
    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO project_tasks (id, project_id, name, due_date, assignee_id, priority, sort_order, start_date, end_date, predecessor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, projectId, parsed.data.name, parsed.data.dueDate ?? null, assigneeId, parsed.data.priority ?? "medium", (maxRows[0]?.m ?? 0) + 1, parsed.data.startDate ?? null, parsed.data.endDate ?? null, parsed.data.predecessorId ?? null)
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/projects/:id/tasks/:taskId", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = projectTaskUpdateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const taskId = c.req.param("taskId");

    const { results } = await db.prepare(`SELECT id FROM project_tasks WHERE id = ?`).bind(taskId).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Tugas tidak ditemukan." }, 404);

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (parsed.data.status !== undefined) { sets.push("status = ?"); vals.push(parsed.data.status); }
    if (parsed.data.priority !== undefined) { sets.push("priority = ?"); vals.push(parsed.data.priority); }
    if (parsed.data.dueDate !== undefined) { sets.push("due_date = ?"); vals.push(parsed.data.dueDate); }
    if (parsed.data.assigneeId !== undefined) {
      const assigneeId = parsed.data.assigneeId && parsed.data.assigneeId.length > 0 ? parsed.data.assigneeId : null;
      if (assigneeId) {
        const { results: emp } = await db.prepare(`SELECT id FROM employees WHERE id = ?`).bind(assigneeId).all<{ id: string }>();
        if (!emp[0]) return c.json({ error: "Penanggung jawab tidak ditemukan." }, 404);
      }
      sets.push("assignee_id = ?");
      vals.push(assigneeId);
    }
    if (parsed.data.startDate !== undefined) { sets.push("start_date = ?"); vals.push(parsed.data.startDate); }
    if (parsed.data.endDate !== undefined) { sets.push("end_date = ?"); vals.push(parsed.data.endDate); }
    if (parsed.data.predecessorId !== undefined) { sets.push("predecessor_id = ?"); vals.push(parsed.data.predecessorId || null); }
    // Simpan baseline = jadwal saat ini (setelah perubahan di atas diterapkan lewat COALESCE nilai baru).
    if (parsed.data.setBaseline) {
      sets.push("baseline_start = COALESCE(?, start_date)");
      vals.push(parsed.data.startDate ?? null);
      sets.push("baseline_end = COALESCE(?, end_date)");
      vals.push(parsed.data.endDate ?? null);
    }
    if (sets.length === 0) return c.json({ error: "Tidak ada perubahan." }, 400);

    vals.push(taskId);
    await db.prepare(`UPDATE project_tasks SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
    // Echo status bila diubah (kompatibilitas dengan pemanggil lama).
    return c.json(parsed.data.status !== undefined ? { ok: true, status: parsed.data.status } : { ok: true });
  })

  // -------------------------------------------------------------------------
  // Termin penagihan (Fase 5g): milestone → 'Buat faktur dari termin'.
  // -------------------------------------------------------------------------

  .post("/:tenantId/projects/:id/milestones", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = projectMilestoneSchema.safeParse(await c.req.json().catch(() => ({})));
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
      .prepare(`INSERT INTO project_milestones (id, project_id, name, amount) VALUES (?, ?, ?, ?)`)
      .bind(id, projectId, parsed.data.name, parsed.data.amount)
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .post("/:tenantId/projects/:id/milestones/:mid/invoice", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = invoiceMilestoneSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const projectId = c.req.param("id");
    const mid = c.req.param("mid");
    const input = parsed.data;

    const { results: projs } = await db
      .prepare(`SELECT contact_id FROM projects WHERE id = ?`)
      .bind(projectId)
      .all<{ contact_id: string | null }>();
    const proj = projs[0];
    if (!proj) return c.json({ error: "Proyek tidak ditemukan." }, 404);
    if (!proj.contact_id) return c.json({ error: "Proyek belum punya pelanggan — tetapkan pelanggan sebelum menagih termin." }, 400);

    const { results: ms } = await db
      .prepare(`SELECT name, amount, status FROM project_milestones WHERE id = ? AND project_id = ?`)
      .bind(mid, projectId)
      .all<{ name: string; amount: number; status: string }>();
    const milestone = ms[0];
    if (!milestone) return c.json({ error: "Termin tidak ditemukan." }, 404);
    if (milestone.status === "invoiced") return c.json({ error: "Termin ini sudah difakturkan." }, 400);

    const serviceProductId = await ensureServiceProduct(db);
    const invoiceInput: CreateInvoiceInput = {
      contactId: proj.contact_id,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      taxRate: input.taxRate,
      warehouseId: input.warehouseId,
      projectId,
      lines: [{ productId: serviceProductId, description: milestone.name, qty: 1, unitPrice: milestone.amount }],
    };
    const result = await executeInvoice(db, invoiceInput, c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, 400);

    await db
      .prepare(`UPDATE project_milestones SET status = 'invoiced', invoice_id = ? WHERE id = ? AND status = 'planned'`)
      .bind(result.invoiceId, mid)
      .run();
    await audit(c.env, {
      action: "project.milestone.invoiced",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { milestoneId: mid, docNo: result.docNo, total: result.total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, invoiceId: result.invoiceId, docNo: result.docNo, total: result.total }, 201);
  })

  .delete("/:tenantId/projects/:id/milestones/:mid", requireAuth, requireTenantRole("admin"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const mid = c.req.param("mid");
    const { results } = await db
      .prepare(`SELECT status FROM project_milestones WHERE id = ? AND project_id = ?`)
      .bind(mid, c.req.param("id"))
      .all<{ status: string }>();
    if (!results[0]) return c.json({ error: "Termin tidak ditemukan." }, 404);
    if (results[0].status === "invoiced") return c.json({ error: "Termin yang sudah difakturkan tidak bisa dihapus." }, 409);
    await db.prepare(`DELETE FROM project_milestones WHERE id = ?`).bind(mid).run();
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // RAB (Fase 5g): anggaran biaya per kategori vs realisasi jurnal ber-tag.
  // -------------------------------------------------------------------------

  .post("/:tenantId/projects/:id/budgets", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = projectBudgetSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const projectId = c.req.param("id");
    const { results } = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Proyek tidak ditemukan." }, 404);
    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO project_budgets (id, project_id, category, planned_amount) VALUES (?, ?, ?, ?)`)
      .bind(id, projectId, parsed.data.category, parsed.data.plannedAmount)
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .delete("/:tenantId/projects/:id/budgets/:bid", requireAuth, requireTenantRole("admin"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(`SELECT id FROM project_budgets WHERE id = ? AND project_id = ?`)
      .bind(c.req.param("bid"), c.req.param("id"))
      .all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Baris RAB tidak ditemukan." }, 404);
    await db.prepare(`DELETE FROM project_budgets WHERE id = ?`).bind(c.req.param("bid")).run();
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // Timesheet (Fase 5g): jam × tarif → estimasi biaya tenaga kerja (informatif).
  // -------------------------------------------------------------------------

  .post("/:tenantId/projects/:id/time-entries", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = timeEntrySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const projectId = c.req.param("id");
    const input = parsed.data;
    const { results } = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(projectId).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Proyek tidak ditemukan." }, 404);

    if (input.employeeId) {
      const { results: emp } = await db
        .prepare(`SELECT id FROM employees WHERE id = ?`)
        .bind(input.employeeId)
        .all<{ id: string }>();
      if (!emp[0]) return c.json({ error: "Karyawan tidak ditemukan." }, 404);
    }

    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO time_entries (id, project_id, employee_id, entry_date, hours, hourly_rate, note) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, projectId, input.employeeId ?? null, input.entryDate, input.hours, input.hourlyRate, input.note ?? null)
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .delete("/:tenantId/projects/:id/time-entries/:eid", requireAuth, requireTenantRole("admin"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(`SELECT id FROM time_entries WHERE id = ? AND project_id = ?`)
      .bind(c.req.param("eid"), c.req.param("id"))
      .all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Entri timesheet tidak ditemukan." }, 404);
    await db.prepare(`DELETE FROM time_entries WHERE id = ?`).bind(c.req.param("eid")).run();
    return c.json({ ok: true });
  });

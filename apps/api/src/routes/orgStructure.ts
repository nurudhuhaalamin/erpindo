import { departmentSchema, type ApiDepartment, type ApiOrgNode } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Struktur organisasi (Fase 8c): departemen berhierarki (parent_id) + bagan
 * organisasi. Gap struktural #1 dari analisis pemilik — fondasi untuk laporan
 * per departemen, "tim saya", dan approval berbasis hierarki ke depan.
 */

type DeptRow = { id: string; code: string; name: string; parent_id: string | null };

/** Apakah menjadikan `parentId` induk dari `deptId` membentuk siklus? */
async function formsCycle(
  db: ReturnType<typeof getTenantDb>,
  deptId: string,
  parentId: string,
): Promise<boolean> {
  let cursor: string | null = parentId;
  for (let hop = 0; cursor && hop < 50; hop++) {
    if (cursor === deptId) return true;
    const row: { parent_id: string | null } | undefined = (await db
      .prepare(`SELECT parent_id FROM departments WHERE id = ?`)
      .bind(cursor).all<{ parent_id: string | null }>()).results[0];
    cursor = row?.parent_id ?? null;
  }
  return false;
}

export const orgStructureRoutes = new Hono<AppEnv>()
  .get("/:tenantId/departments", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT d.id, d.code, d.name, d.parent_id, p.name AS parent_name,
                (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS employee_count
         FROM departments d LEFT JOIN departments p ON p.id = d.parent_id
         WHERE d.is_archived = 0 ORDER BY d.code`,
      )
      .all<DeptRow & { parent_name: string | null; employee_count: number }>();
    const departments: ApiDepartment[] = results.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      parentId: r.parent_id,
      parentName: r.parent_name,
      employeeCount: r.employee_count,
    }));
    return c.json({ departments });
  })

  .post("/:tenantId/departments", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = departmentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const dup = (await db
      .prepare(`SELECT id FROM departments WHERE code = ?`)
      .bind(input.code).all<{ id: string }>()).results[0];
    if (dup) return c.json({ error: `Kode departemen ${input.code} sudah dipakai.` }, 409);

    if (input.parentId) {
      const parent = (await db
        .prepare(`SELECT id FROM departments WHERE id = ? AND is_archived = 0`)
        .bind(input.parentId).all<{ id: string }>()).results[0];
      if (!parent) return c.json({ error: "Departemen induk tidak ditemukan." }, 400);
    }

    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO departments (id, code, name, parent_id) VALUES (?, ?, ?, ?)`)
      .bind(id, input.code, input.name, input.parentId ?? null)
      .run();
    await audit(c.env, {
      action: "org.department.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, code: input.code, name: input.name },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/departments/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = departmentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const input = parsed.data;

    const existing = (await db.prepare(`SELECT id FROM departments WHERE id = ?`).bind(id).all<{ id: string }>()).results[0];
    if (!existing) return c.json({ error: "Departemen tidak ditemukan." }, 404);

    const dup = (await db
      .prepare(`SELECT id FROM departments WHERE code = ? AND id != ?`)
      .bind(input.code, id).all<{ id: string }>()).results[0];
    if (dup) return c.json({ error: `Kode departemen ${input.code} sudah dipakai.` }, 409);

    if (input.parentId) {
      if (input.parentId === id) return c.json({ error: "Departemen tidak boleh menjadi induk dirinya sendiri." }, 400);
      const parent = (await db
        .prepare(`SELECT id FROM departments WHERE id = ? AND is_archived = 0`)
        .bind(input.parentId).all<{ id: string }>()).results[0];
      if (!parent) return c.json({ error: "Departemen induk tidak ditemukan." }, 400);
      if (await formsCycle(db, id, input.parentId)) {
        return c.json({ error: "Struktur melingkar: departemen induk berada di bawah departemen ini." }, 400);
      }
    }

    await db
      .prepare(`UPDATE departments SET code = ?, name = ?, parent_id = ? WHERE id = ?`)
      .bind(input.code, input.name, input.parentId ?? null, id)
      .run();
    await audit(c.env, {
      action: "org.department.updated",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, code: input.code },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // Arsipkan (bukan hapus permanen): sub-departemen naik ke induk, karyawan dilepas.
  .delete("/:tenantId/departments/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const existing = (await db
      .prepare(`SELECT parent_id FROM departments WHERE id = ? AND is_archived = 0`)
      .bind(id).all<{ parent_id: string | null }>()).results[0];
    if (!existing) return c.json({ error: "Departemen tidak ditemukan." }, 404);

    await db.prepare(`UPDATE departments SET parent_id = ? WHERE parent_id = ?`).bind(existing.parent_id, id).run();
    await db.prepare(`UPDATE employees SET department_id = NULL WHERE department_id = ?`).bind(id).run();
    await db.prepare(`UPDATE departments SET is_archived = 1 WHERE id = ?`).bind(id).run();
    await audit(c.env, {
      action: "org.department.archived",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // Bagan organisasi: pohon departemen + karyawan per departemen (+ tanpa departemen).
  .get("/:tenantId/org-chart", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const [{ results: depts }, { results: emps }] = await Promise.all([
      db
        .prepare(`SELECT id, code, name, parent_id FROM departments WHERE is_archived = 0 ORDER BY code`)
        .all<DeptRow>(),
      db
        .prepare(
          `SELECT e.id, e.name, e.position, e.department_id, m.name AS manager_name
           FROM employees e LEFT JOIN employees m ON m.id = e.manager_id
           WHERE e.is_active = 1 ORDER BY e.name`,
        )
        .all<{ id: string; name: string; position: string | null; department_id: string | null; manager_name: string | null }>(),
    ]);

    const nodeById = new Map<string, ApiOrgNode>();
    for (const d of depts) {
      nodeById.set(d.id, { id: d.id, code: d.code, name: d.name, employees: [], children: [] });
    }
    for (const e of emps) {
      const node = e.department_id ? nodeById.get(e.department_id) : undefined;
      if (node) {
        node.employees.push({ id: e.id, name: e.name, position: e.position, managerName: e.manager_name });
      }
    }
    const roots: ApiOrgNode[] = [];
    for (const d of depts) {
      const node = nodeById.get(d.id)!;
      const parent = d.parent_id ? nodeById.get(d.parent_id) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    const unassigned = emps
      .filter((e) => !e.department_id || !nodeById.has(e.department_id))
      .map((e) => ({ id: e.id, name: e.name, position: e.position, managerName: e.manager_name }));

    return c.json({ tree: roots, unassigned });
  });

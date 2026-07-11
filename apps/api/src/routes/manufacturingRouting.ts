import {
  routingActualSchema,
  routingStepSchema,
  workCenterSchema,
  type ApiRoutingStep,
  type ApiWorkCenter,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Manufaktur routing (Fase 7g): work center (pusat kerja) + tahapan routing per
 * perintah produksi, dengan biaya standar vs aktual (dasar analisis WIP/varian).
 * ADDITIVE — tidak mengubah alur produksi/BoM/QC lama.
 */
export const manufacturingRoutingRoutes = new Hono<AppEnv>()
  // --- Work center (master) -------------------------------------------------
  .get("/:tenantId/work-centers", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(`SELECT id, code, name, hourly_rate, created_at FROM work_centers WHERE is_archived = 0 ORDER BY code`)
      .all<{ id: string; code: string; name: string; hourly_rate: number; created_at: string }>();
    const items: ApiWorkCenter[] = results.map((r) => ({ id: r.id, code: r.code, name: r.name, hourlyRate: r.hourly_rate, createdAt: r.created_at }));
    return c.json({ items });
  })

  .post("/:tenantId/work-centers", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = workCenterSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const dup = await db.prepare(`SELECT id FROM work_centers WHERE code = ?`).bind(parsed.data.code).all<{ id: string }>();
    if (dup.results[0]) return c.json({ error: `Kode '${parsed.data.code}' sudah dipakai.` }, 409);
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO work_centers (id, code, name, hourly_rate) VALUES (?, ?, ?, ?)`).bind(id, parsed.data.code, parsed.data.name, parsed.data.hourlyRate).run();
    await audit(c.env, { action: "manufacturing.work_center.created", userId: c.get("user").id, tenantId: tenant.id, detail: { code: parsed.data.code }, ip: clientIp(c) });
    return c.json({ ok: true, id }, 201);
  })

  .post("/:tenantId/work-centers/:id/archive", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    await db.prepare(`UPDATE work_centers SET is_archived = 1 WHERE id = ?`).bind(c.req.param("id")).run();
    await audit(c.env, { action: "manufacturing.work_center.archived", userId: c.get("user").id, tenantId: tenant.id, detail: { id: c.req.param("id") }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  // --- Routing per perintah produksi ----------------------------------------
  .get("/:tenantId/production-orders/:id/routing", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT s.id, s.production_id, s.work_center_id, w.name AS wc_name, s.step_order, s.name, s.standard_cost, s.actual_cost, s.status
         FROM production_routing_steps s JOIN work_centers w ON w.id = s.work_center_id
         WHERE s.production_id = ? ORDER BY s.step_order`,
      )
      .bind(c.req.param("id"))
      .all<{ id: string; production_id: string; work_center_id: string; wc_name: string; step_order: number; name: string; standard_cost: number; actual_cost: number | null; status: "pending" | "done" }>();
    const steps: ApiRoutingStep[] = results.map((r) => ({
      id: r.id,
      productionId: r.production_id,
      workCenterId: r.work_center_id,
      workCenterName: r.wc_name,
      stepOrder: r.step_order,
      name: r.name,
      standardCost: r.standard_cost,
      actualCost: r.actual_cost,
      status: r.status,
    }));
    const totalStandard = steps.reduce((s, x) => s + x.standardCost, 0);
    const totalActual = steps.reduce((s, x) => s + (x.actualCost ?? 0), 0);
    return c.json({ steps, totalStandard, totalActual, variance: totalActual - totalStandard });
  })

  .post("/:tenantId/production-orders/:id/routing", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = routingStepSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const productionId = c.req.param("id");
    const prod = await db.prepare(`SELECT id FROM production_orders WHERE id = ?`).bind(productionId).all<{ id: string }>();
    if (!prod.results[0]) return c.json({ error: "Perintah produksi tidak ditemukan." }, 404);
    const wc = await db.prepare(`SELECT id FROM work_centers WHERE id = ? AND is_archived = 0`).bind(parsed.data.workCenterId).all<{ id: string }>();
    if (!wc.results[0]) return c.json({ error: "Work center tidak ditemukan." }, 400);
    const { results: maxRows } = await db.prepare(`SELECT COALESCE(MAX(step_order), 0) AS m FROM production_routing_steps WHERE production_id = ?`).bind(productionId).all<{ m: number }>();
    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO production_routing_steps (id, production_id, work_center_id, step_order, name, standard_cost) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, productionId, parsed.data.workCenterId, (maxRows[0]?.m ?? 0) + 1, parsed.data.name, parsed.data.standardCost)
      .run();
    await audit(c.env, { action: "manufacturing.routing.added", userId: c.get("user").id, tenantId: tenant.id, detail: { productionId, name: parsed.data.name }, ip: clientIp(c) });
    return c.json({ ok: true, id }, 201);
  })

  // Catat biaya aktual + tandai tahap selesai (WIP → selesai).
  .post("/:tenantId/production-orders/:id/routing/:stepId/complete", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = routingActualSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const stepId = c.req.param("stepId");
    const { results } = await db.prepare(`SELECT id, status FROM production_routing_steps WHERE id = ? AND production_id = ?`).bind(stepId, c.req.param("id")).all<{ id: string; status: string }>();
    if (!results[0]) return c.json({ error: "Tahap routing tidak ditemukan." }, 404);
    if (results[0].status === "done") return c.json({ error: "Tahap ini sudah selesai." }, 409);
    await db.prepare(`UPDATE production_routing_steps SET actual_cost = ?, status = 'done' WHERE id = ?`).bind(parsed.data.actualCost, stepId).run();
    await audit(c.env, { action: "manufacturing.routing.completed", userId: c.get("user").id, tenantId: tenant.id, detail: { stepId, actual: parsed.data.actualCost }, ip: clientIp(c) });
    return c.json({ ok: true });
  });

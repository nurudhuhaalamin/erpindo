import {
  completeWorkOrderSchema,
  createMaintenanceScheduleSchema,
  createWorkOrderSchema,
  maintenanceScheduleStatusSchema,
  type ApiMaintenanceSchedule,
  type ApiWorkOrder,
} from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { accountIdByCode, getLockedBefore, nextDocNo, postJournal } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Maintenance / servis aset (Fase 2v). Jadwal servis berkala per aset tetap;
 * Cron harian (atau pemicu manual) menerbitkan work order saat jatuh tempo lalu
 * memajukan tanggal servis berikutnya. Work order selesai dengan biaya memposting
 * jurnal Beban Pemeliharaan (5-7000) / Kas-Bank.
 */

const BEBAN_PEMELIHARAAN = "5-7000";

/** Majukan tanggal (YYYY-MM-DD) sejumlah bulan; hari di-clamp ke akhir bulan. */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d!, lastDay));
  return base.toISOString().slice(0, 10);
}

/**
 * Terbitkan work order untuk semua jadwal aktif yang jatuh tempo (≤ today), lalu
 * majukan tanggal servis berikutnya. Dipakai Cron & pemicu manual.
 */
export async function runMaintenance(
  db: SqlExecutor,
  today: string,
  userId: string,
): Promise<{ generated: number }> {
  const { results: due } = await db
    .prepare(
      `SELECT s.id, s.asset_id, s.name, s.interval_months, s.next_due_date
       FROM maintenance_schedules s JOIN fixed_assets a ON a.id = s.asset_id
       WHERE s.active = 1 AND a.status = 'active' AND s.next_due_date <= ?`,
    )
    .bind(today)
    .all<{ id: string; asset_id: string; name: string; interval_months: number; next_due_date: string }>();

  let generated = 0;
  for (const s of due) {
    const orderNo = await nextDocNo(db, "work_orders", "WO");
    await db
      .prepare(
        `INSERT INTO work_orders (id, order_no, asset_id, schedule_id, title, status, scheduled_date, created_by)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
      )
      .bind(crypto.randomUUID(), orderNo, s.asset_id, s.id, s.name, s.next_due_date, userId)
      .run();
    await db
      .prepare(`UPDATE maintenance_schedules SET next_due_date = ? WHERE id = ?`)
      .bind(addMonths(s.next_due_date, s.interval_months), s.id)
      .run();
    generated++;
  }
  return { generated };
}

async function listSchedules(db: SqlExecutor): Promise<ApiMaintenanceSchedule[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.asset_id, a.name AS asset_name, s.name, s.interval_months, s.next_due_date, s.active
       FROM maintenance_schedules s JOIN fixed_assets a ON a.id = s.asset_id
       ORDER BY s.active DESC, s.next_due_date`,
    )
    .all<{
      id: string;
      asset_id: string;
      asset_name: string;
      name: string;
      interval_months: number;
      next_due_date: string;
      active: number;
    }>();
  return results.map((r) => ({
    id: r.id,
    assetId: r.asset_id,
    assetName: r.asset_name,
    name: r.name,
    intervalMonths: r.interval_months,
    nextDueDate: r.next_due_date,
    active: r.active === 1,
  }));
}

async function listWorkOrders(db: SqlExecutor): Promise<ApiWorkOrder[]> {
  const { results } = await db
    .prepare(
      `SELECT w.id, w.order_no, w.asset_id, a.name AS asset_name, w.schedule_id, w.title, w.status,
              w.scheduled_date, w.completed_date, w.cost, w.notes, w.created_at
       FROM work_orders w JOIN fixed_assets a ON a.id = w.asset_id
       ORDER BY w.status, w.scheduled_date DESC, w.created_at DESC`,
    )
    .all<{
      id: string;
      order_no: string;
      asset_id: string;
      asset_name: string;
      schedule_id: string | null;
      title: string;
      status: "open" | "done";
      scheduled_date: string;
      completed_date: string | null;
      cost: number;
      notes: string | null;
      created_at: string;
    }>();
  return results.map((w) => ({
    id: w.id,
    orderNo: w.order_no,
    assetId: w.asset_id,
    assetName: w.asset_name,
    scheduleId: w.schedule_id,
    title: w.title,
    status: w.status,
    scheduledDate: w.scheduled_date,
    completedDate: w.completed_date,
    cost: w.cost,
    notes: w.notes,
    createdAt: w.created_at,
  }));
}

async function activeAsset(db: SqlExecutor, assetId: string): Promise<{ id: string; name: string } | null> {
  const { results } = await db
    .prepare(`SELECT id, name FROM fixed_assets WHERE id = ? AND status = 'active'`)
    .bind(assetId)
    .all<{ id: string; name: string }>();
  return results[0] ?? null;
}

export const maintenanceRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Jadwal servis
  // -------------------------------------------------------------------------
  .get("/:tenantId/maintenance/schedules", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ schedules: await listSchedules(db) });
  })

  .post("/:tenantId/maintenance/schedules", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createMaintenanceScheduleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const asset = await activeAsset(db, input.assetId);
    if (!asset) return c.json({ error: "Aset tidak ditemukan atau sudah dilepas." }, 400);

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO maintenance_schedules (id, asset_id, name, interval_months, next_due_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.assetId, input.name, input.intervalMonths, input.startDate, c.get("user").id)
      .run();

    await audit(c.env, {
      action: "maintenance.schedule_created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, assetId: input.assetId, intervalMonths: input.intervalMonths },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/maintenance/schedules/:id/status", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = maintenanceScheduleStatusSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid" }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const id = c.req.param("id");
    const { results } = await db.prepare(`SELECT id FROM maintenance_schedules WHERE id = ?`).bind(id).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Jadwal tidak ditemukan." }, 404);
    await db
      .prepare(`UPDATE maintenance_schedules SET active = ? WHERE id = ?`)
      .bind(parsed.data.active ? 1 : 0, id)
      .run();
    return c.json({ ok: true, active: parsed.data.active });
  })

  // Terbitkan work order untuk jadwal yang jatuh tempo (pemicu manual).
  .post("/:tenantId/maintenance/run", requireAuth, requireTenantRole("admin"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { date?: string };
    const today = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") ? body.date! : new Date().toISOString().slice(0, 10);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const res = await runMaintenance(db, today, c.get("user").id);

    await audit(c.env, {
      action: "maintenance.generated",
      userId: c.get("user").id,
      tenantId: c.get("tenant").id,
      detail: res,
      ip: clientIp(c),
    });
    return c.json({ ok: true, ...res });
  })

  // -------------------------------------------------------------------------
  // Work order
  // -------------------------------------------------------------------------
  .get("/:tenantId/maintenance/work-orders", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ workOrders: await listWorkOrders(db) });
  })

  .post("/:tenantId/maintenance/work-orders", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createWorkOrderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const asset = await activeAsset(db, input.assetId);
    if (!asset) return c.json({ error: "Aset tidak ditemukan atau sudah dilepas." }, 400);

    const id = crypto.randomUUID();
    const orderNo = await nextDocNo(db, "work_orders", "WO");
    await db
      .prepare(
        `INSERT INTO work_orders (id, order_no, asset_id, schedule_id, title, status, scheduled_date, created_by)
         VALUES (?, ?, ?, NULL, ?, 'open', ?, ?)`,
      )
      .bind(id, orderNo, input.assetId, input.title, input.scheduledDate, c.get("user").id)
      .run();

    await audit(c.env, {
      action: "maintenance.work_order_created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, orderNo, assetId: input.assetId },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, orderNo }, 201);
  })

  // Selesaikan work order: catat biaya + jurnal Beban Pemeliharaan / Kas-Bank.
  .post("/:tenantId/maintenance/work-orders/:id/complete", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = completeWorkOrderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const input = parsed.data;

    const { results } = await db
      .prepare(`SELECT id, title, status FROM work_orders WHERE id = ?`)
      .bind(id)
      .all<{ id: string; title: string; status: string }>();
    const wo = results[0];
    if (!wo) return c.json({ error: "Work order tidak ditemukan." }, 404);
    if (wo.status === "done") return c.json({ error: "Work order sudah selesai." }, 409);

    let journalId: string | null = null;
    if (input.cost > 0) {
      if (!input.cashAccountId) return c.json({ error: "Akun pembayar wajib diisi bila ada biaya." }, 400);
      const { results: acc } = await db
        .prepare(`SELECT type FROM accounts WHERE id = ? AND is_archived = 0`)
        .bind(input.cashAccountId)
        .all<{ type: string }>();
      if (acc[0]?.type !== "asset") return c.json({ error: "Akun pembayar harus akun kas/bank (aset)." }, 400);

      const lockedBefore = await getLockedBefore(db);
      if (lockedBefore && input.completedDate <= lockedBefore) {
        return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);
      }
      const beban = await accountIdByCode(db, BEBAN_PEMELIHARAAN);
      const journal = await postJournal(db, {
        entryDate: input.completedDate,
        memo: `Servis: ${wo.title}`,
        createdBy: c.get("user").id,
        lines: [
          { accountId: beban, description: wo.title, debit: input.cost, credit: 0 },
          { accountId: input.cashAccountId, description: wo.title, debit: 0, credit: input.cost },
        ],
      });
      journalId = journal.id;
    }

    await db
      .prepare(
        `UPDATE work_orders SET status = 'done', completed_date = ?, cost = ?, notes = ?, journal_entry_id = ? WHERE id = ?`,
      )
      .bind(input.completedDate, input.cost, input.notes ?? null, journalId, id)
      .run();

    await audit(c.env, {
      action: "maintenance.work_order_completed",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, cost: input.cost },
      ip: clientIp(c),
    });
    return c.json({ ok: true, cost: input.cost }, 200);
  });

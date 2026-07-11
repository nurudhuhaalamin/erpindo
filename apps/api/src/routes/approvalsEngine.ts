import {
  approvalRuleSchema,
  decideStepSchema,
  submitApprovalSchema,
  updateApprovalRuleSchema,
  type ApiApprovalFlow,
  type ApiApprovalRule,
  type ApiApprovalStep,
  type ApprovalDocType,
  type ApprovalRole,
  type ApprovalStatus,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { nextDocNo } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Approval workflow engine (Fase 6e): aturan berjenjang generik + alur multi-langkah.
 * Setiap alur diajukan atas satu jenis dokumen + nominal, lalu dirutekan ke aturan aktif
 * yang cocok (ambang terbesar ≤ nominal). Approver menyetujui berurutan per peran; saat
 * langkah terakhir disetujui → alur 'approved'. Bila tak ada aturan cocok → auto-approved.
 * Berdampingan dengan approval pembelian ambang-tunggal lama (tidak diubah).
 */

/** Ambil nama pengguna dari control-plane (tenant DB hanya simpan id). */
async function resolveNames(env: AppEnv["Bindings"], ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { results } = await env.DB.prepare(
    `SELECT id, name FROM users WHERE id IN (${unique.map(() => "?").join(",")})`,
  )
    .bind(...unique)
    .all<{ id: string; name: string }>();
  for (const u of results) map.set(u.id, u.name);
  return map;
}

type FlowRow = {
  id: string;
  flow_no: string;
  doc_type: ApprovalDocType;
  title: string;
  amount: number;
  status: ApprovalStatus;
  current_step: number;
  requested_by: string;
  created_at: string;
};
type StepRow = {
  id: string;
  flow_id: string;
  step_order: number;
  approver_role: ApprovalRole;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
};

export const approvalEngineRoutes = new Hono<AppEnv>()
  // --- Aturan persetujuan ---------------------------------------------------
  .get("/:tenantId/approval-rules", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(`SELECT id, name, doc_type, min_amount, approver_roles, active, created_at FROM approval_rules ORDER BY doc_type, min_amount`)
      .all<{ id: string; name: string; doc_type: ApprovalDocType; min_amount: number; approver_roles: string; active: number; created_at: string }>();
    const rules: ApiApprovalRule[] = results.map((r) => ({
      id: r.id,
      name: r.name,
      docType: r.doc_type,
      minAmount: r.min_amount,
      approverRoles: JSON.parse(r.approver_roles) as ApprovalRole[],
      active: r.active === 1,
      createdAt: r.created_at,
    }));
    return c.json({ rules });
  })

  .post("/:tenantId/approval-rules", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = approvalRuleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;
    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO approval_rules (id, name, doc_type, min_amount, approver_roles) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, input.name, input.docType, input.minAmount, JSON.stringify(input.approverRoles))
      .run();
    await audit(c.env, {
      action: "approval.rule.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, name: input.name, docType: input.docType, minAmount: input.minAmount },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/approval-rules/:id", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = updateApprovalRuleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const { results } = await db.prepare(`SELECT id FROM approval_rules WHERE id = ?`).bind(id).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Aturan tidak ditemukan." }, 404);

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (parsed.data.name !== undefined) { sets.push("name = ?"); vals.push(parsed.data.name); }
    if (parsed.data.docType !== undefined) { sets.push("doc_type = ?"); vals.push(parsed.data.docType); }
    if (parsed.data.minAmount !== undefined) { sets.push("min_amount = ?"); vals.push(parsed.data.minAmount); }
    if (parsed.data.approverRoles !== undefined) { sets.push("approver_roles = ?"); vals.push(JSON.stringify(parsed.data.approverRoles)); }
    if (parsed.data.active !== undefined) { sets.push("active = ?"); vals.push(parsed.data.active ? 1 : 0); }
    if (sets.length === 0) return c.json({ error: "Tidak ada perubahan." }, 400);
    vals.push(id);
    await db.prepare(`UPDATE approval_rules SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
    await audit(c.env, {
      action: "approval.rule.updated",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  .delete("/:tenantId/approval-rules/:id", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const { results } = await db.prepare(`SELECT id FROM approval_rules WHERE id = ?`).bind(id).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Aturan tidak ditemukan." }, 404);
    await db.prepare(`DELETE FROM approval_rules WHERE id = ?`).bind(id).run();
    await audit(c.env, {
      action: "approval.rule.deleted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // --- Ajukan alur persetujuan ----------------------------------------------
  .post("/:tenantId/approval-flows", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = submitApprovalSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    // Aturan aktif cocok dengan ambang terbesar yang ≤ nominal.
    const { results: ruleRows } = await db
      .prepare(
        `SELECT id, approver_roles FROM approval_rules
         WHERE active = 1 AND doc_type = ? AND min_amount <= ?
         ORDER BY min_amount DESC LIMIT 1`,
      )
      .bind(input.docType, input.amount)
      .all<{ id: string; approver_roles: string }>();
    const rule = ruleRows[0];

    const id = crypto.randomUUID();
    const flowNo = await nextDocNo(db, "approval_flows", "APF");

    if (!rule) {
      // Tak ada aturan → langsung disetujui (tak perlu persetujuan).
      await db
        .prepare(`INSERT INTO approval_flows (id, flow_no, doc_type, title, amount, status, current_step, requested_by) VALUES (?, ?, ?, ?, ?, 'approved', 1, ?)`)
        .bind(id, flowNo, input.docType, input.title, input.amount, c.get("user").id)
        .run();
      await audit(c.env, {
        action: "approval.flow.submitted",
        userId: c.get("user").id,
        tenantId: tenant.id,
        detail: { flowNo, docType: input.docType, amount: input.amount, autoApproved: true },
        ip: clientIp(c),
      });
      return c.json({ ok: true, id, flowNo, status: "approved", autoApproved: true }, 201);
    }

    const roles = JSON.parse(rule.approver_roles) as ApprovalRole[];
    await db
      .prepare(`INSERT INTO approval_flows (id, flow_no, doc_type, title, amount, rule_id, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, flowNo, input.docType, input.title, input.amount, rule.id, c.get("user").id)
      .run();
    for (let i = 0; i < roles.length; i++) {
      await db
        .prepare(`INSERT INTO approval_flow_steps (id, flow_id, step_order, approver_role) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, i + 1, roles[i])
        .run();
    }
    await audit(c.env, {
      action: "approval.flow.submitted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { flowNo, docType: input.docType, amount: input.amount, steps: roles.length },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, flowNo, status: "pending", steps: roles.length }, 201);
  })

  // --- Daftar / antrean / riwayat -------------------------------------------
  .get("/:tenantId/approval-flows", requireAuth, requireTenantRole("viewer"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const queueMe = c.req.query("queue") === "me";
    const myRole = tenant.role;

    const { results: flows } = await db
      .prepare(
        `SELECT id, flow_no, doc_type, title, amount, status, current_step, requested_by, created_at
         FROM approval_flows ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`,
      )
      .all<FlowRow>();
    const { results: steps } = await db
      .prepare(`SELECT id, flow_id, step_order, approver_role, status, decided_by, decided_at, note FROM approval_flow_steps ORDER BY step_order`)
      .all<StepRow>();

    const names = await resolveNames(c.env, [...flows.map((f) => f.requested_by), ...steps.map((s) => s.decided_by)]);

    let apiFlows: ApiApprovalFlow[] = flows.map((f) => ({
      id: f.id,
      flowNo: f.flow_no,
      docType: f.doc_type,
      title: f.title,
      amount: f.amount,
      status: f.status,
      currentStep: f.current_step,
      requestedByName: names.get(f.requested_by) ?? null,
      createdAt: f.created_at,
      steps: steps
        .filter((s) => s.flow_id === f.id)
        .map(
          (s): ApiApprovalStep => ({
            id: s.id,
            stepOrder: s.step_order,
            approverRole: s.approver_role,
            status: s.status,
            decidedBy: s.decided_by,
            decidedByName: s.decided_by ? (names.get(s.decided_by) ?? null) : null,
            decidedAt: s.decided_at,
            note: s.note,
          }),
        ),
    }));

    if (queueMe) {
      // Alur pending yang langkah aktifnya menunggu peran saya.
      apiFlows = apiFlows.filter(
        (f) => f.status === "pending" && f.steps.find((s) => s.stepOrder === f.currentStep)?.approverRole === myRole,
      );
    }
    return c.json({ flows: apiFlows });
  })

  // --- Putuskan langkah aktif -----------------------------------------------
  .post("/:tenantId/approval-flows/:id/steps/decide", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = decideStepSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const flowId = c.req.param("id");

    const { results: flowRows } = await db
      .prepare(`SELECT id, status, current_step FROM approval_flows WHERE id = ?`)
      .bind(flowId)
      .all<{ id: string; status: ApprovalStatus; current_step: number }>();
    const flow = flowRows[0];
    if (!flow) return c.json({ error: "Alur tidak ditemukan." }, 404);
    if (flow.status !== "pending") return c.json({ error: "Alur sudah selesai." }, 409);

    const { results: stepRows } = await db
      .prepare(`SELECT id, approver_role, step_order FROM approval_flow_steps WHERE flow_id = ? AND step_order = ?`)
      .bind(flowId, flow.current_step)
      .all<{ id: string; approver_role: ApprovalRole; step_order: number }>();
    const step = stepRows[0];
    if (!step) return c.json({ error: "Langkah aktif tidak ditemukan." }, 404);
    // Peran pemutus harus sesuai langkah aktif.
    if (tenant.role !== step.approver_role) {
      return c.json({ error: `Langkah ini menunggu persetujuan ${step.approver_role}, bukan peran Anda.` }, 403);
    }

    const total = await db
      .prepare(`SELECT COUNT(*) AS n FROM approval_flow_steps WHERE flow_id = ?`)
      .bind(flowId)
      .all<{ n: number }>();
    const stepCount = total.results[0]?.n ?? 0;

    if (parsed.data.decision === "reject") {
      await db
        .prepare(`UPDATE approval_flow_steps SET status = 'rejected', decided_by = ?, decided_at = datetime('now'), note = ? WHERE id = ?`)
        .bind(c.get("user").id, parsed.data.note ?? null, step.id)
        .run();
      await db.prepare(`UPDATE approval_flows SET status = 'rejected' WHERE id = ?`).bind(flowId).run();
      await audit(c.env, {
        action: "approval.flow.decided",
        userId: c.get("user").id,
        tenantId: tenant.id,
        detail: { flowId, stage: flow.current_step, decision: "reject" },
        ip: clientIp(c),
      });
      return c.json({ ok: true, status: "rejected" });
    }

    // approve
    await db
      .prepare(`UPDATE approval_flow_steps SET status = 'approved', decided_by = ?, decided_at = datetime('now'), note = ? WHERE id = ?`)
      .bind(c.get("user").id, parsed.data.note ?? null, step.id)
      .run();
    const isLast = flow.current_step >= stepCount;
    if (isLast) {
      await db.prepare(`UPDATE approval_flows SET status = 'approved' WHERE id = ?`).bind(flowId).run();
    } else {
      await db.prepare(`UPDATE approval_flows SET current_step = current_step + 1 WHERE id = ?`).bind(flowId).run();
    }
    await audit(c.env, {
      action: "approval.flow.decided",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { flowId, stage: flow.current_step, decision: "approve", final: isLast },
      ip: clientIp(c),
    });
    return c.json({ ok: true, status: isLast ? "approved" : "pending", currentStep: isLast ? flow.current_step : flow.current_step + 1 });
  });

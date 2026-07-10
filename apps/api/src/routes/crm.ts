import {
  convertQuotationSchema,
  createQuotationSchema,
  leadActivitySchema,
  leadSchema,
  quotationStatusSchema,
  updateLeadSchema,
  type ApiCommerceLine,
  type ApiLead,
  type ApiLeadActivity,
  type ApiQuotation,
  type CreateInvoiceInput,
} from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { nextDocNo } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";
import { executeInvoice } from "./commerce";

/**
 * CRM Pipeline (Fase 2l): corong pra-penjualan.
 *  - Lead bergerak lewat tahap funnel (new → … → won/lost) + log aktivitas.
 *  - Lead menang dikonversi menjadi kontak pelanggan.
 *  - Penawaran (quotation) dibuat lepas dari akuntansi; saat diterima &
 *    dikonversi, ia menjadi faktur penjualan lewat jalur `executeInvoice`
 *    yang sama dengan penjualan biasa (jurnal + stok terjadi tepat sekali).
 */

async function listQuotationLines(db: SqlExecutor, quotationIds: string[]): Promise<Map<string, ApiCommerceLine[]>> {
  const byQuote = new Map<string, ApiCommerceLine[]>();
  if (quotationIds.length === 0) return byQuote;
  const { results } = await db
    .prepare(
      `SELECT l.id, l.quotation_id, l.product_id, p.name AS product_name, l.description, l.qty, l.unit_price, l.amount
       FROM quotation_lines l JOIN products p ON p.id = l.product_id
       WHERE l.quotation_id IN (${quotationIds.map(() => "?").join(",")})`,
    )
    .bind(...quotationIds)
    .all<{
      id: string;
      quotation_id: string;
      product_id: string;
      product_name: string;
      description: string | null;
      qty: number;
      unit_price: number;
      amount: number;
    }>();
  for (const l of results) {
    const list = byQuote.get(l.quotation_id) ?? [];
    list.push({
      id: l.id,
      productId: l.product_id,
      productName: l.product_name,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unit_price,
      discountPct: 0, // penawaran belum mendukung diskon per baris
      amount: l.amount,
    });
    byQuote.set(l.quotation_id, list);
  }
  return byQuote;
}

export const crmRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Lead (calon pelanggan) & tahap funnel
  // -------------------------------------------------------------------------
  .get("/:tenantId/leads", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const stage = c.req.query("stage");
    const { results } = await db
      .prepare(
        `SELECT l.id, l.name, l.contact_person, l.email, l.phone, l.source, l.stage, l.est_value,
                l.notes, l.status, l.converted_contact_id, l.created_at,
                (SELECT COUNT(*) FROM lead_activities a WHERE a.lead_id = l.id) AS activity_count
         FROM leads l
         ${stage ? "WHERE l.stage = ?" : ""}
         ORDER BY l.updated_at DESC LIMIT 500`,
      )
      .bind(...(stage ? [stage] : []))
      .all<{
        id: string;
        name: string;
        contact_person: string | null;
        email: string | null;
        phone: string | null;
        source: string | null;
        stage: ApiLead["stage"];
        est_value: number;
        notes: string | null;
        status: ApiLead["status"];
        converted_contact_id: string | null;
        created_at: string;
        activity_count: number;
      }>();

    const leads: ApiLead[] = results.map((r) => ({
      id: r.id,
      name: r.name,
      contactPerson: r.contact_person,
      email: r.email,
      phone: r.phone,
      source: r.source,
      stage: r.stage,
      estValue: r.est_value,
      notes: r.notes,
      status: r.status,
      convertedContactId: r.converted_contact_id,
      activityCount: r.activity_count,
      createdAt: r.created_at,
    }));
    return c.json({ leads });
  })

  .post("/:tenantId/leads", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = leadSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO leads (id, name, contact_person, email, phone, source, est_value, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.name,
        input.contactPerson ?? null,
        input.email || null,
        input.phone ?? null,
        input.source ?? null,
        input.estValue,
        input.notes ?? null,
        c.get("user").id,
      )
      .run();
    await audit(c.env, {
      action: "crm.lead.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, name: input.name },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/leads/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = updateLeadSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const input = parsed.data;

    const { results } = await db
      .prepare(`SELECT status FROM leads WHERE id = ?`)
      .bind(id)
      .all<{ status: string }>();
    const lead = results[0];
    if (!lead) return c.json({ error: "Lead tidak ditemukan." }, 404);
    if (lead.status !== "open") return c.json({ error: "Lead sudah ditutup — tidak bisa diubah." }, 400);

    // Bangun SET dinamis hanya untuk field yang dikirim.
    const map: Record<string, unknown> = {
      name: input.name,
      contact_person: input.contactPerson,
      email: input.email === "" ? null : input.email,
      phone: input.phone,
      source: input.source,
      est_value: input.estValue,
      notes: input.notes,
      stage: input.stage,
    };
    const sets: string[] = [];
    const binds: unknown[] = [];
    for (const [col, val] of Object.entries(map)) {
      if (val !== undefined) {
        sets.push(`${col} = ?`);
        binds.push(val);
      }
    }
    // Memindahkan lead ke tahap won/lost menutup statusnya secara logis.
    if (input.stage === "won" || input.stage === "lost") {
      sets.push(`status = ?`);
      binds.push(input.stage);
    }
    if (sets.length === 0) return c.json({ error: "Tidak ada perubahan." }, 400);
    sets.push(`updated_at = datetime('now')`);
    await db.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();

    await audit(c.env, {
      action: "crm.lead.updated",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, stage: input.stage },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  .get("/:tenantId/leads/:id/activities", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    // Nama pengguna tinggal di control-plane, bukan DB tenant; daftar aktivitas
    // menampilkan jenis + catatan + tanggal (pelaku tak ditampilkan di sini).
    const { results } = await db
      .prepare(
        `SELECT id, type, note, activity_date, due_at, created_at
         FROM lead_activities WHERE lead_id = ?
         ORDER BY activity_date DESC, created_at DESC LIMIT 200`,
      )
      .bind(c.req.param("id"))
      .all<{
        id: string;
        type: ApiLeadActivity["type"];
        note: string;
        activity_date: string;
        due_at: string | null;
        created_at: string;
      }>();

    const activities: ApiLeadActivity[] = results.map((r) => ({
      id: r.id,
      type: r.type,
      note: r.note,
      activityDate: r.activity_date,
      dueAt: r.due_at,
      userName: null,
      createdAt: r.created_at,
    }));
    return c.json({ activities });
  })

  // -------------------------------------------------------------------------
  // Laporan konversi per sumber lead (Fase 5e).
  // -------------------------------------------------------------------------
  .get("/:tenantId/crm/report", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT COALESCE(NULLIF(TRIM(source), ''), '(tanpa sumber)') AS source,
                COUNT(*) AS total,
                SUM(CASE WHEN stage = 'won' THEN 1 ELSE 0 END) AS won,
                SUM(CASE WHEN stage = 'lost' THEN 1 ELSE 0 END) AS lost
         FROM leads
         GROUP BY 1
         ORDER BY total DESC, source`,
      )
      .all<{ source: string; total: number; won: number; lost: number }>();
    const rows = results.map((r) => ({
      source: r.source,
      total: r.total,
      won: r.won,
      lost: r.lost,
      conversionPct: r.total > 0 ? Math.round((r.won / r.total) * 1000) / 10 : 0,
    }));
    return c.json({ rows });
  })

  .post("/:tenantId/leads/:id/activities", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = leadActivitySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const leadId = c.req.param("id");
    const input = parsed.data;

    const { results } = await db.prepare(`SELECT id FROM leads WHERE id = ?`).bind(leadId).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Lead tidak ditemukan." }, 404);

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO lead_activities (id, lead_id, type, note, activity_date, due_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, leadId, input.type, input.note, input.activityDate, input.dueAt ?? null, c.get("user").id)
      .run();
    await db.prepare(`UPDATE leads SET updated_at = datetime('now') WHERE id = ?`).bind(leadId).run();
    await audit(c.env, {
      action: "crm.activity.logged",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { leadId, type: input.type },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .post("/:tenantId/leads/:id/convert", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const leadId = c.req.param("id");

    const { results } = await db
      .prepare(`SELECT name, contact_person, email, phone, status, converted_contact_id FROM leads WHERE id = ?`)
      .bind(leadId)
      .all<{
        name: string;
        contact_person: string | null;
        email: string | null;
        phone: string | null;
        status: string;
        converted_contact_id: string | null;
      }>();
    const lead = results[0];
    if (!lead) return c.json({ error: "Lead tidak ditemukan." }, 404);
    if (lead.converted_contact_id) return c.json({ error: "Lead ini sudah dikonversi menjadi pelanggan." }, 400);

    const contactId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO contacts (id, type, name, email, phone) VALUES (?, 'customer', ?, ?, ?)`,
      )
      .bind(contactId, lead.name, lead.email || null, lead.phone ?? null)
      .run();
    await db
      .prepare(
        `UPDATE leads SET converted_contact_id = ?, status = 'won', stage = 'won', updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(contactId, leadId)
      .run();

    await audit(c.env, {
      action: "crm.lead.converted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { leadId, contactId },
      ip: clientIp(c),
    });
    return c.json({ ok: true, contactId }, 201);
  })

  // -------------------------------------------------------------------------
  // Penawaran (quotation)
  // -------------------------------------------------------------------------
  .get("/:tenantId/quotations", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results: quotes } = await db
      .prepare(
        `SELECT q.id, q.quote_no, q.contact_id, c.name AS contact_name, q.lead_id, q.quote_date, q.valid_until,
                q.status, q.subtotal, q.tax_rate, q.tax_amount, q.total, q.notes, q.result_invoice_id
         FROM quotations q JOIN contacts c ON c.id = q.contact_id
         ORDER BY q.created_at DESC LIMIT 200`,
      )
      .all<{
        id: string;
        quote_no: string;
        contact_id: string;
        contact_name: string;
        lead_id: string | null;
        quote_date: string;
        valid_until: string | null;
        status: ApiQuotation["status"];
        subtotal: number;
        tax_rate: number;
        tax_amount: number;
        total: number;
        notes: string | null;
        result_invoice_id: string | null;
      }>();

    const lines = await listQuotationLines(db, quotes.map((q) => q.id));
    const quotations: ApiQuotation[] = quotes.map((q) => ({
      id: q.id,
      quoteNo: q.quote_no,
      contactId: q.contact_id,
      contactName: q.contact_name,
      leadId: q.lead_id,
      quoteDate: q.quote_date,
      validUntil: q.valid_until,
      status: q.status,
      subtotal: q.subtotal,
      taxRate: q.tax_rate,
      taxAmount: q.tax_amount,
      total: q.total,
      notes: q.notes,
      resultInvoiceId: q.result_invoice_id,
      lines: lines.get(q.id) ?? [],
    }));
    return c.json({ quotations });
  })

  .post("/:tenantId/quotations", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createQuotationSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    // Validasi rujukan: kontak pelanggan aktif + produk aktif.
    const { results: contacts } = await db
      .prepare(`SELECT type FROM contacts WHERE id = ? AND is_archived = 0`)
      .bind(input.contactId)
      .all<{ type: string }>();
    if (!contacts[0]) return c.json({ error: "Kontak tidak ditemukan." }, 400);
    if (!["customer", "both"].includes(contacts[0].type)) return c.json({ error: "Kontak tersebut bukan pelanggan." }, 400);

    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const { results: products } = await db
      .prepare(`SELECT id FROM products WHERE is_archived = 0 AND id IN (${productIds.map(() => "?").join(",")})`)
      .bind(...productIds)
      .all<{ id: string }>();
    if (products.length !== productIds.length) return c.json({ error: "Ada produk yang tidak ditemukan atau diarsipkan." }, 400);

    const subtotal = input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const taxAmount = Math.round((subtotal * input.taxRate) / 100);
    const total = subtotal + taxAmount;
    if (total === 0) return c.json({ error: "Total penawaran tidak boleh nol." }, 400);

    const id = crypto.randomUUID();
    const quoteNo = await nextDocNo(db, "quotations", "SQ");
    await db
      .prepare(
        `INSERT INTO quotations (id, quote_no, contact_id, lead_id, quote_date, valid_until, status,
                                 subtotal, tax_rate, tax_amount, total, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        quoteNo,
        input.contactId,
        input.leadId ?? null,
        input.quoteDate,
        input.validUntil ?? null,
        subtotal,
        input.taxRate,
        taxAmount,
        total,
        input.notes ?? null,
        c.get("user").id,
      )
      .run();
    for (const line of input.lines) {
      await db
        .prepare(
          `INSERT INTO quotation_lines (id, quotation_id, product_id, description, qty, unit_price, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          line.productId,
          line.description ?? null,
          line.qty,
          line.unitPrice,
          line.qty * line.unitPrice,
        )
        .run();
    }

    await audit(c.env, {
      action: "crm.quotation.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { quoteNo, total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, quoteNo, total }, 201);
  })

  .patch("/:tenantId/quotations/:id/status", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = quotationStatusSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Status tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");

    // Penawaran yang sudah dikonversi ke faktur tak bisa diubah statusnya lagi.
    const { results: check } = await db
      .prepare(`SELECT status FROM quotations WHERE id = ?`)
      .bind(id)
      .all<{ status: string }>();
    if (!check[0]) return c.json({ error: "Penawaran tidak ditemukan." }, 404);
    if (check[0].status === "converted") return c.json({ error: "Penawaran sudah dikonversi ke faktur." }, 400);

    await db.prepare(`UPDATE quotations SET status = ? WHERE id = ?`).bind(parsed.data.status, id).run();

    await audit(c.env, {
      action: "crm.quotation.status",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, status: parsed.data.status },
      ip: clientIp(c),
    });
    return c.json({ ok: true, status: parsed.data.status });
  })

  .post("/:tenantId/quotations/:id/convert", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = convertQuotationSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const input = parsed.data;

    const { results: quotes } = await db
      .prepare(`SELECT contact_id, tax_rate, status FROM quotations WHERE id = ?`)
      .bind(id)
      .all<{ contact_id: string; tax_rate: number; status: string }>();
    const quote = quotes[0];
    if (!quote) return c.json({ error: "Penawaran tidak ditemukan." }, 404);
    if (quote.status === "converted") return c.json({ error: "Penawaran sudah dikonversi ke faktur." }, 400);
    if (quote.status !== "accepted") {
      return c.json({ error: "Hanya penawaran berstatus 'diterima' yang bisa dikonversi ke faktur." }, 400);
    }

    const { results: lines } = await db
      .prepare(`SELECT product_id, description, qty, unit_price FROM quotation_lines WHERE quotation_id = ?`)
      .bind(id)
      .all<{ product_id: string; description: string | null; qty: number; unit_price: number }>();

    const invoiceInput: CreateInvoiceInput = {
      contactId: quote.contact_id,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      taxRate: quote.tax_rate as CreateInvoiceInput["taxRate"],
      warehouseId: input.warehouseId,
      lines: lines.map((l) => ({
        productId: l.product_id,
        description: l.description ?? undefined,
        qty: l.qty,
        unitPrice: l.unit_price,
      })),
    };

    const result = await executeInvoice(db, invoiceInput, c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, 400);

    await db
      .prepare(
        `UPDATE quotations SET status = 'converted', result_invoice_id = ? WHERE id = ? AND status = 'accepted'`,
      )
      .bind(result.invoiceId, id)
      .run();

    await audit(c.env, {
      action: "crm.quotation.converted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { quotationId: id, docNo: result.docNo, total: result.total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, invoiceId: result.invoiceId, docNo: result.docNo, total: result.total }, 201);
  });

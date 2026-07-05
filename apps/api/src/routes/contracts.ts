import {
  contractStatusSchema,
  createContractSchema,
  type ApiContract,
  type ApiContractLine,
  type ContractFrequency,
  type CreateInvoiceInput,
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
 * Kontrak & tagihan berulang (Fase 2s). Cron harian (atau pemicu manual)
 * menerbitkan faktur penjualan untuk kontrak yang jatuh tempo lalu memajukan
 * tanggal tagih berikutnya sesuai frekuensi. Faktur dibuat lewat executeInvoice
 * yang sama dengan penjualan biasa (jurnal & stok — produk jasa tak berstok).
 */

const FREQ_MONTHS: Record<ContractFrequency, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Majukan tanggal (YYYY-MM-DD) sejumlah bulan, hari di-clamp ke akhir bulan. */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const year = base.getUTCFullYear();
  const mon = base.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate();
  const day = Math.min(d!, lastDay);
  return `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Terbitkan satu faktur untuk tiap kontrak aktif yang jatuh tempo (≤ today),
 * lalu majukan next_invoice_date satu periode. Idempotent secara praktis:
 * setelah terbit, tanggal berikutnya melompat ke masa depan.
 */
export async function runBilling(
  db: SqlExecutor,
  today: string,
  userId: string,
): Promise<{ issued: number; total: number }> {
  const { results: due } = await db
    .prepare(
      `SELECT id, contact_id, name, frequency, tax_rate, warehouse_id, next_invoice_date, end_date, invoice_count
       FROM contracts WHERE status = 'active' AND next_invoice_date <= ?`,
    )
    .bind(today)
    .all<{
      id: string;
      contact_id: string;
      name: string;
      frequency: ContractFrequency;
      tax_rate: number;
      warehouse_id: string;
      next_invoice_date: string;
      end_date: string | null;
      invoice_count: number;
    }>();

  let issued = 0;
  let total = 0;
  for (const c of due) {
    const { results: lines } = await db
      .prepare(`SELECT product_id, description, qty, unit_price FROM contract_lines WHERE contract_id = ?`)
      .bind(c.id)
      .all<{ product_id: string; description: string | null; qty: number; unit_price: number }>();

    const input: CreateInvoiceInput = {
      contactId: c.contact_id,
      invoiceDate: c.next_invoice_date,
      taxRate: c.tax_rate as CreateInvoiceInput["taxRate"],
      warehouseId: c.warehouse_id,
      lines: lines.map((l) => ({
        productId: l.product_id,
        description: l.description ?? undefined,
        qty: l.qty,
        unitPrice: l.unit_price,
      })),
    };

    const result = await executeInvoice(db, input, userId);
    if ("error" in result) continue; // mis. periode terkunci / stok kurang — lewati, coba lagi lain waktu

    const next = addMonths(c.next_invoice_date, FREQ_MONTHS[c.frequency]);
    const ended = c.end_date && next > c.end_date;
    await db
      .prepare(
        `UPDATE contracts SET next_invoice_date = ?, last_invoice_id = ?, invoice_count = invoice_count + 1,
                status = ? WHERE id = ?`,
      )
      .bind(next, result.invoiceId, ended ? "ended" : "active", c.id)
      .run();
    issued++;
    total += result.total;
  }
  return { issued, total };
}

async function listContracts(db: SqlExecutor): Promise<ApiContract[]> {
  const { results: rows } = await db
    .prepare(
      `SELECT ct.id, ct.code, ct.contact_id, c.name AS contact_name, ct.name, ct.frequency, ct.tax_rate,
              ct.next_invoice_date, ct.end_date, ct.status, ct.invoice_count
       FROM contracts ct JOIN contacts c ON c.id = ct.contact_id
       ORDER BY CASE ct.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, ct.next_invoice_date`,
    )
    .all<{
      id: string;
      code: string;
      contact_id: string;
      contact_name: string;
      name: string;
      frequency: ContractFrequency;
      tax_rate: number;
      next_invoice_date: string;
      end_date: string | null;
      status: ApiContract["status"];
      invoice_count: number;
    }>();

  const { results: lines } = await db
    .prepare(
      `SELECT l.id, l.contract_id, l.product_id, p.name AS product_name, l.description, l.qty, l.unit_price
       FROM contract_lines l JOIN products p ON p.id = l.product_id`,
    )
    .all<{
      id: string;
      contract_id: string;
      product_id: string;
      product_name: string;
      description: string | null;
      qty: number;
      unit_price: number;
    }>();

  const byContract = new Map<string, ApiContractLine[]>();
  for (const l of lines) {
    const list = byContract.get(l.contract_id) ?? [];
    list.push({
      id: l.id,
      productId: l.product_id,
      productName: l.product_name,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unit_price,
      amount: l.qty * l.unit_price,
    });
    byContract.set(l.contract_id, list);
  }

  return rows.map((r) => {
    const cl = byContract.get(r.id) ?? [];
    const subtotal = cl.reduce((s, l) => s + l.amount, 0);
    return {
      id: r.id,
      code: r.code,
      contactId: r.contact_id,
      contactName: r.contact_name,
      name: r.name,
      frequency: r.frequency,
      taxRate: r.tax_rate,
      nextInvoiceDate: r.next_invoice_date,
      endDate: r.end_date,
      status: r.status,
      invoiceCount: r.invoice_count,
      total: subtotal + Math.round((subtotal * r.tax_rate) / 100),
      lines: cl,
    };
  });
}

export const contractRoutes = new Hono<AppEnv>()

  .get("/:tenantId/contracts", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ contracts: await listContracts(db) });
  })

  .post("/:tenantId/contracts", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createContractSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: dup } = await db.prepare(`SELECT id FROM contracts WHERE code = ?`).bind(input.code).all<{ id: string }>();
    if (dup[0]) return c.json({ error: `Kode kontrak ${input.code} sudah dipakai.` }, 409);

    const { results: k } = await db
      .prepare(`SELECT type FROM contacts WHERE id = ? AND is_archived = 0`)
      .bind(input.contactId)
      .all<{ type: string }>();
    if (!k[0] || !["customer", "both"].includes(k[0].type)) return c.json({ error: "Kontak tersebut bukan pelanggan." }, 400);

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO contracts (id, code, contact_id, name, frequency, tax_rate, warehouse_id, next_invoice_date, end_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.code,
        input.contactId,
        input.name,
        input.frequency,
        input.taxRate,
        input.warehouseId,
        input.startDate,
        input.endDate ?? null,
        c.get("user").id,
      )
      .run();
    for (const line of input.lines) {
      await db
        .prepare(`INSERT INTO contract_lines (id, contract_id, product_id, description, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, line.productId, line.description ?? null, line.qty, line.unitPrice)
        .run();
    }

    await audit(c.env, {
      action: "contract.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, code: input.code },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/contracts/:id/status", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = contractStatusSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Status tidak valid." }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const { results } = await db.prepare(`SELECT id FROM contracts WHERE id = ?`).bind(id).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Kontrak tidak ditemukan." }, 404);

    await db.prepare(`UPDATE contracts SET status = ? WHERE id = ?`).bind(parsed.data.status, id).run();
    await audit(c.env, {
      action: "contract.status",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, status: parsed.data.status },
      ip: clientIp(c),
    });
    return c.json({ ok: true, status: parsed.data.status });
  })

  // Terbitkan faktur untuk semua kontrak jatuh tempo (pemicu manual; Cron juga memakainya).
  // Body opsional { date } untuk menagih "per tanggal" tertentu (mis. mengejar ketinggalan).
  .post("/:tenantId/contracts/run-billing", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const body = (await c.req.json().catch(() => ({}))) as { date?: unknown };
    const today =
      typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : new Date().toISOString().slice(0, 10);
    const result = await runBilling(db, today, c.get("user").id);
    await audit(c.env, {
      action: "contract.billed",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: result,
      ip: clientIp(c),
    });
    return c.json({ ok: true, ...result });
  });

import {
  deliverOrderSchema,
  invoiceFromSoSchema,
  salesOrderSchema,
  soDownPaymentSchema,
  type ApiSalesOrder,
  type ApiSalesOrderLine,
  type CreateInvoiceInput,
  type SalesOrderStatus,
} from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { accountIdByCode, getLockedBefore, InsufficientStockError, nextDocNo, postJournal, stockOut, SYS_ACCOUNTS } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";
import { executeInvoice } from "../lib/commercePosting";

/**
 * Penjualan bertahap (Fase 7b): Sales Order → Surat Jalan (DO) → Faktur.
 * - SO: komitmen pelanggan, TANPA stok/jurnal.
 * - Surat Jalan (DO): stok keluar (stockOut) + HPP diakui (Dr HPP / Cr Persediaan) — SEKALI.
 * - Faktur: pendapatan (Dr Piutang / Cr Pendapatan + PPN) lewat executeInvoice(skipStock) —
 *   TIDAK menggerakkan stok lagi. Uang muka (DP) diakui sebagai Uang Muka Pelanggan lalu
 *   diterapkan ke faktur (Dr Uang Muka / Cr Piutang).
 */

const UANG_MUKA_PELANGGAN = "2-1300";

async function ensureAccountByCode(db: SqlExecutor, code: string, name: string, type: "asset" | "liability" | "equity" | "income" | "expense"): Promise<string> {
  const { results } = await db.prepare(`SELECT id FROM accounts WHERE code = ?`).bind(code).all<{ id: string }>();
  if (results[0]) return results[0].id;
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO accounts (id, code, name, type) VALUES (?, ?, ?, ?)`).bind(id, code, name, type).run();
  return id;
}

type SoRow = {
  id: string;
  so_no: string;
  contact_id: string;
  contact_name: string;
  order_date: string;
  expected_date: string | null;
  warehouse_id: string;
  tax_rate: number;
  status: SalesOrderStatus;
  dp_amount: number;
  invoice_id: string | null;
  note: string | null;
  created_at: string;
};

async function fetchSalesOrders(db: SqlExecutor, id?: string): Promise<ApiSalesOrder[]> {
  const where = id ? "WHERE o.id = ?" : "";
  const binds = id ? [id] : [];
  const { results: rows } = await db
    .prepare(
      `SELECT o.id, o.so_no, o.contact_id, c.name AS contact_name, o.order_date, o.expected_date,
              o.warehouse_id, o.tax_rate, o.status, o.dp_amount, o.invoice_id, o.note, o.created_at
       FROM sales_orders o JOIN contacts c ON c.id = o.contact_id ${where}
       ORDER BY CASE o.status WHEN 'open' THEN 0 WHEN 'delivered' THEN 1 ELSE 2 END, o.created_at DESC LIMIT 200`,
    )
    .bind(...binds)
    .all<SoRow>();
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { results: lines } = await db
    .prepare(
      `SELECT l.id, l.so_id, l.product_id, p.name AS product_name, l.qty, l.unit_price, l.discount_pct
       FROM sales_order_lines l JOIN products p ON p.id = l.product_id
       WHERE l.so_id IN (${ids.map(() => "?").join(",")})`,
    )
    .bind(...ids)
    .all<{ id: string; so_id: string; product_id: string; product_name: string; qty: number; unit_price: number; discount_pct: number }>();
  // Nomor faktur & surat jalan tertaut.
  const invoiceIds = rows.map((r) => r.invoice_id).filter((x): x is string => Boolean(x));
  const invoiceNoById = new Map<string, string>();
  if (invoiceIds.length > 0) {
    const { results } = await db.prepare(`SELECT id, invoice_no FROM invoices WHERE id IN (${invoiceIds.map(() => "?").join(",")})`).bind(...invoiceIds).all<{ id: string; invoice_no: string }>();
    for (const r of results) invoiceNoById.set(r.id, r.invoice_no);
  }
  const { results: dos } = await db.prepare(`SELECT so_id, do_no FROM delivery_orders WHERE so_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{ so_id: string; do_no: string }>();
  const doBySo = new Map(dos.map((d) => [d.so_id, d.do_no]));

  return rows.map((r) => {
    const soLines: ApiSalesOrderLine[] = lines
      .filter((l) => l.so_id === r.id)
      .map((l) => ({
        id: l.id,
        productId: l.product_id,
        productName: l.product_name,
        qty: l.qty,
        unitPrice: l.unit_price,
        discountPct: l.discount_pct,
        amount: Math.round(l.qty * l.unit_price * (1 - l.discount_pct / 100)),
      }));
    const subtotal = soLines.reduce((s, l) => s + l.amount, 0);
    const taxAmount = Math.round((subtotal * r.tax_rate) / 100);
    return {
      id: r.id,
      soNo: r.so_no,
      contactId: r.contact_id,
      contactName: r.contact_name,
      orderDate: r.order_date,
      expectedDate: r.expected_date,
      warehouseId: r.warehouse_id,
      taxRate: r.tax_rate,
      status: r.status,
      dpAmount: r.dp_amount,
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
      invoiceNo: r.invoice_id ? (invoiceNoById.get(r.invoice_id) ?? null) : null,
      deliveryNo: doBySo.get(r.id) ?? null,
      note: r.note,
      createdAt: r.created_at,
      lines: soLines,
    };
  });
}

export const salesOrderRoutes = new Hono<AppEnv>()
  .get("/:tenantId/sales-orders", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ orders: await fetchSalesOrders(db) });
  })

  .post("/:tenantId/sales-orders", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = salesOrderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const cust = await db.prepare(`SELECT id FROM contacts WHERE id = ? AND type IN ('customer','both')`).bind(input.contactId).all<{ id: string }>();
    if (!cust.results[0]) return c.json({ error: "Pelanggan tidak ditemukan." }, 404);
    const wh = await db.prepare(`SELECT id FROM warehouses WHERE id = ?`).bind(input.warehouseId).all<{ id: string }>();
    if (!wh.results[0]) return c.json({ error: "Gudang tidak ditemukan." }, 404);
    const prodIds = [...new Set(input.lines.map((l) => l.productId))];
    const { results: prods } = await db.prepare(`SELECT id FROM products WHERE id IN (${prodIds.map(() => "?").join(",")})`).bind(...prodIds).all<{ id: string }>();
    if (prods.length !== prodIds.length) return c.json({ error: "Ada produk yang tidak ditemukan." }, 404);

    const id = crypto.randomUUID();
    const soNo = await nextDocNo(db, "sales_orders", "SO");
    await db
      .prepare(`INSERT INTO sales_orders (id, so_no, contact_id, order_date, expected_date, warehouse_id, tax_rate, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, soNo, input.contactId, input.orderDate, input.expectedDate ?? null, input.warehouseId, input.taxRate, input.note ?? null, c.get("user").id)
      .run();
    for (const line of input.lines) {
      await db
        .prepare(`INSERT INTO sales_order_lines (id, so_id, product_id, qty, unit_price, discount_pct) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, line.productId, line.qty, line.unitPrice, line.discountPct ?? 0)
        .run();
    }
    await audit(c.env, { action: "sales.so.created", userId: c.get("user").id, tenantId: tenant.id, detail: { soNo, lines: input.lines.length }, ip: clientIp(c) });
    return c.json({ ok: true, id, soNo }, 201);
  })

  .post("/:tenantId/sales-orders/:id/cancel", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const { results } = await db.prepare(`SELECT status FROM sales_orders WHERE id = ?`).bind(id).all<{ status: SalesOrderStatus }>();
    if (!results[0]) return c.json({ error: "Pesanan tidak ditemukan." }, 404);
    if (results[0].status !== "open") return c.json({ error: "Hanya pesanan terbuka yang bisa dibatalkan." }, 409);
    await db.prepare(`UPDATE sales_orders SET status = 'cancelled' WHERE id = ?`).bind(id).run();
    await audit(c.env, { action: "sales.so.cancelled", userId: c.get("user").id, tenantId: tenant.id, detail: { id }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  .post("/:tenantId/sales-orders/:id/down-payment", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = soDownPaymentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const input = parsed.data;

    const { results } = await db.prepare(`SELECT status, so_no FROM sales_orders WHERE id = ?`).bind(id).all<{ status: SalesOrderStatus; so_no: string }>();
    const so = results[0];
    if (!so) return c.json({ error: "Pesanan tidak ditemukan." }, 404);
    if (so.status === "invoiced" || so.status === "cancelled") return c.json({ error: "Pesanan sudah difakturkan/dibatalkan." }, 409);
    const acc = await db.prepare(`SELECT type FROM accounts WHERE id = ? AND is_archived = 0`).bind(input.accountId).all<{ type: string }>();
    if (!acc.results[0] || acc.results[0].type !== "asset") return c.json({ error: "Akun uang muka harus akun kas/bank (aset)." }, 400);
    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && input.paymentDate <= lockedBefore) return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);

    const uangMuka = await ensureAccountByCode(db, UANG_MUKA_PELANGGAN, "Uang Muka Pelanggan", "liability");
    const memo = `Uang muka ${so.so_no}`;
    await postJournal(db, {
      entryDate: input.paymentDate,
      memo,
      createdBy: c.get("user").id,
      lines: [
        { accountId: input.accountId, description: memo, debit: input.amount, credit: 0 },
        { accountId: uangMuka, description: memo, debit: 0, credit: input.amount },
      ],
    });
    await db.prepare(`UPDATE sales_orders SET dp_amount = dp_amount + ? WHERE id = ?`).bind(input.amount, id).run();
    await audit(c.env, { action: "sales.so.down_payment", userId: c.get("user").id, tenantId: tenant.id, detail: { soNo: so.so_no, amount: input.amount }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  .post("/:tenantId/sales-orders/:id/deliver", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = deliverOrderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const input = parsed.data;

    const { results: soRows } = await db.prepare(`SELECT so_no, warehouse_id, status FROM sales_orders WHERE id = ?`).bind(id).all<{ so_no: string; warehouse_id: string; status: SalesOrderStatus }>();
    const so = soRows[0];
    if (!so) return c.json({ error: "Pesanan tidak ditemukan." }, 404);
    if (so.status !== "open") return c.json({ error: "Hanya pesanan terbuka yang bisa dikirim." }, 409);
    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && input.deliveryDate <= lockedBefore) return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);

    const { results: lines } = await db.prepare(`SELECT id, product_id, qty FROM sales_order_lines WHERE so_id = ?`).bind(id).all<{ id: string; product_id: string; qty: number }>();
    // Produk jasa tidak menggerakkan stok.
    const prodIds = [...new Set(lines.map((l) => l.product_id))];
    const { results: svc } = await db.prepare(`SELECT id FROM products WHERE is_service = 1 AND id IN (${prodIds.map(() => "?").join(",")})`).bind(...prodIds).all<{ id: string }>();
    const serviceIds = new Set(svc.map((s) => s.id));

    const doId = crypto.randomUUID();
    let totalCogs = 0;
    try {
      for (const line of lines) {
        if (serviceIds.has(line.product_id)) continue;
        totalCogs += await stockOut(db, { productId: line.product_id, warehouseId: so.warehouse_id, qty: line.qty, refType: "sale", refId: doId });
      }
    } catch (err) {
      if (err instanceof InsufficientStockError) return c.json({ error: err.message }, 400);
      throw err;
    }

    const doNo = await nextDocNo(db, "delivery_orders", "DO");
    let journalId: string | null = null;
    if (totalCogs > 0) {
      const [hpp, persediaan] = await Promise.all([accountIdByCode(db, SYS_ACCOUNTS.HPP), accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN)]);
      const memo = `Surat jalan ${doNo}`;
      const journal = await postJournal(db, {
        entryDate: input.deliveryDate,
        memo,
        createdBy: c.get("user").id,
        lines: [
          { accountId: hpp, description: memo, debit: totalCogs, credit: 0 },
          { accountId: persediaan, description: memo, debit: 0, credit: totalCogs },
        ],
      });
      journalId = journal.id;
    }
    await db
      .prepare(`INSERT INTO delivery_orders (id, do_no, so_id, delivery_date, journal_entry_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(doId, doNo, id, input.deliveryDate, journalId, input.note ?? null, c.get("user").id)
      .run();
    for (const line of lines) {
      await db.prepare(`INSERT INTO delivery_order_lines (id, do_id, product_id, qty) VALUES (?, ?, ?, ?)`).bind(crypto.randomUUID(), doId, line.product_id, line.qty).run();
    }
    await db.prepare(`UPDATE sales_orders SET status = 'delivered' WHERE id = ?`).bind(id).run();
    await audit(c.env, { action: "sales.so.delivered", userId: c.get("user").id, tenantId: tenant.id, detail: { soNo: so.so_no, doNo, cogs: totalCogs }, ip: clientIp(c) });
    return c.json({ ok: true, doNo }, 201);
  })

  .post("/:tenantId/sales-orders/:id/invoice", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = invoiceFromSoSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");

    const { results: soRows } = await db
      .prepare(`SELECT so_no, contact_id, warehouse_id, tax_rate, status, dp_amount FROM sales_orders WHERE id = ?`)
      .bind(id)
      .all<{ so_no: string; contact_id: string; warehouse_id: string; tax_rate: number; status: SalesOrderStatus; dp_amount: number }>();
    const so = soRows[0];
    if (!so) return c.json({ error: "Pesanan tidak ditemukan." }, 404);
    if (so.status !== "delivered") return c.json({ error: "Pesanan harus dikirim (surat jalan) sebelum difakturkan." }, 409);

    const { results: lines } = await db.prepare(`SELECT product_id, qty, unit_price, discount_pct FROM sales_order_lines WHERE so_id = ?`).bind(id).all<{ product_id: string; qty: number; unit_price: number; discount_pct: number }>();
    const invoiceInput: CreateInvoiceInput = {
      contactId: so.contact_id,
      invoiceDate: parsed.data.invoiceDate,
      ...(parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {}),
      taxRate: so.tax_rate as CreateInvoiceInput["taxRate"],
      warehouseId: so.warehouse_id,
      lines: lines.map((l) => ({ productId: l.product_id, qty: l.qty, unitPrice: l.unit_price, ...(l.discount_pct > 0 ? { discountPct: l.discount_pct } : {}) })),
    };
    // skipStock: barang sudah dikeluarkan di surat jalan.
    const result = await executeInvoice(db, invoiceInput, c.get("user").id, { skipStock: true });
    if ("error" in result) return c.json({ error: result.error }, 400);

    // Terapkan uang muka (bila ada): Dr Uang Muka Pelanggan / Cr Piutang.
    if (so.dp_amount > 0) {
      const applied = Math.min(so.dp_amount, result.total);
      const [uangMuka, piutang] = await Promise.all([
        ensureAccountByCode(db, UANG_MUKA_PELANGGAN, "Uang Muka Pelanggan", "liability"),
        accountIdByCode(db, SYS_ACCOUNTS.PIUTANG),
      ]);
      const memo = `Terapkan uang muka ${so.so_no} → ${result.docNo}`;
      await postJournal(db, {
        entryDate: parsed.data.invoiceDate,
        memo,
        createdBy: c.get("user").id,
        lines: [
          { accountId: uangMuka, description: memo, debit: applied, credit: 0 },
          { accountId: piutang, description: memo, debit: 0, credit: applied },
        ],
      });
      await db
        .prepare(`UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?`)
        .bind(applied, applied >= result.total ? "paid" : "posted", result.invoiceId)
        .run();
    }

    await db.prepare(`UPDATE sales_orders SET status = 'invoiced', invoice_id = ? WHERE id = ?`).bind(result.invoiceId, id).run();
    await audit(c.env, { action: "sales.so.invoiced", userId: c.get("user").id, tenantId: tenant.id, detail: { soNo: so.so_no, docNo: result.docNo, total: result.total }, ip: clientIp(c) });
    return c.json({ ok: true, invoiceNo: result.docNo, total: result.total }, 201);
  });

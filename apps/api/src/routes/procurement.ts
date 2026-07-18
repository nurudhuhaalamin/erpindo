import {
  decideRequisitionSchema,
  purchaseOrderSchema,
  receiveGoodsSchema,
  requisitionSchema,
  type ApiGoodsReceipt,
  type ApiPurchaseOrder,
  type ApiRequisition,
  type CreatePurchaseInput,
  type PoStatus,
  type RequisitionStatus,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { nextDocNo } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";
import { executePurchase } from "../lib/commercePosting";

/**
 * Procurement / procure-to-pay (Fase 6d): permintaan pembelian (PR) → pesanan ke
 * pemasok (PO) → penerimaan barang (GRN). Stok & jurnal TIDAK dibuat di PR/PO —
 * keduanya dokumen. Saat barang diterima, `executePurchase` (jalur faktur pembelian
 * yang teruji) dipanggil sekali: stok masuk (average cost) + jurnal Persediaan/Hutang.
 * Dengan begitu tak ada dobel-hitung dan buku tetap konsisten.
 */

export const procurementRoutes = new Hono<AppEnv>()
  // --- Permintaan pembelian (PR) --------------------------------------------
  .get("/:tenantId/requisitions", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results: reqs } = await db
      .prepare(
        `SELECT id, req_no, note, status, created_at FROM purchase_requisitions
         ORDER BY CASE status WHEN 'submitted' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`,
      )
      .all<{ id: string; req_no: string; note: string | null; status: RequisitionStatus; created_at: string }>();
    const { results: lines } = await db
      .prepare(
        `SELECT l.id, l.requisition_id, l.product_id, p.name AS product_name, l.qty, l.note
         FROM purchase_requisition_lines l JOIN products p ON p.id = l.product_id`,
      )
      .all<{ id: string; requisition_id: string; product_id: string; product_name: string; qty: number; note: string | null }>();
    const requisitions: ApiRequisition[] = reqs.map((r) => ({
      id: r.id,
      reqNo: r.req_no,
      note: r.note,
      status: r.status,
      createdAt: r.created_at,
      lines: lines
        .filter((l) => l.requisition_id === r.id)
        .map((l) => ({ id: l.id, productId: l.product_id, productName: l.product_name, qty: l.qty, note: l.note })),
    }));
    return c.json({ requisitions });
  })

  .post("/:tenantId/requisitions", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = requisitionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    // Validasi produk ada.
    const ids = [...new Set(input.lines.map((l) => l.productId))];
    const { results: prods } = await db
      .prepare(`SELECT id FROM products WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all<{ id: string }>();
    if (prods.length !== ids.length) return c.json({ error: "Ada produk yang tidak ditemukan." }, 404);

    const id = crypto.randomUUID();
    const reqNo = await nextDocNo(db, "purchase_requisitions", "PR");
    await db
      .prepare(`INSERT INTO purchase_requisitions (id, req_no, note, requested_by) VALUES (?, ?, ?, ?)`)
      .bind(id, reqNo, input.note ?? null, c.get("user").id)
      .run();
    for (const line of input.lines) {
      await db
        .prepare(`INSERT INTO purchase_requisition_lines (id, requisition_id, product_id, qty, note) VALUES (?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, line.productId, line.qty, line.note ?? null)
        .run();
    }
    await audit(c.env, {
      action: "procurement.requisition.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, reqNo, lines: input.lines.length },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, reqNo }, 201);
  })

  .patch("/:tenantId/requisitions/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = decideRequisitionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Status tidak valid." }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");

    const { results } = await db
      .prepare(`SELECT status FROM purchase_requisitions WHERE id = ?`)
      .bind(id)
      .all<{ status: RequisitionStatus }>();
    if (!results[0]) return c.json({ error: "Permintaan tidak ditemukan." }, 404);
    if (results[0].status !== "submitted") return c.json({ error: "Permintaan sudah diputuskan." }, 409);

    await db.prepare(`UPDATE purchase_requisitions SET status = ? WHERE id = ?`).bind(parsed.data.status, id).run();
    await audit(c.env, {
      action: "procurement.requisition.decided",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, status: parsed.data.status },
      ip: clientIp(c),
    });
    return c.json({ ok: true, status: parsed.data.status });
  })

  // --- Pesanan pembelian (PO) -----------------------------------------------
  .get("/:tenantId/purchase-orders", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results: pos } = await db
      .prepare(
        `SELECT o.id, o.po_no, o.contact_id, ct.name AS contact_name, o.order_date, o.expected_date,
                o.warehouse_id, o.tax_rate, o.status, o.note, o.created_at,
                (SELECT grn.purchase_id FROM goods_receipts grn WHERE grn.po_id = o.id AND grn.purchase_id IS NOT NULL LIMIT 1) AS purchase_id
         FROM purchase_orders o JOIN contacts ct ON ct.id = o.contact_id
         ORDER BY CASE o.status WHEN 'ordered' THEN 0 ELSE 1 END, o.created_at DESC LIMIT 200`,
      )
      .all<{
        id: string;
        po_no: string;
        contact_id: string;
        contact_name: string;
        order_date: string;
        expected_date: string | null;
        warehouse_id: string;
        tax_rate: number;
        status: PoStatus;
        note: string | null;
        created_at: string;
        purchase_id: string | null;
      }>();
    const { results: lines } = await db
      .prepare(
        `SELECT l.id, l.po_id, l.product_id, p.name AS product_name, l.qty, l.unit_price
         FROM purchase_order_lines l JOIN products p ON p.id = l.product_id`,
      )
      .all<{ id: string; po_id: string; product_id: string; product_name: string; qty: number; unit_price: number }>();
    // Nomor faktur pembelian hasil penerimaan (bila ada).
    const purchaseIds = pos.map((o) => o.purchase_id).filter((x): x is string => Boolean(x));
    const purchaseNoById = new Map<string, string>();
    if (purchaseIds.length > 0) {
      const { results: purs } = await db
        .prepare(`SELECT id, purchase_no FROM purchases WHERE id IN (${purchaseIds.map(() => "?").join(",")})`)
        .bind(...purchaseIds)
        .all<{ id: string; purchase_no: string }>();
      for (const p of purs) purchaseNoById.set(p.id, p.purchase_no);
    }
    const orders: ApiPurchaseOrder[] = pos.map((o) => {
      const poLines = lines.filter((l) => l.po_id === o.id);
      const subtotal = poLines.reduce((s, l) => s + l.qty * l.unit_price, 0);
      const total = subtotal + Math.round((subtotal * o.tax_rate) / 100);
      return {
        id: o.id,
        poNo: o.po_no,
        contactId: o.contact_id,
        contactName: o.contact_name,
        orderDate: o.order_date,
        expectedDate: o.expected_date,
        warehouseId: o.warehouse_id,
        taxRate: o.tax_rate,
        status: o.status,
        note: o.note,
        total,
        purchaseNo: o.purchase_id ? (purchaseNoById.get(o.purchase_id) ?? null) : null,
        createdAt: o.created_at,
        lines: poLines.map((l) => ({ id: l.id, productId: l.product_id, productName: l.product_name, qty: l.qty, unitPrice: l.unit_price })),
      };
    });
    return c.json({ orders });
  })

  .post("/:tenantId/purchase-orders", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = purchaseOrderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const supplier = await db
      .prepare(`SELECT id FROM contacts WHERE id = ? AND type IN ('supplier','both')`)
      .bind(input.contactId)
      .all<{ id: string }>();
    if (!supplier.results[0]) return c.json({ error: "Pemasok tidak ditemukan." }, 404);
    const wh = await db.prepare(`SELECT id FROM warehouses WHERE id = ?`).bind(input.warehouseId).all<{ id: string }>();
    if (!wh.results[0]) return c.json({ error: "Gudang tidak ditemukan." }, 404);
    const prodIds = [...new Set(input.lines.map((l) => l.productId))];
    const { results: prods } = await db
      .prepare(`SELECT id FROM products WHERE id IN (${prodIds.map(() => "?").join(",")})`)
      .bind(...prodIds)
      .all<{ id: string }>();
    if (prods.length !== prodIds.length) return c.json({ error: "Ada produk yang tidak ditemukan." }, 404);

    // Bila dari PR: PR harus approved, lalu ditandai 'ordered'.
    if (input.requisitionId) {
      const { results: reqRows } = await db
        .prepare(`SELECT status FROM purchase_requisitions WHERE id = ?`)
        .bind(input.requisitionId)
        .all<{ status: RequisitionStatus }>();
      if (!reqRows[0]) return c.json({ error: "Permintaan sumber tidak ditemukan." }, 404);
      if (reqRows[0].status !== "approved") return c.json({ error: "Permintaan harus disetujui dulu sebelum jadi pesanan." }, 400);
    }

    const id = crypto.randomUUID();
    const poNo = await nextDocNo(db, "purchase_orders", "PO");
    await db
      .prepare(
        `INSERT INTO purchase_orders (id, po_no, requisition_id, contact_id, order_date, expected_date, warehouse_id, tax_rate, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, poNo, input.requisitionId ?? null, input.contactId, input.orderDate, input.expectedDate ?? null, input.warehouseId, input.taxRate, input.note ?? null, c.get("user").id)
      .run();
    for (const line of input.lines) {
      await db
        .prepare(`INSERT INTO purchase_order_lines (id, po_id, product_id, qty, unit_price) VALUES (?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, line.productId, line.qty, line.unitPrice)
        .run();
    }
    if (input.requisitionId) {
      await db.prepare(`UPDATE purchase_requisitions SET status = 'ordered' WHERE id = ?`).bind(input.requisitionId).run();
    }
    await audit(c.env, {
      action: "procurement.po.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, poNo, lines: input.lines.length },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, poNo }, 201);
  })

  .post("/:tenantId/purchase-orders/:id/cancel", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const { results } = await db.prepare(`SELECT status FROM purchase_orders WHERE id = ?`).bind(id).all<{ status: PoStatus }>();
    if (!results[0]) return c.json({ error: "Pesanan tidak ditemukan." }, 404);
    if (results[0].status !== "ordered") return c.json({ error: "Hanya pesanan berstatus 'dipesan' yang bisa dibatalkan." }, 409);
    await db.prepare(`UPDATE purchase_orders SET status = 'cancelled' WHERE id = ?`).bind(id).run();
    await audit(c.env, {
      action: "procurement.po.cancelled",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // --- Penerimaan barang (GRN) → faktur pembelian ---------------------------
  .post("/:tenantId/purchase-orders/:id/receive", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = receiveGoodsSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const poId = c.req.param("id");
    const input = parsed.data;

    const { results: poRows } = await db
      .prepare(`SELECT id, contact_id, warehouse_id, tax_rate, status FROM purchase_orders WHERE id = ?`)
      .bind(poId)
      .all<{ id: string; contact_id: string; warehouse_id: string; tax_rate: number; status: PoStatus }>();
    const po = poRows[0];
    if (!po) return c.json({ error: "Pesanan tidak ditemukan." }, 404);
    if (po.status !== "ordered") return c.json({ error: "Pesanan ini sudah diterima atau dibatalkan." }, 409);

    const { results: poLines } = await db
      .prepare(`SELECT id, product_id, qty, unit_price FROM purchase_order_lines WHERE po_id = ?`)
      .bind(poId)
      .all<{ id: string; product_id: string; qty: number; unit_price: number }>();
    const byLineId = new Map(poLines.map((l) => [l.id, l]));

    // Susun baris faktur dari jumlah diterima; validasi ≤ dipesan.
    const purchaseLines: CreatePurchaseInput["lines"] = [];
    for (const rec of input.lines) {
      if (rec.qtyReceived <= 0) continue;
      const poLine = byLineId.get(rec.poLineId);
      if (!poLine) return c.json({ error: "Baris penerimaan tidak cocok dengan pesanan." }, 400);
      if (rec.qtyReceived > poLine.qty) return c.json({ error: "Jumlah diterima melebihi jumlah dipesan." }, 400);
      purchaseLines.push({ productId: poLine.product_id, qty: rec.qtyReceived, unitPrice: poLine.unit_price });
    }
    if (purchaseLines.length === 0) return c.json({ error: "Tidak ada barang diterima (semua jumlah nol)." }, 400);

    // Faktur pembelian (stok masuk + jurnal) lewat jalur teruji.
    const result = await executePurchase(
      db,
      {
        contactId: po.contact_id,
        invoiceDate: input.receiptDate,
        taxRate: po.tax_rate as CreatePurchaseInput["taxRate"],
        warehouseId: po.warehouse_id,
        lines: purchaseLines,
      },
      c.get("user").id,
    );
    if ("error" in result) return c.json({ error: result.error }, 400);

    const grnId = crypto.randomUUID();
    const grnNo = await nextDocNo(db, "goods_receipts", "GRN");
    await db
      .prepare(`INSERT INTO goods_receipts (id, grn_no, po_id, receipt_date, purchase_id, note, received_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(grnId, grnNo, poId, input.receiptDate, result.purchaseId, input.note ?? null, c.get("user").id)
      .run();
    for (const rec of input.lines) {
      if (rec.qtyReceived <= 0) continue;
      await db
        .prepare(`INSERT INTO goods_receipt_lines (id, grn_id, po_line_id, qty_received) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), grnId, rec.poLineId, rec.qtyReceived)
        .run();
    }
    await db.prepare(`UPDATE purchase_orders SET status = 'received' WHERE id = ?`).bind(poId).run();
    await audit(c.env, {
      action: "procurement.goods_received",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { grnNo, poId, purchaseNo: result.docNo, total: result.total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, grnNo, purchaseNo: result.docNo, purchaseId: result.purchaseId, total: result.total }, 201);
  })

  .get("/:tenantId/goods-receipts", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT g.id, g.grn_no, o.po_no, g.receipt_date, g.note, g.created_at, p.purchase_no
         FROM goods_receipts g JOIN purchase_orders o ON o.id = g.po_id
         LEFT JOIN purchases p ON p.id = g.purchase_id
         ORDER BY g.created_at DESC LIMIT 200`,
      )
      .all<{ id: string; grn_no: string; po_no: string; receipt_date: string; note: string | null; created_at: string; purchase_no: string | null }>();
    const receipts: ApiGoodsReceipt[] = results.map((r) => ({
      id: r.id,
      grnNo: r.grn_no,
      poNo: r.po_no,
      receiptDate: r.receipt_date,
      purchaseNo: r.purchase_no,
      note: r.note,
      createdAt: r.created_at,
    }));
    return c.json({ receipts });
  });

import {
  createProductionOrderSchema,
  qcInspectSchema,
  setBomSchema,
  type ApiBom,
  type ApiBomLine,
  type ApiProductionOrder,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import {
  InsufficientStockError,
  nextDocNo,
  stockIn,
  stockOut,
} from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Manufaktur + QC (Fase 2u).
 *
 * - BoM (Bill of Materials): resep satu produk jadi (komponen + jumlah, dan
 *   `outputQty` = hasil per resep).
 * - Perintah produksi: mengonsumsi bahan (stok keluar) → produk jadi (stok
 *   masuk) dengan biaya gabungan (biaya bahan / jumlah hasil). Bahan & produk
 *   jadi sama-sama bernilai di akun Persediaan, jadi produksi **netral terhadap
 *   nilai persediaan** — tak butuh jurnal (neraca tetap seimbang).
 * - QC: inspeksi hasil produksi — lulus (siap jual) atau karantina (dipindah ke
 *   gudang karantina, juga netral nilai).
 */

async function loadBom(db: ReturnType<typeof getTenantDb>, productId: string): Promise<ApiBom | null> {
  const { results } = await db
    .prepare(
      `SELECT b.id, b.output_qty, b.notes, p.sku, p.name
       FROM boms b JOIN products p ON p.id = b.product_id
       WHERE b.product_id = ?`,
    )
    .bind(productId)
    .all<{ id: string; output_qty: number; notes: string | null; sku: string; name: string }>();
  const head = results[0];
  if (!head) return null;

  const { results: lines } = await db
    .prepare(
      `SELECT bl.component_id, bl.qty, p.sku, p.name, p.unit
       FROM bom_lines bl JOIN products p ON p.id = bl.component_id
       WHERE bl.bom_id = ? ORDER BY p.name`,
    )
    .bind(head.id)
    .all<{ component_id: string; qty: number; sku: string; name: string; unit: string }>();

  return {
    id: head.id,
    productId,
    productSku: head.sku,
    productName: head.name,
    outputQty: head.output_qty,
    notes: head.notes,
    lines: lines.map(
      (l): ApiBomLine => ({ componentId: l.component_id, sku: l.sku, name: l.name, unit: l.unit, qty: l.qty }),
    ),
  };
}

function mapOrder(r: {
  id: string;
  order_no: string;
  product_id: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  qty: number;
  status: string;
  qc_status: string;
  unit_cost: number;
  total_cost: number;
  qc_warehouse_name: string | null;
  created_at: string;
  produced_at: string | null;
}): ApiProductionOrder {
  return {
    id: r.id,
    orderNo: r.order_no,
    productId: r.product_id,
    productName: r.product_name,
    warehouseId: r.warehouse_id,
    warehouseName: r.warehouse_name,
    qty: r.qty,
    status: r.status as ApiProductionOrder["status"],
    qcStatus: r.qc_status as ApiProductionOrder["qcStatus"],
    unitCost: r.unit_cost,
    totalCost: r.total_cost,
    qcWarehouseName: r.qc_warehouse_name,
    createdAt: r.created_at,
    producedAt: r.produced_at,
  };
}

const ORDER_SELECT = `SELECT o.id, o.order_no, o.product_id, p.name AS product_name,
    o.warehouse_id, w.name AS warehouse_name, o.qty, o.status, o.qc_status,
    o.unit_cost, o.total_cost, qw.name AS qc_warehouse_name, o.created_at, o.produced_at
  FROM production_orders o
  JOIN products p ON p.id = o.product_id
  JOIN warehouses w ON w.id = o.warehouse_id
  LEFT JOIN warehouses qw ON qw.id = o.qc_warehouse_id`;

export const manufacturingRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // BoM
  // -------------------------------------------------------------------------
  .get("/:tenantId/boms", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db.prepare(`SELECT product_id FROM boms`).all<{ product_id: string }>();
    const boms = (await Promise.all(results.map((r) => loadBom(db, r.product_id)))).filter(
      (b): b is ApiBom => b !== null,
    );
    boms.sort((a, b) => a.productName.localeCompare(b.productName));
    return c.json({ boms });
  })

  .get("/:tenantId/boms/:productId", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const bom = await loadBom(db, c.req.param("productId"));
    if (!bom) return c.json({ error: "Resep (BoM) tidak ditemukan." }, 404);
    return c.json(bom);
  })

  .put("/:tenantId/boms", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = setBomSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    // Produk jadi harus produk berstok (bukan jasa) & bukan komponennya sendiri.
    const { results: prodRows } = await db
      .prepare(`SELECT id, is_service FROM products WHERE id = ? AND is_archived = 0`)
      .bind(input.productId)
      .all<{ id: string; is_service: number }>();
    const product = prodRows[0];
    if (!product) return c.json({ error: "Produk jadi tidak ditemukan." }, 400);
    if (product.is_service === 1) return c.json({ error: "Produk jasa tidak bisa diproduksi." }, 400);

    if (input.lines.some((l) => l.componentId === input.productId)) {
      return c.json({ error: "Komponen tidak boleh sama dengan produk jadi." }, 400);
    }
    const uniqueComponents = new Set(input.lines.map((l) => l.componentId));
    if (uniqueComponents.size !== input.lines.length) {
      return c.json({ error: "Komponen tidak boleh ganda." }, 400);
    }
    const { results: comps } = await db
      .prepare(
        `SELECT id FROM products WHERE is_archived = 0 AND id IN (${input.lines.map(() => "?").join(",")})`,
      )
      .bind(...input.lines.map((l) => l.componentId))
      .all<{ id: string }>();
    if (comps.length !== uniqueComponents.size) {
      return c.json({ error: "Sebagian komponen tidak ditemukan." }, 400);
    }

    // Upsert header + ganti seluruh baris.
    const { results: existingRows } = await db
      .prepare(`SELECT id FROM boms WHERE product_id = ?`)
      .bind(input.productId)
      .all<{ id: string }>();
    const existing = existingRows[0];
    let bomId: string;
    if (existing) {
      bomId = existing.id;
      await db
        .prepare(`UPDATE boms SET output_qty = ?, notes = ? WHERE id = ?`)
        .bind(input.outputQty, input.notes ?? null, bomId)
        .run();
      await db.prepare(`DELETE FROM bom_lines WHERE bom_id = ?`).bind(bomId).run();
    } else {
      bomId = crypto.randomUUID();
      await db
        .prepare(`INSERT INTO boms (id, product_id, output_qty, notes) VALUES (?, ?, ?, ?)`)
        .bind(bomId, input.productId, input.outputQty, input.notes ?? null)
        .run();
    }
    for (const line of input.lines) {
      await db
        .prepare(`INSERT INTO bom_lines (id, bom_id, component_id, qty) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), bomId, line.componentId, line.qty)
        .run();
    }

    await audit(c.env, {
      action: "manufacturing.bom_saved",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { productId: input.productId, components: input.lines.length },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id: bomId }, existing ? 200 : 201);
  })

  // -------------------------------------------------------------------------
  // Perintah produksi
  // -------------------------------------------------------------------------
  .get("/:tenantId/production-orders", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db.prepare(`${ORDER_SELECT} ORDER BY o.created_at DESC`).all<Parameters<typeof mapOrder>[0]>();
    return c.json({ orders: results.map(mapOrder) });
  })

  .post("/:tenantId/production-orders", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createProductionOrderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const bom = await loadBom(db, input.productId);
    if (!bom) return c.json({ error: "Produk ini belum punya resep (BoM)." }, 400);
    if (input.qty % bom.outputQty !== 0) {
      return c.json({ error: `Jumlah produksi harus kelipatan hasil resep (${bom.outputQty}).` }, 400);
    }
    const { results: whRows } = await db
      .prepare(`SELECT id FROM warehouses WHERE id = ? AND is_archived = 0`)
      .bind(input.warehouseId)
      .all<{ id: string }>();
    if (!whRows[0]) return c.json({ error: "Gudang tidak ditemukan." }, 400);

    const id = crypto.randomUUID();
    const orderNo = await nextDocNo(db, "production_orders", "PRD");
    await db
      .prepare(
        `INSERT INTO production_orders (id, order_no, product_id, warehouse_id, qty, status, qc_status, created_by)
         VALUES (?, ?, ?, ?, ?, 'draft', 'none', ?)`,
      )
      .bind(id, orderNo, input.productId, input.warehouseId, input.qty, c.get("user").id)
      .run();

    await audit(c.env, {
      action: "manufacturing.order_created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { orderNo, productId: input.productId, qty: input.qty },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, orderNo }, 201);
  })

  // Jalankan produksi: konsumsi bahan → hasil produk jadi (biaya gabungan).
  .post("/:tenantId/production-orders/:id/complete", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const orderId = c.req.param("id");

    const { results: orderRows } = await db
      .prepare(`SELECT id, product_id, warehouse_id, qty, status FROM production_orders WHERE id = ?`)
      .bind(orderId)
      .all<{ id: string; product_id: string; warehouse_id: string; qty: number; status: string }>();
    const order = orderRows[0];
    if (!order) return c.json({ error: "Perintah produksi tidak ditemukan." }, 404);
    if (order.status !== "draft") return c.json({ error: "Perintah produksi sudah dijalankan." }, 409);

    const bom = await loadBom(db, order.product_id);
    if (!bom) return c.json({ error: "Resep (BoM) produk sudah tidak ada." }, 400);
    const batches = order.qty / bom.outputQty;

    // Konsumsi seluruh bahan; kumpulkan biaya. Bila stok kurang, batalkan.
    let totalCost = 0;
    try {
      for (const line of bom.lines) {
        totalCost += await stockOut(db, {
          productId: line.componentId,
          warehouseId: order.warehouse_id,
          qty: line.qty * batches,
          refType: "adjustment",
          refId: orderId,
        });
      }
    } catch (err) {
      if (err instanceof InsufficientStockError) return c.json({ error: err.message }, 400);
      throw err;
    }

    // Hasil produk jadi dengan biaya rata-rata gabungan.
    const unitCost = Math.round(totalCost / order.qty);
    await stockIn(db, {
      productId: order.product_id,
      warehouseId: order.warehouse_id,
      qty: order.qty,
      unitCost,
      refType: "adjustment",
      refId: orderId,
    });

    await db
      .prepare(
        `UPDATE production_orders SET status = 'produced', qc_status = 'pending',
           unit_cost = ?, total_cost = ?, produced_at = datetime('now') WHERE id = ?`,
      )
      .bind(unitCost, totalCost, orderId)
      .run();

    await audit(c.env, {
      action: "manufacturing.produced",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { orderId, qty: order.qty, totalCost, unitCost },
      ip: clientIp(c),
    });
    return c.json({ ok: true, qty: order.qty, unitCost, totalCost }, 200);
  })

  // Inspeksi QC: lulus (siap jual) atau karantina (pindah ke gudang karantina).
  .post("/:tenantId/production-orders/:id/qc", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = qcInspectSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const orderId = c.req.param("id");
    const input = parsed.data;

    const { results: orderRows } = await db
      .prepare(`SELECT id, product_id, warehouse_id, qty, status, qc_status FROM production_orders WHERE id = ?`)
      .bind(orderId)
      .all<{ id: string; product_id: string; warehouse_id: string; qty: number; status: string; qc_status: string }>();
    const order = orderRows[0];
    if (!order) return c.json({ error: "Perintah produksi tidak ditemukan." }, 404);
    if (order.status !== "produced" || order.qc_status !== "pending") {
      return c.json({ error: "Hanya hasil produksi yang menunggu QC yang bisa diinspeksi." }, 409);
    }

    if (input.result === "passed") {
      await db.prepare(`UPDATE production_orders SET qc_status = 'passed' WHERE id = ?`).bind(orderId).run();
    } else {
      // Karantina: pindahkan produk jadi ke gudang karantina (netral nilai).
      if (!input.warehouseId) return c.json({ error: "Gudang karantina wajib dipilih." }, 400);
      if (input.warehouseId === order.warehouse_id) {
        return c.json({ error: "Gudang karantina harus berbeda dari gudang produksi." }, 400);
      }
      const { results: qcWhRows } = await db
        .prepare(`SELECT id FROM warehouses WHERE id = ? AND is_archived = 0`)
        .bind(input.warehouseId)
        .all<{ id: string }>();
      if (!qcWhRows[0]) return c.json({ error: "Gudang karantina tidak ditemukan." }, 400);

      let cost: number;
      try {
        cost = await stockOut(db, {
          productId: order.product_id,
          warehouseId: order.warehouse_id,
          qty: order.qty,
          refType: "adjustment",
          refId: orderId,
        });
      } catch (err) {
        if (err instanceof InsufficientStockError) return c.json({ error: err.message }, 400);
        throw err;
      }
      await stockIn(db, {
        productId: order.product_id,
        warehouseId: input.warehouseId,
        qty: order.qty,
        unitCost: Math.round(cost / order.qty),
        refType: "adjustment",
        refId: orderId,
      });
      await db
        .prepare(`UPDATE production_orders SET qc_status = 'quarantined', qc_warehouse_id = ? WHERE id = ?`)
        .bind(input.warehouseId, orderId)
        .run();
    }

    await audit(c.env, {
      action: "manufacturing.qc_inspected",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { orderId, result: input.result },
      ip: clientIp(c),
    });
    return c.json({ ok: true, result: input.result }, 200);
  });

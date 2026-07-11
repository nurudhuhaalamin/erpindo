import {
  serialSchema,
  serialStatusSchema,
  type ApiProductSerial,
  type ApiReorderSuggestion,
  type SerialStatus,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Stok lanjut (Fase 7c):
 * - Titik pesan otomatis → usulan pembelian: produk dengan total stok ≤ min_stock
 *   (di luar jasa). Usulan qty menaikkan stok kembali ke 2× ambang. Web memakai daftar
 *   ini untuk membuat Permintaan Pembelian (PR) lewat modul Pengadaan (Fase 6d).
 * - Pindai barcode: cari produk berdasarkan kode batang (untuk kasir).
 * - Nomor seri: registri unit per produk (in_stock → sold), ringan & terpisah dari
 *   stock_levels (tidak mengubah average cost / FEFO).
 */

export const stockAdvancedRoutes = new Hono<AppEnv>()
  // --- Titik pesan otomatis → usulan pembelian ------------------------------
  .get("/:tenantId/reorder-suggestions", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT p.id, p.sku, p.name, p.unit, p.min_stock, p.buy_price,
                COALESCE(SUM(s.qty), 0) AS qty
         FROM products p
         LEFT JOIN stock_levels s ON s.product_id = p.id
         WHERE p.is_archived = 0 AND p.is_service = 0 AND p.min_stock > 0
         GROUP BY p.id
         HAVING COALESCE(SUM(s.qty), 0) <= p.min_stock
         ORDER BY (p.min_stock - COALESCE(SUM(s.qty), 0)) DESC, p.name`,
      )
      .all<{ id: string; sku: string; name: string; unit: string; min_stock: number; buy_price: number; qty: number }>();

    const suggestions: ApiReorderSuggestion[] = results.map((r) => {
      const shortfall = Math.max(r.min_stock - r.qty, 0);
      // Naikkan kembali ke 2× ambang (buffer aman), minimal menutup kekurangan.
      const suggestedQty = Math.max(r.min_stock * 2 - r.qty, shortfall, 1);
      return {
        productId: r.id,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        minStock: r.min_stock,
        qty: r.qty,
        shortfall,
        suggestedQty,
        buyPrice: r.buy_price,
      };
    });
    return c.json({ suggestions });
  })

  // --- Pindai barcode → produk ----------------------------------------------
  .get("/:tenantId/products/lookup", requireAuth, requireTenantRole("viewer"), async (c) => {
    const barcode = (c.req.query("barcode") ?? "").trim();
    if (!barcode) return c.json({ error: "Parameter barcode wajib diisi." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT id, sku, name, unit, sell_price, buy_price
         FROM products WHERE barcode = ? AND is_archived = 0 LIMIT 1`,
      )
      .bind(barcode)
      .all<{ id: string; sku: string; name: string; unit: string; sell_price: number; buy_price: number }>();
    const p = results[0];
    if (!p) return c.json({ error: "Produk dengan barcode tersebut tidak ditemukan." }, 404);
    return c.json({
      product: { id: p.id, sku: p.sku, name: p.name, unit: p.unit, sellPrice: p.sell_price, buyPrice: p.buy_price },
    });
  })

  // --- Nomor seri per produk ------------------------------------------------
  .get("/:tenantId/products/:id/serials", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const productId = c.req.param("id");
    const { results } = await db
      .prepare(
        `SELECT id, product_id, serial_no, status, note, created_at
         FROM product_serials WHERE product_id = ? ORDER BY created_at DESC LIMIT 500`,
      )
      .bind(productId)
      .all<{ id: string; product_id: string; serial_no: string; status: SerialStatus; note: string | null; created_at: string }>();
    const serials: ApiProductSerial[] = results.map((r) => ({
      id: r.id,
      productId: r.product_id,
      serialNo: r.serial_no,
      status: r.status,
      note: r.note,
      createdAt: r.created_at,
    }));
    return c.json({ serials });
  })

  .post("/:tenantId/products/:id/serials", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = serialSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const productId = c.req.param("id");
    const input = parsed.data;

    const prod = await db.prepare(`SELECT id FROM products WHERE id = ? AND is_archived = 0`).bind(productId).all<{ id: string }>();
    if (!prod.results[0]) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const dupe = await db.prepare(`SELECT id FROM product_serials WHERE product_id = ? AND serial_no = ?`).bind(productId, input.serialNo).all<{ id: string }>();
    if (dupe.results[0]) return c.json({ error: `Nomor seri '${input.serialNo}' sudah terdaftar untuk produk ini.` }, 409);

    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO product_serials (id, product_id, serial_no, note) VALUES (?, ?, ?, ?)`)
      .bind(id, productId, input.serialNo, input.note ? input.note : null)
      .run();
    await audit(c.env, { action: "stock.serial.added", userId: c.get("user").id, tenantId: tenant.id, detail: { productId, serialNo: input.serialNo }, ip: clientIp(c) });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/products/:id/serials/:serialId", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = serialStatusSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const serialId = c.req.param("serialId");
    const { results } = await db.prepare(`SELECT id FROM product_serials WHERE id = ? AND product_id = ?`).bind(serialId, c.req.param("id")).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Nomor seri tidak ditemukan." }, 404);
    await db.prepare(`UPDATE product_serials SET status = ? WHERE id = ?`).bind(parsed.data.status, serialId).run();
    await audit(c.env, { action: "stock.serial.status", userId: c.get("user").id, tenantId: tenant.id, detail: { serialId, status: parsed.data.status }, ip: clientIp(c) });
    return c.json({ ok: true });
  });

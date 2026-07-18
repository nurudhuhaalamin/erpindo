import { marketplaceImportSchema, type ApiMarketplaceOrder } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";
import { executeInvoice } from "../lib/commercePosting";

/**
 * Import pesanan marketplace (Fase 11e) — jembatan omnichannel tanpa kunci API.
 * Penjual mengekspor pesanan dari Shopee/Tokopedia/TikTok (CSV) lalu mengunggah
 * ke sini; tiap pesanan menjadi faktur penjualan (stok keluar + jurnal otomatis)
 * lewat executeInvoice yang sudah teruji. Idempoten: satu (channel, no. pesanan)
 * hanya sekali. Konektor API langsung menyusul saat kunci marketplace tersedia.
 */

export const marketplaceRoutes = new Hono<AppEnv>()
  .get("/:tenantId/marketplace/orders", requireAuth, requireTenantRole("viewer"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const { results } = await db
      .prepare(
        `SELECT mo.id, mo.channel, mo.external_order_no, mo.imported_at, i.invoice_no
         FROM marketplace_orders mo LEFT JOIN invoices i ON i.id = mo.invoice_id
         ORDER BY mo.imported_at DESC LIMIT 200`,
      )
      .all<{ id: string; channel: string; external_order_no: string; imported_at: string; invoice_no: string | null }>();
    const orders: ApiMarketplaceOrder[] = results.map((r) => ({
      id: r.id,
      channel: r.channel,
      externalOrderNo: r.external_order_no,
      invoiceNo: r.invoice_no,
      importedAt: r.imported_at,
    }));
    return c.json({ orders });
  })

  .post("/:tenantId/marketplace/import", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = marketplaceImportSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "Data impor tidak valid." }, 400);
    }
    const { channel, warehouseId, contactId, rows } = parsed.data;
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);

    // Peta SKU → produk (sekali baca, hindari N+1).
    const { results: products } = await db
      .prepare(`SELECT id, sku FROM products WHERE is_archived = 0`)
      .all<{ id: string; sku: string }>();
    const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p.id]));

    // Kelompokkan baris per nomor pesanan (pertahankan urutan kemunculan).
    const orderMap = new Map<string, { orderDate: string; lines: { productId: string; qty: number; unitPrice: number; discountPct?: number }[]; unknownSku: string[] }>();
    for (const r of rows) {
      let grp = orderMap.get(r.externalOrderNo);
      if (!grp) {
        grp = { orderDate: r.orderDate, lines: [], unknownSku: [] };
        orderMap.set(r.externalOrderNo, grp);
      }
      const productId = bySku.get(r.sku.toLowerCase());
      if (!productId) grp.unknownSku.push(r.sku);
      else grp.lines.push({ productId, qty: r.qty, unitPrice: r.unitPrice, discountPct: r.discountPct });
    }

    const imported: { externalOrderNo: string; invoiceNo: string }[] = [];
    const skipped: { externalOrderNo: string; reason: string }[] = [];
    const failed: { externalOrderNo: string; reason: string }[] = [];

    for (const [externalOrderNo, grp] of orderMap) {
      // Idempoten: lewati pesanan yang sudah pernah diimpor.
      const { results: dup } = await db
        .prepare(`SELECT id FROM marketplace_orders WHERE channel = ? AND external_order_no = ?`)
        .bind(channel, externalOrderNo)
        .all<{ id: string }>();
      if (dup.length > 0) {
        skipped.push({ externalOrderNo, reason: "sudah pernah diimpor" });
        continue;
      }
      if (grp.unknownSku.length > 0) {
        failed.push({ externalOrderNo, reason: `SKU tak dikenal: ${[...new Set(grp.unknownSku)].join(", ")}` });
        continue;
      }
      const result = await executeInvoice(
        db,
        { contactId, invoiceDate: grp.orderDate, taxRate: 0, warehouseId, lines: grp.lines },
        c.get("user").id,
      );
      if ("error" in result) {
        failed.push({ externalOrderNo, reason: result.error });
        continue;
      }
      await db
        .prepare(`INSERT INTO marketplace_orders (id, channel, external_order_no, invoice_id) VALUES (?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), channel, externalOrderNo, result.invoiceId)
        .run();
      imported.push({ externalOrderNo, invoiceNo: result.docNo });
    }

    await audit(c.env, {
      action: "marketplace.imported",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { channel, imported: imported.length, skipped: skipped.length, failed: failed.length },
      ip: clientIp(c),
    });
    return c.json({ imported, skipped, failed });
  });

import { INDUSTRY_TEMPLATES, industryTemplateSchema } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Template industri (Fase 11f) — isi contoh data awal (produk + kontak) sesuai
 * jenis usaha agar pengguna baru bisa langsung mencoba alur. Idempoten: melewati
 * SKU/kontak yang sudah ada; semuanya bisa diubah/hapus kapan saja.
 */
export const setupRoutes = new Hono<AppEnv>().post(
  "/:tenantId/setup/industry-template",
  requireAuth,
  requireTenantRole("admin"),
  async (c) => {
    const parsed = industryTemplateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Jenis usaha tidak dikenal." }, 400);
    const tpl = INDUSTRY_TEMPLATES[parsed.data.industry];
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);

    let productsAdded = 0;
    for (const p of tpl.products) {
      const { results } = await db.prepare(`SELECT id FROM products WHERE sku = ?`).bind(p.sku).all<{ id: string }>();
      if (results.length > 0) continue;
      await db
        .prepare(`INSERT INTO products (id, sku, name, unit, sell_price, buy_price, is_service) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), p.sku, p.name, p.unit, p.sellPrice, p.buyPrice, p.isService ? 1 : 0)
        .run();
      productsAdded++;
    }

    let contactsAdded = 0;
    for (const ct of tpl.contacts) {
      const { results } = await db
        .prepare(`SELECT id FROM contacts WHERE name = ? AND type = ?`)
        .bind(ct.name, ct.type)
        .all<{ id: string }>();
      if (results.length > 0) continue;
      await db
        .prepare(`INSERT INTO contacts (id, type, name) VALUES (?, ?, ?)`)
        .bind(crypto.randomUUID(), ct.type, ct.name)
        .run();
      contactsAdded++;
    }

    await audit(c.env, {
      action: "setup.industry_template",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { industry: parsed.data.industry, productsAdded, contactsAdded },
      ip: clientIp(c),
    });
    return c.json({ productsAdded, contactsAdded });
  },
);

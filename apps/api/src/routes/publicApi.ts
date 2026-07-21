import {
  apiKeySchema,
  API_KEY_PREFIX,
  contactSchema,
  planIncludesModule,
  productSchema,
  webhookSchema,
  type ApiApiKey,
  type ApiScope,
  type ApiWebhook,
  type Plan,
  type WebhookEvent,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { generateToken, sha256Hex } from "../lib/crypto";
import { getTenantDb } from "../lib/tenantDb";
import { runWebhookDeliveries } from "../lib/webhooks";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

function now(): string {
  return new Date().toISOString();
}

// ===========================================================================
// Middleware autentikasi API key (Bearer) untuk namespace /api/v1.
// ===========================================================================

/**
 * Autentikasi via `Authorization: Bearer erpk_…`. Menyematkan konteks tenant
 * (seperti requireTenantRole) tanpa cookie/sesi. `minScope`:
 * - "read"  → key read/write boleh.
 * - "write" → hanya key write.
 * Menegakkan pula paket Enterprise (modul apiAccess) — key yang dibuat saat
 * Enterprise berhenti berlaku bila tenant turun paket (kecuali legacy).
 */
export function requireApiKey(minScope: ApiScope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authz = c.req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(authz.trim());
    const token = m?.[1]?.trim();
    if (!token || !token.startsWith(API_KEY_PREFIX)) {
      return c.json({ error: "API key tidak ada. Sertakan header Authorization: Bearer erpk_…", detail: "missing-api-key" }, 401);
    }

    const keyHash = await sha256Hex(token);
    const key = await c.env.DB.prepare(
      `SELECT k.id AS key_id, k.scope, t.id, t.name, t.slug, t.db_ref, t.status, t.plan, t.legacy_full_access
       FROM api_keys k JOIN tenants t ON t.id = k.tenant_id
       WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
    )
      .bind(keyHash)
      .first<{
        key_id: string;
        scope: ApiScope;
        id: string;
        name: string;
        slug: string;
        db_ref: string;
        status: string;
        plan: Plan;
        legacy_full_access: number;
      }>();

    if (!key) return c.json({ error: "API key tidak valid atau dicabut.", detail: "invalid-api-key" }, 401);
    if (key.status === "suspended") return c.json({ error: "Langganan perusahaan ditangguhkan.", detail: "suspended" }, 402);

    // Modul apiAccess = Enterprise; legacy tetap boleh.
    if (key.legacy_full_access !== 1 && !planIncludesModule(key.plan, "apiAccess")) {
      return c.json({ error: "API publik hanya tersedia pada paket Enterprise.", detail: "plan-upgrade-required", requiredPlan: "enterprise" }, 403);
    }
    // Skop tulis wajib untuk mutasi.
    if (minScope === "write" && key.scope !== "write") {
      return c.json({ error: "API key ini hanya berskop baca (read).", detail: "insufficient-scope" }, 403);
    }

    // Catat pemakaian (best-effort, tak memblok).
    c.executionCtx?.waitUntil?.(
      c.env.DB.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).bind(now(), key.key_id).run(),
    );

    c.set("tenant", {
      id: key.id,
      name: key.name,
      slug: key.slug,
      dbRef: key.db_ref,
      status: key.status,
      role: key.scope === "write" ? "admin" : "viewer",
      plan: key.plan,
      legacyFullAccess: key.legacy_full_access === 1,
    });
    await next();
  };
}

// ===========================================================================
// Pengelolaan API key + webhook (Owner, dashboard) — /api/tenants/:tenantId/…
// Digerbangi enforcePlanByPath (segmen api-keys/webhooks → apiAccess).
// ===========================================================================

export const publicApiAdminRoutes = new Hono<AppEnv>()
  // --- API keys ------------------------------------------------------------
  .get("/:tenantId/api-keys", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, scope, prefix, created_at, last_used_at, revoked_at FROM api_keys
       WHERE tenant_id = ? ORDER BY created_at DESC`,
    )
      .bind(tenant.id)
      .all<{ id: string; name: string; scope: ApiScope; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>();
    const keys: ApiApiKey[] = results.map((r) => ({
      id: r.id,
      name: r.name,
      scope: r.scope,
      prefix: r.prefix,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      revokedAt: r.revoked_at,
    }));
    return c.json({ keys });
  })

  .post("/:tenantId/api-keys", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = apiKeySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const fullKey = API_KEY_PREFIX + generateToken(); // erpk_ + 64 hex
    const keyHash = await sha256Hex(fullKey);
    const prefix = fullKey.slice(0, 12) + "…"; // erpk_xxxxxxx…
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO api_keys (id, tenant_id, name, key_hash, prefix, scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, tenant.id, parsed.data.name, keyHash, prefix, parsed.data.scope, now())
      .run();
    await audit(c.env, { action: "api.key_created", userId: c.get("user").id, tenantId: tenant.id, detail: { id, scope: parsed.data.scope }, ip: clientIp(c) });
    // Kunci penuh HANYA ditampilkan sekali di sini.
    return c.json({ id, key: fullKey, scope: parsed.data.scope, name: parsed.data.name }, 201);
  })

  .delete("/:tenantId/api-keys/:id", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const id = c.req.param("id");
    const res = await c.env.DB.prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND tenant_id = ? AND revoked_at IS NULL`)
      .bind(now(), id, tenant.id)
      .run();
    if (!res.meta.changes) return c.json({ error: "API key tidak ditemukan." }, 404);
    await audit(c.env, { action: "api.key_revoked", userId: c.get("user").id, tenantId: tenant.id, detail: { id }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  // --- Webhooks ------------------------------------------------------------
  .get("/:tenantId/webhooks", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const { results } = await c.env.DB.prepare(
      `SELECT id, url, events, active, created_at, last_status, last_attempt_at FROM webhooks
       WHERE tenant_id = ? ORDER BY created_at DESC`,
    )
      .bind(tenant.id)
      .all<{ id: string; url: string; events: string; active: number; created_at: string; last_status: string | null; last_attempt_at: string | null }>();
    const webhooks: ApiWebhook[] = results.map((r) => {
      let events: WebhookEvent[] = [];
      try {
        events = JSON.parse(r.events) as WebhookEvent[];
      } catch {
        events = [];
      }
      return {
        id: r.id,
        url: r.url,
        events,
        active: r.active === 1,
        createdAt: r.created_at,
        lastStatus: r.last_status,
        lastAttemptAt: r.last_attempt_at,
      };
    });
    return c.json({ webhooks });
  })

  .post("/:tenantId/webhooks", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsed = webhookSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const id = crypto.randomUUID();
    const secret = "whsec_" + generateToken();
    await c.env.DB.prepare(
      `INSERT INTO webhooks (id, tenant_id, url, secret, events, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`,
    )
      .bind(id, tenant.id, parsed.data.url, secret, JSON.stringify(parsed.data.events), now())
      .run();
    await audit(c.env, { action: "api.webhook_created", userId: c.get("user").id, tenantId: tenant.id, detail: { id, url: parsed.data.url }, ip: clientIp(c) });
    // Secret HMAC HANYA ditampilkan sekali.
    return c.json({ id, secret, url: parsed.data.url, events: parsed.data.events }, 201);
  })

  .delete("/:tenantId/webhooks/:id", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const id = c.req.param("id");
    const res = await c.env.DB.prepare(`DELETE FROM webhooks WHERE id = ? AND tenant_id = ?`).bind(id, tenant.id).run();
    if (!res.meta.changes) return c.json({ error: "Webhook tidak ditemukan." }, 404);
    await audit(c.env, { action: "api.webhook_deleted", userId: c.get("user").id, tenantId: tenant.id, detail: { id }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  // Antrean pengiriman terkini (untuk memantau status di UI).
  .get("/:tenantId/webhooks/deliveries", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const { results } = await c.env.DB.prepare(
      `SELECT id, event, status, attempts, next_attempt_at, last_error, created_at FROM webhook_deliveries
       WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
      .bind(tenant.id)
      .all();
    return c.json({ deliveries: results });
  })

  // Kirim antrean yang jatuh tempo sekarang (flush manual dari dashboard).
  .post("/:tenantId/webhooks/deliveries/run", requireAuth, requireTenantRole("owner"), async (c) => {
    const summary = await runWebhookDeliveries(c.env);
    return c.json({ ok: true, ...summary });
  });

// ===========================================================================
// API publik terkurasi — /api/v1/… (auth via Bearer API key)
// ===========================================================================

export const publicApiV1Routes = new Hono<AppEnv>()
  // --- Kontak --------------------------------------------------------------
  .get("/contacts", requireApiKey("read"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const { results } = await db
      .prepare(`SELECT id, type, name, email, phone, npwp, created_at FROM contacts WHERE is_archived = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset)
      .all<{ id: string; type: string; name: string; email: string | null; phone: string | null; npwp: string | null; created_at: string }>();
    return c.json({ data: results.map((r) => ({ id: r.id, type: r.type, name: r.name, email: r.email, phone: r.phone, npwp: r.npwp, createdAt: r.created_at })) });
  })
  .post("/contacts", requireApiKey("write"), async (c) => {
    const parsed = contactSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const p = parsed.data;
    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO contacts (id, type, name, email, phone, address, npwp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, p.type, p.name, p.email || null, p.phone || null, p.address || null, p.npwp || null)
      .run();
    await audit(c.env, { action: "api.contact_created", tenantId: tenant.id, detail: { id }, ip: clientIp(c) });
    return c.json({ id }, 201);
  })

  // --- Produk --------------------------------------------------------------
  .get("/products", requireApiKey("read"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const { results } = await db
      .prepare(`SELECT id, sku, name, unit, sell_price, buy_price, min_stock, created_at FROM products WHERE is_archived = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset)
      .all<{ id: string; sku: string; name: string; unit: string; sell_price: number; buy_price: number; min_stock: number; created_at: string }>();
    return c.json({ data: results.map((r) => ({ id: r.id, sku: r.sku, name: r.name, unit: r.unit, sellPrice: r.sell_price, buyPrice: r.buy_price, minStock: r.min_stock, createdAt: r.created_at })) });
  })
  .post("/products", requireApiKey("write"), async (c) => {
    const parsed = productSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const p = parsed.data;
    const dupe = await db.prepare(`SELECT id FROM products WHERE sku = ?`).bind(p.sku).first();
    if (dupe) return c.json({ error: `SKU '${p.sku}' sudah dipakai.` }, 409);
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO products (id, sku, name, unit, sell_price, buy_price, track_expiry, is_service, min_stock, barcode, uom_secondary, uom_factor, track_serial)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, p.sku, p.name, p.unit, p.sellPrice, p.buyPrice, p.trackExpiry ? 1 : 0, p.isService ? 1 : 0, p.minStock, p.barcode || null, p.uomSecondary || null, p.uomFactor, p.trackSerial ? 1 : 0)
      .run();
    await audit(c.env, { action: "api.product_created", tenantId: tenant.id, detail: { id, sku: p.sku }, ip: clientIp(c) });
    return c.json({ id }, 201);
  })

  // --- Faktur (baca) -------------------------------------------------------
  .get("/invoices", requireApiKey("read"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const { results } = await db
      .prepare(
        `SELECT i.id, i.invoice_no, i.contact_id, k.name AS contact_name, i.invoice_date, i.due_date, i.status, i.total, i.paid_amount, i.created_at
         FROM invoices i LEFT JOIN contacts k ON k.id = i.contact_id ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(limit, offset)
      .all<{ id: string; invoice_no: string; contact_id: string; contact_name: string | null; invoice_date: string; due_date: string | null; status: string; total: number; paid_amount: number; created_at: string }>();
    return c.json({
      data: results.map((r) => ({
        id: r.id,
        invoiceNo: r.invoice_no,
        contactId: r.contact_id,
        contactName: r.contact_name,
        invoiceDate: r.invoice_date,
        dueDate: r.due_date,
        status: r.status,
        total: r.total,
        paidAmount: r.paid_amount,
        createdAt: r.created_at,
      })),
    });
  })

  // --- Pembayaran (baca) ---------------------------------------------------
  .get("/payments", requireApiKey("read"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const { results } = await db
      .prepare(`SELECT id, payment_no, direction, ref_type, ref_id, amount, payment_date, created_at FROM payments ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset)
      .all<{ id: string; payment_no: string; direction: string; ref_type: string; ref_id: string; amount: number; payment_date: string; created_at: string }>();
    return c.json({
      data: results.map((r) => ({ id: r.id, paymentNo: r.payment_no, direction: r.direction, refType: r.ref_type, refId: r.ref_id, amount: r.amount, paymentDate: r.payment_date, createdAt: r.created_at })),
    });
  })

  // --- Ringkasan (baca) ----------------------------------------------------
  .get("/reports/summary", requireApiKey("read"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const [inv, recv, pay] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS t FROM invoices WHERE substr(invoice_date,1,7) = ?`).bind(monthPrefix).first<{ n: number; t: number }>(),
      db.prepare(`SELECT COALESCE(SUM(total - paid_amount),0) AS r FROM invoices WHERE status != 'paid'`).first<{ r: number }>(),
      db.prepare(`SELECT COALESCE(SUM(amount),0) AS p FROM payments WHERE direction = 'receive' AND substr(payment_date,1,7) = ?`).bind(monthPrefix).first<{ p: number }>(),
    ]);
    return c.json({
      data: {
        period: monthPrefix,
        invoicesThisMonth: inv?.n ?? 0,
        salesThisMonth: inv?.t ?? 0,
        paymentsReceivedThisMonth: pay?.p ?? 0,
        receivablesOutstanding: recv?.r ?? 0,
        generatedAt: now(),
      },
    });
  });

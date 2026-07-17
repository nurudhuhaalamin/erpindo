import type { ApiPaymentLink, Role } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth } from "../middleware/auth";
import { appOrigin, clientIp } from "./auth";
import { billingConfigured, createSnapTransaction } from "./billing";

/**
 * Payment collection (Fase 11d): buat link pembayaran online (Midtrans Snap)
 * untuk faktur penjualan yang masih ada sisa tagihan. Pelanggan membayar via
 * link; webhook (di billing.ts) menandai link 'paid'. Pencatatan ke buku besar
 * tetap aksi Pemilik lewat alur "Terima Pembayaran" yang sudah ada (nudge di
 * UI) — sengaja tidak auto-posting agar aman terhadap kunci periode & valas.
 *
 * Degradasi anggun: tanpa MIDTRANS_SERVER_KEY, pembuatan link membalas 503.
 * Metadata link disimpan di control-plane (c.env.DB — punya .first()).
 */

type LinkRow = {
  order_id: string;
  amount: number;
  status: ApiPaymentLink["status"];
  redirect_url: string | null;
  paid_at: string | null;
  created_at: string;
};

function toApiLink(r: LinkRow): ApiPaymentLink {
  return {
    orderId: r.order_id,
    amount: r.amount,
    status: r.status,
    redirectUrl: r.redirect_url,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  };
}

/**
 * Muat keanggotaan tenant tanpa requireTenantRole — payment collection sengaja
 * DIIZINKAN saat tenant past_due: menagih pelanggan justru cara mereka
 * memulihkan langganan (mirip endpoint billing).
 */
async function loadMembership(
  c: { env: Env; get: (k: "user") => { id: string }; req: { param: (k: string) => string | undefined } },
): Promise<{ id: string; name: string; dbRef: string; role: Role } | null> {
  const tenantId = c.req.param("tenantId");
  if (!tenantId) return null;
  const row = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.db_ref, m.role
     FROM memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = ? AND m.tenant_id = ?`,
  )
    .bind(c.get("user").id, tenantId)
    .first<{ id: string; name: string; db_ref: string; role: Role }>();
  return row ? { id: row.id, name: row.name, dbRef: row.db_ref, role: row.role } : null;
}

export const collectionRoutes = new Hono<AppEnv>()
  // Status link terbaru untuk sebuah faktur.
  .get("/:tenantId/invoices/:id/payment-link", requireAuth, async (c) => {
    const m = await loadMembership(c);
    if (!m) return c.json({ error: "Anda bukan anggota perusahaan ini." }, 403);
    const row = await c.env.DB.prepare(
      `SELECT order_id, amount, status, redirect_url, paid_at, created_at
       FROM payment_links WHERE tenant_id = ? AND invoice_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(m.id, c.req.param("id"))
      .first<LinkRow>();
    return c.json({ link: row ? toApiLink(row) : null, configured: billingConfigured(c.env) });
  })

  // Buat link pembayaran baru untuk sisa tagihan faktur.
  .post("/:tenantId/invoices/:id/payment-link", requireAuth, async (c) => {
    const m = await loadMembership(c);
    if (!m) return c.json({ error: "Anda bukan anggota perusahaan ini." }, 403);
    if (m.role === "viewer") return c.json({ error: "Peran Anda tidak dapat membuat tagihan." }, 403);
    if (!billingConfigured(c.env)) {
      return c.json({ error: "Pembayaran online belum dikonfigurasi. Hubungi kami untuk aktivasi." }, 503);
    }
    const invoiceId = c.req.param("id");
    const db = getTenantDb(c.env, m.dbRef);
    const inv = await db
      .prepare(
        `SELECT i.invoice_no, i.total, i.paid_amount, i.returned_amount, i.voided_at, c.name AS contact_name
         FROM invoices i JOIN contacts c ON c.id = i.contact_id WHERE i.id = ?`,
      )
      .bind(invoiceId)
      .first<{ invoice_no: string; total: number; paid_amount: number; returned_amount: number; voided_at: string | null; contact_name: string }>();
    if (!inv) return c.json({ error: "Faktur tidak ditemukan." }, 404);
    if (inv.voided_at) return c.json({ error: "Faktur sudah dibatalkan." }, 400);
    const outstanding = inv.total - inv.paid_amount - inv.returned_amount;
    if (outstanding <= 0) return c.json({ error: "Faktur ini sudah lunas." }, 400);

    const orderId = `inv-${m.id.slice(0, 8)}-${Date.now()}`;
    const snap = await createSnapTransaction(c.env, {
      orderId,
      amount: outstanding,
      itemId: `faktur-${inv.invoice_no}`,
      itemName: `Pembayaran Faktur ${inv.invoice_no} — ${m.name}`,
      customerName: inv.contact_name,
      finishUrl: `${appOrigin(c)}/app/penjualan`,
    });
    if (!snap.ok) return c.json({ error: snap.error }, 502);

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO payment_links (id, tenant_id, invoice_id, invoice_no, order_id, amount, status, redirect_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(id, m.id, invoiceId, inv.invoice_no, orderId, outstanding, snap.redirectUrl, c.get("user").id)
      .run();
    await audit(c.env, {
      action: "collection.link_created",
      userId: c.get("user").id,
      tenantId: m.id,
      detail: { invoiceNo: inv.invoice_no, amount: outstanding },
      ip: clientIp(c),
    });
    return c.json({ orderId, redirectUrl: snap.redirectUrl, amount: outstanding }, 201);
  });

import type { ApiSubscriptionInvoice, BillingStatus, Plan, Role, TenantStatus } from "@erpindo/shared";
import { SINGLE_PLAN } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv, Env } from "../env";
import { audit } from "../lib/audit";
import { sha512Hex } from "../lib/crypto";
import { requireAuth } from "../middleware/auth";
import { appOrigin, clientIp } from "./auth";

/**
 * Billing langganan via Midtrans Snap (Fase 11b) — pemblokir launching #1.
 *
 * Alur: Owner menekan "Berlangganan" → `POST /checkout` membuat
 * subscription_invoice + transaksi Snap → mengembalikan `redirect_url`
 * (dipakai redirect, BUKAN popup snap.js — aman terhadap CSP `script-src 'self'`).
 * Setelah bayar, Midtrans memanggil `POST /api/billing/notification`; tanda
 * tangan diverifikasi (SHA-512) lalu invoice ditandai lunas + tenant.status
 * jadi 'active' dengan subscription_ends_at diperpanjang 1 bulan.
 *
 * Tanpa MIDTRANS_SERVER_KEY seluruh fitur degradasi anggun: status tetap bisa
 * dilihat, checkout membalas 503, webhook membalas 200 (diabaikan).
 * Semua data billing di control-plane (c.env.DB — punya .first()).
 */

export function billingConfigured(env: Env): boolean {
  return Boolean(env.MIDTRANS_SERVER_KEY);
}

function snapEndpoint(env: Env): string {
  return env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
}

/** Tanda tangan notifikasi Midtrans = SHA512(order_id + status_code + gross_amount + server_key). */
export async function midtransSignatureValid(
  serverKey: string,
  n: { order_id?: string; status_code?: string; gross_amount?: string; signature_key?: string },
): Promise<boolean> {
  if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) return false;
  const expected = await sha512Hex(`${n.order_id}${n.status_code}${n.gross_amount}${serverKey}`);
  return expected === n.signature_key;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

type InvoiceRow = {
  id: string;
  order_id: string;
  amount: number;
  period_months: number;
  status: ApiSubscriptionInvoice["status"];
  transaction_status: string | null;
  paid_at: string | null;
  created_at: string;
};

function toApiInvoice(r: InvoiceRow): ApiSubscriptionInvoice {
  return {
    id: r.id,
    orderId: r.order_id,
    amount: r.amount,
    periodMonths: r.period_months,
    status: r.status,
    transactionStatus: r.transaction_status,
    paidAt: r.paid_at,
    createdAt: r.created_at,
  };
}

/**
 * Muat tenant + peran anggota untuk endpoint billing. Sengaja TIDAK memakai
 * requireTenantRole karena billing adalah jalan keluar dari status past_due —
 * pemilik yang menunggak HARUS tetap bisa membayar (requireTenantRole memblokir
 * tulis saat past_due dengan 402).
 */
async function loadMembership(
  c: { env: Env; get: (k: "user") => { id: string }; req: { param: (k: string) => string | undefined } },
): Promise<{ tenantId: string; row: { id: string; status: TenantStatus; plan: Plan; trial_ends_at: string | null; subscription_ends_at: string | null; role: Role } } | null> {
  const tenantId = c.req.param("tenantId");
  if (!tenantId) return null;
  const row = await c.env.DB.prepare(
    `SELECT t.id, t.status, t.plan, t.trial_ends_at, t.subscription_ends_at, m.role
     FROM memberships m JOIN tenants t ON t.id = m.tenant_id
     WHERE m.user_id = ? AND m.tenant_id = ?`,
  )
    .bind(c.get("user").id, tenantId)
    .first<{ id: string; status: TenantStatus; plan: Plan; trial_ends_at: string | null; subscription_ends_at: string | null; role: Role }>();
  return row ? { tenantId, row } : null;
}

// Endpoint tenant (di-mount di /api/tenants) — pola requireAuth + cek keanggotaan
// manual (bukan requireTenantRole) agar tenant past_due tetap bisa membayar.
export const billingRoutes = new Hono<AppEnv>()
  .get("/:tenantId/billing", requireAuth, async (c) => {
    const m = await loadMembership(c);
    if (!m) return c.json({ error: "Anda bukan anggota perusahaan ini." }, 403);
    const { results } = await c.env.DB.prepare(
      `SELECT id, order_id, amount, period_months, status, transaction_status, paid_at, created_at
       FROM subscription_invoices WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 24`,
    )
      .bind(m.tenantId)
      .all<InvoiceRow>();
    const body: BillingStatus = {
      configured: billingConfigured(c.env),
      plan: m.row.plan,
      status: m.row.status,
      trialEndsAt: m.row.trial_ends_at,
      subscriptionEndsAt: m.row.subscription_ends_at,
      pricePerMonth: SINGLE_PLAN.pricePerMonth,
      invoices: results.map(toApiInvoice),
    };
    return c.json(body);
  })

  .post("/:tenantId/billing/checkout", requireAuth, async (c) => {
    const m = await loadMembership(c);
    if (!m) return c.json({ error: "Anda bukan anggota perusahaan ini." }, 403);
    if (m.row.role !== "owner") return c.json({ error: "Hanya Pemilik yang dapat mengatur langganan." }, 403);
    if (!billingConfigured(c.env)) {
      return c.json({ error: "Pembayaran online belum dikonfigurasi. Hubungi kami untuk aktivasi." }, 503);
    }

    const user = c.get("user");
    const amount = SINGLE_PLAN.pricePerMonth;
    const orderId = `sub-${m.tenantId.slice(0, 8)}-${Date.now()}`;
    const invoiceId = crypto.randomUUID();

    let redirectUrl: string;
    try {
      const res = await fetch(snapEndpoint(c.env), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Basic ${btoa(`${c.env.MIDTRANS_SERVER_KEY}:`)}`,
        },
        body: JSON.stringify({
          transaction_details: { order_id: orderId, gross_amount: amount },
          item_details: [
            { id: "langganan-bulanan", price: amount, quantity: 1, name: `Langganan ERPindo ${SINGLE_PLAN.label} (1 bulan)` },
          ],
          customer_details: { email: user.email, first_name: user.name },
          callbacks: { finish: `${appOrigin(c)}/app/pengaturan` },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect_url?: string; error_messages?: string[] };
      if (!res.ok || !data.redirect_url) {
        const detail = data.error_messages?.join("; ") || `HTTP ${res.status}`;
        console.error(`[billing] Snap gagal untuk ${orderId}: ${detail}`);
        return c.json({ error: "Gagal memulai pembayaran. Coba lagi sebentar." }, 502);
      }
      redirectUrl = data.redirect_url;
    } catch (err) {
      console.error(`[billing] Snap error untuk ${orderId}:`, err);
      return c.json({ error: "Gagal menghubungi gerbang pembayaran." }, 502);
    }

    await c.env.DB.prepare(
      `INSERT INTO subscription_invoices (id, tenant_id, order_id, amount, period_months, status, redirect_url, created_by)
       VALUES (?, ?, ?, ?, 1, 'pending', ?, ?)`,
    )
      .bind(invoiceId, m.tenantId, orderId, amount, redirectUrl, user.id)
      .run();
    await audit(c.env, {
      action: "billing.checkout",
      userId: user.id,
      tenantId: m.tenantId,
      detail: { orderId, amount },
      ip: clientIp(c),
    });
    return c.json({ orderId, redirectUrl }, 201);
  });

// Webhook Midtrans (publik) — di-mount di /api/billing.
export const billingWebhookRoutes = new Hono<AppEnv>().post("/notification", async (c) => {
  // Tanpa server key, abaikan dengan sopan (Midtrans mengharapkan 200).
  if (!billingConfigured(c.env)) return c.json({ ignored: true });
  const n = (await c.req.json().catch(() => ({}))) as {
    order_id?: string;
    status_code?: string;
    gross_amount?: string;
    signature_key?: string;
    transaction_status?: string;
    fraud_status?: string;
  };
  const valid = await midtransSignatureValid(c.env.MIDTRANS_SERVER_KEY as string, n);
  if (!valid) return c.json({ error: "Tanda tangan tidak sah." }, 403);

  const invoice = await c.env.DB.prepare(
    `SELECT si.id, si.tenant_id, si.status, si.period_months, t.subscription_ends_at, t.plan
     FROM subscription_invoices si JOIN tenants t ON t.id = si.tenant_id
     WHERE si.order_id = ?`,
  )
    .bind(n.order_id)
    .first<{ id: string; tenant_id: string; status: string; period_months: number; subscription_ends_at: string | null; plan: Plan }>();
  if (!invoice) return c.json({ ignored: true }); // ping/order tak dikenal

  const ts = n.transaction_status;
  const settled = (ts === "settlement" || ts === "capture") && n.fraud_status !== "deny";

  if (settled && invoice.status !== "paid") {
    const now = new Date().toISOString();
    const base = invoice.subscription_ends_at && invoice.subscription_ends_at > now ? invoice.subscription_ends_at : now;
    const newEnd = addMonths(base, invoice.period_months);
    // Pertahankan enum plan berbayar; naikkan 'trial' → 'business'.
    const newPlan: Plan = invoice.plan === "trial" ? "business" : invoice.plan;
    await c.env.DB.prepare(
      `UPDATE subscription_invoices SET status = 'paid', transaction_status = ?, paid_at = ? WHERE id = ?`,
    )
      .bind(ts ?? "settlement", now, invoice.id)
      .run();
    await c.env.DB.prepare(
      `UPDATE tenants SET status = 'active', plan = ?, subscription_ends_at = ? WHERE id = ?`,
    )
      .bind(newPlan, newEnd, invoice.tenant_id)
      .run();
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
       VALUES (?, ?, NULL, 'billing.paid', ?, NULL, ?)`,
    )
      .bind(crypto.randomUUID(), invoice.tenant_id, JSON.stringify({ orderId: n.order_id, until: newEnd }), now)
      .run();
    return c.json({ ok: true });
  }

  if (ts === "expire" || ts === "cancel" || ts === "deny") {
    await c.env.DB.prepare(
      `UPDATE subscription_invoices SET status = ?, transaction_status = ? WHERE id = ? AND status = 'pending'`,
    )
      .bind(ts === "expire" ? "expired" : "failed", ts, invoice.id)
      .run();
  }
  return c.json({ ok: true });
});

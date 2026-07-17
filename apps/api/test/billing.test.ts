import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv, Env } from "../src/env";
import { billingWebhookRoutes, midtransSignatureValid } from "../src/routes/billing";
import { sha512Hex } from "../src/lib/crypto";

/**
 * Fase 11b — webhook billing Midtrans. Jalur aktivasi tak menyentuh jaringan
 * (checkout memanggil Snap, itu diuji manual), jadi di sini kita verifikasi
 * tanda tangan + logika aktivasi lewat control-plane DB tiruan.
 */

const SERVER_KEY = "SB-Mid-server-TEST";

describe("midtransSignatureValid", () => {
  it("cocok untuk tanda tangan yang benar; tolak yang salah/kurang", async () => {
    const order_id = "sub-abc-1";
    const status_code = "200";
    const gross_amount = "389000.00";
    const signature_key = await sha512Hex(`${order_id}${status_code}${gross_amount}${SERVER_KEY}`);
    expect(await midtransSignatureValid(SERVER_KEY, { order_id, status_code, gross_amount, signature_key })).toBe(true);
    expect(await midtransSignatureValid(SERVER_KEY, { order_id, status_code, gross_amount, signature_key: "salah" })).toBe(false);
    expect(await midtransSignatureValid(SERVER_KEY, { order_id, status_code, gross_amount })).toBe(false);
  });
});

/** Control-plane DB tiruan untuk jalur webhook (1 invoice + 1 tenant). */
function fakeDb(state: {
  invoice: { id: string; order_id: string; tenant_id: string; status: string; period_months: number } | null;
  tenant: { status: string; plan: string; subscription_ends_at: string | null };
  audits: unknown[];
}) {
  return {
    prepare(sql: string) {
      const run = (params: unknown[]) => {
        if (/UPDATE subscription_invoices SET status = 'paid'/.test(sql)) {
          if (state.invoice) state.invoice.status = "paid";
        } else if (/UPDATE subscription_invoices SET status = \?/.test(sql)) {
          if (state.invoice && state.invoice.status === "pending") state.invoice.status = String(params[0]);
        } else if (/UPDATE tenants SET status = 'active'/.test(sql)) {
          state.tenant.status = "active";
          state.tenant.plan = String(params[0]);
          state.tenant.subscription_ends_at = String(params[1]);
        } else if (/INSERT INTO audit_logs/.test(sql)) {
          state.audits.push(params);
        }
        return Promise.resolve({});
      };
      const first = () => {
        if (/FROM subscription_invoices si JOIN tenants/.test(sql)) {
          if (!state.invoice) return Promise.resolve(null);
          return Promise.resolve({
            id: state.invoice.id,
            tenant_id: state.invoice.tenant_id,
            status: state.invoice.status,
            period_months: state.invoice.period_months,
            subscription_ends_at: state.tenant.subscription_ends_at,
            plan: state.tenant.plan,
          });
        }
        return Promise.resolve(null);
      };
      const handle = (params: unknown[]) => ({ run: () => run(params), first, all: () => Promise.resolve({ results: [] }) });
      return { bind: (...p: unknown[]) => handle(p), run: () => run([]), first, all: () => Promise.resolve({ results: [] }) };
    },
  };
}

function appWithDb(env: Partial<Env>) {
  const app = new Hono<AppEnv>();
  app.route("/api/billing", billingWebhookRoutes);
  return (body: unknown) =>
    app.request("/api/billing/notification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env as Env);
}

async function signedNotif(over: Record<string, string>) {
  const base = { order_id: "sub-abc-1", status_code: "200", gross_amount: "389000.00", ...over };
  const signature_key = await sha512Hex(`${base.order_id}${base.status_code}${base.gross_amount}${SERVER_KEY}`);
  return { ...base, signature_key };
}

describe("webhook notifikasi billing", () => {
  it("tanpa server key → diabaikan sopan (200)", async () => {
    const call = appWithDb({});
    const res = await call({ order_id: "x", transaction_status: "settlement" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
  });

  it("tanda tangan tidak sah → 403", async () => {
    const state = { invoice: { id: "i1", order_id: "sub-abc-1", tenant_id: "t1", status: "pending", period_months: 1 }, tenant: { status: "past_due", plan: "trial", subscription_ends_at: null }, audits: [] };
    const call = appWithDb({ MIDTRANS_SERVER_KEY: SERVER_KEY, DB: fakeDb(state) as unknown as Env["DB"] });
    const res = await call({ order_id: "sub-abc-1", status_code: "200", gross_amount: "389000.00", signature_key: "palsu", transaction_status: "settlement" });
    expect(res.status).toBe(403);
    expect(state.tenant.status).toBe("past_due"); // tak berubah
  });

  it("settlement + tanda tangan sah → invoice lunas + tenant aktif + langganan diperpanjang", async () => {
    const state = { invoice: { id: "i1", order_id: "sub-abc-1", tenant_id: "t1", status: "pending", period_months: 1 }, tenant: { status: "trial", plan: "trial", subscription_ends_at: null as string | null }, audits: [] as unknown[] };
    const call = appWithDb({ MIDTRANS_SERVER_KEY: SERVER_KEY, DB: fakeDb(state) as unknown as Env["DB"] });
    const res = await call(await signedNotif({ transaction_status: "settlement", fraud_status: "accept" }));
    expect(res.status).toBe(200);
    expect(state.invoice.status).toBe("paid");
    expect(state.tenant.status).toBe("active");
    expect(state.tenant.plan).toBe("business"); // trial dinaikkan
    expect(state.tenant.subscription_ends_at).toBeTruthy();
    expect(Date.parse(state.tenant.subscription_ends_at as string)).toBeGreaterThan(Date.now());
    expect(state.audits.length).toBe(1);
  });

  it("order tak dikenal → diabaikan (200) tanpa efek", async () => {
    const state = { invoice: null, tenant: { status: "trial", plan: "trial", subscription_ends_at: null }, audits: [] };
    const call = appWithDb({ MIDTRANS_SERVER_KEY: SERVER_KEY, DB: fakeDb(state) as unknown as Env["DB"] });
    const res = await call(await signedNotif({ transaction_status: "settlement" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true });
    expect(state.tenant.status).toBe("trial");
  });
});

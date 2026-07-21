import {
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_SIGNATURE_HEADER,
  webhookBackoffSeconds,
  type WebhookEvent,
} from "@erpindo/shared";
import type { Env } from "../env";
import { hmacSha256Hex } from "./crypto";

/**
 * Webhook keluar (Fase 13h). `emitWebhook` mengantre satu pengiriman per
 * webhook aktif yang melanggan peristiwa; `runWebhookDeliveries` (dipanggil cron)
 * mengirim antrean dengan tanda tangan HMAC + retry berjenjang. Kegagalan
 * mengantre TIDAK boleh menggagalkan transaksi bisnis — dibungkus try/catch.
 */

function nowIso(): string {
  return new Date().toISOString();
}

/** Antre pengiriman webhook untuk sebuah peristiwa tenant. Best-effort. */
export async function emitWebhook(
  env: Env,
  tenantId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, events FROM webhooks WHERE tenant_id = ? AND active = 1`,
    )
      .bind(tenantId)
      .all<{ id: string; events: string }>();
    if (results.length === 0) return;

    const payload = JSON.stringify({ event, tenantId, occurredAt: nowIso(), data });
    const stmts = [];
    for (const wh of results) {
      let events: string[] = [];
      try {
        events = JSON.parse(wh.events) as string[];
      } catch {
        events = [];
      }
      if (!events.includes(event)) continue;
      stmts.push(
        env.DB.prepare(
          `INSERT INTO webhook_deliveries (id, webhook_id, tenant_id, event, payload, status, attempts, next_attempt_at, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
        ).bind(crypto.randomUUID(), wh.id, tenantId, event, payload, nowIso(), nowIso()),
      );
    }
    if (stmts.length > 0) await env.DB.batch(stmts);
  } catch (err) {
    console.error(`[webhook] gagal mengantre ${event} untuk tenant ${tenantId}:`, err);
  }
}

/**
 * Kirim satu payload ke URL webhook dengan tanda tangan HMAC. Mengembalikan
 * status HTTP (atau 0 bila galat jaringan). Timeout 10 detik.
 */
async function deliverOne(url: string, secret: string, payload: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const signature = await hmacSha256Hex(secret, payload);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: `sha256=${signature}`,
      },
      body: payload,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "network-error" };
  }
}

/**
 * Proses antrean pengiriman webhook yang jatuh tempo. Dipanggil cron (dan bisa
 * dipicu manual di uji). `limit` menjaga anggaran waktu cron.
 */
export async function runWebhookDeliveries(env: Env, limit = 50): Promise<{ delivered: number; failed: number; retried: number }> {
  const now = nowIso();
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.webhook_id, d.payload, d.attempts, w.url, w.secret
     FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
     WHERE d.status = 'pending' AND d.next_attempt_at <= ?
     ORDER BY d.next_attempt_at ASC LIMIT ?`,
  )
    .bind(now, limit)
    .all<{ id: string; webhook_id: string; payload: string; attempts: number; url: string; secret: string }>();

  let delivered = 0;
  let failed = 0;
  let retried = 0;

  for (const d of results) {
    const attempt = d.attempts + 1;
    const result = await deliverOne(d.url, d.secret, d.payload);
    const lastStatus = result.ok ? `ok ${result.status}` : result.error ? `error ${result.error}` : `http ${result.status}`;

    if (result.ok) {
      await env.DB.prepare(`UPDATE webhook_deliveries SET status = 'delivered', attempts = ?, last_error = NULL WHERE id = ?`)
        .bind(attempt, d.id)
        .run();
      delivered++;
    } else if (attempt >= WEBHOOK_MAX_ATTEMPTS) {
      await env.DB.prepare(`UPDATE webhook_deliveries SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?`)
        .bind(attempt, lastStatus, d.id)
        .run();
      failed++;
    } else {
      const next = new Date(Date.now() + webhookBackoffSeconds(attempt) * 1000).toISOString();
      await env.DB.prepare(`UPDATE webhook_deliveries SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?`)
        .bind(attempt, next, lastStatus, d.id)
        .run();
      retried++;
    }

    // Ringkasan status terakhir di webhook (untuk UI).
    await env.DB.prepare(`UPDATE webhooks SET last_status = ?, last_attempt_at = ? WHERE id = ?`)
      .bind(lastStatus, now, d.webhook_id)
      .run();
  }

  return { delivered, failed, retried };
}

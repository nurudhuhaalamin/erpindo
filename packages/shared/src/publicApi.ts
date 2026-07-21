import { z } from "zod";

/**
 * API publik + webhook (Fase 13h) — pembeda paket Enterprise (modul `apiAccess`).
 * Integrator memakai API key per perusahaan (Bearer) untuk membaca/menulis
 * subset data terkurasi, dan webhook untuk menerima notifikasi peristiwa.
 */

/** Skop akses API key: baca-saja atau baca-tulis. */
export const API_SCOPES = ["read", "write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Prefix kunci publik agar mudah dikenali & dicabut bila bocor. */
export const API_KEY_PREFIX = "erpk_";

/** Peristiwa webhook yang bisa dilanggan integrator. */
export const WEBHOOK_EVENTS = ["invoice.created", "payment.received", "stock.low"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "invoice.created": "Faktur penjualan dibuat",
  "payment.received": "Pembayaran diterima",
  "stock.low": "Stok menipis (di bawah minimum)",
};

/** Header tanda tangan HMAC-SHA256 pada setiap pengiriman webhook. */
export const WEBHOOK_SIGNATURE_HEADER = "X-Erpindo-Signature";

export const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(60),
  scope: z.enum(API_SCOPES).default("read"),
});
export type ApiKeyInput = z.infer<typeof apiKeySchema>;

export const webhookSchema = z.object({
  url: z.string().trim().url("URL webhook tidak valid").max(500),
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1, "Pilih minimal satu peristiwa")
    .max(WEBHOOK_EVENTS.length),
});
export type WebhookInput = z.infer<typeof webhookSchema>;

/** Metadata API key untuk UI (kunci penuh HANYA ditampilkan sekali saat dibuat). */
export type ApiApiKey = {
  id: string;
  name: string;
  scope: ApiScope;
  /** Prefix + beberapa karakter awal (mis. "erpk_ab12…") untuk identifikasi. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type ApiWebhook = {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
  lastStatus: string | null;
  lastAttemptAt: string | null;
};

/** Hitung jeda percobaan ulang webhook (detik) — backoff eksponensial sederhana. */
export function webhookBackoffSeconds(attempt: number): number {
  // attempt 1→60s, 2→300s, 3→1500s, dst. (×5), dibatasi 6 jam.
  return Math.min(60 * Math.pow(5, Math.max(0, attempt - 1)), 6 * 3600);
}

/** Batas percobaan pengiriman webhook sebelum dianggap gagal permanen. */
export const WEBHOOK_MAX_ATTEMPTS = 5;

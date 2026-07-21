# Log Kerja — Fase 13h: API publik (Bearer) + webhook + halaman dokumentasi

**Tanggal:** 21 Juli 2026.

## Yang dikerjakan

Modul `apiAccess` (paket Enterprise) kini punya API publik terkurasi + webhook —
pembeda untuk integrator (toko online, aplikasi kasir, sistem internal).

1. **API key per perusahaan (Bearer).** Buat/cabut di Pengaturan → Lainnya → API &
   Integrasi (khusus Owner). Kunci `erpk_…` di-hash SHA-256 di control-plane (nilai
   penuh hanya tampil sekali). Skop `read` / `write`. Middleware `requireApiKey(scope)`
   menyematkan konteks tenant tanpa cookie, menegakkan paket Enterprise (turun paket →
   403 `plan-upgrade-required`) dan skop (tulis pakai kunci read → 403 `insufficient-scope`).
2. **Endpoint `/api/v1` terkurasi:**
   - Baca: `GET /contacts`, `/products`, `/invoices`, `/payments`, `/reports/summary`.
   - Tulis: `POST /contacts`, `/products` (skop write).
   - Basis URL tanpa ID perusahaan (kunci sudah menentukan tenant); `?limit`/`?offset`.
3. **Webhook.** Daftar URL + peristiwa (`invoice.created`, `payment.received`,
   `stock.low`); secret HMAC `whsec_…` (tampil sekali). `emitWebhook()` mengantre
   pengiriman saat peristiwa terjadi (dipasang di faktur, penerimaan pembayaran, dan
   penyesuaian stok yang menembus minimum). `runWebhookDeliveries()` (cron harian +
   tombol flush manual) mengirim JSON bertanda tangan `X-Erpindo-Signature: sha256=…`
   (HMAC-SHA256 body) dengan retry berjenjang (×5, 60s→…→6 jam, maks 5 percobaan).
4. **Halaman dokumentasi** `/api-docs` — SSR oleh Worker (masuk `run_worker_first`),
   menjelaskan autentikasi, endpoint, contoh curl, dan verifikasi tanda tangan webhook.

### Berkas

- `packages/shared/src/publicApi.ts` (baru): `apiKeySchema`, `webhookSchema`,
  `API_SCOPES`, `WEBHOOK_EVENTS` + label, `webhookBackoffSeconds`, tipe `ApiApiKey`/`ApiWebhook`.
- `packages/db/src/migrations.ts`: control-plane `0014_public_api` (`api_keys`,
  `webhooks`, `webhook_deliveries`).
- `apps/api/src/lib/crypto.ts`: `hmacSha256Hex`. `apps/api/src/lib/webhooks.ts` (baru):
  `emitWebhook` + `runWebhookDeliveries`.
- `apps/api/src/routes/publicApi.ts` (baru): middleware `requireApiKey` + rute kelola
  key/webhook + router `/api/v1`. `routes/apiDocs.ts` (baru): halaman SSR.
- `apps/api/src/middleware/auth.ts`: peta `api-keys`/`webhooks` → `apiAccess`.
- `apps/api/src/index.ts`: daftarkan rute + `/api-docs` + pengiriman webhook di cron.
- `apps/api/src/routes/commerce.ts`: emit `invoice.created` / `payment.received` / `stock.low`.
- `apps/web`: klien + kartu **API & Integrasi** (kelola key + webhook; upsell via 403).
- `wrangler.jsonc`: `/api-docs` di `run_worker_first`.

## Batas cakupan (jujur)

- **Tulis** via API v1 sengaja terbatas ke kontak & produk (insert sederhana). Faktur &
  pembayaran **baca-saja** — pembuatannya memposting jurnal double-entry; membukanya lewat
  API menuntut kurasi & pengujian tersendiri (dicatat sebagai perluasan Fase 14).
- Pengiriman webhook diuji sampai transisi status terminal (`delivered`/`failed`,
  `attempts≥1`) terhadap URL nyata; tanda tangan HMAC diverifikasi deterministik lewat
  unit test (termasuk vektor RFC 4231). Retry dijadwalkan cron harian.

## Validasi

- **Unit 115 → 127** (+12): `apiKeySchema`/`webhookSchema` (default skop, tolak URL/
  peristiwa tak valid), `webhookBackoffSeconds` (backoff + batas 6 jam), `hmacSha256Hex`
  (deterministik, berubah tiap secret/pesan, cocok vektor RFC 4231).
- **Smoke 819 → 835** (+16): buat key read+write, 401 tanpa/salah key, GET /products,
  403 insufficient-scope, POST kontak/produk (write), summary, cabut key → 401, gate paket
  Business → 403, webhook 201 + secret, faktur memicu antrean, flush → pengiriman diproses,
  `/api-docs` SSR. `makeClient` tetap; klien v1 memakai `fetch` Bearer langsung.
- **UI-sim 180 → 181** (+1): tab Lainnya menampilkan kartu API & Integrasi.
- typecheck 4/4 · lint bersih · build. Guard RBAC diperbarui: `requireApiKey` diakui
  sebagai penjaga setara `requireAuth`; `/api-docs` masuk daftar putih publik.

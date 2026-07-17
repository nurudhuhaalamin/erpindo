# Fase 11b — Billing langganan via Midtrans (pemblokir launching #1)

**Tanggal:** 17 Juli 2026
**Branch/PR:** `claude/erp-business-planning-8wx296` → PR #82 (akumulasi Fase 11)
**Uji:** typecheck 4/4 · lint bersih · **31 unit** (+5 `billing.test.ts`) · build · **smoke 759** (+5) · **ui-sim 160**

Sekarang ERPindo bisa **menarik pembayaran langganan sendiri** — syarat mutlak jualan. Dibangun
"siap-pakai, degradasi anggun": lengkap & teruji, aktif otomatis begitu kunci Midtrans dipasang,
tanpa kunci UI menampilkan info & checkout membalas 503 (tidak memalsukan).

## Alur

1. Pemilik buka **Pengaturan → Langganan** → tombol **Berlangganan / Perpanjang**.
2. `POST /billing/checkout` membuat `subscription_invoice` (pending) + transaksi **Snap** →
   mengembalikan `redirect_url`. Browser **di-redirect** ke halaman bayar Midtrans (BUKAN popup
   `snap.js`) — sengaja, agar aman terhadap CSP `script-src 'self'` (Fase 10h).
3. Pengguna bayar (QRIS / transfer / kartu / e-wallet).
4. Midtrans memanggil webhook `POST /api/billing/notification`. Tanda tangan diverifikasi
   **SHA-512(order_id + status_code + gross_amount + server_key)**. Bila `settlement`/`capture` →
   invoice `paid`, tenant `status='active'`, `subscription_ends_at` diperpanjang 1 bulan
   (plan `trial` dinaikkan ke `business`; enum lama tak diubah).
5. Cron harian menurunkan `active → past_due` saat `subscription_ends_at` lewat (comped =
   `subscription_ends_at` NULL → tak tersentuh) + email pemberitahuan ke Pemilik.

## Perubahan

- **Migrasi control-plane `0008_billing`:** tabel `subscription_invoices` (order_id unik, status
  pending/paid/failed/expired, redirect_url, paid_at) + `ALTER tenants ADD subscription_ends_at`.
- **`env.ts`:** `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION` (sandbox default).
- **`routes/billing.ts`:** `GET /:tenantId/billing` (status + riwayat), `POST /:tenantId/billing/checkout`
  (owner-only, Snap), webhook publik `POST /api/billing/notification` (verifikasi tanda tangan).
  Endpoint tenant sengaja pakai `requireAuth` + cek keanggotaan/owner MANUAL (bukan
  `requireTenantRole`) supaya tenant **past_due tetap bisa membayar** (requireTenantRole memblokir
  tulis saat past_due). Diallowlist di `rbac-guard.test.ts`.
- **`lib/crypto.ts`:** `sha512Hex` (verifikasi tanda tangan webhook).
- **`index.ts`:** mount rute + cron `active → past_due` saat langganan lewat.
- **`/me` + `ApiMembership`:** tambah `subscriptionEndsAt` (additive).
- **Web `SubscriptionCard`:** status hidup (trial sisa hari / aktif s/d tanggal / past_due), tombol
  berlangganan (redirect Snap), riwayat tagihan; tanpa konfigurasi → info "hubungi kami".

## Uji
- **Unit (`billing.test.ts`, 5):** `midtransSignatureValid` (benar/salah/kurang field); webhook —
  tanpa kunci diabaikan, tanda tangan salah 403, `settlement` sah → invoice lunas + tenant aktif +
  langganan diperpanjang, order tak dikenal diabaikan.
- **Smoke (+5):** billing 401 tanpa sesi; status 200 `configured=false` + harga Rp389.000; checkout
  503 tanpa kunci; checkout non-Pemilik 403; webhook tanpa kunci 200 diabaikan.

## Menyalakan di produksi (pending pemilik)
Set secret `MIDTRANS_SERVER_KEY` (dari dashboard Midtrans; sandbox `SB-Mid-server-...` untuk uji,
lalu key produksi) + opsional `MIDTRANS_IS_PRODUCTION=true`. Daftarkan URL webhook
`https://<domain>/api/billing/notification` di Pengaturan Midtrans (Payment Notification URL).
Setelah itu tombol berlangganan langsung aktif — tanpa deploy ulang kode.

# Fase 11d — Tagih pelanggan: payment link (Midtrans) + WhatsApp share

**Tanggal:** 17 Juli 2026
**Branch/PR:** `claude/erp-business-planning-8wx296` → PR #82 (akumulasi Fase 11)
**Uji:** typecheck 4/4 · lint bersih · **unit 49** (+4: shared 17, api 32) · build · **smoke 765** (+4) · **ui-sim 160**

UMKM kini bisa **menagih pelanggan lebih cepat**: satu tombol **"Tagih (WA)"** di faktur
penjualan menyiapkan pesan tagihan di WhatsApp, lengkap dengan **link pembayaran online** (Midtrans)
bila diaktifkan. Reuse penuh infrastruktur billing 11b.

## Dua kemampuan
1. **WhatsApp share (tanpa kunci, langsung jalan):** helper `waLink()` (shared) + tombol "Tagih (WA)".
   Pesan berisi nomor faktur, sisa tagihan, dan (bila ada) link bayar → dibuka via `wa.me` (pengguna
   memilih kontak) + disalin ke clipboard. **Tak butuh API/kunci apa pun.**
2. **Payment link (Midtrans Snap):** buat transaksi Snap untuk sisa tagihan faktur → `redirect_url`
   yang bisa dibagikan. Pelanggan bayar via QRIS/transfer/kartu/e-wallet; webhook terverifikasi
   menandai link **lunas**. Pencatatan ke buku besar tetap aksi Pemilik (alur "Terima Pembayaran"
   yang sudah ada) — sengaja tidak auto-posting agar aman terhadap kunci periode & valas.

## Perubahan
- **`billing.ts`:** ekstrak `createSnapTransaction()` (dipakai bersama langganan & payment link;
  perilaku checkout langganan identik). Webhook diperluas: bila order bukan langganan → cek
  `payment_links` → tandai lunas/kadaluwarsa + audit `collection.paid`.
- **Migrasi control-plane `0009_payment_links`:** tabel `payment_links` (order_id unik, status,
  redirect_url, paid_at).
- **`routes/collections.ts`:** `GET/POST /:tenantId/invoices/:id/payment-link`. Sengaja pakai
  `requireAuth` + cek keanggotaan/peran MANUAL (bukan `requireTenantRole`) agar tenant **past_due
  tetap bisa menagih pelanggannya** — justru cara mereka memulihkan langganan (mirip endpoint
  billing). Diallowlist di `rbac-guard.test.ts`.
- **`shared`:** `waLink()` (normalisasi nomor ID → 62, encode teks) + `ApiPaymentLink`.
- **Web `commerce.tsx`:** tombol "Tagih (WA)" pada faktur penjualan ber-sisa-tagihan (admin+).
  Degradasi anggun: bila Midtrans nonaktif/gagal, pesan tetap terkirim tanpa link bayar.

## Uji
- **Unit (+4):** `waLink` normalisasi/encode/null (shared, 3); webhook payment link → link lunas +
  audit (api, 1).
- **Smoke (+4):** payment-link status 200 (configured=false, link null); buat link tanpa Midtrans →
  503; viewer → 403; tanpa sesi → 401. (Membuktikan past_due tetap boleh menagih + degradasi + RBAC.)

## Menyalakan di produksi
Payment link aktif otomatis begitu `MIDTRANS_SERVER_KEY` dipasang (sama dengan billing 11b) — satu
kunci mengaktifkan langganan DAN payment collection. WhatsApp share sudah aktif tanpa kunci.

## Catatan increment berikutnya
Bank-feed agregator (Brick/Ayoconnect) + auto-rekonsiliasi v2 dan WhatsApp Business API (kirim
otomatis) menyusul saat kunci tersedia; rekonsiliasi manual (CSV) sudah ada sejak Fase 5d/7f.

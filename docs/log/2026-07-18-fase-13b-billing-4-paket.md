# Log Kerja — Fase 13b: Billing 4 paket + penegakan paket + pemilih paket UI

**Tanggal:** 18 Juli 2026.

## Yang dikerjakan

1. **Checkout per paket** (`apps/api/src/routes/billing.ts`) — `POST /billing/checkout`
   kini menerima `{ plan: starter|business|enterprise }` (`checkoutSchema`), harga dari
   `PLAN_LIMITS[plan].pricePerMonth`. Paket yang dibeli disimpan di kolom baru
   `subscription_invoices.plan` (migrasi `0011_invoice_plan`); **webhook** Midtrans
   mengaktifkan paket yang tertulis di invoice (bukan mewarisi paket lama). Status billing
   kini melaporkan harga per paket + flag `legacyFullAccess`.
2. **Seam admin set-plan** (`POST /api/admin/tenants/:id/plan`, platform admin) — set
   paket/status/legacy secara manual. Kegunaan produksi: grant paket, koreksi, comped,
   grandfather. Sekaligus **seam deterministik** untuk menguji penegakan paket di smoke.
3. **Pagar trial** (`POST /companies`) — satu perusahaan berstatus trial per akun
   (non-comped). Menutup celah "beli 1 akses lalu farming trial gratis dengan menambah
   perusahaan"; perusahaan tambahan diizinkan setelah ada perusahaan berbayar.
4. **Perbaikan penegakan paket 13a (bug kebocoran).** Pembungkus per-router `planGated`
   dengan pola `/:tenantId/*` **bocor** — gerbang CRM menangkap `/cost-centers`, dst.
   Diganti **satu middleware global** `enforcePlanByPath` di `/api/tenants/:tenantId/*`
   yang memetakan segmen path pertama → modul (`MODULE_ROUTE_PREFIXES`) lalu memanggil
   `requirePlanModule`. Presisi: segmen inti (mis. `reports`) tidak dipetakan sehingga
   laporan inti tak ikut tergerbang; endpoint dimensi hanya `cost-centers` &
   `bank-match-rules` yang digerbangi.
5. **Pemilih paket di Pengaturan** (`apps/web/src/pages/settings.tsx`) — kartu 3 paket
   (Starter/Business/Enterprise + harga + ringkasan fitur; Business berbadge "Populer"),
   sorot paket aktif, tombol checkout per paket. Pelanggan grandfather melihat badge
   "akses penuh (pelanggan awal)" + ucapan terima kasih. `api.billingCheckout(tenantId, plan)`.

## Validasi

- Smoke **786 → 796** (+10): matriks modul × paket lengkap (Starter/Business/Enterprise:
  inti terbuka, operasional/skala 403 `plan-upgrade-required` dengan `requiredPlan` benar),
  grandfather membuka semua, set-plan non-admin 403, pagar trial 402 `trial-limit`,
  checkout paket tak dikenal 400. Uji dipakai perusahaan kedua yang sudah ada (hindari
  batas pool DB tenant lokal + rate-limit register).
- UI-sim **169 → 170** (+1): tab Langganan menampilkan 3 kartu paket + harga Rp999.000.
  Email demo ui-sim ditandai comped agar seed bisa membuat perusahaan kedua (kebal pagar trial).
- Unit test billing diperbarui: webhook mengaktifkan paket dari invoice (bukan fallback
  trial→business). Total unit 99 · typecheck 4/4 · lint bersih · build.

## Catatan
- Downgrade/prorata dijaga sederhana: paket baru berlaku sejak pembayaran; perpanjangan
  menumpuk dari `subscription_ends_at`. Prorata granular = penyempurnaan lanjutan.
- Bundling entitas Enterprise (3 termasuk, +Rp750rb/entitas) belum ditagihkan otomatis —
  `maxEntities` sudah ada di `PLAN_LIMITS`; penagihan entitas menyusul.

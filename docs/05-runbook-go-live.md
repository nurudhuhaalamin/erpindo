# Runbook Go-Live ERPindo

> Panduan operasional mengubah "aplikasi jadi" menjadi "aplikasi menghasilkan".
> Ditujukan ke pemilik + operator rilis. Semua nama secret & perilaku di sini
> **diverifikasi langsung dari kode** (`apps/api/src/env.ts` dan handler terkait),
> bukan asumsi.

**Status dasar:** aplikasi sudah live di Cloudflare Workers (auto-deploy dari
`main`). Yang tersisa untuk komersialisasi hampir seluruhnya **memasang kunci**,
bukan menulis kode — tiap fitur berkunci sudah *degradasi anggun* (menampilkan
instruksi/pesan jelas, bukan error) sampai kuncinya dipasang.

---

## 1. Empat kunci yang perlu dipasang

Semua disimpan sebagai **secret terenkripsi** di dashboard Cloudflare
(Workers & Pages → **erpindo** → Settings → Variables and Secrets), atau via CLI
`wrangler secret put <NAMA>`. Jangan pernah menaruhnya di repo.

### 1a. Midtrans — tarik pembayaran langganan (pemblokir monetisasi #1)

| Secret | Isi |
|---|---|
| `MIDTRANS_SERVER_KEY` | Server Key dari dashboard Midtrans (Settings → Access Keys) |
| `MIDTRANS_IS_PRODUCTION` | `"true"` untuk produksi; kosong/apa pun lain = **sandbox** |

- **Membuka:** checkout langganan (QRIS/VA/kartu/e-wallet), aktivasi otomatis via
  webhook bertanda tangan, link bayar faktur pelanggan (Fase 11d).
- **Tanpa kunci:** `GET /api/billing` membalas `configured:false`; checkout
  membalas `503 "Pembayaran online belum dikonfigurasi…"` (bukan error keras).
- **Urutan aman:** pasang **sandbox** dulu (tanpa `MIDTRANS_IS_PRODUCTION`),
  jalankan uji §3, baru set `MIDTRANS_IS_PRODUCTION="true"` dengan server key
  produksi.
- **Webhook:** daftarkan Payment Notification URL Midtrans ke
  `https://<domain>/api/billing/notification` (verifikasi tanda tangan sudah ada).

### 1b. Google OAuth — login Google + backup Drive

| Secret | Isi |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Client ID (console.cloud.google.com) |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |

- Buat OAuth Client (tipe Web) dengan **dua** Authorized redirect URI:
  - `https://<domain>/api/auth/google/callback` (login)
  - `https://<domain>/api/drive/callback` (backup Drive)
- **Membuka:** tombol "Lanjutkan dengan Google" + backup terenkripsi ke Drive.
- **Tanpa kunci:** `GET /api/drive/status` → `configured:false` (UI menyembunyikan/
  menonaktifkan tombol); endpoint auth Google membalas `503 "belum dikonfigurasi"`.

### 1c. Admin Platform

| Secret | Isi |
|---|---|
| `PLATFORM_ADMIN_EMAILS` | email Anda (pisah koma bila >1) |

- **Membuka:** menu **Admin** (`/app/admin`) — pantau pendaftar, langganan,
  masukan pengguna, tulis blog.
- **Tanpa var:** seluruh `/api/admin` membalas **403** (aman secara default).

### 1d. Email transaksional (Resend) — opsional tapi disarankan

| Secret | Isi |
|---|---|
| `RESEND_API_KEY` | API key Resend |
| `MAIL_FROM` | mis. `ERPindo <no-reply@erpindo.id>` (default sudah ada) |

- **Membuka:** email nyata (verifikasi, lupa sandi, pengingat trial/tagihan).
- **Tanpa kunci:** `ConsoleMailer` — email hanya **dicatat ke log**, aplikasi tidak
  gagal. Cocok untuk staging; wajib untuk produksi agar pengguna terima email.

> **Catatan:** Lampiran file (Fase 2m, butuh **R2**) **belum dibangun** — tidak
> ada binding R2 di kode saat ini, jadi tidak ada yang perlu dinyalakan sampai
> fiturnya dibuat. Provisioning D1 dinamis (skala >6 tenant) memakai
> `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` — aktifkan hanya saat menjelang
> skala komersial.

---

## 2. Ringkasan degradasi anggun (terverifikasi kode)

| Fitur | Tanpa kunci | Dengan kunci |
|---|---|---|
| Billing/langganan | `configured:false`, checkout `503` berpesan | Checkout + aktivasi otomatis |
| Login/Drive Google | `configured:false`, tombol nonaktif | Login Google + backup Drive |
| Admin Platform | `/api/admin` → `403` | Menu Admin aktif untuk email terdaftar |
| Email (Resend) | dicatat ke log (tak gagal) | Email nyata terkirim |
| Asisten AI | `503 "binding-absent"`, kuota tak terpotong | AI menjawab |

Prinsip ini **diuji deterministik** di smoke — jadi memasang/mencabut kunci tidak
akan membuat aplikasi gagal keras.

---

## 3. Uji langganan sandbox (sebelum produksi)

1. Set `MIDTRANS_SERVER_KEY` sandbox (tanpa `MIDTRANS_IS_PRODUCTION`).
2. Daftarkan webhook Midtrans → `/api/billing/notification`.
3. Buat perusahaan uji → Pengaturan → Langganan → pilih paket → checkout.
4. Bayar dengan **simulator sandbox** Midtrans.
5. Verifikasi: webhook masuk → langganan **otomatis aktif** → banner baca-saja
   hilang. Cek juga skenario gagal/expire → status tidak aktif.
6. Uji **link bayar faktur** (Fase 11d) ke pelanggan.
7. Bila semua benar → ganti ke server key **produksi** + `MIDTRANS_IS_PRODUCTION="true"`.

---

## 4. Checklist pra-peluncuran

**Gerbang mutu (harus hijau — sudah otomatis di CI):**
- [ ] `pnpm typecheck && pnpm test && pnpm build && pnpm smoke` (850 smoke · 222 unit)
- [ ] `node scripts/ui-sim.mjs` (184 cek browser)
- [ ] `pnpm lint`

**Konfigurasi produksi:**
- [ ] Domain kustom dipasang (Workers → Custom Domains) & redirect URI Google
      menunjuk domain final
- [ ] Empat kunci §1 terpasang (Midtrans **produksi**, Google, admin, Resend)
- [ ] `COMPED_EMAILS` berisi email pemilik (akun kebal trial) bila diperlukan
- [ ] Seed demo produksi masih tampil sehat (`/app` mode demo, neraca seimbang)

**Uji asap manual pasca-deploy (di domain produksi):**
- [ ] Daftar perusahaan baru → login → buat faktur → terima pembayaran → Neraca seimbang
- [ ] POS: buka shift → jual tunai → kembalian benar → tutup shift
- [ ] Asisten AI menjawab (HTTP 200) — bila 503, cek binding Workers AI
- [ ] Email verifikasi/lupa-sandi benar-benar terkirim (Resend)
- [ ] Checkout langganan produksi (nominal kecil) → aktivasi otomatis
- [ ] Login Google berhasil → pendaftar baru hanya ditanya nama perusahaan
- [ ] Menu Admin muncul untuk email di `PLATFORM_ADMIN_EMAILS`

---

## 5. Pasca-peluncuran

- **Pantauan:** Cloudflare → Workers → erpindo → Logs/Analytics; tab **Infra** di
  Admin Platform (mode DB, versi skema, tenant tertinggal migrasi).
- **Rollback:** Workers Builds menyimpan riwayat deploy — kembalikan ke deploy
  hijau sebelumnya bila ada regresi. Semua migrasi tenant **maju & idempoten**.
- **Skala:** saat mendekati 6 tenant, aktifkan D1 dinamis (`CLOUDFLARE_API_TOKEN`
  + `CLOUDFLARE_ACCOUNT_ID`, `TENANT_DB_MODE=cloudflare`) — runbook di
  `docs/log/2026-07-17-fase-11a-skala-migrasi.md`.
- **Kuota AI:** Workers AI gratis ~10rb neuron/hari; fitur AI dibatasi per tenant.
  Bila laris, Workers AI berbayar murah (bayar per neuron) & bisa dibebankan ke
  paket Enterprise.

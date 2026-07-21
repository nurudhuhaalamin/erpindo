# Laporan Akhir — Fase 13: Monetisasi 4 paket + reposisi + multibahasa + fitur mid-market

**Tanggal:** 21 Juli 2026.

## Ringkasan

Fase 13 mengubah ERPindo dari "satu harga Rp389rb" menjadi **produk berpaket 4 tingkat**
siap jual ke pasar menengah–besar, plus fondasi multibahasa dan tiga fitur pembeda
(migrasi saldo awal, keamanan enterprise, API publik). Setiap sub-fase **di-merge saat
selesai** (bukan ditumpuk) sesuai arahan pemilik — enam PR berurutan.

## Yang dikirim

| Sub-fase | Isi | PR |
|---|---|---|
| 13a–13c | 4 paket (Trial/Starter/Business/Enterprise) + penegakan modul per-path + billing per paket + kartu upsell + landing harga/kalkulator/perbandingan kategori/form demo/halaman Layanan | #84 |
| 13d | Fondasi i18n ID/EN (store `useSyncExternalStore`, tanpa pustaka) + landing dwibahasa | #85 |
| 13f | Wizard migrasi & saldo awal — CSV → jurnal pembuka seimbang otomatis (selisih ke Ekuitas), nilai persediaan sinkron | #86 |
| 13e | Multibahasa gelombang 2 — shell aplikasi (44 rute) + dashboard | #87 |
| 13g | Keamanan enterprise — 2FA wajib per tenant, pembatasan IP (CIDR IPv4), ekspor audit CSV, katup anti-lockout | #88 |
| 13h | API publik (Bearer key skop read/write) + `/api/v1` terkurasi + webhook (HMAC + retry) + `/api-docs` SSR | #89 |

## Prinsip yang dipegang

- Paket dibedakan oleh **kedalaman operasional & skala, bukan jumlah user** (tak terbatas di semua paket).
- **Akuntansi inti tak pernah dipotong**; trial = akses penuh; pelanggan lama Rp389rb di-grandfather.
- Perbandingan pesaing **implisit per kategori** (tanpa merek).
- Semua keputusan bisnis terpusat di `packages/shared/src/core.ts` (geser modul = satu baris).

## Arsitektur penting yang diperkenalkan

- **`enforcePlanByPath`** — satu middleware global memetakan segmen path → modul → `403
  plan-upgrade-required` (menggantikan pembungkus per-router yang bocor).
- **i18n tanpa pustaka** — store modul-level + `useLang`/`useT`; Playwright ui-sim di-`locale: id-ID`.
- **Keamanan enterprise di `requireTenantRole`** — IP → 2FA, dengan pengecualian endpoint `…/security`.
- **API key Bearer + webhook** — `requireApiKey(scope)`, HMAC-SHA256 (`hmacSha256Hex`), antrean
  `webhook_deliveries` dengan backoff berjenjang, dikirim cron + flush manual.

## Angka validasi (hanya naik, per konvensi CLAUDE.md)

| Gerbang | Awal Fase 13 | Akhir Fase 13 |
|---|---|---|
| Unit test | 90 | **127** |
| Smoke (end-to-end) | 784 | **835** |
| UI-sim (Chromium nyata) | 169 | **181** |
| Typecheck | 4/4 | 4/4 |
| Lint | 0 error | 0 error |

## Batas jujur / sisa

- **i18n**: halaman modul transaksi masih Indonesia (ekor panjang) — kamus & pola siap, dimigrasi bertahap.
- **API tulis** terbatas kontak & produk; faktur/pembayaran baca-saja (pembuatan memposting jurnal).
- **13i (kustomisasi dokumen)** belum dikerjakan — opsional, dicatat di roadmap §23.
- Pembayaran nyata menunggu **Server Key Midtrans**; skala >6 tenant menunggu **D1 dinamis** dinyalakan.

## Dokumen diperbarui

- `docs/STATUS.md` (pemilik) — baris Fase 13 + angka uji terbaru.
- `docs/03-roadmap-lanjutan.md` §23 — kondisi terkini + centang item selesai.
- `docs/04-rencana-monetisasi-tier.md` (baru) — rencana pemaketan versi repo.
- `README.md` — status matang + tabel pemaketan.

# Log Kerja — Fase 4a: Akun Bebas Langganan (Comped) + Skrip Seed Demo

**Tanggal:** 9 Juli 2026 · **Konteks:** PR pertama dari rangkaian Fase 4 (landing baru, UI/UX
refresh, panduan, AI, akun utama + demo). Fondasi untuk butir 7 (akun pemilik bebas batasan
langganan) dan butir 8 (login berisi data lengkap untuk review).

## Yang dikerjakan

1. **`COMPED_EMAILS`** (env/secret, dipisah koma, case-insensitive): email pada daftar ini
   mendapat tenant `status='active'` + `plan='enterprise'` + `trial_ends_at=NULL` saat register
   **dan** saat membuat perusahaan tambahan (`POST /companies` memakai email user login, jadi
   semua workspace baru pemilik ikut bebas langganan). Cron siklus trial tidak pernah menyentuh
   status `active` — permanen tanpa migrasi skema. Audit log mencatat `comped: true`.
2. **`scripts/seed-demo.mjs`** (+ `pnpm seed:demo`): membuat perusahaan **"PT Demo Sejahtera"**
   berisi data hidup untuk SEMUA modul — 131 langkah: pengaturan+logo+NPWP, akun COA kustom,
   12 produk (dagang/jasa/kedaluwarsa/bahan+jadi, min_stock), 8 kontak ber-NPWP, 2 gudang,
   6 pembelian (lot, diskon, PPN), 24 faktur penjualan tersebar 45 hari (PPN 0/11/12, diskon,
   jatuh tempo lewat), pelunasan+parsial, retur, void, shift POS + 3 penjualan tunai + tutup
   shift, CRM (3 lead, aktivitas, konversi → penawaran → faktur), anggaran bulan berjalan,
   4 karyawan + payroll TER, 2 aset + penyusutan, 2 proyek + tugas, kurs USD + faktur valas,
   kontrak berulang + run-billing, BoM hampers + produksi + QC, jadwal servis + work order,
   3 tiket helpdesk + balasan, opname + transfer gudang, ambang persetujuan + **pengajuan
   pembelian pending** (via akun staf demo), jurnal operasional. Tanggal relatif hari eksekusi
   (grafik dashboard selalu hidup); menolak seed ganda (guard slug); neraca saldo diverifikasi
   seimbang di akhir (exit 1 bila tidak).
   Mendukung dua mode autentikasi: `SEED_EMAIL`+`SEED_PASSWORD`, atau `SEED_SESSION` (token sesi
   mentah — untuk ops tanpa menyentuh password pemilik).
3. **Pool database tenant 5 → 6**: `erpindo-tenant-6` dibuat di akun Cloudflare (batas akun 10 DB
   sudah tercapai — 3 database lain milik proyek terpisah pemilik). Binding + env + `LOCAL_POOL`
   diperbarui. Catatan kapasitas produksi ada di bagian "Menuju produksi skala".
4. CI: langkah `node --check scripts/seed-demo.mjs` agar drift sintaks terlihat.

## Validasi (semua hijau)

- Typecheck · unit test 24 · build · **smoke 385 → 391**: register comped → active/enterprise/
  tanpa akhir trial; register biasa tetap trial; `/companies` comped ikut comped; **tenant comped
  kebal cron trial-expiry dan tetap bisa menulis (201, bukan 402)** — diuji dengan
  `TRIAL_DAYS_OVERRIDE:0` + trigger cron.
- Seed demo end-to-end di wrangler dev lokal: 131 langkah sukses, neraca saldo seimbang,
  guard seed-ganda bekerja.

## Temuan produksi (untuk runbook ops setelah merge)

- Akun `nurudhuhaalamin@gmail.com` **sudah terdaftar** di produksi (3 Juli, perusahaan "softtin",
  status trial di `TENANT_DB_1`) → jalur ops = `UPDATE tenants SET status='active',
  plan='enterprise', trial_ends_at=NULL` (bukan registrasi baru), lalu pasang secret
  `COMPED_EMAILS` agar perusahaan berikutnya otomatis comped.
- Slot pool produksi terpakai 1/6 — cukup untuk PT Demo Sejahtera + workspace staf demo.

## Menuju produksi skala (dicatat, tidak menghambat)

Mode pool `local` dibatasi 6 tenant & batas akun 10 database D1. Saat pengguna nyata mulai
mendaftar: aktifkan `TENANT_DB_MODE='cloudflare'` (provisioning D1 dinamis via REST API) — butuh
secret `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (pending pemilik) dan menaikkan batas
database (paid plan Workers).

## Berikutnya

Fase 4b: UI/UX refresh + palet baru total (indigo-violet + aksen amber) — wajib sebelum
screenshot landing (4c) & panduan (4d).

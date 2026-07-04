# Log Kerja — Gelombang B-4 (Fase 2p): Aset Tetap

**Tanggal:** 4 Juli 2026 · **Status akhir:** selesai, siap PR

## Konteks

Melengkapi back-office dengan **register aset tetap** dan **penyusutan garis lurus otomatis
bulanan** (via Cron) berikut jurnalnya, serta **pelepasan aset** dengan laba/rugi. Semua
angka tetap mengalir dari jurnal sehingga neraca konsisten.

## Yang dibangun

- **Migrasi tenant `0011_fixed_assets`**: seed akun `5-5000 Beban Penyusutan`; tabel
  `fixed_assets` dan `depreciation_entries` (UNIQUE `asset_id`+`period` → idempoten).
  Akun Aset Tetap `1-1500` & Akumulasi Penyusutan `1-1510` sudah ada di COA.
- **Skema Zod (`packages/shared`)**: `fixedAssetSchema` (refine residu < perolehan),
  `runDepreciationSchema`, `disposeAssetSchema` + tipe `ApiFixedAsset` (dengan nilai buku &
  penyusutan/bulan terhitung).
- **API `routes/assets.ts`**:
  - `POST /assets` — daftar aset + **jurnal perolehan** (Debit Aset Tetap / Kredit kas-bank).
  - `POST /assets/depreciation` — penyusutan garis lurus satu periode: `(perolehan−residu)/masa`,
    dibatasi agar akumulasi tak melebihi dasar susut; posting satu jurnal gabungan Debit Beban
    Penyusutan / Kredit Akumulasi. **Idempotent** (lewati aset yang sudah punya entri periode itu
    atau sudah tersusut penuh).
  - `POST /assets/:id/dispose` — pelepasan: hapus akumulasi & perolehan dari buku, catat hasil,
    dan **laba** (→ Pendapatan Lain-lain) atau **rugi** (→ Beban Operasional Lain) pelepasan.
  - Fungsi `runDepreciation()` dipakai bersama oleh endpoint & Cron.
- **Cron bulanan** (`apps/api/src/index.ts` `scheduled()`): pada tanggal 1, jalankan penyusutan
  **bulan lalu** untuk semua tenant aktif/trial, per-tenant di-`try/catch`, dicatat ke audit log.
  Idempotent, aman bila terpicu berulang.
- **Web `pages/assets.tsx`**: kartu ringkasan (aset aktif, nilai buku total, penyusutan/bulan),
  form daftar aset, tombol jalankan penyusutan manual, dan daftar aset dengan detail
  (penyusutan/bln, % tersusut) + panel pelepasan inline. Nav "Aset Tetap" (ikon `Landmark`) di
  seksi Keuangan, rute `/app/keuangan/aset`, metode api client.

## Validasi (semua hijau)

- Typecheck · 24 unit test · build.
- **Smoke 186 → 197** — seksi "11j. Aset Tetap": daftar aset (nilai buku 48jt, susut 1jt/bln),
  residu ≥ perolehan ditolak (400), penyusutan Agustus (1 aset, 1jt) lalu **idempotent** (0),
  nilai buku turun ke 47jt, **pelepasan hasil 50jt → laba 3jt**, aset jadi `disposed`, pelepasan
  ganda ditolak (400), RBAC viewer 403, dan **neraca saldo tetap seimbang** setelah semua jurnal.
  Asersi jumlah akun COA disesuaikan 18 → 19 (tambah Beban Penyusutan). Digaji/disusutkan di
  Agustus agar arus kas Juli tak terganggu.
- Verifikasi visual Playwright: halaman Aset Tetap terang & gelap (3 aset, penyusutan 2 bulan).

## Berikutnya

Gelombang B-5: **Proyek** (proyek & tugas, tagging biaya/pendapatan per proyek dari faktur &
jurnal, laporan profitabilitas proyek) — item terakhir Gelombang B.

# Log Kerja — Gelombang C-3 (Fase 2t): Konsolidasi Multi-Perusahaan

**Tanggal:** 5 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Satu pemilik sering menjalankan **beberapa badan usaha** (induk + cabang/anak usaha). Fase ini
menambah **laporan konsolidasi** — Laba Rugi & Neraca **gabungan** lintas seluruh perusahaan yang
dimiliki (peran `owner`) oleh satu akun — sekaligus melengkapi cerita multi-perusahaan dengan cara
**membuat perusahaan tambahan** dari satu akun.

## Yang dibangun

- **Perusahaan tambahan** (`POST /api/auth/companies`, butuh login): pengguna yang sudah masuk bisa
  membuat badan usaha baru — database tenant baru diprovisi + migrasi dijalankan, keanggotaan `owner`
  ditambahkan. Melengkapi pengalih workspace (Fase 2g) yang sebelumnya hanya terisi lewat undangan.
  Kartu **"Perusahaan lain"** di Pengaturan (khusus Owner) + metode `api.createCompany`.
- **Ekstraksi mesin laporan** (`apps/api/src/lib/reports.ts`): `computeIncomeStatement` &
  `computeBalanceSheet` dipisah dari `routes/reports.ts` sehingga **dipakai ulang** oleh laporan
  tunggal maupun konsolidasi — satu sumber kebenaran, angka konsolidasi otomatis konsisten dengan
  laporan per perusahaan.
- **API konsolidasi** (`routes/consolidation.ts`, prefiks `/api/consolidation`, di luar `/:tenantId`
  karena menjangkau banyak tenant):
  - `GET /companies` — daftar perusahaan milik pengguna (untuk pemilih di UI).
  - `GET /income-statement?from&to[&companies=id,id]` — Laba Rugi gabungan.
  - `GET /balance-sheet?asOf[&companies=id,id]` — Neraca gabungan.
  Baris digabung **per kode akun** (semua tenant memakai COA yang sama), dengan **rincian nilai per
  perusahaan** + total konsolidasi. Isolasi terjaga: tiap tenant tetap dibaca lewat `db_ref`-nya
  sendiri, dan hanya perusahaan ber-peran `owner` milik pengguna yang disertakan.
- **Web `pages/consolidation.tsx`**: pemilih mode (Laba Rugi / Neraca), rentang tanggal / per-tanggal,
  chip pemilih perusahaan (bisa dikecualikan), tabel multi-kolom (satu kolom per perusahaan + Total),
  laba/rugi konsolidasi, badge "seimbang", dan ekspor CSV. Nav "Konsolidasi" (ikon `Layers`).

## Validasi (semua hijau)

- Typecheck · 24 unit test · build.
- **Smoke 228 → 239** — seksi "11n. Konsolidasi multi-perusahaan": buat perusahaan kedua,
  owner kini punya 2 keanggotaan, COA perusahaan kedua tersemai bersih, daftar konsolidasi berisi 2
  perusahaan, **user lain tidak melihat perusahaan owner** (isolasi kepemilikan), akses tanpa sesi
  401, **Laba Rugi konsolidasi = penjumlahan laporan tiap perusahaan** (invariant), rincian per
  perusahaan (pendapatan 20jt / beban 8jt / laba 12jt), baris akun menyimpan nilai per perusahaan,
  **filter `companies=` menyaring** ke satu perusahaan, dan **Neraca konsolidasi tetap seimbang**
  dengan total = penjumlahan (aset 42jt untuk perusahaan kedua).
- Verifikasi visual Playwright: halaman Konsolidasi Laba Rugi & Neraca (3 perusahaan) terang & gelap.

## Berikutnya

Gelombang C lanjut: Manufaktur+QC, Maintenance, Helpdesk, Ekspor e-Faktur.

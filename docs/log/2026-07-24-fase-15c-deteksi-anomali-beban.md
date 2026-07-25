# Log Kerja — Fase 15c: Deteksi anomali beban

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Pembeda produk dari roadmap ("AI pembeda"), tetapi diwujudkan **deterministik**
— bukan tebakan model. Untuk angka keuangan, aturan yang bisa dijelaskan &
diuji jauh lebih tepercaya daripada narasi AI, dan tidak memakan kuota.

1. **`detectSpendAnomalies()`** (`apps/api/src/lib/reports.ts`) — fungsi murni:
   tandai akun beban yang bulan ini **≥ 2× baseline** (rata-rata bulan-bulan
   sebelumnya) **dan** selisihnya **≥ Rp500.000** (meredam noise nominal kecil).
   Akun tanpa baseline (≤ 0) dilewati. Hasil diurutkan dari selisih terbesar.
   Ambang dapat dikonfigurasi (`minRatio`/`minDelta`).
2. **`GET /:tenantId/reports/anomalies`** — menghitung `current` (bulan yang
   dianalisis) dan `baseline` (jumlah 3 bulan sebelumnya ÷ **jumlah bulan yang
   benar-benar ada aktivitas**, sehingga perusahaan baru tidak salah tandai).
   Param opsional `?month=YYYY-MM-01` (default bulan berjalan) — memudahkan
   pengujian deterministik & penelusuran bulan lampau. Peran `viewer` boleh baca;
   memakai pembatas laju laporan berat yang sudah ada.
3. **Widget dashboard "Beban perlu diperiksa"** (`apps/web/src/pages/dashboard.tsx`)
   — menampilkan maksimal 5 anomali: nama akun, badge `N× biasanya`, dan
   perbandingan "Bulan ini X vs biasanya Y (+selisih)". Bila bersih: pesan ramah.
   Terdaftar di preferensi widget (bisa disembunyikan), default tampil.

## Validasi

- **Unit 222 → 228** (+6): rasio & selisih minimum, peredam noise, akun tanpa
  baseline, pengurutan selisih terbesar, ambang yang dapat dikonfigurasi.
- **Smoke 852 → 857** (+5): jurnal beban uji terposting; Beban Sewa 10jt vs
  baseline 1jt ditandai (10× biasanya); kenaikan wajar 1jt→1,2jt **tidak**
  ditandai; bulan tenang tidak menyerap lonjakan bulan sesudahnya; viewer 200.
- typecheck 4/4 · lint bersih · build.

## Catatan jujur

- **Uji smoke menemukan cacat nyata pada rancangan awal endpoint:** kueri
  "bulan berjalan" tidak punya **batas atas**, sehingga analisis bulan Maret ikut
  menyerap lonjakan bulan Mei. Diperbaiki dengan batas atas eksklusif
  (`< bulan berikutnya`) sebelum fase ini ditutup.
- Blok smoke sengaja ditempatkan **sebelum** siklus langganan (tenant masih boleh
  menulis) dan **setelah** asersi dashboard bernilai tetap, karena jurnal ujinya
  menggeser saldo kas. Bulan uji memakai 2027 agar terisolasi dari data lain.
- ui-sim: widget muncul di dashboard tenant baru dalam keadaan "tidak ada beban
  mencurigakan" (belum ada baseline) — perilaku kosong yang benar.

# Log Kerja — Fase 10a: Rebranding ERPindo + perbaikan dashboard tenant baru

**Tanggal:** 16 Juli 2026 · PR pertama Fase 10 (17 arahan pemilik). Menjawab butir 1 & 2.

## Rebranding (butir 1) — memakai logo ASLI pemilik apa adanya

- **Sumber kanonik** di `apps/web/public/brand/`: `source-logo.png` (wordmark "ERPindo —
  Integrate. Automate. Grow.") dan `source-icon.png` (ikon squircle) — berkas persis yang
  dikirim pemilik, TIDAK digambar ulang.
- `scripts/make-icons.mjs` (sharp) men-generate dari sumber tersebut: `pwa-192/512.png` +
  `favicon.png` (crop margin putih + sudut squircle transparan), `brand/logo-erpindo.png`
  (wordmark ter-trim untuk UI), `og-image.png` 1200×630 (komposit wordmark + ikon).
- **Komponen `BrandWordmark`** (ui.tsx) merender gambar logo asli — dipakai di sidebar app,
  header+footer landing, panel auth, header panduan (chip putih agar tetap terbaca di tema
  gelap). `icon.svg` lama dihapus.
- **Warna brand → biru logo**: `--color-brand-50..950` (styles.css) beralih dari indigo ke skala
  biru (#3b82f6/#2563eb/#1d4ed8) — seluruh tombol/gradien/badge ikut otomatis. theme-color +
  manifest `#1d4ed8`; nama produk di title/OG/manifest/email → **ERPindo**; og:image +
  twitter card large ditambahkan (sebelumnya tidak ada).
- **33 screenshot diregenerasi** (landing 6 + panduan 27) — semua kini menampilkan brand baru.

## Dashboard tenant baru (butir 2) — akar masalah & perbaikan

Akar: kartu KPI merender skeleton bila `value === undefined`, dan halaman tak punya state error —
request yang gagal/menggantung tampak sebagai shimmer abu-abu selamanya (bukti screenshot
pemilik). API sebenarnya selalu mengembalikan angka (nol untuk tenant baru).

- Skeleton kini hanya saat `isLoading`; nilai nol dirender **"Rp 0"** nyata.
- Cabang **error** baru: Alert "Gagal memuat ringkasan dashboard" + tombol "Coba lagi".
- Grafik 30 hari & tren bulanan mendapat **pesan kosong ramah** ("Belum ada penjualan — mulai
  dari faktur pertama Anda") alih-alih sumbu datar bisu.

## Validasi

Typecheck · lint bersih · unit 33 · build · **smoke 668** · **UI-SIM 130 → 132** (+2: dashboard
tenant BARU menampilkan ≥3 nilai "Rp 0" tanpa skeleton tersisa — diuji pada perusahaan pertama
yang belum berisi data). Bukti visual (hero baru, og-image, ikon PWA) dikirim ke pemilik.

## Berikutnya

Fase 10b: harga tunggal Rp389rb + overhaul landing + akun demo publik read-only.

# Log Kerja — Fase 4d: Panduan Lengkap 3 Permukaan

**Tanggal:** 9 Juli 2026 · **Permintaan pemilik #2:** panduan lengkap semua fitur ber-screenshot,
tersedia di publik, repo, dan dalam aplikasi.

## Yang dikerjakan

1. **Konten satu sumber** (`apps/web/src/pages/panduan/content/`): **23 modul** dalam 4 kategori
   (Dasar, Transaksi Harian, Keuangan & Pajak, Operasional Lanjutan) — tipe `GuideModule`
   {slug, title, appPath, intro, sections{heading, body, steps, tips, image}}. Prosa Indonesia
   dengan langkah bernomor, tips beraksen amber, dan tangkapan layar asli.
2. **27 screenshot produk** via manifest `panduan` di `scripts/screenshots.mjs` (seed demo lokal
   → Playwright → WebP 78%, 2,7 MB total, statis di `/panduan/*` — bukan bundle).
3. **Permukaan 1 — publik**: rute code-split (`lazyRouteComponent`) `/panduan` (hero + pencarian
   + grid kartu per kategori) dan `/panduan/$modul` (TOC sticky, langkah, gambar, tips, prev/next,
   tombol "Buka di aplikasi") — chunk terpisah ±29 KB, bundle utama tidak membengkak.
4. **Permukaan 2 — repo**: `scripts/export-panduan-md.mjs` (bundle konten TS via esbuild →
   `docs/panduan/*.md` + README daftar isi, 24 berkas di-commit) — tanpa perawatan ganda.
5. **Permukaan 3 — dalam aplikasi**: item sidebar "Panduan" + **tombol `?` di topbar** yang
   deep-link ke modul panduan sesuai halaman yang sedang dibuka (peta rute→slug, buka tab baru).
6. Tautan "Panduan" ditambahkan ke header & footer landing.

## Validasi (semua hijau)

- Typecheck · unit test · build (chunk panduan terpisah terverifikasi) · smoke 391.
- Playwright: indeks panduan, halaman modul POS (terang), halaman pajak (gelap) — dikirim pemilik.

## Berikutnya

Fase 4e: Asisten AI gratis (Workers AI) — chat bantuan grounded pada ringkasan panduan ini +
draf jurnal dari bahasa alami.

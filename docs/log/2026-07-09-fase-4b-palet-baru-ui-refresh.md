# Log Kerja — Fase 4b: Palet Baru Total + UI/UX Refresh

**Tanggal:** 9 Juli 2026 · **Keputusan pemilik:** ganti identitas warna sepenuhnya.

## Yang dikerjakan

1. **Identitas warna baru**: ramp `--color-brand-*` diganti dari teal ke **indigo-violet**
   (500 #6366f1, 600 #4f46e5, 950 #1e1b4b) — karena seluruh UI memakai token, semua halaman
   (aplikasi, landing, auth, cetakan) berpindah identitas otomatis. Ditambah ramp aksen hangat
   `--color-accent-*` (amber, 500 #f59e0b) untuk pemakaian di landing/panduan/chart berikutnya.
2. **Tipografi**: font **Inter Variable** self-host (`@fontsource-variable/inter`) dengan
   fallback system stack — tampilan lebih modern di semua halaman sekaligus.
3. **Token permukaan**: `--radius-card` 0.75rem → 1rem; token bayangan `--shadow-card`
   dua-lapis lembut dipakai `Card`.
4. **Komponen** (`ui.tsx`): Button — gradien primer lebih hidup (500→600) + ring inset halus +
   prop `size` (md/lg untuk CTA landing); Card — shadow token + prop `hover` (efek angkat untuk
   kartu klik); Badge — kontras dark mode diperbaiki (bg alpha di atas slate gelap).
5. **Sapu bersih teal hardcoded**: meta theme-color (index.html), manifest PWA (vite.config),
   `icon.svg` baru bergradien indigo + **regenerasi pwa-192/512.png** via sharp.
6. **Sidebar**: item aktif kini pill dengan ring halus (terang & gelap); chip stat dashboard
   yang tadinya violet dipindah ke teal agar tak melebur dengan brand baru.

Tidak ada perubahan `id` input atau nama ekspor komponen — selektor Playwright & alur lama aman.

## Validasi (semua hijau)

- Typecheck · unit test · build · smoke **391** (perubahan murni visual, API tak tersentuh).
- Playwright: landing, dashboard terang & gelap, penjualan, mobile 390px gelap — dikirim ke
  pemilik.

## Berikutnya

Fase 4c: landing page overhaul besar (hero dengan screenshot produk UI baru, showcase modul,
seksi perbandingan, dsb.).

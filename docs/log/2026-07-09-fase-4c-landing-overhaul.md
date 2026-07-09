# Log Kerja — Fase 4c: Landing Page Overhaul Besar

**Tanggal:** 9 Juli 2026 · **Tujuan:** landing = penggerak konversi utama (permintaan pemilik #1).

## Yang dikerjakan

1. **Pipeline screenshot produk** `scripts/screenshots.mjs` (manifest `landing` & `panduan`):
   spawn wrangler dev scratch → registrasi akun contoh → jalankan seed demo lokal (131 langkah) →
   Playwright login & pindah ke workspace demo → tangkap halaman @2x → kompres WebP via sharp.
   Banner verifikasi email disembunyikan khusus untuk materi tangkapan. Seed kini diawali
   **jurnal setoran modal 200 jt** agar saldo Kas & Bank realistis (tidak negatif) — jurnal yang
   sama juga ditambahkan ke PT Demo Sejahtera produksi via D1 (neraca tetap seimbang,
   Kas & Bank kini +Rp 71 jt).
2. **Landing ditulis ulang** sebagai direktori `apps/web/src/pages/landing/` (index.tsx +
   sections.ts): header sticky (Fitur/Harga/FAQ + tema) → **hero baru** "Pembukuan, stok, gaji,
   dan pajak — beres dalam satu aplikasi" dengan **screenshot dashboard nyata dalam bingkai
   browser** (fetchPriority high, dimensi eksplisit anti-CLS) → trust bar 4 bukti (390+ uji ·
   1 DB/perusahaan · PPh21 TER & Coretax · PWA offline) → **showcase bertab 5 alur** (POS,
   Faktur & PPN, Laporan, Gaji & PPh 21, Stok & FEFO) masing-masing gambar produk + 3 benefit
   beraksen amber → grid 11 kelompok fitur → **seksi perbandingan "Masih pakai buku & Excel?"**
   (6 baris manual vs erpindo) → harga 3 kartu → **FAQ 8** (baru: lama setup, impor Excel;
   jawaban PPN diperbarui ke XML Coretax) → CTA band → footer.
3. **Anggaran gambar terpenuhi**: 6 WebP total **534 KB** (< 700 KB), semua di bawah fold
   `loading="lazy"` + `decoding="async"`, dilayani statis dari `/landing/*` (bukan bundle JS).

## Validasi (semua hijau)

- Typecheck · unit test · build · smoke 391.
- Playwright: landing penuh terang, tab showcase interaktif, gelap, mobile 390px — dikirim ke
  pemilik.

## Berikutnya

Fase 4d: panduan lengkap 3 permukaan (publik `/panduan` + Markdown repo + akses dalam aplikasi)
memakai manifest screenshot `panduan` yang sudah disiapkan.

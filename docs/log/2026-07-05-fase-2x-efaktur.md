# Log Kerja — Gelombang C-7 (Fase 2x): Ekspor e-Faktur

**Tanggal:** 5 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Wajib Pajak PKP perlu melaporkan **faktur keluaran ber-PPN** ke aplikasi e-Faktur DJP.
Fase ini menyediakan **ekspor CSV** faktur ber-PPN per periode — batas mandiri (koneksi
Coretax pending akun/regulasi).

## Yang dibangun

- **API `GET /reports/efaktur?from&to`** (di `routes/reports.ts`): daftar faktur penjualan
  dengan `tax_amount > 0` pada periode, join kontak untuk **NPWP & nama pembeli**, dengan
  kolom **DPP** (subtotal), **PPN** (tax_amount), **total**, plus total DPP/PPN. Nilai dalam
  Rupiah (faktur valas sudah dikonversi saat posting). Tanpa migrasi — kolom `npwp` kontak &
  `subtotal`/`tax_amount` faktur sudah ada.
- **Web `EfakturPage`** (di `pages/reports.tsx`): pemilih periode, tabel pratinjau (nomor,
  tanggal, NPWP, pembeli, DPP, PPN, total) + baris total, dan tombol **Ekspor CSV**. Pembeli
  tanpa NPWP diekspor sebagai `000000000000000`. Nav "Ekspor e-Faktur" (ikon `FileSpreadsheet`)
  di seksi Keuangan.

## Validasi (semua hijau)

- Typecheck · 24 unit test · build.
- **Smoke 284 → 292** — seksi "11r. Ekspor e-Faktur": pelanggan ber-NPWP, faktur PPN 11%
  (total 2.220.000), parameter tanggal salah 400, RBAC viewer boleh baca (200), **baris
  e-Faktur DPP 2jt / PPN 220rb / NPWP & nama benar**, **hanya faktur ber-PPN yang diekspor**
  (semua PPN > 0 — faktur PPN 0% dikecualikan), total = penjumlahan baris (invariant), periode
  tanpa faktur ber-PPN kosong.
- Verifikasi visual Playwright: halaman Ekspor e-Faktur (3 faktur, non-PPN dikecualikan) terang
  & gelap.

## Berikutnya

**Gelombang C (V3 tanpa dependensi eksternal) selesai.** Tersisa: A-6 Manajemen Dokumen
(pending R2), dan Gelombang D (pembayaran langganan/ekspedisi/marketplace — pending kunci
API pemilik).

# Log Kerja — Fase 2y: UI Responsif + Tema Menu + Landing Baru

**Tanggal:** 6 Juli 2026 · **Status akhir:** selesai, siap PR. (Murni frontend — tanpa perubahan API/DB.)

## Konteks

Seluruh fitur V3 mandiri sudah rilis. Pemilik minta perbaikan tampilan agar setara SaaS modern.
Empat masalah konkret + keputusan pemilik (harga 3 paket semua-fitur; landing marketing penuh).

## Yang dikerjakan

1. **Sidebar/menu ikut ganti tema.** Sidebar, `nav`, workspace picker, & menu mobile sebelumnya
   memakai kelas gelap hardcoded tanpa pasangan `dark:` (selalu gelap). Diubah jadi *terang default
   + `dark:`*: `bg-white dark:bg-slate-950`, item aktif `bg-brand-50 text-brand-700 dark:bg-brand-600/20
   dark:text-white`, dst. Isi sidebar diekstrak ke `sidebarContent` yang dipakai bersama desktop &
   mobile (tanpa duplikasi).
2. **Menu mobile → off-canvas drawer.** Ganti dropdown-inline dengan **drawer geser dari kiri**
   (`fixed inset-y-0 left-0 w-72 max-w-[82vw]`, `translate-x` + transisi 300ms) + backdrop
   (`bg-slate-900/50 backdrop-blur`), tombol tutup (X), tutup via backdrop/Escape/klik menu, dan
   kunci scroll body saat terbuka. `role="dialog" aria-modal`.
3. **Responsif.** Bungkus 5 tabel yang belum ber-`overflow-x-auto` (currencies, jurnal finance,
   ReportSection, kutipan CRM, audit-log app.tsx); beri `min-w` pada tabel terlebar (konsolidasi,
   aging, e-Faktur, manufaktur, maintenance) agar scroll-horizontal rapi; `CardBody` `px-4 sm:px-5`
   untuk melebarkan ruang di HP.
4. **Landing page marketing penuh** (`pages/landing.tsx` baru, dipindah dari `auth.tsx`): header
   sticky + toggle tema, hero, baris statistik, **11 kartu fitur per kategori** (Keuangan, Faktur,
   Stok, POS, CRM & Helpdesk, HR & Payroll, Aset & Maintenance, Manufaktur & QC, Multi-perusahaan &
   Valas, Pajak/e-Faktur, Keamanan & Platform), **harga baru** (diturunkan dari `PLAN_LIMITS`), FAQ
   (`<details>`), CTA band, footer. Halaman publik kini menerapkan tema (`useDarkMode`) sehingga
   kelas `dark:` benar-benar aktif.
5. **Harga** (`packages/shared` `PLAN_LIMITS`/`PLAN_LABELS`): **Starter Rp149rb/3 user · Bisnis
   Rp349rb/10 user · Enterprise Rp799rb/tak terbatas**. Semua fitur di setiap paket; hanya jumlah
   pengguna + dukungan yang berbeda. Kompetitif menekan Jurnal/Accurate/Kledo (riset pasar).
6. **Token `brand-950`** ditambahkan di `styles.css` (kelas `dark:bg-brand-950/*` sebelumnya tak
   resolve — bug laten diperbaiki).

## Validasi (semua hijau)

- Typecheck · 24 unit test · build · **smoke tetap 292** (UI murni; smoke lewat API tak terpengaruh).
- Verifikasi visual Playwright di **3 viewport (390 / 768 / 1280 px)**: sidebar ganti warna
  terang↔gelap; drawer mobile meluncur dari kiri + backdrop; landing terang & gelap dengan harga
  baru; tabel lebar (e-Faktur) scroll horizontal di HP tanpa overflow halaman.

## Berikutnya

Pending-pemilik: R2 (dokumen), Server Key Midtrans (pembayaran), API key ekspedisi/marketplace.

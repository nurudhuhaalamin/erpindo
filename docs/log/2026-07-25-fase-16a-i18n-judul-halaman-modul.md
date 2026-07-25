# Log Kerja — Fase 16a: Judul & pengantar halaman modul dwibahasa

**Tanggal:** 25 Juli 2026.

## Yang dikerjakan

Membuka program **i18n modul**. Sejak Fase 13e menu sidebar sudah mengikuti
bahasa aktif, tetapi **isi halamannya tidak** — menu menampilkan "Products"
sementara halamannya tetap berjudul "Produk". Fase ini menutup ketidakselarasan
paling terlihat itu untuk **seluruh halaman sekaligus**, bukan sebagian.

1. **Kamus `apps/web/src/i18n/pageHeadings.ts`** — 40 entri `title` (+ `desc`
   bila ada) dwibahasa untuk setiap halaman modul: master data, transaksi,
   laporan, keuangan, pajak, HR, proyek, manufaktur, POS, admin, dan panduan.
2. **Komponen `PageHeading`** (`components/ui.tsx`) — merender judul + paragraf
   pengantar dalam bahasa aktif. Sengaja memakai **fragment**, bukan `<div>`,
   agar `h1`/`p` tetap anak langsung kontainer halaman sehingga **jarak
   vertikalnya persis sama** seperti sebelum diekstrak (induknya `space-y-6`).
   Dipakai di **29 header** berstruktur seragam.
3. **Hook `useHeading(key)`** — untuk **11 header** yang tata letaknya khas:
   judul dinamis (Penjualan/Pembelian dari `mode`, Umur Piutang/Hutang dari
   `kind`), atau judul & pengantar terpisah jauh (Helpdesk, Pemeliharaan,
   Manufaktur, Panduan), serta judul-saja (Konsolidasi, Neraca, Kasir POS).

Hasil: **tidak ada lagi `<h1>` halaman modul yang teksnya dipatok Indonesia.**

## Validasi

- **UI-sim 184 → 187** (+3): dalam mode EN, halaman **Produk** menampilkan
  "Products" + pengantar Inggris (dan **tidak** lagi memuat "Katalog barang"),
  halaman **Neraca Saldo** menjadi "Trial Balance", lalu kembali ke ID
  memulihkan judul Indonesia — bukti toggle bekerja dua arah pada halaman modul.
- typecheck 4/4 · lint bersih · build.
- Smoke 861 (tak berubah — murni penyajian teks sisi klien, tanpa perubahan API).

## Catatan jujur

- **Ini baru lapis header.** Isi halaman (label kolom tabel, tombol, teks form,
  pesan validasi) **masih Bahasa Indonesia** — disebutkan terbuka agar tidak ada
  kesan i18n modul sudah tuntas. Header dipilih lebih dulu karena paling
  terlihat, terukur, dan menghilangkan campur-bahasa menu↔judul yang paling
  mengganggu. Lapis berikutnya (label & tombol umum) layak jadi sub-fase sendiri
  dengan kamus istilah bersama.
- Istilah standar Indonesia dipertahankan di teks Inggris (PPh 21 TER, BPJS,
  e-Faktur, PP 55/2022, SPT Masa PPN, BoM) karena memang nama resmi — konsisten
  dengan keputusan i18n landing (Fase 14f).

## Tambahan: perbaikan lint lokal yang gagal palsu

Saat fase ini dikerjakan, `pnpm lint` gagal dengan 41 galat pada
`.wrangler/tmp/dev-*/index.js` — bundel sementara yang dibuat `wrangler dev`
selagi smoke/ui-sim berjalan. Direktori itu sudah diabaikan **git**, tetapi
belum diabaikan **ESLint**, sehingga hasil lint lokal bergantung pada ada
tidaknya proses wrangler yang sedang jalan (di CI selalu lolos karena job lint
terpisah). `.wrangler/**` ditambahkan ke daftar abai `eslint.config.mjs`.

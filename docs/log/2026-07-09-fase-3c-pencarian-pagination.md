# Log Kerja — Fase 3c: Pencarian, Pagination, & Pemilih Produk Berskala

**Tanggal:** 9 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Audit Fase 3 menemukan batas skala keras: daftar master data dipotong `LIMIT 500`,
daftar dokumen `LIMIT 200`, dan dropdown produk di form faktur me-render SEMUA produk —
produk ke-501+ tidak bisa difakturkan sama sekali, dan tak ada kotak pencarian di mana pun.

## Yang dikerjakan

1. **API berhalaman + pencarian.** Parameter `?q=` (LIKE, wildcard `%`/`_` di-escape sebagai
   literal) + `?limit&offset` (default 100, maks 500) + `total` di respons untuk:
   - master data produk/kontak/gudang (kolom cari per entitas: SKU/nama, nama/email/telepon,
     kode/nama);
   - daftar faktur penjualan & pembelian (nomor dokumen atau nama kontak) — baris dokumen
     kini di-fetch hanya untuk halaman yang tampil, bukan seluruh tabel;
   - jurnal umum (nomor jurnal atau keterangan).
2. **Komponen `SearchSelect`** (combobox typeahead di ui.tsx): opsi di-fetch saat mengetik
   (debounce 250 ms, 20 hasil), navigasi keyboard ↑/↓/Enter/Escape, hint harga di kanan.
   Dipakai di: form faktur penjualan/pembelian (produk + pelanggan/pemasok), kontrak
   (pelanggan + produk), dan BoM manufaktur (produk jadi + komponen — dropdown perintah
   produksi kini diambil dari daftar resep, bukan semua produk).
3. **Kotak cari + "Muat lebih banyak"** di halaman Produk/Kontak/Gudang, Penjualan/Pembelian,
   dan Jurnal Umum (footer "Menampilkan X dari Y").
4. **POS**: pencarian produk pindah ke sisi server — grid kasir hanya memuat 100 produk yang
   cocok, katalog ribuan produk tetap ringan.

## Validasi (semua hijau)

- Typecheck · unit test 24 · build · **smoke 334 → 347** (13 baru): `?q=` produk/kontak/faktur/
  jurnal dengan hasil eksak, wildcard `%` sebagai literal, pagination offset memberi baris
  berbeda dengan total konsisten, limit di-clamp 500, RBAC viewer boleh mencari, dan alur
  nyata cari-produk→posting-faktur (Rp80.000) dengan neraca saldo tetap seimbang.
- Playwright: combobox produk terbuka dengan hasil + harga, kotak cari dokumen (gelap),
  pencarian master data, pencarian POS — dikirim ke pemilik.

## Berikutnya

Fase 3d: diskon per baris + logo kop faktur + stok menipis & notifikasi lonceng.

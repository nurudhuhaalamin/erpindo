# Log Kerja — Fase 3d: Diskon per Baris, Logo Kop, & Notifikasi Stok Menipis

**Tanggal:** 9 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Tiga fitur transaksi yang diminta pemilik (keputusan AskUserQuestion Fase 3): diskon per baris
faktur, logo kop faktur/struk, dan peringatan stok menipis + pusat notifikasi.

## Yang dikerjakan

1. **Diskon per baris (persen 0–100).** Migrasi `0019_commerce_extras` menambah
   `discount_pct` di `invoice_lines` & `purchase_lines`. Nilai baris = qty × harga ×
   (1 − diskon/100), dibulatkan per baris — **PPN & seluruh jurnal mengikuti nilai setelah
   diskon**; pembelian berdiskon memasukkan persediaan pada biaya satuan setelah diskon
   (nilai stok = jurnal Persediaan, eksak). Kolom "Disc %" di form faktur jual/beli,
   input diskon per item di keranjang POS (struk ikut menampilkan), kolom Diskon di
   cetakan faktur, dan badge hijau −% di daftar dokumen.
2. **Logo kop faktur & struk.** Unggah di Pengaturan → gambar dikecilkan di browser
   (kanvas, maks 256 px, PNG) sampai ≤64KB base64 lalu disimpan di `settings` DB tenant —
   tanpa butuh object storage/R2. Tampil di kop cetakan faktur & header struk POS;
   bisa diganti/dihapus; validasi format di server (PNG/JPEG/WebP/SVG data URL).
3. **Stok menipis + pusat notifikasi.** Produk punya `min_stock` (0 = tanpa peringatan;
   diatur dari form produk). Endpoint `GET /:tenantId/notifications` menghitung on-demand:
   stok total ≤ ambang, faktur lewat jatuh tempo (belum lunas, bukan void), tiket
   terbuka/diproses, dan pembelian menunggu persetujuan. **Lonceng di topbar** dengan badge
   jumlah, panel dropdown berwarna per jenis, tautan langsung ke halaman terkait; disegarkan
   tiap menit.

## Validasi (semua hijau)

- Typecheck · unit test 24 · build · **smoke 347 → 363** (16 baru): faktur diskon 25% →
  total 333.000 (PPN dari nilai setelah diskon), laba-rugi Δpendapatan +300rb & ΔHPP +200rb
  eksak; pembelian diskon 10% → stok masuk @18.000 senilai jurnal; diskon >100% ditolak;
  notifikasi stok menipis & faktur jatuh tempo muncul dengan isi benar; RBAC viewer;
  logo tersimpan/ditolak-format-aneh/terhapus; neraca saldo tetap seimbang.
- Playwright: kolom Disc % di form, panel lonceng (2 notifikasi), logo di Pengaturan (gelap),
  cetakan faktur berlogo + kolom diskon — dikirim ke pemilik.

## Berikutnya

Fase 3e: dashboard modern (grafik tren 30 hari — baca skill dataviz dulu), onboarding
checklist, polish menyeluruh (EmptyState/Skeleton/ikon/copywriting), lalu 3f e-Faktur XML.

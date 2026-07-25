# Log Kerja — Fase 16g: Isi halaman Kasir (POS) dwibahasa

**Tanggal:** 25 Juli 2026.

## Yang dikerjakan

Lapis ketujuh program i18n modul. `pos.tsx` mencakup layar kasir penuh: buka/
tutup shift, keranjang & pembayaran multi-metode, tahan/panggil transaksi,
rekap harian (per jam / per shift / per metode), serta panel Struk & Refund.

38 entri kamus baru + **35 penggantian**, termasuk komponen `RecapCard` dan
`RefundPanel` agar seluruh layar ikut bahasa, bukan sebagian.

## Tiga pengaman kini jadi standar

Fase ini adalah yang pertama dikerjakan dengan **ketiga** pelajaran sekaligus:

1. **Regex sadar-spasi** untuk teks JSX multi-baris (pelajaran 16c).
2. **Penanda negatif hanya dari teks murni UI** — bukan kata yang juga muncul di
   data pengguna (pelajaran 16c/16e). Di sini sengaja **tidak** memakai
   "Tunai"/"Lunas" karena keduanya muncul sebagai metode/status pada data struk;
   dipakai judul kartu.
3. **Sapuan atribut TANPA batas panjang** (pelajaran 16f). Terbukti langsung
   berguna: sapuan menangkap **3 kalimat panjang** yang dengan alat lama akan
   lolos diam-diam —
   - "Mulai sesi kasir dengan mencatat kas awal di laci."
   - "Penjualan POS per jam, per shift, dan per metode pembayaran."
   - "Pilih struk, isi qty barang yang dikembalikan — uang tunai keluar dari laci shift ini."

Sapuan akhir atas **seluruh** halaman yang sudah dikerjakan (6 berkas) kini
bersih.

## Validasi

- **UI-sim +1 (`F0i`)**: mode EN pada Kasir memuat judul kartu Inggris dan tidak
  lagi memuat "Rekap hari ini"/"Buka shift".
- typecheck 4/4 · lint bersih · build · unit 234 · smoke 861 (tak berubah).

## Catatan

- **Sengaja tidak diterjemahkan:** `PPN` (nama pajak resmi) dan nilai contoh
  (`500000`).
- **Cakupan kumulatif: ±15 layar** tuntas isinya; kamus **201 entri**.

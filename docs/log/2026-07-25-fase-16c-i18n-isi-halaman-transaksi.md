# Log Kerja — Fase 16c: Isi halaman Penjualan & Pembelian dwibahasa

**Tanggal:** 25 Juli 2026.

## Yang dikerjakan

Lapis ketiga program i18n modul, meneruskan pola 16b (satu halaman dituntaskan
**penuh**, bukan sebagian). Kali ini `commerce.tsx` — halaman **Penjualan** dan
**Pembelian**, dua halaman transaksi yang paling sering dipakai.

### 1. `MODE_CFG` menjadi dwibahasa

Konfigurasi per-mode (`sale` / `purchase`) memuat teks yang tampil di layar:
`title`, `docLabel`, `contactLabel`, dan `stockHint`. Keempatnya diubah dari
`string` menjadi `Dual { id, en }` dan dibaca lewat `pick(..., lang)`. Ini
membuat kedua halaman ikut bahasa **dari satu sumber**, bukan dua salinan teks.

Kalimat yang menyisipkan label (mis. "Daftar penjualan", "Belum ada faktur
penjualan") diberi bentuk Inggris yang wajar ("Sales list", "No sales invoice
yet") — bukan terjemahan harfiah pola Indonesia.

### 2. Kamus diperluas + 19 penggantian

23 entri baru di `i18n/ui.ts` untuk istilah transaksi: Harga satuan, Disc %,
Mata uang, Proyek (opsional), No. lot (opsional), Tanpa PPN, Pembayaran, Sudah
dibayar/diretur, Retur, DIBATALKAN/DIHAPUS, teks konfirmasi hapus pembayaran &
batalkan dokumen, serta placeholder pencarian.

Komponen `DocRow` (baris dokumen dengan tombol Cetak/Ubah/Retur/Batalkan dan
panel pembayaran) ikut dipatch, sehingga tombol aksinya berubah — bukan hanya
tabel utamanya.

## Validasi

- **UI-sim 188 → 189** (+1): mode EN pada halaman Penjualan menampilkan "Unit
  price" dan "Customer", serta **tidak lagi** memuat "Harga satuan".
- typecheck 4/4 · lint bersih · build · unit 234 · smoke 861 (tak berubah —
  murni penyajian teks sisi klien).

## Catatan jujur

- **Cakupan kumulatif:** 3 dari 36 halaman kini tuntas isinya (Master Data
  Produk/Kontak/Gudang di 16b, Penjualan & Pembelian di 16c). Sisanya masih
  Bahasa Indonesia di bagian isi — kamus bersama kini menanggung sebagian
  istilah umum sehingga halaman berikutnya lebih cepat.
- Istilah resmi (PPN, SKU, HPP) tetap tidak diterjemahkan, konsisten 14f/16a/16b.

# Log Kerja — Fase 5h: Pelengkap Modul Lain

**Tanggal:** 10 Juli 2026 · **Temuan review pemilik #9:** beberapa fitur lainnya juga sangat minim.

## Yang dikerjakan

1. **Laporan penjualan analitik** (`/app/laporan/penjualan`): endpoint baru
   `GET /reports/sales-analytics?from=&to=` yang mengagregasi faktur (di luar yang dibatalkan)
   **per produk** (qty + omzet, terurut menurun) dan **per pelanggan** (jumlah faktur + omzet).
   Halaman dengan kartu ringkas (total penjualan, jumlah faktur, rata-rata per faktur) +
   **ekspor CSV** per tabel. Ditambahkan menu "Laporan Penjualan" di grup Keuangan.
2. **Dashboard delta vs bulan lalu**: dashboard kini mengembalikan `salesLastMonth`; kartu
   "Penjualan Bulan Ini" menampilkan **▲/▼ persen perbandingan** dengan bulan sebelumnya
   (hijau naik, merah turun).
3. **Helpdesk — umur tiket**: tiket yang masih terbuka/diproses diberi badge umur berwarna
   (**hijau <24 jam, kuning 24–72 jam, merah >72 jam**) supaya tiket lama tidak terabaikan.
4. **Stok — filter menipis + ekspor CSV**: kartu Level stok mendapat toggle "Hanya tampilkan
   stok menipis (qty ≤ ambang)" dengan ambang yang bisa diatur, dan tombol **Ekspor CSV**
   (mengikuti tampilan/filter yang aktif). (Peringatan lot hampir kedaluwarsa ≤30 hari sudah
   ada sejak Fase 2j.)
5. Komponen `CardHeader` kini mendukung slot `action` (dipakai untuk tombol ekspor di header
   kartu) — perbaikan reusable, tidak mengubah pemakaian lama.

Semua tanpa migrasi baru (murni endpoint agregat + UI); tidak mengubah `id` input atau nama
ekspor komponen lama.

## Validasi

- Typecheck · unit test (24) · build · **smoke 456 → 460** (+4: dashboard memuat
  `salesLastMonth`; laporan penjualan 200 dengan baris produk & pelanggan + nominal > 0;
  byProduct terurut menurun; RBAC viewer boleh membaca). Assert angka lama tidak terganggu
  (endpoint baca-saja, tidak menyentuh ledger).
- Screenshot Laporan Penjualan & halaman Stok (filter) — dikirim ke pemilik.

## Catatan lingkup

Fitur pelengkap difokuskan pada 4 yang paling berdampak & berisiko rendah (laporan analitik,
dashboard delta, umur tiket, filter/CSV stok). Sisa ide di roadmap (anggaran salin periode,
revaluasi aset + CSV register, manufaktur cek bahan, POS nominal cepat) tetap tercatat sebagai
peningkatan lanjutan pasca-beta bila diperlukan — lihat laporan akhir Fase 5.

Berikutnya: **laporan akhir Fase 5** (`2026-07-10-fase-5-laporan-akhir.md`).

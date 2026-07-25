# Log Kerja — Fase 16e: Isi halaman Laporan dwibahasa

**Tanggal:** 25 Juli 2026.

## Yang dikerjakan

Lapis kelima program i18n modul. `reports.tsx` memuat **enam halaman laporan**
dalam satu berkas: Laba Rugi, Arus Kas, Umur Piutang/Hutang, Ekspor e-Faktur,
Neraca, dan Laporan Penjualan. Keenamnya dipatch sekaligus.

31 entri kamus baru + **48 penggantian**: label kolom (Nomor, Kontak, Pembeli,
Omzet, Piutang/Hutang, Qty), bagian neraca (Aset, Kewajiban, Ekuitas,
"Kewajiban + Ekuitas", penanda "TIDAK seimbang"), arus kas (Kas Masuk/Keluar),
metrik penjualan (Margin kotor/bersih, Jumlah faktur, Rata-rata per faktur,
Total keseluruhan), serta pesan kosong ("Tidak ada faktur pada rentang tanggal
ini.").

Termasuk membereskan istilah yang **sudah ada di kamus** tetapi belum terpakai
di berkas ini (Dari, Sampai, Tanggal, Total, Pelanggan, Produk, Jenis) — 13
penggantian tambahan. Ini menunjukkan nilai kamus terpusat: makin banyak halaman
dikerjakan, makin besar bagian yang tinggal dipasang.

## Validasi

- **UI-sim 190 → 191** (+1, cek `F0g`): mode EN pada Laba Rugi memuat "Income" &
  "Expenses" dan **tidak lagi** memuat "Pendapatan".
- typecheck 4/4 · lint bersih · build · unit 234 · smoke 861 (tak berubah).

## Catatan jujur

- **Sengaja tidak diterjemahkan:** `DPP`, `NPWP`, `PPN`, `SKU`, `Qty`, `XML` —
  istilah/format resmi, konsisten dengan keputusan sejak Fase 14f.
- **Cakupan kumulatif: 5 berkas halaman / ~10 layar** tuntas isinya (Master Data
  3 layar, Penjualan, Pembelian, Stok, dan 6 layar laporan). Sisa halaman modul
  masih Bahasa Indonesia di bagian isi.

## Koreksi uji: penanda negatif harus teks murni UI

Cek `F0g` mula-mula gagal dengan `income=true expenses=true tanpaID=false` —
terjemahannya benar, tetapi asersi negatif `!includes("Pendapatan")` keliru:
kata "Pendapatan" muncul di **nama akun** bagan akun ("Pendapatan Penjualan",
"Pendapatan Lain-lain"), yaitu **data pengguna** yang memang tidak diterjemahkan.

Ini pengulangan pola yang sama seperti di 16c (kata "Pelanggan" muncul di nama
kontak demo "PT Pelanggan Setia"). Aturannya kini eksplisit di komentar uji:

> **Penanda negatif untuk asersi i18n harus teks yang murni antarmuka** — jangan
> memakai kata yang juga bisa muncul di data pengguna (nama akun, nama kontak,
> nama produk).

Diganti ke label toggle "Bandingkan dengan periode sebelumnya" yang hanya ada di
antarmuka. Pesan gagal berisi tiap sub-kondisi membuat diagnosis ini butuh satu
kali baca, tanpa menebak.

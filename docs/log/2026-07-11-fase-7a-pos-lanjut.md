# Log Kerja — Fase 7a: POS Lanjut (Retail)

**Tanggal:** 11 Juli 2026 · **Fase 7 (pendalaman modul), gelombang ROI-UMKM.**

## Yang dikerjakan

POS/Kasir sebelumnya hanya menerima **tunai tunggal**. Fase 7a menjadikannya kelas retail:

1. **Multi metode bayar + split**: satu transaksi bisa dibayar gabungan **Tunai + QRIS +
   Kartu/EDC + E-Wallet**. Kembalian **hanya dari tunai** (non-tunai wajib pas). Jurnal
   memisah **Kas** (porsi tunai) dan **Bank** (porsi non-tunai). Kas laci shift kini hanya
   menghitung **porsi tunai** (bukan total), sehingga hitung fisik saat tutup shift benar.
2. **Tahan transaksi (park)**: simpan keranjang sementara per shift + **panggil lagi** atau hapus.

- Migrasi `0028_pos_multipay`: tabel `pos_sale_payments` (amount = masuk pembukuan, tendered =
  diserahkan) + `pos_held_sales` (keranjang ditahan). Tanpa ubah tabel lama.
- Skema shared: `POS_PAYMENT_METHODS` + label; `posSaleSchema` diperluas dengan `payments[]`
  (opsional; `cashReceived` lama tetap jalan → kompatibel); `holdSaleSchema`, `ApiHeldSale`.
- API `pos.ts`: penjualan menerima `payments[]` (validasi total & kembalian≤tunai), jurnal
  Kas/Bank terpisah, catat `pos_sale_payments`; `shiftTotals` hitung kas laci dari porsi tunai
  (faktur lama tanpa baris pembayaran = tunai penuh). Endpoint tahan: `GET/POST/DELETE /pos/held`.
- Web `pos.tsx`: pemilih metode + baris tender (prefill sisa), status Lunas/Sisa + kembalian;
  panel **tahan** + daftar transaksi ditahan (panggil/hapus). Struk menampilkan tunai & kembalian.
- Seed-demo: 1 penjualan split (Tunai+QRIS) + 1 transaksi ditahan (Meja 5).

Catatan: **retur di kasir** memakai alur retur yang sudah ada (halaman Penjualan) — belum
dipindah ke layar POS; dijadwalkan sebagai pelengkap kecil bila diperlukan.

## Validasi

- Typecheck · unit test (24) · build · **smoke 523 → 533** (+10: split tunai+QRIS 201, kas laci
  hanya porsi tunai, kembalian dari non-tunai 400, kurang bayar 400, tahan 201, daftar tahan,
  hapus/panggil 200, viewer tahan 403, neraca saldo seimbang). Jalur POS tunai lama tetap hijau.
- Screenshot desktop + HP 390px dikirim ke pemilik.

## Berikutnya

Fase 7b: Penjualan bertahap (Sales Order → Surat Jalan → Faktur + uang muka).

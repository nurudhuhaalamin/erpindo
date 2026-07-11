# Log Kerja — Fase 7b: Penjualan Bertahap (SO → Surat Jalan → Faktur)

**Tanggal:** 11 Juli 2026 · **Fase 7 (pendalaman modul), gelombang ROI-UMKM.**

## Yang dikerjakan

Sebelumnya penjualan langsung ke **faktur** (stok keluar + pendapatan sekaligus). Banyak UMKM
grosir/distribusi perlu tahap: **komitmen pesanan → kirim barang → tagih**. Fase 7b menambah
alur bertahap **Pesanan Penjualan (SO) → Surat Jalan (DO) → Faktur**, sejajar dengan alur
pembelian PR→PO→GRN (Fase 6d), dengan **stok bergerak tepat sekali**.

Prinsip akuntansi:
- **Pesanan (SO)** — hanya dokumen komitmen pelanggan; **tidak** menyentuh stok/jurnal.
- **Surat Jalan (DO)** — stok **keluar** (`stockOut`) + HPP diakui (Dr HPP / Cr Persediaan)
  **sekali di sini**.
- **Faktur** — pendapatan diakui (Dr Piutang / Cr Pendapatan + PPN) lewat `executeInvoice`
  mode **`skipStock`** → **tidak menggerakkan stok lagi**.
- **Uang muka (DP)** — diterima sebelum faktur sebagai **Uang Muka Pelanggan** (liabilitas
  2-1300); saat difakturkan otomatis direklasifikasi (Dr Uang Muka / Cr Piutang) sehingga
  faktur sebagian/lunas terbayar.

### Perubahan teknis
- **`commerce.ts`**: `executeInvoice` mendapat opsi `{ skipStock?: boolean }` — melewati
  `stockOut` + jurnal HPP saat barang sudah dikeluarkan di surat jalan. Jalur faktur biasa
  tidak berubah (default tetap menggerakkan stok).
- **Migrasi `0029_sales_orders`** (backward-compatible): `sales_orders` (+`sales_order_lines`),
  `delivery_orders` (+`delivery_order_lines`) dengan status SO
  `open → delivered → invoiced` / `cancelled`, kolom `dp_amount` & `invoice_id`.
- **Skema shared**: `SO_STATUSES` + label, `salesOrderSchema`, `deliverOrderSchema`,
  `invoiceFromSoSchema`, `soDownPaymentSchema`, tipe `ApiSalesOrder`/`ApiSalesOrderLine`.
- **API baru `salesOrders.ts`**: `GET/POST /sales-orders`, `/:id/cancel` (hanya SO terbuka),
  `/:id/down-payment`, `/:id/deliver` (buat DO + stok keluar + HPP), `/:id/invoice`
  (reuse `executeInvoice` skipStock + terapkan DP). RBAC admin-tulis / viewer-baca; audit
  `sales.so.*`.
- **Web `salesorders.tsx`** + rute `/app/pesanan-penjualan` + nav **Pesanan Penjualan** (grup
  Transaksi): form pesanan multi-baris; daftar pesanan dengan aksi bertahap (Uang muka, Kirim,
  Buat faktur, Batalkan) + badge status + nomor DO & faktur tertaut + **cetak surat jalan**.
- **Seed-demo**: satu siklus penuh (Hotel Parahyangan: SO → DP Rp150.000 → surat jalan DO-00001
  → faktur INV-00030) + satu pesanan terbuka (Toko Priangan) untuk demo.

## Validasi

- Typecheck · unit test (24) · build · **smoke 533 → 548** (+15): viewer buat SO 403; buat SO
  201; faktur sebelum kirim 409; uang muka 200; stok awal 20; surat jalan 201 + **stok berkurang
  5 (20→15)**; batalkan pesanan terkirim 409; faktur dari terkirim 201 (total 1.110.000);
  **stok tidak bergerak lagi saat faktur (tetap 15)** — bukti `skipStock`; uang muka Rp300.000
  terpakai (paidAmount 300rb, status posted); kirim ulang setelah difakturkan 409; batalkan
  pesanan terbuka 200; daftar pesanan menampilkan status `invoiced` + nomor faktur & surat jalan;
  neraca saldo tetap seimbang. Entitas baru pakai produk & tanggal khusus (September) agar asersi
  stok BRG-002 & arus kas Juli lama tetap hijau.
- Screenshot desktop + HP halaman **Pesanan Penjualan** dikirim ke pemilik.

## Berikutnya

Fase 7c: Stok lanjut — titik pesan otomatis → usulan PO (tersambung Pengadaan 6d), multi-satuan
(UOM) + konversi, barcode + opsi nomor seri.

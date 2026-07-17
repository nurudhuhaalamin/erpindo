# Fase 11e — Import Pesanan Marketplace (Shopee/Tokopedia/TikTok → faktur)

**Tanggal:** 17 Juli 2026
**Branch/PR:** `claude/erp-business-planning-8wx296` → PR #82 (akumulasi Fase 11)
**Uji:** typecheck 4/4 · lint bersih · unit 49 · build · **smoke 770** (+5) · **ui-sim 160**

Penjual online kini bisa **memasukkan pesanan marketplace ke pembukuan dalam satu langkah**:
ekspor pesanan dari Shopee/Tokopedia/TikTok Shop (CSV), tempel/unggah di menu **Marketplace**,
dan tiap pesanan otomatis menjadi **faktur penjualan + stok keluar + jurnal** — lewat
`executeInvoice` yang sudah teruji. Ini jembatan omnichannel yang **bekerja sekarang tanpa kunci
API**; konektor API langsung (OAuth Shopee dll.) menyusul saat kunci tersedia.

## Cara kerja
- Kolom CSV: `no_pesanan, tanggal, SKU, qty, harga_satuan, diskon%(opsional)`. Baris dengan nomor
  pesanan sama digabung menjadi satu faktur multi-baris.
- Produk dicocokkan **per SKU** (case-insensitive); pesanan dengan SKU tak dikenal dilaporkan gagal
  (tanpa memblokir pesanan lain).
- **Idempoten:** satu `(channel, no. pesanan)` hanya diimpor sekali (indeks unik
  `marketplace_orders`) — aman diunggah ulang.
- Hasil dilaporkan rinci: diimpor / dilewati / gagal (+alasan).

## Perubahan
- **Migrasi tenant `0038_marketplace`:** tabel `marketplace_orders` (channel, external_order_no,
  invoice_id) + indeks unik idempotensi.
- **`shared`:** `MARKETPLACE_CHANNELS` + label, `marketplaceImportSchema`, `ApiMarketplaceOrder`.
- **`routes/marketplace.ts`:** `POST /:tenantId/marketplace/import` (admin) — kelompokkan per
  pesanan, cocokkan SKU (peta sekali baca, hindari N+1), `executeInvoice`, catat idempotensi;
  `GET /:tenantId/marketplace/orders` (viewer) — daftar pesanan terimpor + nomor faktur.
- **Web:** halaman **Marketplace** (`/app/marketplace`, grup Transaksi) — pilih kanal/gudang/
  pelanggan, tempel atau unggah CSV, pratinjau jumlah pesanan, impor, dan tabel riwayat impor.

## Uji
- **Smoke (+5, di tenant comped terisolasi agar tak mengganggu asersi angka tenant utama):** 2
  pesanan → 2 faktur (baris digabung, SKU case-insensitive); re-import idempoten → 2 dilewati;
  SKU tak dikenal → gagal 0 diimpor; tanpa sesi → 401; daftar memuat nomor faktur.

## Catatan increment berikutnya
Konektor API langsung (tarik pesanan otomatis + sinkron stok balik ke marketplace) memerlukan
kunci/OAuth tiap marketplace — menyusul saat kunci tersedia; pola degradasi anggun sudah disiapkan.

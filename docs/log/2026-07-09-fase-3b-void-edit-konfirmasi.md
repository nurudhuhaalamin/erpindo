# Log Kerja — Fase 3b: Void Dokumen, Edit Master Data, & Dialog Konfirmasi

**Tanggal:** 9 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Tiga celah dampak-tinggi dari audit Fase 3: (1) faktur salah input tidak bisa dibatalkan —
koreksi hanya lewat retur; (2) produk/kontak/gudang/akun tidak bisa diedit dari UI; (3) aksi
berisiko (arsip, tutup buku, lepas aset, nonaktif 2FA) memakai `window.confirm` polos atau
tanpa konfirmasi sama sekali. Ditambah satu bug laten: `PUT` master data tidak mengecek
duplikat kolom unik → mengubah SKU ke nilai yang sudah ada menghasilkan error 500 mentah.

## Yang dikerjakan

1. **Void faktur penjualan & pembelian.** Migrasi `0018_void` menambah kolom `voided_at` di
   `invoices` & `purchases` (lebih aman daripada mengubah CHECK status di SQLite). Endpoint
   `POST …/invoices/:id/void` & `…/purchases/:id/void`:
   - **Jurnal pembalik persis** — baris jurnal asal ditukar debit↔kredit, bertanggal sama
     dengan dokumen asal, sehingga gerbang tutup buku otomatis berlaku (dokumen di periode
     terkunci → 400 + saran pakai retur).
   - **Stok kembali eksak** — faktur penjualan: tiap mutasi `stock_movements` asal dikembalikan
     pada `unit_cost` asal (bukan avg kini) → nilai persediaan pulih persis. Pembelian: hanya
     bisa di-void bila stoknya **belum bergerak** (tidak ada mutasi lebih baru untuk
     produk+gudang yang sama); produk ber-lot/kedaluwarsa diarahkan ke retur.
   - **Guard**: sudah dibayar / sudah ada retur / sudah void → 400; pembayaran & retur atas
     dokumen void → 400; semua query outstanding (aging, dashboard, e-Faktur, listDocs)
     kini memfilter `voided_at IS NULL`.
   - UI: tombol "Batalkan" (hanya dok bersih), badge **DIBATALKAN**, dialog konfirmasi.
2. **Edit master data.** `client.updateItem` + form tambah/ubah bersama di halaman
   Produk/Kontak/Gudang (tombol "Ubah" per baris; kontak saat diedit juga membuka alamat &
   NPWP). Bug PUT diperbaiki: cek duplikat kolom unik **kecuali diri sendiri** → 409 rapi.
3. **Rename akun.** `PATCH …/accounts/:id` — nama saja; kode & tipe terkunci demi integritas
   laporan & pemetaan akun sistem. UI edit inline di Bagan Akun.
4. **Komponen `ConfirmDialog`** (modal berbrand: backdrop blur, Escape, varian danger, busy).
   Dipakai di: arsip produk/kontak/gudang, batalkan dokumen, tutup buku (ganti
   `window.confirm`), pelepasan aset, dan nonaktif 2FA.

## Validasi (semua hijau)

- Typecheck · unit test 24 · build · **smoke 292 → 334** (42 pemeriksaan baru): void faktur →
  stok kembali 20 pcs @50rb, piutang & laba-rugi Agustus pulih persis, neraca saldo seimbang;
  void pembelian stok-utuh OK, stok-bergerak/ber-lot ditolak; bayar-retur-void dokumen void
  ditolak; void di periode terkunci ditolak dengan saran retur; edit PUT + duplikat 409 +
  RBAC; rename akun + validasi. Semua dokumen uji bertanggal Agustus 2026 agar angka Juli
  (arus kas, laba-rugi) tidak berubah.
- Playwright: edit produk, dialog arsip (gelap), konfirmasi void, badge DIBATALKAN, rename
  akun inline (gelap) — dikirim ke pemilik.

## Berikutnya

Fase 3c: search + pagination + combobox typeahead produk/kontak (lihat rencana Fase 3).

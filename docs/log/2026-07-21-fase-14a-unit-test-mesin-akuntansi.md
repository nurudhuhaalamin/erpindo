# Log Kerja — Fase 14a: Unit test mesin akuntansi inti

**Tanggal:** 21 Juli 2026.

## Yang dikerjakan

Menutup celah risiko terbesar sebelum menumpuk fitur baru: **mesin double-entry inti
tidak punya satu pun unit test**, padahal SEMUA faktur, pembelian, dan pembayaran
memposting jurnal + menggerakkan stok lewatnya.

1. **Harness SQLite in-memory** (`apps/api/test/helpers/memdb.ts`): membungkus
   `node:sqlite` (Node built-in) sebagai antarmuka `SqlExecutor` bergaya D1
   (prepare/bind/all/run/first). Skema dibangun dari **migrasi tenant asli**
   (`TENANT_MIGRATIONS` via `applyMigrations`) — termasuk seed COA + gudang UTAMA — jadi
   uji menempel pada skema produksi, bukan tiruan. FK dimatikan agar setara D1 (yang
   bersandar pada validasi lapis aplikasi). Deklarasi ambient minimal `node-sqlite.d.ts`
   (tsconfig hanya memuat `@cloudflare/workers-types`).
2. **`accounting.test.ts`** (6): `postJournal` (nomor JRN berurutan, tolak tak seimbang,
   tolak < 2 baris/nol, `PeriodLockedError` saat periode ditutup) + `nextDocNo` (format
   bawaan berurutan; pola kustom di-scope per periode terhadap `settings.doc_numbering`,
   termasuk reset antar bulan).
3. **`commercePosting.test.ts`** (13): `executePurchase` (subtotal/PPN/total, stok masuk,
   jurnal seimbang, moving-average pembelian kedua, tolak kontak salah jenis/tak ada);
   `executeInvoice` (pendapatan+HPP+stok berkurang & jurnal seimbang, diskon per baris,
   produk jasa tanpa stok/HPP, stok tak cukup → error tanpa efek, total nol ditolak,
   validasi jenis kontak, valas tanpa kurs ditolak); `voidDoc` (jurnal pembalik + stok
   pulih persis + buku tetap seimbang, tolak faktur terbayar, 404 dokumen tak ada).

Tanpa perubahan kode produksi — murni menambah uji.

## Validasi

- **Unit 137 → 156** (+19): 6 accounting + 13 commercePosting, semua terhadap SQLite nyata.
- Smoke 842 · ui-sim 182 (tak berubah — fase uji saja) · typecheck 4/4 · lint bersih · build.

## Catatan

- `node:sqlite` masih "experimental" di Node 22 (memunculkan ExperimentalWarning di
  stderr — tak menggagalkan uji). Bila kelak distabilkan, deklarasi ambient bisa diganti
  tipe resmi dari `@types/node`.

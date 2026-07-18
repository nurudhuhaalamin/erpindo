# Log Kerja — Fase 13f: Wizard migrasi & saldo awal

**Tanggal:** 18 Juli 2026.

## Yang dikerjakan

Menghancurkan hambatan pindah dari sistem lama: pengguna mengunggah saldo awal
akun + stok awal, sistem menyusun **satu jurnal pembuka yang dijamin seimbang**.

1. **Endpoint** (`apps/api/src/routes/migration.ts`):
   - `GET /:tenantId/migration/opening-status` → `canSetOpening` (true bila buku
     masih kosong) + jumlah jurnal terposting.
   - `POST /:tenantId/migration/opening-balances` (role admin) — menerima
     `asOfDate`, `accounts[]` (kode akun + debit/kredit), `stock[]` (produk +
     gudang + qty + biaya). Alur: validasi referensi → nilai persediaan dari stok
     otomatis jadi baris Persediaan (1-1300) → **penyeimbang otomatis ke Ekuitas
     Saldo Awal / Laba Ditahan (3-2000)** sehingga jurnal SELALU seimbang →
     `postJournal` (reuse) → `stockIn` per baris (level + mutasi masuk sinkron
     dengan buku besar).
   - **Guard integritas**: hanya boleh saat buku kosong (belum ada jurnal
     terposting) → 409 `books-not-empty` bila sudah berisi. Persediaan tak boleh
     diisi manual di saldo akun (diambil dari stok) → 400.
2. **Skema** dwiguna (`packages/shared/src/migration.ts`): `openingBalanceSchema`,
   `ApiOpeningStatus` — dipakai API & web.
3. **Halaman web** `pages/migration.tsx` + menu "Migrasi" + rute `/app/migrasi`:
   impor **CSV** (tempel) untuk saldo akun (`kode,debit,kredit`) dan stok awal
   (`sku,gudang,qty,biaya`) — memakai `parseCsv` yang sudah ada; resolusi
   SKU→produk & nama gudang→id di klien. Tombol "Isi contoh", tanggal saldo awal,
   dan penjelasan penyeimbang otomatis. Bila buku sudah berisi → info, form disembunyikan.

## Batas cakupan (jujur)

Saldo awal AR/AP masuk sebagai **agregat** ke akun Piutang/Hutang (via saldo akun),
bukan per-faktur open-item yang bisa dilunasi satu per satu — cukup untuk mayoritas
migrasi; open-item terperinci dicatat sebagai penyempurnaan lanjutan.

## Validasi

- Smoke **800 → 808** (+8): diuji di "Toko Sari" (tenant berbuku kosong milik Sari).
  canSetOpening true → jurnal pembuka 201, nilai stok 600rb, **neraca seimbang**,
  total aset = kas+bank+persediaan (25.600.000), kartu stok memuat mutasi masuk 100,
  status flip ke false, pengisian kedua 409, data invalid 400.
- UI-sim **174 → 176** (+2): rute `/app/migrasi` masuk sapuan (render + bebas galat).
- Unit 105 · typecheck 4/4 · lint bersih · build.

# Log Kerja — Fase 14i: Uji penjaga integritas posting

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Lanjutan 14a/14g/14h. `lib/commercePosting.ts` mengekspor beberapa **penjaga
integritas** yang dipanggil di SETIAP posting faktur/pembelian tetapi belum
tercakup uji 14a (yang fokus ke `executeInvoice`/`executePurchase`/`voidDoc`).
Guard yang salah bisa meloloskan dokumen cacat, jadi diuji terpisah.

**`apps/api/test/commerceGuards.test.ts`** (10 uji) terhadap SQLite in-memory:

- **`resolveCurrency`**: IDR/kosong → kurs 1; kode dinormalkan huruf besar;
  valas tanpa kurs / kurs ≤ 0 → ditolak; valas belum terdaftar → ditolak; valas
  terdaftar + kurs > 0 → memakai kurs input pembayaran (bukan kurs master).
- **`checkPeriodOpen`**: tanpa tutup buku → lolos; tanggal ≤ `locked_before`
  ditolak (batas **inklusif**); setelahnya lolos.
- **`approvalThreshold`**: tanpa setelan → 0; membaca angka dari settings; nilai
  tak valid (`"abc"`) → 0.
- **`checkProject`**: tanpa proyek → null; id tak ada → error; proyek ada → null.
- **`validateRefs`**: kontak tak ada / salah jenis (pemasok untuk faktur jual &
  sebaliknya) / diarsipkan; gudang tak ada; produk tak ada/diarsipkan; dan jalur
  valid (termasuk kontak `both` yang sah untuk faktur maupun pembelian) → null.

Tanpa perubahan kode produksi — murni menambah uji.

## Validasi

- **Unit 177 → 187** (+10): seluruhnya di `apps/api` (75 → 85).
- typecheck 4/4 · lint bersih · build.
- Smoke 850 · ui-sim 184 **(tak berubah — fase uji saja**, tanpa kode produksi/UI).

## Catatan

Dengan 14i, seluruh fungsi terekspor `lib/commercePosting.ts`,
`lib/accounting.ts`, `lib/reports.ts`, dan `runDepreciation` kini punya uji unit
langsung. Logika yang masih tertanam di handler route (selisih kurs pelunasan,
pelepasan aset, posting POS/gaji) menjadi kandidat berikutnya — perlu diekstrak
jadi fungsi murni lebih dulu agar tetap uji-saja tanpa risiko perubahan perilaku.

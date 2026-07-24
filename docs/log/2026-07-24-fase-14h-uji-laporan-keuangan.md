# Log Kerja — Fase 14h: Uji mesin laporan keuangan

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Lanjutan 14a/14g. Mesin **laporan keuangan inti** (`apps/api/src/lib/reports.ts`)
— Laba Rugi & Neraca yang dipakai laporan per-tenant maupun konsolidasi lintas
perusahaan — sebelumnya **tanpa uji unit**, padahal ini janji inti aplikasi:
**Neraca wajib selalu seimbang** dan laba/rugi berjalan masuk ke ekuitas.

**`apps/api/test/reports.test.ts`** (11 uji) terhadap SQLite in-memory beskema
migrasi tenant asli, memposting jurnal nyata lewat `postJournal`:

- **`computeIncomeStatement`**: menjumlahkan pendapatan/beban + laba bersih;
  `income.amount` = kredit−debit, `expense.amount` = debit−kredit; hanya memuat
  entri dalam rentang `[from, to]` (inklusif); **mengabaikan jurnal void**.
- **`computeBalanceSheet`**: invarian **`balanced === true`** &
  `totalAssets === totalLiabilities + totalEquity` setelah rangkaian jurnal
  seimbang; **laba berjalan** (pendapatan−beban) muncul sebagai baris ekuitas
  `laba-berjalan`; **rugi berjalan negatif tetap seimbang**; akun bersaldo nol
  disaring; kutoff `asOf` mengecualikan entri setelah tanggal neraca.
- **`profitLoss`**: menegaskan batas **`to` eksklusif** (`< to`) — berbeda dari
  Laba Rugi yang inklusif (`<= to`); uji membandingkan keduanya pada entri tepat
  di tanggal batas. Plus laba = pendapatan − beban.
- **`monthStart`**: format `YYYY-MM-01`, urutan kronologis antar-offset, dan
  aritmetika offset yang melintasi batas tahun dengan benar (UTC).

Tanpa perubahan kode produksi — murni menambah uji.

## Validasi

- **Unit 166 → 177** (+11): seluruhnya di `apps/api` (64 → 75), diuji terhadap
  mesin laporan nyata di atas skema produksi.
- typecheck 4/4 · lint bersih · build.
- Smoke 850 · ui-sim 184 **(tak berubah — fase uji saja**, tanpa kode produksi/UI).

## Catatan

- Uji void memakai `UPDATE journal_entries SET status='void'` langsung (bukan
  jalur pembalik penuh) — cukup untuk membuktikan `accountBalances` memfilter
  `status='posted'`; efek jurnal pembalik itu sendiri sudah tercakup di
  `commercePosting.test.ts` (14a).

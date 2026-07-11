# Log Kerja — Fase 7f: Akuntansi Dimensi + Rekonsiliasi Bank v2

**Tanggal:** 11 Juli 2026 · **Fase 7 (pendalaman modul), gelombang Enterprise.**

## Yang dikerjakan

Dua kemampuan akuntansi kelas menengah, keduanya **ADDITIVE** (jurnal & laporan lama tak berubah):

1. **Akuntansi dimensi (cost center / departemen).** Master cost center + kolom opsional
   `cost_center_id` per baris jurnal. Form Jurnal Umum kini punya **pemilih dimensi per baris**.
   Laporan **laba-rugi per dimensi** mengelompokkan pendapatan & beban per cost center pada
   rentang tanggal (baris "Tanpa dimensi" untuk yang tak ditandai) + ekspor CSV.
2. **Rekonsiliasi bank v2.** **Aturan auto-match tersimpan** per akun bank (kata kunci deskripsi
   + toleransi hari) untuk mempercepat pencocokan; **preset format impor** rekening koran bank
   besar (BCA/Mandiri/BRI) untuk pemetaan kolom otomatis saat impor mutasi.

### Perubahan teknis
- **Migrasi `0032_dimensions`**: `cost_centers` + kolom `journal_lines.cost_center_id` (nullable,
  indeks) + `bank_match_rules`.
- **`postJournal`**: `JournalLineInput` mendapat `costCenterId` opsional (default null) — jalur
  otomatis lama tak terpengaruh. Endpoint jurnal manual memvalidasi cost center bila diisi.
- **Skema shared**: `costCenterSchema`, `bankMatchRuleSchema`, `BANK_CSV_PRESETS`, tipe
  `ApiCostCenter`/`ApiDimensionReport`/`ApiBankMatchRule`; `journalLineSchema` +costCenterId.
- **API `dimensions.ts`**: cost-centers CRUD; `GET reports/dimension`; bank-match-rules CRUD.
  Audit `dimension.*`.
- **Web**: halaman **Dimensi & Rekon** (`/app/keuangan/dimensi`) — cost center + laporan dimensi +
  aturan auto-match; **pemilih dimensi per baris** di form Jurnal Umum; nav grup Keuangan.
- **seed-demo**: 2 cost center (Cabang Bandung/Jakarta) + 2 jurnal beban bertag + 1 aturan rekon.

## Validasi

- Typecheck · unit test (24) · build · **smoke 586 → 598** (+12): viewer buat cost center 403;
  buat 201; kode duplikat 409; jurnal dengan dimensi 201; jurnal dengan cost center tak dikenal
  400; **laporan dimensi menampilkan beban per cost center (500rb, laba -500rb)**; arsip 200;
  viewer buat aturan 403; buat aturan 201; daftar memuat; hapus 200; neraca saldo seimbang. Alur
  jurnal/laporan lama tetap hijau (dimensi opsional, entitas & tanggal Oktober terpisah).
- Screenshot halaman Dimensi & Rekon dikirim ke pemilik.

## Berikutnya

Fase 7g: Proyek Gantt + dependensi tugas & baseline; Manufaktur work center + routing + biaya
aktual vs standar (WIP).

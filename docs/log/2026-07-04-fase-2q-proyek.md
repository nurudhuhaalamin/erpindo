# Log Kerja — Gelombang B-5 (Fase 2q): Proyek

**Tanggal:** 4 Juli 2026 · **Status akhir:** selesai, siap PR — **Gelombang B tuntas.**

## Konteks

Modul terakhir Gelombang B (back-office V2 lanjutan): **Proyek** dengan tugas dan
**laporan profitabilitas per proyek**. Pendekatan yang dipilih menandai
`journal_entries.project_id` — profitabilitas dihitung dari jurnal terposting ber-tag,
jadi penjualan ber-tag otomatis membawa pendapatan **dan** HPP-nya, dan konsisten dengan
buku besar tanpa perhitungan terpisah.

## Yang dibangun

- **Migrasi tenant `0012_projects`**: tabel `projects` (kode unik, status, anggaran,
  pelanggan opsional) & `project_tasks`; kolom `project_id` ditambahkan ke `journal_entries`
  (+ indeks).
- **`postJournal` (accounting.ts)**: parameter opsional `projectId` — **backward-compatible**,
  semua pemanggil lama (pembayaran, retur, payroll, aset, opname, POS) tak berubah.
- **Tagging pada transaksi**: `createInvoiceSchema` (dipakai penjualan & pembelian) dan
  `createJournalEntrySchema` menerima `projectId` opsional; `executeInvoice`/`executePurchase`
  dan route jurnal manual meneruskannya + memvalidasi proyek ada.
- **API `routes/projects.ts`**: proyek CRUD + ubah status; tugas tambah/ubah status; laporan
  profitabilitas dihitung via sub-kueri korelasi (pendapatan = akun income kredit−debit, biaya
  = akun expense debit−kredit dari jurnal ber-tag terposting); detail proyek menampilkan tugas
  + rincian entri jurnal ber-tag.
- **Web `pages/projects.tsx`**: form proyek, daftar dengan pendapatan/biaya/laba + margin,
  panel detail (status, tugas dengan toggle, tabel transaksi ber-tag). Pemilih **Proyek** di
  form Penjualan/Pembelian (`commerce.tsx`) dan Jurnal Umum (`finance.tsx`). Nav "Proyek"
  (ikon `FolderKanban`) di seksi Lainnya, rute `/app/proyek`.

## Validasi (semua hijau)

- Typecheck · 24 unit test · build.
- **Smoke 197 → 207** — seksi "11k. Proyek": buat proyek (kode di-uppercase), kode ganda 409,
  RBAC viewer 403, tag pendapatan 10jt & biaya 4jt via jurnal → **profitabilitas pendapatan
  10jt / biaya 4jt / laba 6jt** eksak, jurnal dengan proyek tak dikenal 400, tugas tambah/ubah
  status, ubah status proyek, dan **neraca saldo tetap seimbang**. Jurnal ber-tag bertanggal
  Agustus agar arus kas Juli tak terganggu.
- Verifikasi visual Playwright: halaman Proyek terang & gelap (profitabilitas + tugas + entri).

## Status Gelombang B

**Tuntas:** CRM Pipeline (2l), Anggaran (2n), HR & Payroll (2o), Aset Tetap (2p), Proyek (2q).
Selanjutnya Gelombang C (V3 tanpa dependensi eksternal): Manufaktur+QC, Maintenance, Multi
mata uang, Helpdesk, Kontrak/tagihan berulang, Konsolidasi multi-perusahaan, Ekspor e-Faktur.
Manajemen Dokumen (A-6) tetap menunggu pemilik mengaktifkan R2.

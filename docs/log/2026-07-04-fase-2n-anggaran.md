# Log Kerja — Gelombang B-2 (Fase 2n): Anggaran

**Tanggal:** 4 Juli 2026 · **Status akhir:** selesai, siap PR

## Konteks

Setelah CRM (Fase 2l), modul back-office berikutnya: **Anggaran** — menetapkan
target pendapatan & beban per akun per bulan, lalu membandingkannya dengan realisasi
yang dihitung otomatis dari jurnal. Tidak ada dependensi eksternal; mengikuti pola
laporan keuangan yang sudah ada.

## Yang dibangun

- **Migrasi tenant `0009_budgets`**: tabel `budgets` (`account_id`, `period` 'YYYY-MM',
  `amount`, `UNIQUE(account_id, period)`). Tabel ini hanya menyimpan **target** — realisasi
  tetap dihitung dari `journal_lines` terposting, jadi laporan varians selalu konsisten
  dengan buku besar.
- **Skema Zod (`packages/shared`)**: `setBudgetSchema` + tipe respons `ApiBudgetRow`
  (per akun: budget, actual, variance) dan `ApiBudgetReport` (rincian + total per jenis).
- **API `routes/budgets.ts`**:
  - `GET /budgets/:period` (viewer) — laporan anggaran vs realisasi satu bulan. Realisasi
    per akun dihitung dari jurnal terposting dalam rentang bulan, dengan tanda mengikuti
    tipe akun (pendapatan = kredit−debit, beban = debit−kredit). Selisih favorable positif:
    pendapatan di atas target atau beban di bawah target.
  - `PUT /budgets` (admin) — upsert anggaran satu akun untuk satu bulan; ditolak bila akun
    bukan pendapatan/beban.
- **Web `pages/budget.tsx`** (`BudgetPage`): pemilih bulan, tabel **Pendapatan** & **Beban**
  dengan input anggaran (tersimpan saat blur untuk admin), kolom realisasi + selisih
  berwarna (hijau favorable / merah unfavorable), ringkasan laba/rugi anggaran vs realisasi,
  dan ekspor CSV. Rute `/app/keuangan/anggaran`, nav "Anggaran" (ikon `PiggyBank`) di seksi
  Keuangan, metode `budgets`/`setBudget` di api client.

## Validasi (semua hijau)

- Typecheck · 20 unit test · build.
- **Smoke 176 pemeriksaan** (naik dari 168) — seksi "11h. Anggaran": tetapkan/upsert
  anggaran, **realisasi cocok dengan angka Laba Rugi bulan yang sama** (dicek sebagai
  invariant, bukan angka hardcode), selisih = realisasi − anggaran, RBAC viewer ditolak
  (403), anggaran pada akun non-pendapatan/beban ditolak (400), periode salah format
  ditolak (400). Arus kas & neraca saldo tak terpengaruh (modul hanya membaca jurnal).
- Verifikasi visual Playwright: halaman Anggaran terang & gelap — tabel pendapatan/beban,
  input anggaran, realisasi & selisih berwarna, ringkasan laba/rugi.

## Catatan operasional

Container sesi sempat restart saat verifikasi visual; kode utuh & tervalidasi ulang
(176 smoke tetap hijau) sebelum ship. Gelombang A-6 (dokumen R2) tetap ditunda sampai
pemilik mengaktifkan R2.

## Berikutnya

Gelombang B-3: **HR & Payroll** (karyawan, komponen gaji, PPh 21 metode TER + BPJS, slip
gaji, jurnal beban gaji otomatis).

# Log Kerja — Gelombang B-3 (Fase 2o): HR & Payroll

**Tanggal:** 4 Juli 2026 · **Status akhir:** selesai, siap PR

## Konteks

Modul back-office terbesar: penggajian bulanan Indonesia dengan **PPh 21 metode TER**
(PMK 168/2023) dan **BPJS**, plus jurnal beban gaji otomatis. Mesin perhitungan pajak
diletakkan di satu berkas shared yang teruji unit test, dengan caveat verifikasi tarif.

## Yang dibangun

- **Mesin perhitungan (`packages/shared/src/payroll.ts`)** — sumber kebenaran tarif, mudah
  diperbarui, murni & teruji: pemetaan status PTKP → kategori TER (A/B/C), tabel TER bulanan
  ketiga kategori, parameter BPJS pekerja (Kesehatan 1% batas 12jt, JHT 2%, JP 1% batas
  10.547.400) + tarif employer sebagai info, dan `calculatePayslip()` yang menghitung
  bruto → potongan (BPJS + PPh 21 = tarif TER × bruto) → netto. **Diberi tanda ⚠ verifikasi
  tarif pajak** karena peraturan bisa berubah.
- **Migrasi tenant `0010_payroll`**: `employees`, `payroll_runs` (UNIQUE per periode),
  `payslips` (rincian per karyawan). Memakai akun COA yang sudah ada (Beban Gaji 5-2000,
  Hutang Gaji 2-1200, Kas).
- **API `routes/payroll.ts`**: karyawan CRUD + aktif/nonaktif; `POST /payroll-runs` menjalankan
  penggajian satu bulan — hitung semua karyawan aktif, simpan run + slip, dan **posting satu
  jurnal**: Debit Beban Gaji (bruto), Kredit Kas (netto), Kredit Hutang Gaji (potongan yang
  harus disetor). Dijaga: satu run per periode (409), tutup buku, akun kas harus aset, minimal
  1 karyawan aktif. RBAC per-endpoint + audit.
- **Web `pages/payroll.tsx`**: banner caveat pajak, kelola karyawan (form + tabel + aktif/
  nonaktif), jalankan penggajian (periode + akun kas + tanggal), dan riwayat penggajian dengan
  **slip gaji per karyawan** (bruto, BPJS, PPh 21 dengan kategori/tarif TER, netto). Nav seksi
  "HR" (ikon `UsersRound`), rute `/app/hr/penggajian`, metode api client.

## Validasi (semua hijau)

- Typecheck · build.
- **Unit test naik 20 → 24**: pemetaan kategori TER, PPh 21 = 0 di bawah ambang, konsistensi
  bruto = netto + potongan, dan penerapan batas upah BPJS (Kesehatan 12jt, JP 10.547.400).
- **Smoke 176 → 186** — seksi "11i. HR & Payroll": tambah karyawan, RBAC viewer 403, jalankan
  penggajian (bruto 15jt / netto 14,2jt / 2 karyawan eksak), slip manajer PPh21 200rb (TER A
  2%) & staf di bawah ambang PPh21 0, penggajian ganda 409, akun non-kas 400, dan **neraca
  saldo tetap seimbang** setelah jurnal gaji. Digaji di Agustus agar tak mengganggu asersi
  arus kas Juli.
- Verifikasi visual Playwright: halaman Penggajian terang & gelap dengan slip gaji terbuka.

## Catatan

Tarif TER/BPJS ada di satu berkas dan ditandai untuk diverifikasi dengan peraturan terbaru
sebelum penggajian resmi — engine, jurnal, dan alur sudah berkualitas produksi. Iuran BPJS
sisi employer belum dijurnalkan (potongan pekerja saja) — bisa ditambah di iterasi lanjutan.

## Berikutnya

Gelombang B-4: **Aset Tetap** (register aset, penyusutan garis lurus otomatis bulanan via
Cron + jurnal, pelepasan aset).

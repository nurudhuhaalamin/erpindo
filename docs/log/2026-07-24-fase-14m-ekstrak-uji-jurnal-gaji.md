# Log Kerja — Fase 14m: Ekstrak & uji jurnal penggajian

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Melanjutkan pola 14k/14l. Perakit **baris jurnal penggajian** tadinya inline di
handler `payroll-runs` (`routes/payroll.ts`) — tak terjangkau uji unit.
Perhitungan gaji (PPh 21 TER/BPJS) sudah teruji di paket shared (`calculatePayslip`);
yang belum adalah **perakitan jurnalnya**. Diekstrak jadi fungsi murni
**`buildPayrollJournalLines`**:

```
Debit  Beban Gaji         = totalGross (bruto)
Kredit Kas                = totalNet (netto yang dibayar)
Kredit Hutang Gaji        = totalDeductions (PPh21 & BPJS, bila > 0)
Kredit Piutang Karyawan   = totalLoanDeduction (cicilan kasbon, bila ada akun & > 0)
```

Karena `bruto = netto + potongan + cicilan`, jurnal selalu seimbang. Handler
tetap meresolusi akun (termasuk memastikan akun kasbon saat ada cicilan) lalu
memanggil fungsi ini; baris & syaratnya **sama persis** dengan kode lama.

**`apps/api/test/payrollJournal.test.ts`** (5 uji): dengan potongan (Beban/Kas/
Hutang seimbang), dengan cicilan kasbon (tambah Kredit Piutang Karyawan), tanpa
potongan (tak ada baris Hutang), akun piutang null → baris cicilan disaring
(mengikuti guard handler), dan deskripsi memuat periode. Kasus utama mengasersi
**Σdebit = Σkredit**.

## Validasi

- **Unit 207 → 212** (+5): `apps/api` 105 → 110.
- **Smoke 850 (tetap)** — jalur route LULUS: "penggajian 2026-05/06 berjalan 201"
  + "neraca saldo seimbang setelah void penggajian", membuktikan ekstraksi
  behavior-preserving.
- typecheck 4/4 · lint bersih · build · ui-sim 184 (tak berubah).

## Catatan jujur

- Sempat ada error typecheck di berkas uji (helper `byAcc` terlalu sempit tipenya
  saat mengakses `.description`) — diperbaiki jadi generik. Bukti gerbang
  typecheck bekerja; tak menyentuh kode produksi.
- Ini melengkapi ekstraksi mesin-uang yang bersih (selisih kurs 14k, pelepasan
  aset 14l, jurnal gaji 14m). Sisa yang belum diuji unit (posting POS
  multi-tender) adalah orkestrasi DB, bukan perhitungan murni — kandidat
  restrukturisasi tersendiri, bukan ekstraksi sederhana.

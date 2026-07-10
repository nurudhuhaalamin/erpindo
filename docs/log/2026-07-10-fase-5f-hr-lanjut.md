# Log Kerja — Fase 5f: HR Lanjut

**Tanggal:** 10 Juli 2026 · **Temuan review pemilik #7:** HR masih sangat minim.

## Yang dikerjakan

1. **Slip gaji cetak/PDF** per karyawan: halaman cetak berlogo baru
   `/cetak/slip-gaji?tenant=&run=&employee=` (pola cetak faktur) — rincian penghasilan
   (pokok + tunjangan + bonus/potongan), potongan (BPJS, PPh 21 TER, cicilan kasbon), dan
   gaji netto dibawa pulang. Tautan "Cetak" di tiap baris slip pada Riwayat penggajian.
2. **Komponen ad-hoc per periode** (bonus/lembur/potongan): tabel `payroll_adjustments`.
   Ditambahkan sebelum run periode itu; saat penggajian dijalankan komponen ikut menambah
   (atau mengurangi) bruto sehingga **PPh 21 & BPJS ikut menyesuaikan otomatis** dan tercatat
   di jurnal beban gaji. Komponen terkunci ("terpakai") setelah run.
3. **Kasbon/pinjaman karyawan**: tabel `employee_loans`. Pencairan tercatat sebagai
   **Piutang Karyawan (1-1210, berjurnal)**; cicilan otomatis memotong gaji **netto** tiap
   penggajian sampai saldo lunas (di luar perhitungan pajak). Akun piutang dibuat sekali bila
   template COA tenant belum punya (`ensureAccountByCode`).
4. **Cuti & izin**: tabel `leave_requests` (tahunan/sakit/izin). Pengajuan + persetujuan
   Owner/Admin; **cuti tahunan yang disetujui memotong saldo cuti** karyawan (default 12
   hari/tahun, kolom baru `employees.leave_balance`). Pengajuan melebihi saldo ditolak.
5. **Bukti potong PPh 21 tahunan** (ringkasan 1721-A1): halaman cetak
   `/cetak/1721a1?tenant=&employee=&year=` — akumulasi seluruh run setahun per karyawan
   (bruto, BPJS pekerja, PPh 21 dipotong) + total setahun. Tautan "Cetak" di daftar karyawan.
6. Migrasi tenant `0022_hr_extras` (backward-compatible: 3 kolom ALTER + 3 tabel baru);
   skema shared (payrollAdjustment/employeeLoan/leaveRequest + tipe Api*); klien API; slip gaji
   & run kini membawa `adjustmentsTotal` + `loanDeduction`. Seed-demo diperluas (kasbon,
   bonus kinerja, cuti disetujui + izin menunggu, run bulan berjalan) → 143 langkah.

## Validasi

- Typecheck · unit test (24) · build · **smoke 423 → 441** (+18: kasbon 201+jurnal, saldo &
  status, cicilan>pokok 400, RBAC 403; komponen ad-hoc 201, daftar 2 belum terpakai, hapus
  belum terpakai 200, slip memuat bonus bruto 6jt + cicilan 1jt, saldo kasbon turun ke 1jt,
  hapus komponen terpakai 409; cuti tahunan 3 hari 201, RBAC 403, setujui 200, saldo 12→9,
  putus ulang 409, cuti > saldo 400; neraca saldo tetap seimbang). Semua tambahan pada seksi
  HR pra-cron dengan periode 2026-09 yang belum terpakai, tanpa mengganggu assert angka lama.
- Screenshot halaman Penggajian, slip gaji (dengan bonus), dan bukti potong 1721-A1 — dikirim
  ke pemilik.

## Berikutnya

Fase 5g: Proyek lanjut (termin penagihan → faktur, RAB vs realisasi, papan tugas + % progres,
timesheet → biaya proyek).

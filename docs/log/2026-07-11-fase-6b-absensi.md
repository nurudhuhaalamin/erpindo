# Log Kerja — Fase 6b: HR Absensi/Kehadiran

**Tanggal:** 11 Juli 2026 · **Temuan review pemilik #5** ("HR kurang enterprise — baru penggajian, padahal ada absensi dll").

## Yang dikerjakan

Modul **Absensi/kehadiran** sebagai pelengkap HR (sebelumnya hanya penggajian, kasbon, komponen
ad-hoc, cuti & izin). Satu catatan per karyawan per tanggal (upsert saat dikoreksi).

1. **Migrasi `0024_hr_attendance`**: tabel `attendance` (id, employee_id → employees, date,
   clock_in, clock_out, status default `hadir`, note, created_at) dengan `UNIQUE (employee_id,
   date)` + indeks `(employee_id, date)`. Backward-compatible, bernomor urut.
2. **Skema shared**: `ATTENDANCE_STATUSES` = hadir/izin/sakit/alfa/cuti + label Indonesia,
   `attendanceSchema` (Zod: tanggal `YYYY-MM-DD`, jam `HH:MM` opsional, catatan ≤200),
   tipe `ApiAttendance` & `ApiAttendanceRecap`.
3. **API** (di `payroll.ts`, mount `/api/tenants`):
   - `POST /:tenantId/attendance` — catat/koreksi (upsert `ON CONFLICT(employee_id,date) DO
     UPDATE`), admin-only, validasi karyawan aktif (404 bila tidak), audit
     `hr.attendance.recorded`.
   - `GET /:tenantId/attendance?month=YYYY-MM` — daftar catatan bulan itu + **rekap per karyawan
     aktif** (jumlah hari per status via `SUM(CASE …)` + `LEFT JOIN` agar karyawan tanpa catatan
     tetap muncul), viewer boleh baca. Default bulan berjalan.
   - `DELETE /:tenantId/attendance/:id` — hapus (404 bila tidak ada), admin-only, audit
     `hr.attendance.deleted`.
4. **Web** — halaman baru **HR › Absensi** (`/app/hr/absensi`): pemilih bulan, form catat
   kehadiran (karyawan/tanggal/status/jam masuk-keluar/catatan), **tabel rekap bulanan** dengan
   ekspor **CSV**, dan daftar catatan (badge status berwarna, tombol hapus + konfirmasi). Rapi di
   desktop & HP 390px (tabel rekap `overflow-x-auto`, form menumpuk). Menu + rute + label audit
   (`hr.attendance.*`) ditambahkan.
5. **Seed-demo**: 4 karyawan × 4 hari kehadiran (Agus sakit sehari, Budi alfa sehari, Sari izin
   sehari) → rekap demo kaya.

## Validasi

- Typecheck · unit test (10) · build · **smoke 471 → 483** (+12: viewer tulis 403, catat hadir
  201, catat sakit 201, status tak dikenal 400, karyawan tak dikenal 404, daftar 2 catatan, rekap
  1 hadir+1 sakit, upsert 201, upsert menimpa (total tetap 2, jadi 1 izin+1 sakit), hapus 200,
  hapus tak dikenal 404, sisa 1 setelah hapus).
- Screenshot HP 390px + desktop 1280px (form + rekap + daftar) dikirim ke pemilik.

## Berikutnya

Fase 6c: Proyek jadi PM serius (penanggung jawab tugas, prioritas, beban kerja, timeline);
lalu 6d (Procurement lengkap PR→PO→GRN→faktur), 6e (Approval workflow engine) + laporan akhir
Fase 6.

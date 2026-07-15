# Log Kerja — Fase 8c: Struktur organisasi (departemen + atasan + bagan)

**Tanggal:** 15 Juli 2026 · Gap struktural #1 dari dokumen analisis pemilik: *"tabel karyawan
tidak punya department_id dan manager_id — mustahil bikin org chart, laporan 'tim saya', atau
approval berbasis hierarki."*

## Yang dikerjakan (ADDITIVE — alur payroll lama tak berubah)

1. **Migrasi tenant `0035_org_structure`**: tabel `departments` (kode UNIQUE, nama, `parent_id`
   → hierarki, arsip) + `employees` ADD `department_id`, `manager_id` (nullable).
2. **API `orgStructure.ts`** (baru): departemen CRUD (admin tulis, viewer baca; DELETE = arsip —
   sub-departemen naik ke induk, karyawan dilepas) dengan **guard siklus** (telusuri rantai induk;
   departemen jadi leluhur/induk dirinya → 400) & kode duplikat 409; `GET /org-chart` (pohon
   departemen + karyawan per unit + nama atasan + daftar tanpa-departemen). Audit `org.*`.
3. **Karyawan** (`payroll.ts`): create/update menyimpan departemen & atasan dengan validasi
   (departemen harus ada; **atasan ≠ diri sendiri** & harus karyawan terdaftar); GET menyertakan
   `departmentName`/`managerName` (LEFT JOIN).
4. **Web (Penggajian)**: form karyawan + dropdown Departemen & Atasan langsung; kolom
   "Departemen · Atasan" di daftar; kartu **Departemen** (CRUD + pilih induk + jumlah karyawan);
   kartu **Struktur organisasi** (pohon indentasi: departemen → sub → karyawan + atasan).
5. **seed-demo**: 3 departemen (Gudang & Logistik sebagai sub-Operasional) + 4 karyawan
   ber-departemen, 3 melapor ke Manajer Operasional.

## Validasi

- Typecheck · `pnpm lint` bersih · unit test · build · **smoke 626 → 637** (+11): viewer 403;
  buat 201; duplikat 409; sub-departemen 201; **siklus ditolak 400** (dua arah: induk = anak
  sendiri & induk = diri sendiri); karyawan ber-departemen+atasan 201; **atasan = diri sendiri
  400**; GET menyertakan nama departemen & atasan; **bagan memuat hierarki + karyawan**; arsip
  200 + hilang dari daftar. Asersi payroll lama tetap hijau (kolom nullable).
- Screenshot halaman Penggajian (departemen + bagan organisasi) dikirim ke pemilik.

## Berikutnya

Fase 8d (TERAKHIR Fase 8): **RBAC berdimensi** (scope cost center per peran kustom) +
**LAPORAN AKHIR FASE 8**. Midtrans tetap pemblokir launching #1.

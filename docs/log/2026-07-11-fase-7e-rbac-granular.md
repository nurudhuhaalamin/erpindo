# Log Kerja — Fase 7e: RBAC Granular

**Tanggal:** 11 Juli 2026 · **Fase 7 (pendalaman modul), gelombang Enterprise.**

## Yang dikerjakan

Sebelumnya hak akses hanya 3 peran tetap (Owner/Admin/Viewer). Fase 7e menambah **izin per
modul + peran kustom** secara **ADDITIVE** — middleware `requireTenantRole` yang ada tidak diubah,
sehingga seluruh jalur lama & 572 asersi smoke tetap hijau.

Desain:
- **Katalog izin** 13 modul (Penjualan, Pembelian, Kasir, Stok, Keuangan, Pajak, Laporan, HR,
  Proyek, CRM, Persetujuan, Pengaturan, Kelola pengguna).
- **Preset**: Owner = semua; Admin = semua kecuali "kelola pengguna"; Viewer = semua modul
  terlihat (baca-saja tetap ditegakkan `requireTenantRole`).
- **Peran kustom** (per perusahaan): nama + **peran dasar** (Admin/Viewer, penentu hak baca/tulis
  demi kompatibilitas) + subset modul. Anggota yang memakai peran kustom tetap menyimpan
  `role = base` (agar `requireTenantRole` lama jalan) plus `custom_role_id`.
- **Enforcement**: middleware baru `requirePermission(modul)` dipasang **berdampingan** — karena
  preset memberi semua modul, jalur owner/admin/viewer lolos; peran kustom bisa membatasi.
  Diterapkan pada rute **Pajak** sebagai bukti. Sidebar web menyembunyikan menu modul terlarang.

### Perubahan teknis
- **Migrasi control-plane `0003_custom_roles`**: tabel `custom_roles` + kolom
  `memberships.custom_role_id`.
- **Skema shared**: `PERMISSIONS` (+label), `PRESET_PERMISSIONS`, `customRoleSchema`,
  `assignRoleSchema`, tipe `ApiCustomRole`, `ApiMyPermissions`; `ApiMember` +customRoleId/roleName.
- **Middleware `auth.ts`**: `resolvePermissions()` + `requirePermission()`.
- **API `tenants.ts`**: `GET my-permissions`; `GET/POST/PATCH/DELETE roles`;
  `PATCH members/:id/assign` (preset ATAU kustom, jaga owner terakhir); PATCH members lama
  menghapus custom_role_id saat balik ke preset. Audit `tenant.role_*`. Rute pajak memakai
  `requirePermission("pajak")`.
- **Web**: kartu **Peran kustom** (CRUD + grid centang modul) di Pengaturan; dropdown peran
  anggota menawarkan peran kustom; sidebar disaring `my-permissions`.
- **seed-demo**: 3 peran kustom contoh (Kasir Toko, Staf Keuangan, Auditor).

## Validasi

- Typecheck · unit test (24) · build · **smoke 572 → 586** (+14): izin Owner (13)/Admin (12, tanpa
  "pengguna")/Viewer (13); viewer buat peran 403; buat peran kustom; tetapkan ke anggota; izin
  anggota berubah sesuai peran kustom (base admin, 2 modul); **peran tanpa "pajak" ditolak akses
  Pajak (403)**, peran dengan "pajak" boleh (200) — bukti enforcement; hapus peran terpakai 409,
  lepas → hapus 200; anggota kembali Viewer. Jalur peran lama tetap hijau.
- Screenshot halaman Pengaturan (peran kustom) dikirim ke pemilik.

## Berikutnya

Fase 7f: Akuntansi dimensi (cost center/tag opsional di jurnal & laporan terfilter) +
rekonsiliasi bank v2 (aturan auto-match tersimpan, impor format bank besar).

# Log Kerja — Fase 8d: RBAC berdimensi (scope cost center per peran)

**Tanggal:** 15 Juli 2026 · **PR TERAKHIR Fase 8.**

## Yang dikerjakan (ADDITIVE — scope kosong = perilaku lama persis)

Menjawab gap "RBAC berdimensi" dari analisis pemilik: *"Manajer Cabang Surabaya login ke tenant
yang sama tapi cuma boleh lihat transaksi cabangnya."*

1. **Migrasi control-plane `0005_role_scope`**: `custom_roles` ADD `scope_cost_center_ids`
   (JSON; NULL = tanpa batasan).
2. **Skema shared**: `customRoleSchema` + `scopeCostCenterIds` opsional (maks 20);
   `ApiCustomRole`/`ApiMyPermissions` diperluas.
3. **`resolvePermissions`** (middleware) kini mengembalikan scope; `my-permissions`
   menyertakannya (dipakai UI & smoke).
4. **Penegakan** di tiga titik data dimensi:
   - `GET /cost-centers` — peran ber-scope hanya melihat cost center-nya;
   - `GET /reports/dimension` — baris di luar scope (termasuk "tanpa dimensi") disembunyikan;
   - `POST /journal-entries` — baris ber-cost-center di luar scope → **403**.
5. **Web**: kartu Peran kustom dapat bagian **"Batasi data ke cost center"** (multi-checkbox) +
   badge "terbatas N cost center" di daftar peran.
6. **seed-demo**: peran "Manajer Cabang Bandung" ber-scope CAB-BDG.

## Validasi

- Typecheck · `pnpm lint` bersih · unit test · build · **smoke 637 → 648** (+11): scope >20 → 400;
  peran ber-scope 201 + tampil di daftar; my-permissions memuat scope; **daftar cost center
  tersaring**; **laporan dimensi hanya baris dalam scope**; **jurnal luar scope 403 / dalam scope
  201**; pengguna tanpa scope tetap melihat semua (perilaku lama); anggota dikembalikan ke preset.
- Screenshot kartu Peran kustom ber-scope dikirim ke pemilik.

## Berikutnya

**LAPORAN AKHIR FASE 8** (`docs/log/2026-07-15-fase-8-laporan-akhir.md`). Midtrans tetap
pemblokir launching #1.

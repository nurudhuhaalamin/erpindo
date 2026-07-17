# Fase 11a — Buka kapasitas: auto-migrasi tenant + observability infra

**Tanggal:** 17 Juli 2026
**Branch/PR:** `claude/erp-business-planning-8wx296`
**Uji:** typecheck 4/4 · lint bersih · **26 unit** (dari 19; +7 `tenantDb.test.ts`) · build · **smoke 754** (dari 749) · **ui-sim 160** (tetap)

Fase 11 dibuka dengan **fondasi skala**. Dua celah nyata ditutup: (1) tenant lama tak
pernah menerima migrasi skema baru, (2) mode produksi (`cloudflare`) belum teruji &
kurang matang. Belum menyalakan mode cloudflare di produksi (butuh kredensial pemilik —
lihat runbook di bawah), tetapi seluruh kode + uji sudah siap.

## Masalah yang diperbaiki

- **Migrasi tenant existing (celah utama):** `provisionTenantDb` menjalankan `applyMigrations`
  **hanya saat provisioning**. Migrasi baru yang ditambahkan pada rilis berikut **tak pernah**
  sampai ke tenant yang sudah ada → kolom/tabel baru hilang untuk mereka. Kini ada auto-migrasi.
- **Mode cloudflare (`HttpD1Executor`) kurang lengkap:** tak punya `.first()` yang dimiliki D1
  nyata → kode yang memakainya akan pecah di produksi. Kini ditambahkan (satu round-trip REST).

## Perubahan

### 1) `apps/api/src/lib/tenantDb.ts`
- **`HttpD1Executor.first()`** — melengkapi antarmuka D1 di mode cloudflare (ambil baris pertama
  dalam satu round-trip, bukan tarik-semua-lalu-iris). `SqlExecutor` (packages/db) kini juga
  mendeklarasikan `first()` agar kontrak sama untuk kedua mode.
- **`ensureTenantMigrated(env, {id, dbRef, schemaVersion})`** — auto-migrasi **malas**: jika versi
  tenant tertinggal, terapkan `applyMigrations` lalu naikkan `tenants.schema_version`. Idempoten,
  aman konkuren (applyMigrations mencatat di `_migrations`), langsung kembali bila sudah mutakhir.
- **`migrateAllTenants(env)`** — sapu **borongan** semua tenant; per-tenant try/catch (satu gagal
  tak menghentikan sisanya; **resumable** — versi hanya naik saat sukses, jalankan lagi untuk retry).

### 2) `apps/api/src/middleware/auth.ts` — auto-migrasi malas saat akses
`requireTenantRole` kini memilih `schema_version` dan memanggil `ensureTenantMigrated` sebelum
modul menyentuh DB. Kegagalan **tidak** memutus akses (dicatat, request lanjut, dicoba ulang
di request berikut) → swasembuh.

### 3) `apps/api/src/index.ts` — sapu migrasi di cron
`scheduled()` memanggil `migrateAllTenants` di awal agar tenant idle (hanya disentuh cron) tetap
mutakhir sebelum tugas bisnis (penyusutan/rekap/tagihan) menyentuh DB-nya. Murah bila semua mutakhir.

### 4) `apps/api/src/routes/admin.ts` — observability (khusus admin platform)
- **`GET /api/admin/infra`** — `dbMode`, `schemaVersion`, `totalTenants`, `tenantsBehind`, sebaran
  versi, jenis penyimpanan (`binding` vs `cloudflare`), dan daftar tenant tertinggal.
- **`POST /api/admin/migrate-tenants`** — jalankan `migrateAllTenants` (idempoten, resumable) + audit.

### 5) `apps/web` — tab **Infra** di Admin Platform
Kartu status (mode DB, versi skema, total, tertinggal), sebaran versi & jenis penyimpanan, daftar
tenant tertinggal, dan tombol **“Migrasi sekarang”**. Hanya untuk admin platform.

## Uji
- **Unit (`apps/api/test/tenantDb.test.ts`, 7 uji):** `HttpD1Executor` mode cloudflare (all/first/error/
  tanpa-kredensial, fetch tiruan) + `ensureTenantMigrated`/`migrateAllTenants` (mutakhir dilewati,
  tertinggal dimigrasi + versi naik, gagal terisolasi & versi tak naik).
- **Smoke (+5):** `admin/infra` (403 non-admin; 200 + field; distribusi 1 entri = versi terkini) dan
  `admin/migrate-tenants` (403 non-admin; 200 idempoten 0 gagal). Register tenant → `schema_version`
  = versi terkini (dibuktikan lewat `tenantsBehind === 0`).

---

# RUNBOOK — Menyalakan mode `cloudflare` (skala > 6 tenant)

> **Kondisi saat ini (terverifikasi 17 Juli 2026):** produksi berjalan `TENANT_DB_MODE=local`
> (6 binding `TENANT_DB_*` di `wrangler.jsonc`) → **maksimum 6 perusahaan**. Tenant ke-7 gagal
> daftar (`"Pool database tenant lokal habis"`). Ukuran tiap DB tenant < 1 MB, jadi **satu-satunya
> batas keras adalah jumlah binding**. Kode mode `cloudflare` sudah siap & teruji; tinggal
> dinyalakan bila pemilik menyediakan prasyarat.

**Prasyarat pemilik:**
1. **Workers Paid $5/bln** (buka 50.000 DB D1 + kuota tulis/baca jauh lebih besar; free tier
   agregat se-akun hanya cukup untuk pilot ~5–15 usaha).
2. **`CLOUDFLARE_API_TOKEN`** — scoped: **D1 Edit** untuk akun yang dipakai (jangan token global).
3. **`CLOUDFLARE_ACCOUNT_ID`** — id akun Cloudflare.
4. *(Disarankan)* bersihkan/pindahkan proyek lama di akun yang sama (`catat`, `catatpro`, `sofftin`,
   `dhuha`, `rebis-id-db`) — di free tier kuota harian **agregat se-akun**, jadi proyek itu ikut
   memakan jatah erpindo.

**Langkah:**
1. Set secret: `wrangler secret put CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID`.
2. Ubah `wrangler.jsonc` → `"vars": { "TENANT_DB_MODE": "cloudflare" }`.
3. Deploy: `wrangler deploy`.
4. **Verifikasi tenant baru:** daftar perusahaan uji → cek `db_ref` bermula `uuid:` (bukan `binding:`).
5. **Verifikasi observability:** buka **Admin Platform → Infra** → `Mode database tenant` =
   “Cloudflare (D1 dinamis)”, `Tertinggal migrasi` = 0.

**Migrasi 6 tenant lokal yang sudah ada → D1 dinamis:** *tidak otomatis.* Enam tenant lama tetap
`binding:` dan berfungsi. Bila ingin dipindah ke D1 dinamis, ekspor (menu Backup) lalu impor ke
perusahaan baru, atau siapkan skrip migrasi khusus (di luar cakupan 11a).

**Catatan latency:** di mode cloudflare tiap query tenant = round-trip REST (~100–300ms). Mitigasi
(caching per-request, batching, audit N+1, tier pooled) direncanakan pada iterasi 11 berikutnya bila
volume tumbuh.

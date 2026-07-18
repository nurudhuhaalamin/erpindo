# Log Kerja — Fase 13a: Struktur paket 4 tingkat & penegakan modul di API

**Tanggal:** 18 Juli 2026.

## Yang dikerjakan

1. **Struktur paket terpusat di `packages/shared/src/core.ts`** — `PLAN_LIMITS`
   diisi ulang dengan harga keputusan pemilik: Trial Rp0 · Starter Rp499rb ·
   Business Rp999rb · Enterprise Rp2.499rb; tiap paket menyimpan `aiDailyLimit`
   (25/100/250, trial 100), `maxEntities` (1/1/1/3), dan `maxUsers` tak terbatas
   di **semua** paket (pembeda inti vs ERP per-user). Ditambah `EXTRA_ENTITY_PRICE`
   Rp750rb, `PAID_PLANS`, dan peta modul: `MODULE_KEYS`, `MODULE_MIN_PLAN`,
   `MODULE_LABELS`, `planIncludesModule()`, `minPlanForModule()`, `modulesForPlan()`.
   Menggeser satu modul antar paket = mengubah satu baris `MODULE_MIN_PLAN`.
2. **Penegakan modul di API** — middleware baru `requirePlanModule(module)` +
   pembungkus `planGated(module, router)` di `apps/api/src/middleware/auth.ts`.
   Dipasang di titik mount (`index.ts`) untuk 16 router modul operasional
   (payroll, crm, projects, procurement, approvals, salesStaged, manufacturing×2,
   maintenance, helpdesk, contracts, currency, scheduledReports, orgStructure,
   driveBackup) dan skala (dimensions). Paket tak mencukupi → **403
   `plan-upgrade-required`** berisi `module` + `requiredPlan` (untuk kartu upsell,
   bukan error keras). Bersifat aditif & tanpa kebocoran: sesi buruk/bukan anggota
   tetap dijawab `requireTenantRole`.
3. **Grandfather** — migrasi control-plane `0010_plan_tiers` menambah kolom
   `legacy_full_access`; tenant berbayar yang sudah ada saat migrasi berjalan
   ditandai akses penuh permanen. `requirePlanModule` selalu meloloskan tenant
   berbendera legacy.
4. **Kuota AI per paket** — `routes/ai.ts` membaca `PLAN_LIMITS[plan].aiDailyLimit`
   lewat `tenant.plan` (kini disematkan ke konteks tenant oleh `requireTenantRole`).
5. **Konteks tenant** kini membawa `plan` + `legacyFullAccess` (`env.ts`).

## Keputusan & koreksi sequencing (kejujuran)

- **Pagar trial (1 perusahaan trial/akun) & cap entitas dipindah ke Fase 13b.**
  Alasan: menegakkannya sekarang memblokir uji konsolidasi (tenant trial "budi"
  membuat perusahaan kedua), dan cap entitas butuh seam set-plan dari billing
  yang baru dibangun 13b — di sana pengujiannya bisa deterministik + smoke
  konsolidasi disesuaikan (multi-entitas = fitur Enterprise).
- **Matriks 403 modul × paket lengkap juga di 13b** (butuh tenant non-trial).
  Di 13a matriks diuji kuat lewat **unit test** (`planIncludesModule` untuk 4
  paket × 20 modul) + smoke regresi bahwa tenant trial (akses penuh) tidak
  terblokir gerbang.
- **`SINGLE_PLAN` dipertahankan di Rp389rb** (deprecated) agar billing.ts belum
  berubah; billing 4 paket menggantinya di 13b.
- **Konsolidasi & bank-match-rules**: router konsolidasi (`/api/consolidation`,
  tanpa `:tenantId`) belum digerbangi otomatis — ditegakkan lewat cap entitas di
  13b (konsolidasi hanya berguna bila punya >1 entitas = Enterprise). Router
  `dimensions` yang membundel bank-match-rules digerbangi Enterprise sebagai
  paket; bila pemilik mau bank-rec di Business, cukup pindahkan ke router lain.

## Validasi

Unit test **90 → 99** (+9 matriks paket) · smoke **784 → 786** (+2 regresi
gerbang) · ui-sim 169 (web belum berubah) · typecheck 4/4 · lint bersih · build.

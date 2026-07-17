# CLAUDE.md — Panduan agen untuk repo ERPindo

ERP SaaS multi-tenant untuk UKM Indonesia. **Seluruh isi repo berbahasa Indonesia**:
UI, komentar kode, dokumen, log, dan pesan commit.

## Tata letak monorepo (pnpm workspaces, Node >= 22)

- `apps/api` — Hono di Cloudflare Workers + Drizzle ORM + D1. Entry `src/index.ts`
  (memasang ~40 modul route dari `src/routes/` + handler cron `scheduled`).
  Worker juga menyajikan SPA web lewat binding ASSETS.
- `apps/web` — React 19 + Vite + TanStack Router/Query + Tailwind 4 + PWA.
  Halaman di `src/pages/`, klien API tunggal di `src/api/client.ts`.
- `packages/shared` — skema zod + tipe API + fungsi murni, dipakai api & web
  (impor sebagai `@erpindo/shared`).
- `packages/db` — migrasi tenant (`migrations.ts`) + skema control-plane.
- `scripts/` — ops: `ui-sim.mjs` (simulasi UI Playwright), `seed-demo.mjs`,
  `ai-probe.mjs`, `make-dev-config.mjs` (menghasilkan `wrangler.dev.jsonc`).

## Gerbang validasi (jalankan sebelum commit)

```sh
pnpm typecheck && pnpm test && pnpm build && pnpm smoke   # smoke: wrangler dev + D1 lokal
node scripts/ui-sim.mjs                                    # klik-tembus Chromium nyata
pnpm lint                                                  # wajib di CI sejak Fase 12a
```

Jumlah cek hanya boleh **naik**, tidak boleh turun. Fitur baru wajib diberi cek
smoke (`apps/api/scripts/smoke.mjs`) dan, bila menyentuh UI, cek ui-sim.

## Konvensi kerja "Fase"

- Pekerjaan berjalan dalam Fase bernomor (12a, 12b, …), satu commit/PR per sub-fase.
- Tiap sub-fase menulis log `docs/log/YYYY-MM-DD-fase-NX-ringkas.md`: bagian
  "Yang dikerjakan", "Validasi" (dengan angka cek), dan catatan koreksi/kejujuran
  bila temuan eksplorasi tidak terbukti.
- Akhir fase besar: laporan akhir untuk pemilik + perbarui `docs/STATUS.md`
  (non-teknis, ditujukan ke pemilik) dan centang item di `docs/03-roadmap-lanjutan.md`.

## Fakta arsitektur penting

- **Satu database D1 per tenant.** Control-plane di binding `DB`; DB tenant dari pool
  `TENANT_DB_1..6` (mode via `TENANT_DB_MODE`: `local`/`cloudflare`). Resolusi di
  `apps/api/src/lib/tenantDb.ts`.
- **Binding Env opsional terdegradasi anggun** — jangan membuat fitur gagal keras:
  Workers AI absen → 503 `binding-absent`; kunci Resend/Midtrans/Google absen →
  fitur nonaktif dengan pesan jelas. Pola ini diuji deterministik di smoke.
- Kuota AI per tenant disimpan di KV `RATE_KV`; panggilan model lewat `runModel()`
  (`apps/api/src/routes/ai.ts`) dengan fallback model.
- Jurnal double-entry adalah pusat data: modul (penjualan, POS, gaji, aset, dll.)
  memposting jurnal; laporan membaca dari jurnal berstatus `posted`.

## Larangan yang sudah diputuskan (jangan diulang)

- `apps/web/src/api/client.ts` TIDAK dipecah (keputusan Fase 9d: churn tanpa nilai).
- Jangan membangun ulang pembayaran non-tunai POS — sudah ada sejak Fase 7a
  (`POS_PAYMENT_METHODS`, multi-tender, jurnal ke akun bank).

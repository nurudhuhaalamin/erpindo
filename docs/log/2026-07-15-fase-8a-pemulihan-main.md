# Log Kerja — Fase 8a: Pemulihan main + integrasi ESLint/Prettier yang benar

**Tanggal:** 15 Juli 2026 · **PR pertama Fase 8 (pemulihan + fondasi).**

## Latar

Pada 14 Juli, lima commit masuk langsung ke `main` lewat GitHub web UI (bantuan AI lain):
config ESLint + Prettier + ignore + edit root `package.json` (8 devDependencies & 4 script baru)
— **tanpa meregenerasi `pnpm-lock.yaml`**. Akibatnya `pnpm install --frozen-lockfile` di CI gagal
dan **CI `main` merah** sejak itu (run terakhir hijau: merge Fase 7h). Config ESLint-nya juga
tidak bisa dipakai: ada rule yang salah nama (`explicit-function-return-types` — tidak ada) dan
preset *type-checked* yang mustahil lulus di codebase ini tanpa perombakan besar.

Keputusan pemilik: **perbaiki & pertahankan** (niatnya bagus — kualitas kode), lint jadi job CI
**non-blocking** dulu.

## Yang dikerjakan

1. **`pnpm-lock.yaml` diregenerasi** dengan 8 devDependencies baru (eslint 8.57, prettier 3.9,
   plugin TS/React) → `--frozen-lockfile` lulus lagi.
2. **`.eslintrc.json` diperbaiki**: rule salah nama → dinonaktifkan dengan nama benar
   (`explicit-function-return-type: off`); preset diturunkan ke `@typescript-eslint/recommended`
   (buang `recommended-requiring-type-checking` + `parserOptions.project` yang lambat & rapuh);
   `no-explicit-any` → warn; `no-console` → off (Worker memakai `console.log` untuk log Cron);
   `react/no-unescaped-entities` → off (teks Indonesia penuh tanda kutip); versi React dipin 19.
3. **10 pelanggaran lint nyata diperbaiki** (bukan disembunyikan): 6 import/variabel tak terpakai
   (budget, consolidation, manufacturing, masterdata ×3, projects), 2 `!=` → pembanding ketat
   (smoke.mjs, manufacturing), 1 BOM literal di regex `parseCsv` → escape `﻿` (perilaku sama,
   karakter tak kasat mata hilang dari sumber). → **`pnpm lint` kini lulus bersih.**
4. **`ci.yml`**: job baru `Lint (non-blocking)` terpisah dengan `continue-on-error: true` —
   job utama "Typecheck, test, build & smoke" tidak berubah. Lint bisa dijadikan wajib nanti.

## Validasi

- `pnpm lint` bersih · typecheck · unit test (10 file/24 asersi) · build · **smoke 617 tetap
  lulus penuh** (perubahan kode produk hanya penghapusan variabel mati + pembanding ketat).
- Setelah merge: CI `main` harus hijau kembali + deploy Workers Builds sukses (diverifikasi).

## Berikutnya

Fase 8b: **Backup & portabilitas data** — ekspor penuh mandiri (ZIP CSV semua tabel, tetap bisa
saat akun baca-saja) + sambungan Google Drive (OAuth `drive.file`, menunggu Client ID/Secret dari
pemilik). Midtrans tetap pemblokir launching #1.

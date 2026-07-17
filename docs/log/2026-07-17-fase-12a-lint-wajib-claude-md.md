# Log Kerja — Fase 12a: Lint flat config (ESLint 9) jadi gerbang wajib + CLAUDE.md

**Tanggal:** 17 Juli 2026.

## Yang dikerjakan

1. **Migrasi ESLint ke flat config** — `.eslintrc.json` + `.eslintignore` (format lama,
   tidak didukung ESLint >= 9) diganti `eslint.config.mjs`. Semua aturan lama
   dipertahankan 1:1 (react-in-jsx-scope off, `no-unused-vars: error` dengan pola `^_`,
   `eqeqeq: always`, `no-explicit-any: warn`, override `*.mjs`/`*.js`, dst.).
   Dependensi diperbarui: `eslint` ^8.57 → ^9.39, paket terpadu `typescript-eslint` ^8.64
   (menggantikan pasangan `@typescript-eslint/*` v7), `eslint-plugin-react` ^7.37,
   `eslint-plugin-react-hooks` ^7.1, plus `@eslint/js` dan `globals`.
   Skrip `lint` kehilangan flag `--ext` (dihapus di flat config).
2. **Job lint CI dipromosikan WAJIB** — `continue-on-error: true` dihapus dari
   `.github/workflows/ci.yml` (mengikuti jejak promosi ui-sim di Fase 9d). Basis kode
   terverifikasi bersih: 0 error, 0 peringatan.
3. **`CLAUDE.md` baru di akar repo** — panduan agen: tata letak monorepo, gerbang
   validasi, konvensi Fase + `docs/log/`, kewajiban bahasa Indonesia, fakta arsitektur
   (D1 per tenant, degradasi binding opsional), dan larangan yang sudah diputuskan
   (client.ts tidak dipecah; non-tunai POS sudah ada sejak 7a).

## Catatan keputusan

- **ESLint 10 tidak dipakai** — `eslint-plugin-react` terbaru (7.37.5) baru mendukung
  peer sampai `^9.7`. ESLint 9 tetap flat config; naik ke 10 tinggal ganti angka saat
  plugin siap.
- **4 aturan baru react-hooks v7 berbasis React Compiler** (`purity`,
  `set-state-in-effect`, `refs`, `preserve-manual-memoization`) sengaja belum
  diaktifkan: menyalakan semuanya menghasilkan 11 error yang menuntut perombakan
  komponen (di luar lingkup fase kebersihan ini). Paritas v4 dipertahankan:
  `rules-of-hooks: error`, `exhaustive-deps: warn`. Kandidat fase mendatang.

## Validasi

Lint bersih (0 error/0 warning, kini WAJIB) · typecheck · unit test · build · smoke —
lihat angka di laporan akhir Fase 12.

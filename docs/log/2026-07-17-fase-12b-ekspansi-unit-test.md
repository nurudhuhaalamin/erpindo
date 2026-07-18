# Log Kerja — Fase 12b: Ekspansi unit test (shared + web)

**Tanggal:** 17 Juli 2026.

## Yang dikerjakan

1. **`packages/shared/test/payroll.test.ts`** — batas bracket TER tepat di ambang
   (5,4jt/6,2jt/6,6jt inklusif; +1 rupiah naik bracket), bracket puncak 34%,
   monotonisitas seluruh tabel TER, batas upah BPJS tepat di cap (12jt Kesehatan,
   11.086.300 JP), tunjangan membentuk bruto, invarian bruto = netto + potongan
   untuk 8 status PTKP × 5 titik bruto, dan pembulatan iuran.
2. **`packages/shared/test/schemas.test.ts`** — `posSaleSchema` (multi-tender,
   metode tak dikenal/nominal 0 ditolak, jalur legacy `cashReceived`, taxRate
   default 0), `createInvoiceSchema` (tarif 0/11/12, normalisasi mata uang ke
   huruf besar, diskon >100% dan qty pecahan ditolak), `marketplaceImportSchema`
   (channel tak dikenal, qty 0, >1000 baris ditolak), skema email/password/slug,
   sanitas `INDUSTRY_TEMPLATES` (SKU unik, harga > 0, ada pelanggan+pemasok).
3. **`packages/shared/test/text.test.ts`** — `escapeHtml` (5 entitas),
   `renderMarkdown` (heading bergeser, daftar, inline; XSS: `<script>` dan injeksi
   atribut selalu ter-escape; hanya tautan http(s)), `toSlug`.
4. **vitest diaktifkan di `apps/web`** — skrip `test` yang semula no-op (`true`)
   kini `vitest run` (environment node, tanpa jsdom — test komponen ditunda).
   `apps/web/test/client-utils.test.ts`: `parseCsv` (deteksi pemisah, kutipan
   ganda, CRLF, BOM), `formatIDR`, `formatDate`.

## Bug yang tertangkap test (dan diperbaiki)

- **`toSlug` tidak membuang tanda diakritik** setelah `normalize("NFKD")` —
  "Café Déjà" menjadi `cafe-de-ja` (aksen terdekomposisi berubah jadi hubung).
  Diperbaiki: buang combining marks `̀–ͯ` sebelum substitusi non-alfanumerik.

## Validasi

Unit test **49 → 90** (shared 17→50, web 0→8, api 32 tetap) · typecheck · lint ·
build · smoke 774 — semua hijau.

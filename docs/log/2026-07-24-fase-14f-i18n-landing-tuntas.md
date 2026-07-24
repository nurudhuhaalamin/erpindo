# Log Kerja — Fase 14f: Landing 100% dwibahasa

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Landing masih ±60% berbahasa Indonesia saat mode EN (Fase 13d hanya menyentuh Header,
Hero, Pricing, form Demo). Fase 14f menuntaskan i18n landing — seluruh seksi kini
mengikuti bahasa aktif.

1. **Data seksi jadi dwibahasa `Dual {id,en}`** (`apps/web/src/pages/landing/sections.ts`):
   `TRUST_POINTS`, `SHOWCASE` (label/title/benefits), `FEATURE_GROUPS`, `COMPARISON`,
   `SINGLE_PLAN_MODULES`, `CATEGORY_COMPARISON` (+headers), `SECURITY_POINTS`, dan `FAQ`
   semuanya kini `{id,en}` dengan terjemahan Inggris penuh. `formatRupiah` tetap.
2. **Konsumen di `landing/index.tsx`** memilih via `pick(x, lang)`: TrustBar, Showcase,
   FeaturesGrid, Comparison, CategoryComparison, Security, Faq — masing-masing menambah
   `const lang = useLang()`.
3. **Prosa hardcoded dilokalkan** lewat helper `L(lang, id, en)` yang sudah ada: judul &
   subjudul tiap seksi (Showcase/Features/Comparison/CategoryComparison/Security/FAQ/CTA),
   tombol DemoButton, PerUserCalculator (label slider + kartu + baris "Hemat"),
   blok "Untuk grup & holding" + "Layanan pendampingan", CtaBand, dan Footer (tagline +
   tautan). Kini tak ada teks landing yang tertinggal di satu bahasa.

Tak ada perubahan perilaku — hanya penyajian teks per bahasa. `landingSeo.ts` (SSR JSON-LD
14d) memakai FAQ lokalnya sendiri, tak terpengaruh.

## Validasi

- **UI-sim 183 → 184** (+1): cek baru memastikan toggle EN menerjemahkan seksi
  Showcase ("See how it works") + Comparison ("Still using") + FAQ ("Frequently asked
  questions") — bukti seksi non-hero ikut dwibahasa. Cek 14e ("Hemat sekitar", penanda ID)
  tetap hijau karena landing dibaca dalam mode ID sebelum toggle.
- typecheck 4/4 · lint bersih · build · unit 156 · smoke 850 (tak ada perubahan API).

## Catatan jujur

- Terjemahan Inggris ditulis idiomatis, bukan mesin; istilah domain Indonesia (Coretax,
  PPh 21 TER, BPJS, e-Faktur) sengaja dipertahankan karena memang nama standar/produk.
- Menghapus ekspor `SINGLE_PLAN_PERKS` yang tak terpakai saat mengonversi sections.ts
  (lolos `no-unused-vars` tetap bersih).

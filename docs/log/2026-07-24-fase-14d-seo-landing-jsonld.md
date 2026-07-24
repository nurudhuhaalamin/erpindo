# Log Kerja — Fase 14d: SEO landing (JSON-LD + noscript server-side)

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Landing `/` adalah satu-satunya halaman publik utama yang belum server-rendered (blog &
api-docs sudah), sehingga kehilangan data terstruktur untuk rich result. Diperbaiki tanpa
merombak SPA menjadi SSR penuh:

- Worker kini menangani `GET /` (masuk `run_worker_first`): mengambil shell SPA yang sudah
  dibangun dari binding `ASSETS`, lalu **menyisipkan** ke `<head>`/`<body>` — shell tetap
  memuat `#root` + skrip SPA sehingga aplikasi berjalan normal, sementara crawler menerima
  data terstruktur + konten teks.
- **JSON-LD** (`apps/api/src/routes/landingSeo.ts`):
  - `Organization` (nama, url, logo, deskripsi).
  - `SoftwareApplication` dengan **`Offer` harga tiap paket** (Starter/Business/Enterprise,
    IDR) dibaca dari `PLAN_LIMITS` (@erpindo/shared) — sumber tunggal, selalu sinkron harga.
  - `FAQPage` (5 Q&A) → kandidat FAQ rich result.
- **`<link rel="canonical">`** + blok **`<noscript>`** berisi headline, ringkasan paket, dan
  tautan (Coba gratis/Masuk/Panduan/Blog) + FAQ — konten teks untuk crawler tanpa JS.

## Validasi

- **Smoke 847 → 850** (+3): `GET /` 200 + `#root` utuh (SPA tak rusak); JSON-LD
  `SoftwareApplication` + `Offer` 499000 + `FAQPage` + `Organization`; canonical + noscript.
- **UI-sim 182** (tanpa regresi): landing tetap render penuh via shell yang disisipkan —
  3 paket, kalকulator per-pengguna, toggle EN, tombol demo semuanya jalan.
- typecheck 4/4 · lint bersih · build. Guard RBAC: `landingSeo.ts GET "/"` masuk daftar putih publik.

## Catatan jujur

- Ini **SSR-lite**: `<head>` (JSON-LD/canonical) + `<noscript>` disajikan server; badan hero
  penuh tetap dirender klien (CSR). Cukup untuk rich result & meta yang benar; SSR badan
  penuh (react-dom/server di Worker) sengaja tidak diambil karena berat/berisiko dan
  nilainya marginal (Googlebot merender JS).
- Meta/OG dasar sudah ada di `index.html` (tak diduplikasi); 14d menambah yang kurang: data terstruktur.

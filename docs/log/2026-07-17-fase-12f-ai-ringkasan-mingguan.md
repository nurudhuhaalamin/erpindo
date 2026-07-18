# Log Kerja — Fase 12f: Ringkasan bisnis mingguan AI di dashboard

**Tanggal:** 17 Juli 2026.

## Yang dikerjakan

1. **Endpoint baru `GET /:tenantId/ai/ringkasan-mingguan`** (role viewer, `routes/ai.ts`):
   - **Cache-first di `RATE_KV`** dengan kunci `ai:weekly:<tenant>:<tanggal-Senin>`,
     TTL 8 hari — hit cache tidak memakan kuota harian dan tetap tersaji walau
     AI sedang absen. On-demand (bukan cron) sehingga tenant pasif tidak
     membakar neuron: efektif ≈1 panggilan model/tenant/minggu.
   - Miss: `buildWeeklySnapshot()` menghitung minggu ini vs minggu lalu (Senin
     UTC): omzet & jumlah faktur, pendapatan/beban/laba dari jurnal terposting
     (memakai `profitLoss()` dari `lib/reports.ts`, hasil 12d), saldo kas/
     piutang/hutang, dan 3 produk terlaris → diberikan ke `runModel()` (rantai
     fallback model yang sudah ada) dengan instruksi narasi ±100 kata berbahasa
     Indonesia, HANYA dari data ("JANGAN mengarang angka").
   - Degradasi anggun: tanpa binding / model gagal → 503 `binding-absent`,
     kontrak identik dengan endpoint AI lain (deterministik di CI).
2. **Widget dashboard "Ringkasan mingguan AI"** — terdaftar di `DASHBOARD_WIDGETS`
   (bisa disembunyikan), ikon Sparkles, menampilkan narasi + tanggal dibuat;
   saat 503 menampilkan teks redup "Fitur AI belum tersedia…" (pola asisten.tsx),
   tidak pernah error state. Tipe `ApiAiWeeklySummary` di shared, `api.aiWeeklySummary`
   di klien (timeout 35 dtk).
3. **Pelacak galat ui-sim**: 503 dari endpoint `/ai/` kini dikecualikan dari
   asersi "bebas 5xx" — itu degradasi anggun yang DIHARAPKAN di dev/CI tanpa
   binding (widget merendernya sebagai fallback, bukan error).
4. **`scripts/ai-probe.mjs`** diperluas: probe produksi kini juga memanggil
   endpoint ringkasan mingguan (GET) — keluaran AI nyata hanya bisa diverifikasi
   di produksi (preseden Fase 4e/11c).

## Validasi

- Smoke **782 → 784** (+2): anonim 401; viewer 200 ATAU 503 `binding-absent`.
- UI-sim **168 → 169** (+1): widget tampil dengan fallback anggun di dashboard.
- Typecheck 4/4 · lint bersih · unit 90 · build — semua hijau.

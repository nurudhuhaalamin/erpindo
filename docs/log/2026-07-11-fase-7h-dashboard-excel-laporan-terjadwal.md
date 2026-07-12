# Log Kerja — Fase 7h: Dashboard kustom + Ekspor Excel + Laporan terjadwal

**Tanggal:** 11 Juli 2026 · **PR TERAKHIR Fase 7.**

## Yang dikerjakan

Tiga pendalaman analitik/pelaporan, semua **ADDITIVE**:

1. **Dashboard yang bisa disesuaikan.** Tombol **“Sesuaikan”** membuka panel centang widget —
   pengguna memilih apa yang tampil (Ringkasan KPI, Grafik 30 hari, **Tren bulanan**, Faktur
   jatuh tempo, Aktivitas, **Laporan terjadwal**). Preferensi disimpan di **localStorage** per
   tenant (tanpa migrasi, tanpa server). Ditambah **grafik tren bulanan** baru (omzet per bulan,
   6 bulan, SVG ringan tanpa pustaka).
2. **Ekspor Excel (.xlsx).** Penulis **OOXML SpreadsheetML mandiri** di klien (`downloadXlsx`) —
   membangun ZIP (metode *store*/tanpa kompresi) + CRC32 + parts XML minimal, **tanpa dependency
   pihak ketiga**. Angka ditulis sebagai sel numerik, teks sebagai *inline string* (escaping
   benar). Dipakai di **Laporan Penjualan** (2 sheet: per produk + per pelanggan) dan **Neraca
   Saldo**, **berdampingan** dengan tombol CSV lama (tidak menggantikan).
3. **Laporan terjadwal (Cron).** Cron harian, di awal bulan, menyusun **rekap penjualan bulan
   lalu** per tenant dan menyimpannya sebagai **snapshot** (idempotent `UNIQUE(kind, period)`).
   Kartu dashboard menampilkan rekap terbaru + tombol **“Susun bulan lalu”** (pemicu manual). v1
   berupa laporan **in-app** (bukan email) — email berkala menunggu domain pengirim terverifikasi
   (dicatat sebagai keterbatasan).

### Perubahan teknis
- **Migrasi tenant `0034_scheduled_reports`**: tabel `report_snapshots` (kind, period, title,
  payload JSON, `UNIQUE(kind, period)`).
- **Skema shared**: `ApiSalesMonthlyRow`, `ApiReportSnapshot`, `runRecapSchema`.
- **API reports.ts**: `GET /reports/sales-monthly?months=N` (tren bulanan).
- **API `scheduledReports.ts`** (baru): `runMonthlyRecap()` (dipakai Cron & manual),
  `GET /report-snapshots`, `POST /report-snapshots/run` (admin). Audit `report.recap_generated`.
- **Cron `index.ts`**: langkah 3b — rekap penjualan bulan lalu per tenant (idempotent).
- **Web `client.ts`**: `downloadXlsx` + metode `salesMonthly`/`reportSnapshots`/`runReportSnapshot`.
- **Web**: dashboard (`app.tsx`) — panel Sesuaikan + `MonthlyTrendChart` + `ScheduledReportsWidget`;
  `reports.tsx` & `finance.tsx` — tombol **Ekspor Excel**.
- **seed-demo**: rekap penjualan bulan ini & bulan lalu.

## Validasi

- Typecheck · unit test (24) · build · **smoke 608 → 617** (+9): tren bulanan 200; data laporan
  (sumber Excel) 200; daftar laporan terjadwal 200; **viewer tolak susun rekap 403**; periode tak
  valid 400; **susun rekap Juli 200 (omzet & faktur nyata)**; **idempoten** (ulang tetap 1 snapshot
  per periode via UNIQUE); omzet snapshot konsisten dengan hasil run.
- **Ekspor .xlsx diverifikasi nyata**: berkas dibongkar `unzip -t` (CRC OK) **dan** dibaca
  `openpyxl` — nama sheet, tipe angka, & escaping (`&`, `"`) benar.
- Screenshot **Dashboard kustom** produksi (PT Demo Sejahtera) dikirim ke pemilik: tombol
  Sesuaikan, tren bulanan, & kartu Laporan terjadwal (rekap Juli & Juni) terlihat.

## Berikutnya

**LAPORAN AKHIR FASE 7** (`docs/log/2026-07-11-fase-7-laporan-akhir.md`). Midtrans (pembayaran
langganan) tetap pemblokir launching #1 — menunggu Server Key pemilik.

# Log Kerja — Fase 12d: Quick wins Dashboard (roadmap §1)

**Tanggal:** 17 Juli 2026.

## Yang dikerjakan

1. **Filter rentang grafik penjualan 7/30/90 hari** — tombol segmen di header kartu
   grafik (`dashboard.tsx`); label sumbu X menyesuaikan kerapatan. API
   `sales-daily?days=` sudah menerima 7–90 sejak lama — perubahan murni frontend.
2. **Kartu KPI bisa diklik** — semua kartu KPI kini `Link` ke laporan sumbernya:
   Kas & Bank → Kas & Bank, Penjualan → Laporan Penjualan, Laba → Laba Rugi,
   Piutang/Hutang → Umur Tagihan, Persediaan → Stok, Lead → CRM. Memakai prop
   `hover` komponen `Card` yang memang tersedia untuk kartu klik.
3. **KPI baru "Laba Bulan Ini" + delta ▲/▼ vs bulan lalu** — endpoint
   `GET /:tenantId/dashboard` diperluas dengan `profitThisMonth`/`profitLastMonth`
   dari jurnal terposting. Agregasi `profitLoss()` ditaruh di `lib/reports.ts`
   dan dipakai bersama oleh dashboard **dan** grounding AI laporan
   (duplikasi `pl()` di `routes/ai.ts` dihapus). Grid KPI 5→4 kolom XL (7 kartu).
4. **Sapaan kontekstual** — "Selamat pagi/siang/sore/malam" sesuai jam perangkat +
   "Ada N faktur lewat jatuh tempo yang perlu ditagih" dari mesin notifikasi
   (query di-share dengan widget jatuh tempo, tanpa fetch ganda).

## Validasi

- Smoke **774 → 778** (+4): field laba dashboard ada; laba bulan ini konsisten
  dengan `netProfit` laporan laba rugi bulan berjalan (cek bebas-jam); `days=7`
  diterima; `days=1` di-clamp ke 7.
- UI-sim **160 → 164** (+4): KPI "Laba Bulan Ini" tampil; klik "7 hari" → judul
  grafik berubah; klik kartu Kas & Bank → mendarat di /app/keuangan/kas-bank;
  bebas galat halaman.
- Typecheck 4/4 · lint bersih · unit 90 · build — semua hijau.

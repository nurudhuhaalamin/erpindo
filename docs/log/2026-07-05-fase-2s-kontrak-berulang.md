# Log Kerja — Gelombang C-2 (Fase 2s): Kontrak & Tagihan Berulang

**Tanggal:** 5 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Untuk usaha langganan/retainer (maintenance, sewa, jasa berkala): **kontrak pelanggan**
yang **menerbitkan faktur otomatis tiap periode** via Cron, plus dukungan **produk jasa**
(tanpa stok) agar faktur berulang tak butuh persediaan.

## Yang dibangun

- **Migrasi tenant `0014_contracts`**: kolom `is_service` di `products` (jasa, tanpa stok);
  tabel `contracts` (kode unik, pelanggan, frekuensi bulanan/triwulan/tahunan, tarif PPN,
  gudang, `next_invoice_date`, `end_date`, status, `invoice_count`) & `contract_lines`.
- **Produk jasa**: `productSchema` + `isService`; `executeInvoice` **melewati stockOut/HPP**
  untuk produk jasa — sekaligus memungkinkan menjual jasa di faktur biasa. Checkbox "Jasa"
  di form produk.
- **API `routes/contracts.ts`**: kontrak CRUD + ubah status (aktif/jeda/berakhir); fungsi
  `runBilling(db, today, userId)` menerbitkan satu faktur (lewat `executeInvoice`) untuk tiap
  kontrak aktif yang jatuh tempo (`next_invoice_date ≤ today`), lalu memajukan tanggal tagih
  satu periode (hari di-clamp akhir bulan) dan menandai `ended` bila melewati `end_date`.
  Endpoint `POST /contracts/run-billing` (body opsional `{date}`) untuk pemicu manual.
- **Cron harian** (`scheduled()`): menjalankan `runBilling` untuk semua tenant aktif/trial,
  per-tenant `try/catch` + audit log. Faktur yang gagal (mis. periode terkunci) dilewati &
  dicoba lagi lain waktu — aman & idempotent secara praktis (tanggal melompat ke masa depan
  setelah terbit).
- **Web `pages/contracts.tsx`**: form kontrak (frekuensi, mulai/berakhir, PPN, baris jasa),
  tombol "Terbitkan Jatuh Tempo", daftar kontrak dengan nilai/periode, tanggal tagih
  berikutnya, jumlah faktur terbit, dan jeda/aktifkan. Nav "Kontrak Berulang" (ikon
  `CalendarClock`).

## Validasi (semua hijau)

- Typecheck · 24 unit test · build.
- **Smoke 217 → 228** — seksi "11m. Kontrak & tagihan berulang": produk jasa, RBAC viewer 403,
  buat kontrak, kode ganda 409, **tagih 15 Jul → 1 faktur 500rb** + tanggal maju ke 2026-08-15
  & invoiceCount 1, **menagih ulang tanggal sama → 0 faktur** (idempoten), tagih 15 Agu → 1
  faktur lagi, **produk jasa tak muncul di level stok**, dan **neraca saldo tetap seimbang**.
- Verifikasi visual Playwright: halaman Kontrak (bulanan/triwulan/tahunan) terang & gelap.

## Berikutnya

Gelombang C lanjut: Konsolidasi multi-perusahaan, Manufaktur+QC, Maintenance, Helpdesk,
Ekspor e-Faktur.

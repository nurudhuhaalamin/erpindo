# Log Kerja — Fase 12c: Pecah berkas monolit (lanjutan konsolidasi Fase 9d)

**Tanggal:** 17 Juli 2026.

## Yang dikerjakan

1. **`packages/shared/src/index.ts` (2.800 → 17 baris barrel)** — dipecah menjadi
   14 modul domain mengikuti header seksi yang sudah ada: `core` (peran/RBAC/paket/
   skema auth/billing), `accounting`, `commerce` (faktur/pembelian/marketplace/
   template industri/procurement), `approvals`, `crm` (+anggaran), `hr` (+aset tetap),
   `projects` (+kontrak), `ops` (manufaktur/maintenance/helpdesk), `reporting`,
   `pos`, `salesStaged`, `audit`, `platform`, `text`. `index.ts` kini murni
   `export * from` — **nol perubahan konsumen** (semua tetap impor `@erpindo/shared`).
   Impor antarmodul berlapis (core → domain), `amountSchema` diekspor dari
   `accounting` karena dipakai lintas modul. Bebas siklus — typecheck bersih.
2. **`apps/api/src/routes/commerce.ts` (1.449 → 820)** — mesin posting (konfigurasi
   dokumen, `listDocs`, `executePurchase`, `executeInvoice`, `validateRefs`,
   `voidDoc`, helper proyek/valas/periode/ambang approval) diekstrak ke
   **`apps/api/src/lib/commercePosting.ts` (654 baris)**. Enam pengimpor
   (`marketplace`, `procurement`, `salesOrders`, `crm`, `contracts`, `projects`)
   kini mengimpor langsung dari lib — `routes/commerce.ts` tinggal handler HTTP.
3. **`apps/web/src/pages/commerce.tsx` (1.447 → 923)** — seksi "Stok per gudang"
   (`StockPage`, `StockCard`, `StockAdjustmentForm`, `StockTransferForm`,
   `LotsCard`, `ReorderCard`) diekstrak ke **`apps/web/src/pages/stok.tsx`
   (551 baris)**; `commerce.tsx` me-re-export `StockPage` sehingga `main.tsx`
   tidak berubah (pola Fase 9d).

## Yang sengaja TIDAK dipecah (dicatat agar tidak diulang)

- `apps/web/src/api/client.ts` — keputusan Fase 9d tetap berlaku (churn tanpa nilai).
- `apps/web/src/pages/settings.tsx` — kumpulan kartu independen yang kohesif;
  memecahnya tidak mengurangi kompleksitas nyata.

## Validasi

Refactor murni — seluruh asersi lama hijau tanpa perubahan jumlah:
typecheck 4/4 · lint bersih · unit 90 · build · smoke 774 · **ui-sim 160/160**
(bukti bebas regresi: browser nyata menyapu semua rute termasuk Stok).

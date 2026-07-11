# Log Kerja — Fase 6d: Pengadaan Lengkap (Procure-to-Pay)

**Tanggal:** 11 Juli 2026 · **Temuan review pemilik #7** ("Procurement belum lengkap").

## Yang dikerjakan

Rantai pengadaan lengkap: **permintaan (PR) → pesanan (PO) → penerimaan (GRN) → faktur pembelian**,
dilacak per tahap. Stok & jurnal tetap **satu sumber kebenaran**: saat barang diterima, jalur
`executePurchase` yang sudah teruji dipanggil sekali (stok masuk average cost + jurnal
Persediaan/Hutang) — tak ada dobel-hitung, tak perlu akun baru.

1. **Migrasi `0026_procurement`**: `purchase_requisitions`(+lines), `purchase_orders`(+lines),
   `goods_receipts`(+lines). Semua tabel baru, tanpa ubah tabel lama.
2. **Skema shared**: status PR (submitted/approved/rejected/ordered) & PO (ordered/received/
   cancelled) + label; `requisitionSchema`, `purchaseOrderSchema`, `receiveGoodsSchema`,
   `decideRequisitionSchema`; tipe `ApiRequisition`, `ApiPurchaseOrder`, `ApiGoodsReceipt`.
3. **API** `routes/procurement.ts` (mount di index), RBAC admin-tulis/viewer-baca, audit
   `procurement.*`:
   - PR: `GET/POST /requisitions`, `PATCH /requisitions/:id` (setujui/tolak).
   - PO: `GET/POST /purchase-orders` (bisa dari PR approved → PR jadi 'ordered'),
     `POST /purchase-orders/:id/cancel`.
   - GRN: `POST /purchase-orders/:id/receive` (validasi qty ≤ dipesan → **`executePurchase`** →
     simpan GRN + tautan faktur, PO jadi 'received'), `GET /goods-receipts`.
   - `executePurchase` di `commerce.ts` di-**export** (tadinya privat).
4. **Web** halaman **Transaksi › Pengadaan** (`/app/pengadaan`): tiga bagian bertahap — Permintaan
   (form multi-baris + setujui/tolak), Pesanan (pilih pemasok/gudang/PPN + harga, tarik dari PR),
   Penerimaan (form jumlah diterima per baris → faktur otomatis; riwayat GRN). Badge status per
   tahap; responsif HP.
5. **Seed-demo**: siklus penuh PR→setujui→PO→terima (GRN+faktur) + satu PR menunggu keputusan.

## Validasi

- Typecheck · unit test (24) · build · **smoke 492 → 509** (+17: RBAC viewer 403 (PR & PO),
  buat PR 201, produk tak dikenal 404, setujui PR 200, buat PO dari PR 201 + PR jadi 'ordered',
  PO tampil status+total, terima > dipesan 400, terima → faktur 201, terima ulang 409, stok
  bertambah, faktur muncul di daftar pembelian, GRN tertaut faktur, batalkan PO 200, batalkan PO
  sudah diterima 409, neraca saldo tetap seimbang). Uji pakai produk khusus PRC-001 agar asersi
  stok modul lain tak terganggu.
- Screenshot desktop 1280px + HP 390px dikirim ke pemilik.

## Berikutnya

Fase 6e: Approval workflow engine (generalisasi persetujuan multi-langkah) + **laporan akhir
Fase 6** (per temuan 1–8) + checklist siap-launching.

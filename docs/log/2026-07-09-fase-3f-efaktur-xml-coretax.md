# Log Kerja — Fase 3f: Ekspor e-Faktur XML Coretax

**Tanggal:** 9 Juli 2026 · **Status akhir:** selesai — PR terakhir dari rangkaian Fase 3.

## Konteks

Sejak Januari 2025 Coretax DJP hanya menerima **XML** (bukan CSV) untuk impor faktur keluaran.
Ekspor CSV yang ada (Fase 2x) tetap berguna sebagai rekap, tetapi tidak bisa diimpor. Fase ini
menambahkan ekspor XML sesuai template impor resmi `TaxInvoiceBulk`.

## Riset format (sumber ganda, saling menguatkan)

- Struktur: `TaxInvoiceBulk > TIN > ListOfTaxInvoice > TaxInvoice > … > ListOfGoodService >
  GoodService` dengan urutan elemen persis (TaxInvoiceDate, TaxInvoiceOpt, TrxCode, AddInfo,
  CustomDoc, **CustomDocMonthYear**, RefDesc, FacilityStamp, SellerIDTKU, BuyerTin, BuyerDocument,
  BuyerCountry, BuyerDocumentNumber, BuyerName, BuyerAdress, BuyerEmail, BuyerIDTKU).
- **CustomDocMonthYear wajib** sejak pembaruan skema Coretax 27 Feb 2025 — tanpa elemen ini impor
  gagal dengan error "TaxInvoice has invalid child element RefDesc".
- **Kode transaksi**: sesuai PMK 131/2024 + penegasan DJP, penyerahan **non-mewah** memakai kode
  **04** dengan **DPP nilai lain = 11/12 × nilai** (tarif efektif 11%); barang **mewah** (tarif 12%
  penuh) memakai kode **01** dengan DPP penuh. `VATRate` selalu 12.
- IDTKU = TIN 16 digit + sufiks `000000`; NPWP 15 digit lama dinormalkan dengan awalan `0`;
  pembeli tanpa NPWP → 16 digit nol. `GoodService.Code` tidak boleh kosong (`000000` = kode barang
  umum), `Unit` memakai kode satuan DJP `UM.0018`.

## Yang dikerjakan

1. **Endpoint `GET /:tenantId/reports/efaktur-xml?from&to`** (reports.ts): NPWP penjual dari
   settings (400 dengan pesan jelas bila belum diisi); hanya faktur ber-PPN non-void dalam
   periode; nilai per baris mereproduksi persis perhitungan posting (harga satuan → IDR, diskon,
   pembulatan per baris) sehingga ΣTaxBase = subtotal faktur; escaping XML penuh; respons
   `application/xml` + Content-Disposition.
2. **Klien web**: `requestText` (fetch teks dengan error JSON), `api.efakturXml`, helper
   `downloadXml`; tombol **"Unduh XML Coretax"** (primer) di samping Ekspor CSV di halaman
   e-Faktur + copywriting yang menjelaskan alur impor Coretax.
3. **Smoke seksi 11v (19 pemeriksaan)**: XML valid + elemen wajib; TIN/IDTKU penjual-pembeli
   ternormalisasi; escaping nama pembeli (`&`, `<`); kode 04 vs 01; angka eksak — diskon 10%:
   TaxBase 180.000, DPP nilai lain 165.000, PPN 19.800; tarif 12%: DPP penuh; faktur void &
   non-PPN dikecualikan; RBAC viewer boleh; tanggal salah 400; tenant tanpa NPWP 400.

## Validasi (semua hijau)

- Typecheck · unit test · build · **smoke 366 → 385**.
- Playwright: halaman e-Faktur terang & gelap + berkas XML contoh — dikirim ke pemilik.

## Catatan

- Kode barang/jasa memakai kode umum `000000` dan satuan `UM.0018`; bila pemilik butuh kode
  spesifik per produk (mis. barang mewah ber-PPnBM), tambahkan kolom master di iterasi lanjut.
- PPnBM (STLGRate/STLG) diekspor 0 — aplikasi belum menghitung PPnBM.

## Berikutnya

Fase 3 (3a–3f) **lengkap**. Menunggu keputusan pemilik: aktivasi R2 (lampiran dokumen), Server
Key Midtrans, API key ekspedisi/marketplace.

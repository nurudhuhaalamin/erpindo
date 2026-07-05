# Log Kerja — Gelombang C-1 (Fase 2r): Multi Mata Uang

**Tanggal:** 5 Juli 2026 · **Status akhir:** selesai, siap PR — modul pertama Gelombang C.

## Konteks

Mendukung transaksi valas untuk UMKM eksportir/importir: **faktur dalam mata uang asing**
yang dikonversi ke IDR saat posting, dengan **laba/rugi selisih kurs otomatis saat
pelunasan**. Nilai buku selalu IDR sehingga seluruh laporan (neraca, laba rugi, arus kas,
aging) tetap konsisten tanpa perubahan.

## Yang dibangun

- **Migrasi tenant `0013_multicurrency`**: seed akun `4-3000 Laba Selisih Kurs` (income) &
  `5-6000 Rugi Selisih Kurs` (expense); tabel `currencies` (IDR basis, kurs REAL); kolom
  `currency`/`exchange_rate`/`foreign_total` di `invoices` & `purchases`, dan
  `currency`/`exchange_rate`/`foreign_amount` di `payments`.
- **Skema shared**: `currencySchema`, `ApiCurrency`; `createInvoiceSchema` menerima
  `currency`+`exchangeRate` opsional; `createPaymentSchema` menerima `foreignAmount`+
  `exchangeRate` (dokumen valas) di samping `amount` (IDR); `ApiCommerceDoc` menyertakan
  currency/exchangeRate/foreignTotal.
- **API**: `resolveCurrency()` memvalidasi mata uang & kurs; `executeInvoice`/`executePurchase`
  mengonversi baris ke IDR pada kurs posting (baris & buku IDR, `foreign_total` = total
  valas). **Pembayaran** faktur valas: piutang/hutang dikurangi pada **kurs faktur**, kas
  bergerak pada **kurs bayar**, selisihnya dijurnal ke Laba/Rugi Selisih Kurs. Jalur IDR tak
  berubah. Route baru `currencies.ts` (list + upsert; IDR tak bisa diubah).
- **Web**: halaman **Mata Uang & Kurs** (`/app/keuangan/kurs`), pemilih mata uang + input
  kurs di form Penjualan/Pembelian (total tampil dalam valas + ekuivalen IDR), badge valas
  & panel pembayaran valas (jumlah valas + kurs bayar, dengan info selisih kurs) di daftar
  faktur. Nav "Mata Uang" (ikon `Coins`).

## Validasi (semua hijau)

- Typecheck · 24 unit test · build.
- **Smoke 207 → 217** — seksi "11l. Multi mata uang": RBAC viewer 403, ubah IDR ditolak 400,
  set kurs USD, faktur valas tanpa kurs 400, mata uang tak terdaftar 400, **faktur USD 1000
  @16.000 = 16jt IDR** (foreignTotal 1000 tersimpan), **pelunasan @16.500 → lunas + selisih
  kurs laba 500rb**, dan **neraca saldo tetap seimbang**. Asersi jumlah akun COA 19 → 21.
- Verifikasi visual Playwright: halaman Kurs + faktur valas (USD & SGD, panel bayar) terang
  & gelap.

## Catatan

Jumlah valas diperlakukan sebagai bilangan bulat (konsisten dengan model uang app yang bulat
tanpa sen) — cocok untuk mayoritas kasus UMKM. Retur atas faktur valas mengasumsikan nilai
IDR tersimpan (bukan re-konversi) — dapat disempurnakan bila diperlukan.

## Berikutnya

Gelombang C lanjut: Manufaktur+QC, Maintenance, Helpdesk, Kontrak/tagihan berulang,
Konsolidasi multi-perusahaan, Ekspor e-Faktur.

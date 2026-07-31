# Fase 21c — Satuan ganda dipakai saat transaksi

Kolom `uom_secondary`/`uom_factor` sudah ada di master produk **sejak Fase 7c**,
tetapi konversinya tak pernah dipakai saat transaksi. Roadmap menandainya 🟡
sejak audit 21a. Ini penutupannya.

## Yang dikerjakan

- `konversiSatuanBaris()` + `periksaSatuanBaris()` di
  `packages/shared/src/commerce.ts`; medan `uom` di `commerceLineSchema`.
- `resolveUom()` di `apps/api/src/lib/commercePosting.ts`, dipakai
  `executePurchase` & `executeInvoice` (termasuk qty picking Fase 20g).
- Migrasi `0042_uom_baris_transaksi`: `uom_factor` + `uom_name` di
  `invoice_lines` & `purchase_lines`.
- Ekspor XML e-Faktur mengembalikan qty ke satuan input.
- Pemilih satuan per baris di `apps/web/src/pages/commerce.tsx`, lengkap dengan
  penskalaan harga dan keterangan konversi.

## Keputusan penyimpanan — dan kenapa begitu

Ini bagian yang paling mudah salah, jadi ditulis eksplisit:

| Kolom | Satuan |
| --- | --- |
| `qty` | **selalu satuan DASAR** (pcs) |
| `unit_price` | **satuan yang DIINPUT** (per dus) |
| `uom_factor` | isi satuan besar; 1 untuk semua baris lama |

**`qty` dibuat konsisten** karena `SUM(qty)` dipakai di beberapa tempat: produk
terlaris di `reports.ts`, validasi retur lewat `docLineAggregates`, agregat
dokumen POS. Menyimpan dus & pcs bercampur di satu kolom membuat penjumlahan itu
salah **tanpa satu angka pun terlihat aneh**.

**`unit_price` justru tidak dibagi** supaya `qty_input × unit_price` tetap
eksak. Ekspor e-Faktur Coretax menjumlah ulang `TaxBase` dari kolom-kolom ini dan
hasilnya wajib sama persis dengan subtotal faktur. Harga per dus yang tak habis
dibagi isinya akan meleset kalau dibulatkan lebih dulu.

Konsekuensinya `qty` dan `unit_price` beda satuan dalam satu baris. Itu memang
bau, jadi dinyatakan di komentar migrasinya, bukan dibiarkan jadi ranjau.

### Sisa pembulatan disebut, bukan disembunyikan

`konversiSatuanBaris()` mengembalikan `sisaPembulatan`. Rp 1.000.000 per dus isi
24 → Rp 41.667/pcs → 24 × 41.667 = Rp 1.000.008, **sisa −8 rupiah**. Sisa itu
tak terhindarkan; yang bisa dilakukan adalah membuatnya terhitung, teruji, dan
terbatas pada ±qty/2 rupiah. Neraca saldo tetap seimbang karena jurnalnya
memakai nilai baris, bukan hasil pembagian.

### Penjaga yang paling mahal kalau tidak ada

Baris `uom: "besar"` pada produk **tanpa** satuan besar ditolak. Tanpa itu
"2 dus" diam-diam jadi 2 pcs: stok dan HPP-nya keliru berlipat-lipat sementara
setiap angka di layar tetap terlihat wajar. Pemeriksaannya ditaruh di jalur
posting, bukan di route, supaya API publik dan impor marketplace ikut tunduk.

Jalur "Ubah" (void + prefill) juga dibagi balik: tanpa itu, mengubah faktur
bersatuan dus menghasilkan dokumen baru bernilai 20× lipat — dan "Ubah" adalah
jalur yang paling sering dipakai.

## Yang TIDAK dikerjakan, dan alasannya

- **POS tetap satuan dasar.** Kasir memindai barcode per pcs; menambah pemilih
  satuan di layar kasir menambah langkah pada alur yang justru dioptimalkan
  untuk cepat. `pos.ts` menulis `invoice_lines` tanpa kolom satuan, jadi
  default `uom_factor = 1` berlaku dan tidak ada yang rusak.
- **Penawaran CRM belum bersatuan ganda.** `quotation_lines` tidak menyimpan
  satuan sama sekali, jadi konversinya baru bisa dipilih saat penawaran jadi
  faktur. Barisnya dikembalikan sebagai `uomFactor: 1` secara eksplisit.

## Dua temuan pemeriksaan mata

**Kotak qty tergencet.** Pemilih satuan ditaruh di kolom grid `5rem` yang sama
dengan kotak qty — hasilnya kotak qty tinggal sesobek garis: angkanya tak
terbaca dan tak bisa diketik. Tidak satu pun gerbang menangkapnya; ceknya semua
hijau. Kolom dilebarkan ke `8.5rem`, dan cek `F34d` mengukur lebar yang
**benar-benar ter-render** (≥ 48px) — bukan kelas Tailwind-nya, karena kelas
yang benar di kolom yang kurang lebar tetap menghasilkan kotak yang tergencet.

**"— tanpa proyek —" masih Indonesia di mode Inggris**, di halaman
Penjualan/Pembelian dan Keuangan. Bentuknya isi `<option>` — bukan atribut, bukan
teks anak elemen biasa — sehingga penyapu i18n tak melihatnya. Ini blind spot
**keempat** pada penyapu yang sama, setelah `label="Kode"` (Fase 19), glob
subfolder (20m), dan nilai bawaan parameter (21b). Polanya konsisten: alat hanya
membuktikan apa yang diukurnya.

Kali ini penyapunya **tidak** diperlebar. Menambahkan isi `<option>` ke pola
teks-layar akan menyeret setiap `<option>` berisi data (nama gudang, kode mata
uang, nama akun) menjadi utang palsu. Yang dipasang cek `F34e` yang menegaskan
pilihan kosong itu ikut EN. Keterbatasannya dinyatakan di sini, tidak ditutup
dengan cek yang seolah menguji.

## Satu cek yang sempat lulus-gagal bergantian

`F34a` sempat merah, lalu hijau, lalu merah lagi di mesin yang sama tanpa
perubahan kode. Sebabnya ia menumpang pemilihan produk milik `F1y`, yang memakai
`waitForTimeout(700)` — dan `F1y` **tetap hijau walau produknya belum terpilih**,
karena panel picking yang diperiksanya muncul tanpa itu. Jadi kegagalan diam di
`F1y` menular ke cek lain yang benar-benar butuh produknya.

`F1y` ikut dibuat deterministik (menunggu opsi dropdown muncul, bukan jeda
tetap). Cek yang hijau karena kebetulan lebih berbahaya daripada cek yang merah.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **343** (dari 331) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **944** (dari 930) |
| `node scripts/ui-sim.mjs` | 0 | **289** (dari 284) |
| `sapu-i18n` | 0 | utang atribut tetap **0** |

Dua belas uji unit baru, empat belas cek smoke (blok `13y3`), lima cek ui-sim
(`F34a`–`F34e`).

**Ketiga cek UI inti dibuktikan bisa gagal**: opsi "dus" dihapus → `F34a` merah
(`["pcs"]`); penskalaan harga dilumpuhkan → `F34c` merah (`85000 → 85000`);
angka konversi dipalsukan → `F34b` merah (`"1 dus = 1 pcs"`). Penjaganya
dikembalikan.

**Pemeriksaan mata** lewat `UI_SIM_SHOT`, mode Inggris **dan** Indonesia — dari
situlah kedua temuan di atas berasal. Blok tangkapan sementara sudah dihapus.

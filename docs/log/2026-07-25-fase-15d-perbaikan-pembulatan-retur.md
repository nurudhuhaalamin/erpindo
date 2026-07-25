# Log Kerja — Fase 15d: Perbaikan pembulatan retur penuh (bug nyata)

**Tanggal:** 25 Juli 2026.

## Temuan

Audit terarah pada jalur uang (meneruskan metode yang menemukan bug POS di 14n)
menemukan cacat di penetapan **nilai retur per baris** (`routes/returns.ts`):

```js
const unitPrice = Math.round(docLine.amount / docLine.qty); // 899/3 → 300
const amount = line.qty * unitPrice;                        // 3 × 300 = 900 ✗
```

Nilai baris faktur sudah dibulatkan **sekali** saat dokumen dibuat — mis. qty 3
× Rp333 diskon 10% → `round(899,1)` = **899**. Rumus lama menghitung ulang lewat
harga satuan yang dibulatkan, sehingga retur seluruh qty bernilai **900**.

**Dampak nyata (dikonfirmasi smoke sebelum perbaikan):** meretur seluruh barang
dari faktur berdiskon yang **belum dibayar** justru **ditolak**:

```
400 "Nilai retur (Rp 900) melebihi sisa tagihan (Rp 899) —
     pilih akun kas/bank untuk refund Rp 1." (detail: refund-account-required)
```

Pengguna dipaksa menyiapkan "refund" Rp 1 yang tidak pernah benar-benar ada.

## Perbaikan

Fungsi murni **`priceReturnLine()`** (terekspor, dapat diuji langsung):

- Bila retur **menghabiskan** sisa qty produk → nilainya = **sisa nilai yang
  belum diretur** (`docAmount − returnedAmount`) → pembalikan **eksak**.
- Bila retur sebagian → proporsional `round(docAmount × qty / docQty)`.
- `unitPrice` diturunkan dari nilai akhir (hanya untuk tampilan/simpan).

Pendukung: **`returnedAmountPerProduct()`** — nilai yang sudah diretur per
produk. Sengaja dibuat fungsi **baru** (bukan mengubah `returnedQtyPerProduct`)
agar `routes/pos.ts` yang memakainya tidak ikut terpengaruh.

## Validasi

- **Unit 228 → 234** (+6): retur penuh eksak (899, bukan 900); retur penutup
  menutup selisih retur sebelumnya; baris tanpa pecahan; retur sebagian
  proporsional; rangkaian 3 retur sebagian berjumlah **persis** nilai asli;
  qty 0 tidak membagi nol.
- **Smoke 857 → 861** (+4): faktur berdiskon total 899; **retur seluruh qty
  membalik persis 899**; faktur setelah retur penuh **sisa tagihan 0** (tidak
  menyisakan Rp 1); pembelian stok penyiapan.
- typecheck 4/4 · lint bersih · build.

## Catatan jujur

- Bug ini **ditemukan lewat uji, bukan diasumsikan**: uji smoke ditulis lebih
  dulu, gagal dengan pesan `refund-account-required` di atas, baru diperbaiki.
- Perilaku retur normal (tanpa diskon pecahan) **tidak berubah** — dibuktikan
  seluruh cek retur lama tetap hijau, termasuk retur dengan refund kas (14c).

# Fase 20h — Peramalan stok

Perkiraan kebutuhan pembelian dari kecepatan jual yang sebenarnya, menumpang
titik pesan yang sudah ada di `routes/stockAdvanced.ts`.

## Yang dikerjakan

- `ramalStok()` di `packages/shared/src/accounting.ts` — fungsi murni, tanpa DB.
- `GET /:tenantId/stock-forecast` di `apps/api/src/routes/stockAdvanced.ts`.
- Kartu **Peramalan stok** di `apps/web/src/pages/stok.tsx`, dwibahasa sejak awal.

## Deterministik, bukan AI

Rata-rata bergerak biasa: total terjual ÷ panjang jendela, dikali (lead time +
cadangan) untuk titik pesan. Sejalan dengan pilihan yang sudah diambil untuk
deteksi anomali di Fase 15c.

Alasannya sama: pemilik UKM yang ditolak angkanya oleh instingnya sendiri harus
bisa **membantah** angka itu dengan kalkulator. Ramalan yang lebih pintar tetapi
tak bisa ditelusuri akan diabaikan diam-diam — dan fitur yang diabaikan lebih
buruk daripada fitur yang tidak ada, karena ia tetap menuntut perawatan.

## Keyakinan adalah bagian dari hasil, bukan catatan kaki

Bagian yang paling penting dari fase ini.

Pembagian menghasilkan angka yang **sama rapinya** entah datanya 60 hari atau
2 hari. Produk yang terjual 180 unit dalam 60 hari berbeda hari dan produk yang
terjual 180 unit dalam 2 hari sama-sama menghasilkan "rata-rata 2/hari", dan
tak ada apa pun pada angka itu yang mengungkap bedanya.

Karena itu `ramalStok()` mengembalikan `keyakinan` (`tinggi`/`sedang`/`rendah`)
yang diturunkan dari **ketebalan data** — berapa hari berbeda yang benar-benar
ada penjualannya — bukan dari besarnya angka. Layar menampilkannya sebagai kolom
tersendiri, bukan tooltip, dan memasang peringatan di atas tabel bila ada baris
berkeyakinan rendah.

Diuji langsung: satu test menegaskan kedua kasus di atas menghasilkan
`rataHarian` yang **identik** sementara `keyakinan`-nya berbeda.

## Permintaan BERSIH, bukan kotor

Retur penjualan tercatat sebagai baris `stock_movements` bertipe `sale` dengan
qty **positif**, jadi `SUM(-qty)` menghasilkan permintaan bersih dengan
sendirinya.

Ini bukan kebetulan yang dibiarkan — meramal dari angka kotor akan menyarankan
beli **lebih banyak** justru untuk barang yang paling sering dikembalikan, yaitu
barang yang paling tidak layak ditambah stoknya.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **292** (dari 283) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **893** (dari 887) |
| `node scripts/ui-sim.mjs` | 0 | **267** (dari 263) |
| `node scripts/sapu-i18n.mjs` | 0 | utang atribut tetap **0** |

Sembilan unit test (`packages/shared/test/forecast.test.ts`), enam cek smoke,
dan empat cek ui-sim (`F7c` × 3 + `F1z` untuk mode Inggris).

**Cek ui-sim `F7c` dibuktikan bisa gagal.** Saringan "hanya yang perlu dipesan"
dilumpuhkan sementara, dan ceknya langsung merah (`266/267 — tersaring=8
semua=8`). Setelah dikembalikan, hijau lagi.

## Pemeriksaan mata: dua temuan

**Satu cacat nyata.** Penanda `data-testid` yang saya pasang pada `<Tr>` tidak
pernah sampai ke DOM — komponen `Tr` memang sengaja tidak meneruskan prop
sembarangan. Ceknya melaporkan `tersaring=0 semua=0` dan tampak seperti kartunya
kosong, padahal tabelnya berisi delapan baris. Penandanya dipindah ke wadah
tabel.

Tangkapan pertama juga diambil dalam **mode demo (viewer)**, dan kartu ini hanya
untuk admin — jadi yang terekam adalah halaman tanpa kartunya sama sekali.
Bukan cacat; blok tangkapan dipindahkan ke bagian sesi pemilik.

**Satu pengamatan yang sengaja TIDAK "diperbaiki".** Di data demo, seluruh baris
ramalan berlencana **"Naik"** dan **"Rendah"**. Keduanya benar: penjualan demo
tersemai pada rentang hari yang pendek, sehingga paruh awal jendela kosong (→
naik) dan hari berjualannya sedikit (→ keyakinan rendah).

Godaan untuk melonggarkan ambang supaya demonya "terlihat lebih pintar" ditolak.
Kolom keyakinan sedang melakukan persis tugasnya: memberi tahu bahwa data
sependek itu belum layak diramalkan.

## Yang sengaja tidak dikerjakan

- **Musiman (seasonality).** Butuh riwayat bertahun; tenant paling tua di sistem
  ini belum setahun. Rata-rata bergerak yang jujur lebih berguna daripada model
  musiman yang datanya belum ada.
- **Tombol "buat PR dari ramalan".** Kartu titik pesan yang sudah ada sudah
  punya tombol itu; menambahkan yang kedua dengan angka berbeda hanya membuat
  pemilik ragu mana yang benar.

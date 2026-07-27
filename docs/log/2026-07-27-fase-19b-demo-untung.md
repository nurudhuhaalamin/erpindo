# Fase 19b — Perusahaan demo berhenti merugi

Hal kedua yang menggantung dari Fase 18. Kartu "Laba Bulan Ini" menampilkan
**−Rp 42.212.855**, dan itu bukan hanya soal tangkapan layar halaman depan:
**setiap calon pelanggan yang mengeklik "Lihat Demo" masuk ke perusahaan yang
sama** dan melihat kerugian itu langsung.

## Sebab sebenarnya: gaji dua kali dalam satu bulan

Dugaan awal — "penjualan demo terlalu kecil" — hanya separuh benar. Angkanya
sendiri yang menunjukkan sebab yang lebih spesifik:

```
Beban Gaji bulan berjalan   Rp 51.300.000
Gaji pokok 4 karyawan       Rp 24.400.000
Bonus kinerja Rina          Rp  2.500.000

51.300.000 = 24.400.000 × 2 + 2.500.000
```

Bulan berjalan menanggung **dua kali** penggajian. Penyebabnya satu argumen di
`scripts/seed-demo.mjs`:

```js
await step(`payroll periode ${lastMonth}`, …, { paymentDate: daysAgo(3) });
```

Jurnal penggajian memakai `paymentDate` sebagai tanggal jurnal
(`apps/api/src/routes/payroll.ts:448`). Jadi gaji **periode bulan lalu** yang
dibayar "3 hari lalu" ikut terbukukan di **bulan berjalan** — memberatkan bulan
ini sekaligus mengosongkan bulan lalu. Bukan hanya jelek dipandang: laporan
kedua bulan itu memang salah.

Diperbaiki menjadi hari terakhir bulan lalu. Efeknya sendirian:
**−Rp 42,2 jt → −Rp 17,8 jt.**

### Bug ikutan: `lastMonth` salah tiga hari setiap bulan

Saat memperbaiki tanggalnya, terlihat `lastMonth` dihitung sebagai
`Date.now() − 28 hari`. Pada tanggal 29–31 itu **masih bulan yang sama**: pada
30 Juli, 28 hari lalu adalah 2 Juli, sehingga `lastMonth === thisMonth` dan
seluruh data "bulan lalu" diam-diam tertumpuk ke bulan berjalan.

Bug yang hanya muncul tiga hari sebulan — karena itu tidak pernah tertangkap.
Diganti perhitungan kalender (`Date.UTC(y, m − 1, 1)`), bentuk yang sebenarnya
sudah dipakai di bagian lain berkas yang sama.

## Sebab kedua: bisnisnya memang tidak masuk akal

Setelah gaji dibetulkan pun masih rugi Rp 17,8 jt — dan wajar, karena demo
menggambarkan perusahaan dengan **4 karyawan bergaji Rp 24,4 jt/bulan tetapi
penjualan hanya ±Rp 18 jt/bulan**. Tidak ada bisnis yang bertahan seperti itu.

Ditambahkan **satu siklus dagang grosir** di bulan berjalan: kulakan
Rp 48,9 jt lebih dulu, lalu tiga faktur grosir ke pelanggan besar (hotel,
koperasi, kafe) senilai Rp 63,3 jt. Kulakan sengaja lebih besar daripada yang
dijual supaya stok tetap sehat dan tidak ada baris minus. Dua dari tiga faktur
dilunasi, satu dibiarkan terbuka agar piutang tetap punya isi yang masuk akal.

Seluruh siklus memakai `taxRate: 0` **secara sengaja** — demo sudah punya
banyak faktur ber-PPN 11% untuk modul pajak, sementara menggeser total PPN akan
mengubah angka laporan pajak tanpa menambah nilai demo apa pun.

## Hasilnya

| | Sebelum | Sesudah |
| --- | ---: | ---: |
| Laba Bulan Ini | **−Rp 42.212.855** | **+Rp 5.852.673** |
| Penjualan Bulan Ini | Rp 17.938.390 | Rp 81.238.390 |
| Kas & Bank | Rp 39.126.009 | Rp 88.765.759 |
| Nilai Persediaan | Rp 11.826.694 | Rp 21.408.716 |

## Koreksi: risiko yang saya perkirakan ternyata salah alamat

Rencana fase ini menyebut risikonya adalah **"298 asersi smoke yang menyebut
angka rupiah spesifik"**. Itu **keliru**, dan perlu dicatat.

`scripts/seed-demo.mjs` hanya dipakai `scripts/ui-sim.mjs` dan
`scripts/screenshots.mjs` — **`pnpm smoke` menyemai datanya sendiri** dan tidak
menyentuh berkas ini sama sekali. Ke-298 asersi itu memang ada, tetapi
menguji fixture milik smoke, bukan perusahaan demo.

Terbukti empiris: setelah kedua perubahan, **863 cek smoke lolos tanpa satu pun
disentuh**. Permukaan risiko yang sebenarnya adalah ui-sim (235 cek) dan
tangkapan layar — jauh lebih kecil daripada yang saya khawatirkan.

Pelajaran yang sama bentuknya dengan yang berulang sejak Fase 16: **periksa
ketergantungannya, jangan menyimpulkan dari besarnya angka.**

## Cek baru `F1b`

Membaca nilai kartu "Laba Bulan Ini" yang **dirender**, mengurainya jadi angka,
dan menuntutnya positif. Sengaja bukan "tidak ada tanda minus di halaman" —
asersi longgar seperti itu akan hijau walaupun kartunya hilang sama sekali.

**Dibuktikan bisa gagal.** Hanya tanggal penggajian dikembalikan ke `daysAgo(3)`:

```
✗ F1b perusahaan demo menampilkan laba positif, bukan rugi
  → terbaca "-Rp 18.457.345" → -18457345
UI-SIM: 234/235 checks passed — 1 GAGAL
```

Selisihnya (−18,5 jt vs +5,9 jt) sekaligus memastikan kedua perbaikan itu
memang dua penyumbang terpisah, bukan satu hal yang dihitung dua kali.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **246** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap, tanpa satu pun diubah) |
| `node scripts/ui-sim.mjs` | **235** cek lolos (naik dari 234) |

## Diperiksa dengan mata

Dasbor demo, lalu tangkapan layar hero halaman depan yang diregenerasi —
keduanya kini menampilkan laba hijau. 6 gambar `landing` dan 27 gambar
`panduan` diregenerasi karena semuanya memotret data semaian yang berubah.

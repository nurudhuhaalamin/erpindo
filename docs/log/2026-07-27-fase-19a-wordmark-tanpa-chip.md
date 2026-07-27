# Fase 19a — Wordmark tanpa chip putih

Salah satu dari dua hal yang menggantung sejak Fase 17a dan sengaja tidak saya
putuskan sendiri karena menyentuh identitas merek. Pemilik memutuskan agar
dikerjakan.

## Masalahnya bukan format berkas, melainkan kanal alfa

`logo-erpindo.png` adalah PNG **RGB tanpa kanal alfa** — **64% pikselnya putih**,
dan putih itu *terbakar di dalam gambar*. Sudut-sudutnya bahkan bukan putih
murni (253–254), sisa kompresi sumbernya.

Karena itu chip `bg-white` di `BrandWordmark` **bukan hiasan**: ia menyamarkan
kotak putih yang memang akan muncul di latar apa pun. Menghapus kelasnya saja
tidak menyelesaikan apa-apa — kotaknya tetap ada, hanya jadi tidak disengaja.

## Terus terang soal permintaan "jadikan SVG"

Yang diminta adalah SVG. Yang dikerjakan **bukan** SVG, dan alasannya perlu
ditulis apa adanya:

SVG **sungguhan** butuh berkas vektor aslinya. Melacak-ulang PNG bergradien
dengan huruf kustom seperti ini menghasilkan path membengkak yang **tidak setia
pada bentuk aslinya** — untuk sesuatu yang justru berfungsi sebagai identitas
merek, itu hasil yang lebih buruk, bukan lebih baik.

Keuntungan utama SVG pun hampir tidak berlaku di sini: wordmark dirender pada
`h-7`/`h-8` (28–32px), sementara PNG-nya 1180px — **sudah 30× lipat** resolusi
yang dibutuhkan, bahkan pada layar 3×.

Jadi yang dikerjakan adalah **tujuan di balik permintaan itu**: logo yang bersih
di latar apa pun, di kedua tema. Bila pemilik punya berkas vektor aslinya
(Illustrator/Figma/`.svg`), memasangnya jelas lebih baik dan hanya perlu
hitungan menit — saya cukup diberi berkasnya.

## Yang dikerjakan

`scripts/brand-alfa.mjs` (baru) membuat dua varian ber-alfa dari berkas asli,
yang kini disimpan apa adanya sebagai `logo-erpindo-original.png`:

- **`logo-erpindo.png`** — latar transparan, warna asli (tema terang).
- **`logo-erpindo-dark.png`** — sama, tetapi tulisan abu-gelap ("indo" dan
  tagline) dicerahkan, biru merek dipertahankan.

Latar putih dilepas dengan memulihkan alfa dari kanal paling gelap lalu
meng-*un-premultiply* warnanya (`a = 1 − min/255`, `C = (P − (1−a)·255)/a`),
sehingga **tepi anti-alias tetap halus** — bukan potong-ambang yang meninggalkan
gerigi. Piksel dengan `min ≥ 250` dipaksa transparan penuh untuk membuang kabut
253–254.

`BrandWordmark` membuang chip, merender kedua varian bertumpuk, dan menukarnya
lewat `dark:`. Penukaran **murni CSS**, bukan pemilihan di JavaScript — supaya
ikut berlaku pada muat pertama sebelum React hidrasi, jadi tidak ada kedipan
logo salah tema. Alasan yang sama dengan anti-FOUC `theme-init.js`.

## Bug yang ditemukan saat mengerjakannya: saturasi tidak berarti pada warna gelap

Varian gelap versi pertama keluar **identik** dengan varian terang — tulisan
"indo" tetap nyaris tak terbaca di latar gelap.

Sebabnya pembeda yang dipakai adalah **saturasi relatif** `(max−min)/max`.
Setelah un-premultiply, piksel "indo" bernilai `[0, 4, 8]` — dan saturasinya
terhitung **1,0**, seolah warna paling pekat yang mungkin. Penyaring `sat < 0,25`
karena itu tidak mengenainya sama sekali.

Diganti **kroma absolut** (`max − min`), yang berperilaku benar di ujung gelap:

| Piksel | max−min | Kesimpulan |
| --- | ---: | --- |
| "indo" `[0,4,8]` | 8 | netral → dicerahkan |
| Biru merek `[0,64,128]` | 128 | berwarna → dipertahankan |

Ini ketahuan hanya karena hasilnya **dilihat**, lalu nilai pikselnya
dibandingkan antara kedua berkas — bukan karena ada asersi yang gagal.

## Cek baru `F1a`

Memeriksa **gaya terhitung** pembungkus wordmark di `/masuk`, bukan ada atau
tidaknya kelas `bg-white` di markup. Alasannya dua arah: latar putih bisa
kembali lewat jalan lain walau kelasnya hilang, dan sebaliknya asersi "tidak ada
kelas `bg-white`" akan hijau walaupun logonya tetap berkotak putih.

Halaman `/masuk` dipilih karena di sanalah masalahnya paling terlihat — wordmark
berdiri di atas panel `brand-50` yang berwarna.

**Dibuktikan bisa gagal.** Chip dikembalikan, lalu:

```
✗ F1a wordmark tanpa chip putih di atas panel brand halaman masuk → latar=rgb(255, 255, 255)
UI-SIM: 233/234 checks passed — 1 GAGAL
```

Setelah dikembalikan, 234/234 hijau.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **246** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **234** cek lolos (naik dari 233) |

## Diperiksa dengan mata

Tiga latar diperiksa, bukan satu: putih, `brand-50` (panel halaman masuk), dan
`#0c0c10` (tema gelap). Lalu halaman `/masuk` sungguhan — wordmark kini duduk
langsung di atas panel bergrid tanpa kotak — dan aplikasi dalam tema gelap,
tempat varian gelapnya terbaca dengan benar.

`sharp` sengaja **tidak** dijadikan dependensi repo: skrip ini sekali jalan,
hasilnya ikut ter-commit, dan skripnya disimpan sebagai catatan bagaimana
berkas itu dibuat. Ia mencari `sharp` dari store pnpm bila tidak tertaut di akar.

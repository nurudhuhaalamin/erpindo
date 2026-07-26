# Fase 16u — Isi halaman Dasbor dwibahasa

Sub-fase pertama yang menggarap halaman **belum pernah masuk program i18n**
(bukan lagi pelunasan utang). Sasaran: `apps/web/src/pages/dashboard.tsx` —
layar pertama yang dilihat setiap pemakai setelah masuk, dan halaman dengan
temuan terbanyak (65) dalam sapuan menyeluruh Fase 16n.

## Alat diperbaiki dulu: bentuk ternary kedua

Sapuan melaporkan 65, tetapi 11 di antaranya **sudah dwibahasa**. Halaman ini
memakai bentuk yang belum dikenali alat:

```ts
const en = lang === "en";
…
label: en ? "Cash & Bank" : "Kas & Bank",
```

Alat hanya mengenali `lang === "en" ? … : …`. Ditambahkan pengenalan alias
`const en = lang === "en"` beserta ternary `en ? … : …`. Setelah itu angkanya
turun ke **54**, dan sepuluh halaman yang sudah bersih diperiksa ulang untuk
memastikan tidak ada yang berubah — tidak ada regresi.

Pola berulang sepanjang program ini: **percayai alat hanya sejauh ia sudah
dibuktikan pada kasus yang ada di depan mata.**

## Yang dikerjakan

- **~70 entri kamus baru** (613 → 678).
- **33 blok teks** di sembilan komponen dasbor: grafik penjualan harian,
  faktur jatuh tempo, beban perlu diperiksa, aktivitas terakhir, daftar mulai
  cepat, tren bulanan, laporan terjadwal, ringkasan mingguan AI, panel
  sesuaikan dasbor, kartu KPI (aria-label + delta), dan tautan cepat.

`DASHBOARD_WIDGETS` adalah konstanta tingkat modul **kedelapan** yang menyimpan
teks tampilan. Kini bertipe `readonly { key: string; label: UiKey }[]` lewat
`satisfies`, sehingga kesalahan kunci tertangkap saat kompilasi.

## Dua hal yang diperiksa, bukan diasumsikan

**Kunci kembar.** `belumAdaAktivitas` yang saya tambahkan ternyata sudah ada
sejak Fase 16h dengan isi **persis sama**. TypeScript menangkapnya
(`TS1117: multiple properties with the same name`). Kamus sudah 600+ entri,
jadi menambah tanpa memeriksa mulai berisiko.

**Terjemahan yang sekilas benar.** Tautan cepat sempat memakai
`penjualanJudul`/`pembelianJudul` — kunci yang dibuat Fase 16q untuk **jenis
transaksi** pada kartu stok, isinya `"Sale"`/`"Purchase"` (tunggal). Untuk
tautan menu yang benar adalah `"Sales"`/`"Purchases"`. Ditambahkan
`menuPenjualan`/`menuPembelian`. Kunci yang cocok namanya belum tentu cocok
maknanya.

## Yang sengaja TIDAK diterjemahkan

```tsx
{n.title.replace("Faktur ", "").replace(" lewat jatuh tempo", "")}
```

Ini **memotong** judul notifikasi yang datang dari server. Dua string itu
argumen pencocokan, bukan teks layar — menerjemahkannya justru mematahkan
pemotongannya. Teks yang tampil tetap berbahasa Indonesia karena **sumbernya
dari API**, dan itu perkara teks sisi server: di luar lingkup fase halaman web,
tetapi dicatat di sini supaya tidak hilang.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 238 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **209** cek lolos (naik dari 208) |

Cek baru `F0y` — rute `/app`. Penanda positifnya menerima **salah satu** dari
dua kartu; kartu "Mulai dari sini" sengaja **tidak** dijadikan syarat karena
hanya tampil untuk peran owner. Sesi ui-sim memang owner, tetapi asersi yang
bergantung pada peran akan rapuh bila alur ujinya berubah.

Sisa temuan halaman ini 2: satu potongan kode dan satu argumen `.replace()`
di atas.

## Sisa program

| Lingkup | Temuan mentah |
| --- | ---: |
| 25 halaman lain yang belum masuk program | ~724 |
| 19 peta label `shared` untuk halaman itu | bagian dari ~335 |
| `apps/web/src/components/` | ~28 |

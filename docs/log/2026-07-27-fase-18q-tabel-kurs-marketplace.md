# Fase 18q — Mata Uang & Marketplace, plus cacat lebar kartu yang tersembunyi 12 sub-fase

Rencananya sub-fase ini yang paling murah: dua tabel seragam, tanpa `colSpan`,
tanpa form di dalam sel. Yang terjadi justru sebaliknya — dua tabel sempit itu
**membuka cacat pada pola tabel-kartu itu sendiri**, yang sudah ada sejak 18d.

## Yang dikerjakan

### `apps/web/src/pages/currencies.tsx` — 1 tabel

Daftar mata uang (Kode, Nama, Kurs) dipindahkan ke `Table`/`Thead`/`Tr`/`Th`/
`Td`. Hanya kolom Kurs yang `numeric`; kolom Kode **tidak**, karena selnya
memuat kode plus lencana "dasar" — bukan satu nilai (aturan 17g/17h).

### `apps/web/src/pages/marketplace.tsx` — 1 tabel

Daftar pesanan terimpor (Kanal, No. Pesanan, Faktur, Diimpor). **Tidak ada
kolom `numeric` sama sekali**: seluruh isinya pengenal, label kanal, atau
tanggal.

## Cacat yang ditemukan: kartu baris tidak memenuhi lebar wadahnya

Tangkapan layar halaman Mata Uang pada 390px memperlihatkan kartu baris
berhenti di sekitar 55% lebar kartu induknya, menyisakan area kosong lebar di
sebelah kanan.

**Sebabnya** ada di komponen `Table`, bukan di halaman ini. Sejak 18d, `<table>`
dan `<tr>` dibuat `block` di bawah `md`, tetapi **`<tbody>` dibiarkan tetap
`table-row-group`**. Peramban lalu membungkus baris-baris blok itu dalam tabel
anonim, dan tabel anonim **menciut ke lebar isinya**.

**Kenapa baru ketahuan sekarang.** Dua belas sub-fase sebelumnya memigrasikan
tabel yang isinya lebar — Stok, Faktur, Jurnal, Gaji, Manufaktur — sehingga
kartunya kebetulan penuh dan cacatnya tidak terlihat. Mata Uang hanya punya
tiga kolom pendek; di sanalah selisihnya muncul.

**Perbaikannya** satu baris di `apps/web/src/components/ui.tsx`:

```
max-md:[&>tbody]:block
```

Ditulis sebagai varian arbitrer pada `Table`, **bukan** komponen `Tbody` baru,
supaya seluruh pemanggil yang sudah bermigrasi ikut terbaiki tanpa perlu
disentuh satu per satu — 24 tabel di 15 berkas.

## Cek baru: `F33`

`F28` (18d) memeriksa **bentuk** — kepala tersembunyi, sel jadi blok, label
muncul — tetapi tidak memeriksa **lebar**. Justru itu celahnya. `F33`
membandingkan lebar baris dengan lebar wadahnya, dan sengaja memakai halaman
Mata Uang **karena tabelnya sempit**: pada tabel lebar cek ini akan hijau
walaupun bugnya ada.

Ini pengulangan pelajaran yang sama persis dengan lahirnya `F28`: **asersi
hanya membuktikan apa yang benar-benar diukurnya.** `F28` mengukur bentuk, jadi
ia hijau sementara lebarnya salah — sama seperti `F26` yang mengukur gulir
dokumen dan hijau sementara tabelnya menggulir di dalam dirinya sendiri.

Dan sekali lagi, yang menemukannya **bukan asersi, melainkan mata**. Ini bug
keempat dalam program ini yang lolos seluruh gerbang dan hanya ketahuan dari
melihat tangkapan layar.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**, bukan penyaringan
keluaran (pelajaran 18f).

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **244** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **233** cek lolos (naik dari 232) |
| `node scripts/sapu-i18n.mjs` | tidak ada utang baru |

## Diperiksa dengan mata

Tangkapan layar 390px dilihat untuk Mata Uang dan Marketplace (halaman baru),
**dan** untuk Stok — karena perbaikan `ui.tsx` menyentuh seluruh tabel yang
sudah bermigrasi, jadi perlu dipastikan tidak ada yang rusak. Ketiganya benar:
kartu memenuhi lebar, label di kiri, nilai di kanan, tanpa gulir mendatar.

## Sisa cakupan

Tersisa **5 tabel di 5 berkas**: `attendance`, `crm`, `budget`,
`consolidation`, `projects`.

**8 tabel dikecualikan permanen** — 5 `print.tsx`, 2 struk POS
(`buildReceiptHtml`), 1 surat jalan (`printDeliveryNote`) — karena merupakan
dokumen cetak yang wajib putih terlepas dari tema layar.

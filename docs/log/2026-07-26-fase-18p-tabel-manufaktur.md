# Fase 18p — Manufaktur & QC memakai `Table` + kartu di HP

Melanjutkan penyebaran pola tabel-kartu (18d). Modul ini punya dua tabel dan
satu bentuk yang belum pernah dilalui sub-fase sebelumnya: **baris total
ber-`colSpan`**.

## Yang dikerjakan

### `apps/web/src/pages/manufacturing.tsx` — 2 tabel

**Riwayat produksi.** Tujuh kolom (No., Produk, Jumlah, Biaya total, Status,
QC, Aksi) dipindahkan ke `Table`/`Thead`/`Tr`/`Th`/`Td`. Kolom Jumlah dan
Biaya total memakai `numeric` — isinya murni nilai. Kolom QC **tidak**, karena
selnya memuat lencana plus keterangan gudang karantina, bukan satu nilai
(aturan yang sama dengan kolom stok di 17g dan PPh 21 di 18j).

Tiga tombol dalam sel aksi dipindahkan dari `className="h-8"` ke `size="xs"`.

**Routing produksi.** Enam kolom plus baris total. Baris tahapan hidup di
komponen `RoutingRow` tersendiri, jadi `<tr>`/`<td>`-nya ikut dimigrasikan di
sana. `Tr` diberi `align-top` karena sel aksinya memuat form penyelesaian
(input biaya aktual + tombol) — tanpa itu baris lain ikut merenggang saat form
muncul, persis kasus work order di 18o.

### Baris total ber-`colSpan` — bentuk yang perlu diperhatikan

Pada mode kartu setiap sel menjadi blok, sehingga **`colSpan` kehilangan
artinya**. Baris total karena itu tidak boleh mengandalkan `colSpan` untuk
keterbacaannya: tiap sel nilainya diberi `label` sendiri (`Standar`, `Aktual`,
`Varian`) supaya di HP ia tetap punya konteks, sementara sel judulnya
(`colSpan={3}`) sengaja dibiarkan tanpa label karena ia memang judulnya.

## Cek baru: `F32`

`F28` (18d) membuktikan tabel Stok menumpuk jadi kartu — tetapi seluruh
barisnya seragam. Baris total ber-`colSpan` adalah bentuk yang berbeda dan
belum dijaga apa pun, jadi `F32` menyasarnya di tabel routing manufaktur:
kartunya muat di layar, tabelnya tidak menggulir di dalam dirinya sendiri,
barisnya benar-benar `display: block`, dan sel ber-`colSpan`-nya ikut menjadi
`flex`.

### Cek ini dibuktikan bisa gagal

Sesuai pelajaran yang berulang sejak Fase 17 — **asersi yang tidak pernah bisa
merah tidak menjaga apa pun** — `F32` diuji dengan mengembalikan bug-nya:
baris total dikembalikan ke `<tr>` polos. Hasilnya:

```
✗ F32 … → kanan=269 layar=390 tabelMeluber=false blok=false sel=true
UI-SIM: 231/232 checks passed — 1 GAGAL
```

Perhatikan `kanan=269` pada layar 390: dengan `<tr>` polos baris totalnya
menciut ke 269px dan tidak lagi sejajar dengan kartu-kartu di atasnya — persis
cacat visual yang dicegah. Setelah dikembalikan, 232/232 hijau.

### Koreksi: sasaran `F32` sempat salah

Rancangan pertama `F32` menyasar sel aksi yang memuat `<input type="number">`
di baris routing berstatus WIP — kasus yang lebih menarik. Cek itu **merah**
dengan pesan "tidak ada sel berisi input number".

Sebabnya bukan kode halaman, melainkan **keadaan sesi**: blok layar kecil
berjalan setelah `F15`, yang masuk lewat tombol "Lihat Demo" — jadi suite
berada di sesi demo dengan peran `viewer`, dan kolom aksi memang tidak
dirender sama sekali untuk viewer. Sasarannya dipindah ke bentuk yang
benar-benar dilihat pengunjung demo. Catatan ini ditulis di komentar cek juga,
supaya orang berikutnya tidak mengulangi asumsi yang sama.

## Diperiksa dengan mata

`UI_SIM_SHOT` mendapat satu rute baru (`hp-manufaktur`), lalu gambarnya
dilihat: baris riwayat produksi tersaji sebagai kartu berlabel — `No.`,
`Produk` (dengan nama gudang di bawahnya), `Jumlah`, `Biaya total`, `Status`,
`QC` — tanpa gulir mendatar dan tanpa kolom yang terpotong.

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
| `node scripts/ui-sim.mjs` | **232** cek lolos (naik dari 231) |
| `node scripts/sapu-i18n.mjs` | tidak ada utang baru |

## Sisa cakupan — dengan satu koreksi hitungan

Tersisa **7 tabel di 7 berkas**, satu tabel per berkas: `projects`,
`marketplace`, `currencies`, `crm`, `consolidation`, `budget`, `attendance`.

**Koreksi:** angka yang sempat ditulis adalah "8 tabel di 8 berkas", termasuk
`salesorders.tsx`. Saat berkas itu dibuka ternyata satu-satunya `<table>` di
dalamnya berada di `printDeliveryNote()` — string HTML surat jalan yang dibuka
di jendela cetak, **bukan tabel layar**. Ia masuk kategori yang sama dengan
struk POS yang dikoreksi di 18n: dokumen cetak wajib putih terlepas dari tema
layar, jadi tidak boleh dimigrasikan.

Ini kedua kalinya hitungan tabel meleset karena `<table>` dihitung dari hasil
grep tanpa melihat konteksnya. Karena itu daftar pengecualian sekarang ditulis
lengkap, bukan sebagai catatan kaki:

| Berkas | Jumlah | Alasan |
| --- | ---: | --- |
| `print.tsx` | 5 | Seluruh berkas adalah dokumen cetak |
| `pos.tsx` → `buildReceiptHtml` | 2 | Struk termal (string HTML) |
| `salesorders.tsx` → `printDeliveryNote` | 1 | Surat jalan (string HTML) |

Total **8 tabel dikecualikan permanen**.

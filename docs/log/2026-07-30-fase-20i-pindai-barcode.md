# Fase 20i — Pindai barcode lewat kamera

Kasir bisa memindai barcode produk dengan kamera perangkat; hasilnya langsung
masuk keranjang POS.

## Yang dikerjakan

- `apps/web/src/lib/barcode.ts` — pembungkus `BarcodeDetector` + deteksi dukungan.
- Panel pemindai di `apps/web/src/pages/pos.tsx`, dwibahasa sejak awal.
- `apps/web/test/barcode.test.ts` — 6 test, seluruhnya tentang **degradasi**.

## Koreksi rencana: TANPA cadangan `zxing-wasm`

Rencana Fase 20 menyebut `zxing-wasm` sebagai cadangan bila `BarcodeDetector`
tidak tersedia. **Itu tidak dikerjakan**, dan alasannya perlu dinyatakan terus
terang karena ini penyimpangan dari rencana yang sudah disetujui.

Saya memeriksa Chromium yang menjalankan ui-sim, bukan mengasumsikannya:

```
{"detector":false,"media":false,"secure":false}
```

Peramban itu **tidak punya `BarcodeDetector` dan tidak punya kamera**. Artinya
jalur pemindaian yang berhasil — baik lewat `BarcodeDetector` maupun lewat
wasm — tidak bisa dijalankan oleh gerbang mana pun yang repo ini punya.
Cadangan wasm akan masuk sebagai ±1,2 MB aset dan beberapa ratus baris kode
yang **tidak satu pun cek bisa membuktikannya bekerja**.

Itu persis kelas utang yang baru saja dibayar di Fase 19q: `useT()` hidup 13
fase tanpa satu pun pemanggil, dan tak ada yang tahu karena tak ada yang
mengujinya. Menambah pengurai wasm yang tak teruji berarti membuka utang yang
sama sambil merasa sudah menutup butir roadmap.

**Akibatnya, dinyatakan apa adanya:** peramban tanpa `BarcodeDetector` —
terutama **Safari iOS** — tidak mendapat pemindaian kamera. Mereka mendapat
penjelasan yang jelas dan tetap bisa berjualan lewat kotak pencarian. Butir ini
ditandai **sebagian** di roadmap, bukan selesai.

## Degradasi adalah fiturnya, bukan pelengkapnya

Karena jalur sukses tak bisa diuji di sini, seluruh perhatian pengujian jatuh ke
kegagalannya — dan itu memang bagian yang paling sering diabaikan.

`mulaiPindai()` melempar **sebab** (`"tanpa-detektor"`, `"tanpa-kamera"`,
`"tanpa-izin"`), bukan `Error`. Disengaja: pesan galat `getUserMedia` berbeda
antarperamban dan berubah antarversi, jadi memilih kalimat berdasarkan teks
galat berarti kalimatnya akan salah suatu hari tanpa ada yang tahu kapan.

Tiga sebab → tiga kalimat berbeda, karena tindakan kasirnya berbeda: ganti
peramban, ganti perangkat, atau beri izin.

Satu test menegaskan `dukunganPindai()` **tidak meminta izin kamera** — layar
yang memunculkan dialog izin hanya untuk mengecek apakah tombolnya perlu
ditampilkan akan membuat kasir menolak izin itu sebelum sempat memakainya.

## `lookupBarcode` akhirnya punya pemanggil

`api.lookupBarcode` sudah ada sejak Fase 7c dan **tidak pernah dipanggil dari
mana pun** sampai fase ini — ditemukan saat menelusuri kode, bukan dari daftar.
Kelas yang sama dengan `useT()`.

Cek smoke ditambah satu: hasil lookup harus memuat `sellPrice`, `unit`, dan
`name`, bukan hanya `id`/`sku` seperti yang diperiksa sebelumnya. Keranjang POS
kini memakai ketiganya; tanpa cek itu, barang bisa masuk keranjang berharga
Rp 0 tanpa ada yang menyadarinya.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **298** (dari 292) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **894** (dari 893) |
| `node scripts/ui-sim.mjs` | 0 | **273** (dari 267) |
| `node scripts/sapu-i18n.mjs` | 0 | utang atribut tetap **0** |

Cek ui-sim baru: `F6c` (× 5) dan `F2a` (mode Inggris).

Salah satunya, `F6c prasyarat cek ini benar`, sengaja menguji **asumsi ceknya
sendiri**: bila suatu hari Chromium CI mulai menyediakan `BarcodeDetector`,
cek itu merah dan memaksa kami menulis ulang pemeriksaan degradasinya — bukan
membiarkannya hijau sambil diam-diam tidak menguji apa pun.

`F2a` diperiksa di dalam blok POS, bukan di sapuan EN di awal suite: tombol
pindai hanya ada saat shift terbuka, dan sapuan itu berjalan sebelum shift
dibuka. Menuntutnya di sana adalah kesalahan asersi, bukan bukti bug —
pelajaran yang sudah tertulis di `F0i`.

**Pemeriksaan mata** lewat `UI_SIM_SHOT`: panel tampil dengan peringatan amber
yang terbaca, kartu produk hasil pencarian tetap ada di sebelahnya (bukti
degradasinya benar-benar anggun), dan tombolnya berubah jadi "Tutup pemindai".
Blok tangkapan sementara sudah dihapus lagi.

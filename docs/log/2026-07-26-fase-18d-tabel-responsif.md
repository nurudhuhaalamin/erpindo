# Fase 18d — Pola tabel responsif: kartu di layar kecil

Sub-fase keempat arah "bersih & lapang". Menyelesaikan masalah yang **sengaja
ditinggalkan terbuka** oleh 18c.

## Masalah yang F26 tidak tangkap

`F26` (18c) memastikan dokumen tidak bocor keluar layar. Halaman Stok
**lolos** cek itu — tetapi tangkapan layarnya menunjukkan kolom "Kedaluwarsa"
dan "Qty" terpotong, dan nama produk pecah jadi tiga baris.

Sebabnya: gulir mendatarnya terjadi **di dalam** wadah `overflow-x-auto` milik
tabel, bukan pada `<body>`. Dari sudut pandang dokumen, semuanya baik-baik saja.
Dari sudut pandang pemakai yang memegang HP, tabelnya tidak terbaca.

Ini contoh bagus bahwa satu cek hijau hanya membuktikan **persis apa yang ia
ukur** — bukan lebih.

## Pola yang dipakai

Di bawah `md` (768px), tabel berhenti jadi tabel:

| Elemen | Perilaku < `md` |
| --- | --- |
| `<table>` | `block` — bukan lagi tata letak kolom |
| `<thead>` | **disembunyikan** — judul kolom pindah ke tiap sel |
| `<tr>` | jadi **kartu**: berbingkai, bersudut, berbantalan, berjarak |
| `<td>` | baris `flex`: **label di kiri, nilai di kanan** |

Judul kolom di layar kecil datang dari prop baru **`Td label={…}`**.

### Kenapa label diminta ulang, bukan disimpulkan dari `<Th>`

Menyimpulkan otomatis berarti memasangkan sel ke-N dengan header ke-N. Itu
**diam-diam salah begitu ada `colSpan`** — dan `colSpan` sudah dipakai hari ini
(baris total di Stok memakai `colSpan={5}`, di Neraca Saldo `colSpan={2}`).
Label yang salah pasang lebih buruk daripada tanpa label, karena pembaca
memercayainya.

Jadi pemanggil menuliskannya ulang. Ada duplikasi dengan `<Th>`, dan itu
diterima sebagai harga dari kebenaran yang bisa dibaca langsung di tempatnya.
Sel tanpa `label` (mis. kolom aksi) tetap tampil, hanya tanpa judul.

### `minWidth` dibuang

Prop `minWidth` pada `Table` **dihapus**: tidak ada satu pun pemanggilnya, dan
di layar kecil ia justru akan memaksa kembali gulir mendatar yang baru saja
dihilangkan. Mempertahankan jalur yang tak pernah terpakai berarti merawat
sesuatu yang belum pernah terbukti benar.

## Diterapkan ke dua modul percontohan

`stok.tsx` (4 tabel) dan `finance.tsx` (4 tabel) — keduanya sudah memakai
komponen `Table` sejak 17g/17h. Total **35 sel** diberi label.

Sisanya menunggu 18i+ bersama migrasi tabel tangan yang belum dipindahkan.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **229** cek lolos (naik dari 228) |

Cek baru **`F28`** memeriksa **empat hal sekaligus** pada 390px, karena tiga di
antaranya bisa benar sementara satu lainnya salah:

1. `<thead>` benar-benar `display: none`;
2. sel ter-render `flex` (menumpuk), bukan `table-cell`;
3. **tabelnya sendiri** tidak menggulir (`scrollWidth <= clientWidth + 2`) —
   inilah yang `F26` lewatkan;
4. lebih dari 3 label kolom benar-benar tampak (bukan sekadar ada di DOM —
   `display` diperiksa).

Poin 4 penting: kalau label hanya diperiksa keberadaannya, cek akan lolos
meski seluruh label tersembunyi dan kartunya jadi deretan angka tanpa
keterangan.

## Diperiksa dengan mata

Tangkapan layar `hp-stok` sebelum dan sesudah:

- **Sebelum**: kolom terpotong di kanan, nama produk pecah tiga baris, perlu
  digeser ke samping.
- **Sesudah**: tiap baris jadi kartu — `SKU`, `Produk`, `Gudang`, `Lot`,
  `Kedaluwarsa`, `Qty` semuanya terbaca berpasangan label-nilai, tanpa geser
  samping sama sekali.

## Catatan

Kolom rupiah tetap memakai utilitas `num` (mono + `tabular-nums`) di kedua mode
— di layar kecil pun angka tetap rata kanan terhadap label kolomnya, sehingga
tetap mudah dipindai.

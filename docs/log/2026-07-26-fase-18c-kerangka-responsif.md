# Fase 18c — Kerangka aplikasi responsif + uji layar kecil

Sub-fase ketiga arah "bersih & lapang". Yang ditutup di sini adalah **lubang
terbesar** yang ditemukan waktu menyusun rencana Fase 18.

## Klaim "responsif" selama ini tidak dijaga apa pun

Sampai fase ini, **seluruh 225 cek `ui-sim` berjalan pada satu viewport:
1360×900**. Tidak ada satu pun asersi yang pernah menyentuh layar kecil. Dan
kodenya memang menunjukkan akibatnya:

| Breakpoint | Jumlah pemakaian di 36 berkas halaman |
| --- | ---: |
| `sm:` | 205 |
| **`md:`** | **10** |
| `lg:` | 45 |
| `xl:` | 3 |

**15 dari 36 halaman** punya kurang dari 3 kelas responsif.

## Lintasan layar kecil, dan dua bug yang langsung ditemukannya

Ditambahkan babak baru di akhir suite: viewport **390×844**, empat rute inti
(`/app`, Stok, Penjualan, Neraca Saldo). Ditaruh paling akhir dengan sengaja —
mengubah viewport di tengah suite bisa menggeser tata letak yang diandalkan
asersi lain.

Babak itu langsung menemukan **dua bug nyata**, keduanya tak terlihat di
desktop dan tak terjangkau cek mana pun sebelumnya:

1. **Tombol Menu hanya 34×34px.** Ini **satu-satunya** jalan menuju menu di
   layar kecil — sidebar desktop memakai `hidden md:flex`. Ukuran segitu di
   bawah ambang nyaman untuk jempol.
2. **Setelah diperbesar ke 44px, lebarnya tergencet jadi 32px.** Tombolnya ada
   di dalam `flex`, dan sebagai flex item ia boleh menyusut di bawah lebar yang
   diminta. `size-11` saja tidak cukup — perlu `shrink-0`.

Bug kedua ini contoh bagus kenapa asersi harus **mengukur hasil render**:
kelasnya (`size-11`) benar dan ada di DOM, tapi hasil nyatanya bukan 44×44.
Cek berbasis kelas akan lolos dengan tenang.

## Yang dikerjakan

- Tombol Menu & tombol tutup drawer: **sasaran sentuh 44×44px**
  (`size-11 shrink-0`), ikon `size-4` → `size-5`.
- Topbar lebih tinggi di layar kecil (`h-14`, kembali `h-12` mulai `md`) supaya
  tombol 44px punya ruang dan tidak berdesakan dengan wordmark.
- Bantalan topbar `px-3` → `px-3 sm:px-4`.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **228** cek lolos (naik dari 225) |

Tiga cek baru:

- **`F26`** — pada 390px, empat rute inti tidak menghasilkan **gulir mendatar
  pada dokumen** (`scrollWidth <= clientWidth + 2`, toleransi sub-piksel).
- **`F27`** — drawer bisa dibuka & ditutup, berisi > 5 tautan, dan tombol
  pemicunya **terukur** ≥ 36×36px.
- **`F26` bebas galat halaman** pada layar kecil.

`UI_SIM_SHOT` kini juga merekam tampilan HP (`hp-dasbor`, `hp-stok`,
`hp-drawer`, `hp-masuk`, `hp-landing`). Yang di dalam aplikasi diambil selagi
sesi masih hidup — blok tangkapan layar di bawahnya sudah membuang cookie demi
menangkap `/masuk`.

## Yang F26 TIDAK jamin — penting, jangan salah baca

`F26` hanya memastikan **dokumennya** tidak bocor keluar layar. Ia **tidak**
berarti tabel sudah bisa dipakai di HP.

Terbukti dari tangkapan layar `hp-stok`: halaman Stok lolos `F26` — karena
gulir mendatarnya terjadi **di dalam** wadah `overflow-x-auto` milik tabel,
bukan di `<body>` — padahal kolom "Kedaluwarsa" dan "Qty" terpotong di luar
layar, dan nama produk terpecah jadi tiga baris. Praktis tidak terbaca.

Itulah pekerjaan **18d**: pola "kartu di layar kecil, tabel di layar lebar".
Dicatat di sini supaya `F26` tidak dianggap membuktikan lebih dari yang
sebenarnya ia buktikan.

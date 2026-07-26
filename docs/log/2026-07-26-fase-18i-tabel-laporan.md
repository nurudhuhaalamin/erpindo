# Fase 18i — Modul Laporan memakai `Table` + kartu di HP

Sub-fase pertama dari rangkaian panjang **18i+**: menyebarkan pola tabel
responsif (18d) ke modul-modul yang tersisa, satu modul per PR.

## Kenapa Laporan lebih dulu

Rencana menyebut urutan `commerce` → `reports` → `pos` → …
**`commerce.tsx` dilewati** — sudah diperiksa pada 17g dan memang tidak punya
satu pun `<table>`; daftarnya dibangun dari baris CSS grid. Memindahkannya
adalah perubahan struktur, bukan migrasi tabel.

Laporan dipilih berikutnya karena **paling banyak tabelnya** di antara berkas
yang boleh disentuh (5), dan karena isinya angka rupiah — persis tempat
utilitas `num` paling terasa.

## Yang dikerjakan

Kelima tabel dipindahkan ke `Table`/`Thead`/`Tr`/`Th`/`Td`, lengkap dengan
`label` untuk mode kartu di layar kecil:

1. **Blok akun** (dipakai Laba Rugi & Neraca) — tanpa `Thead`, karena judul
   bloknya sudah ada di atas tabel.
2. **Umur Piutang/Hutang** — kolomnya dinamis (`AGING_BUCKETS`), jadi `label`
   ikut dibangkitkan dari kunci kamus yang sama dengan headernya.
3. **Ekspor e-Faktur** — 7 kolom; inilah tabel terlebar di modul ini dan yang
   paling menderita di HP sebelum pola kartu.
4. **Penjualan per produk**.
5. **Penjualan per pelanggan**.

Tiga konstanta lokal (`const th`, dua `const td`) ikut terhapus — sisa terakhir
dari dua gaya header yang bersaing di repo ini.

## Sisa pekerjaan, dengan angka yang jujur

Tersisa **36 `<table>` tangan**, **5 di antaranya di `print.tsx` yang
dikecualikan permanen** (dokumen cetak wajib putih apa pun tema layarnya).
Jadi sasaran migrasi sebenarnya **31 tabel** di 17 berkas:

| Berkas | Jumlah |
| --- | ---: |
| `payroll.tsx` | 4 |
| `pajak.tsx`, `masterdata.tsx`, `admin.tsx` | 3 masing-masing |
| `pos.tsx`, `manufacturing.tsx`, `maintenance.tsx`, `kasbank.tsx`, `dimensi.tsx` | 2 masing-masing |
| 8 berkas lain | 1 masing-masing |

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Status keluar |
| --- | --- |
| `pnpm typecheck` | 0 |
| `pnpm lint` | 0 |
| `pnpm test` | 0 — 244 unit test |
| `pnpm build` | 0 |
| `pnpm smoke` | 0 — 863 cek |
| `node scripts/ui-sim.mjs` | 0 — 231 cek |

Tidak ada cek baru. Pola ini **sudah** dijaga `F28` (18d), yang memeriksa
`<thead>` tersembunyi, sel ter-render `flex`, tabelnya sendiri tidak menggulir,
dan label benar-benar tampak. Cek itu berjalan di halaman Stok; menambahkan
salinannya untuk tiap modul hanya menambah waktu jalan tanpa menambah
kepercayaan — yang dijaga adalah **komponennya**, dan komponennya satu.

Yang dijaga di fase ini justru cek yang **sudah ada**: seluruh 231 asersi harus
tetap hijau setelah lima tabel diganti bentuknya — termasuk `F0c` yang membaca
judul kolom Neraca Saldo dan `F19` yang membaca isi halaman Laporan.

# Fase 18k — Modul Master Data memakai `Table` + kartu di HP

Lanjutan rangkaian 18i+. Sasaran: `apps/web/src/pages/masterdata.tsx`
(1.187 baris) — 3 tabel: **Produk**, **Kontak**, dan **Gudang**.

## Kenapa modul ini penting untuk dirapikan

Tiga halaman ini adalah tempat pengguna baru paling sering mendarat: mengisi
produk, kontak, dan gudang adalah langkah pertama setelah mendaftar. Kalau
tabelnya tidak terbaca di HP, kesan pertamanya rusak sejak awal.

## Yang dikerjakan

Ketiga tabel dipindahkan ke `Table`/`Thead`/`Tr`/`Th`/`Td` lengkap dengan
`label` untuk mode kartu. Dua konstanta lokal (`const th`, `const td`) ikut
terhapus — dan dengan ini **berkas terakhir yang menyimpan pasangan itu sudah
bersih**.

### Kolom barcode: sengaja tetap tersembunyi di layar sempit

Kolom **Barcode** sudah memakai `hidden sm:table-cell` sejak lama. Kelas itu
**dipertahankan**, jadi di mode kartu barcode memang tidak ikut tampil.

Itu keputusan, bukan kelalaian: kartu produk sudah memuat tujuh baris
(SKU, nama, satuan, harga jual, harga beli, label, aksi). Menambahkan barcode —
yang jarang dibaca mata dan lebih sering dipindai alat — hanya memperpanjang
kartu tanpa menambah kegunaan. Dicatat di komentar kodenya supaya tidak
terbaca sebagai lupa.

## Sisa pekerjaan

Tersisa **29 `<table>` tangan**, 5 di `print.tsx` yang dikecualikan permanen.
Sasaran sebenarnya **24 tabel di 15 berkas**:

| Berkas | Jumlah |
| --- | ---: |
| `pajak.tsx`, `admin.tsx` | 3 masing-masing |
| `pos.tsx`, `manufacturing.tsx`, `maintenance.tsx`, `kasbank.tsx`, `dimensi.tsx` | 2 masing-masing |
| 8 berkas lain | 1 masing-masing |

Sejak pola ini dimulai (18d), **5 modul** sudah selesai: Stok, Keuangan,
Laporan, Penggajian, dan Master Data.

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

Ujian sebenarnya di fase ini adalah asersi yang **sudah ada**: `F0d`/`F0e`
membaca isi halaman Produk dan Kontak dalam dua bahasa, dan `F1` menambah
produk lewat form lalu memeriksa barisnya muncul di tabel. Ketiganya menyentuh
persis tabel yang diganti bentuknya.

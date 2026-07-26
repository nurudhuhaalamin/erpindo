# Fase 18o — Dimensi & Pemeliharaan memakai `Table` + kartu di HP

Lanjutan rangkaian 18i+. Dua modul sekaligus karena keduanya kecil: masing-
masing 2 tabel dengan bentuk yang mirip.

## Yang dikerjakan

**`dimensi.tsx`** — daftar cost center, dan laba/rugi per dimensi.
Dua konstanta lokal (`const th`, `const td`) ikut terhapus.

**`maintenance.tsx`** — jadwal servis berkala, dan work order.

Tabel work order adalah yang paling rumit sejauh ini: sel aksinya memuat
formulir penyelesaian (tanggal, biaya, akun pembayar, catatan) yang terbuka
di dalam sel. `Tr` mendapat `align-top` supaya baris lain tidak ikut
meregang saat formulir itu terbuka.

Lima tombol di dalam sel berpindah dari penimpaan `className="h-8"` ke
`size="xs"`.

## Sisa pekerjaan

Tersisa **10 tabel di 9 berkas**, semuanya satu tabel per berkas kecuali
`manufacturing.tsx` yang punya 2:

| Berkas | Jumlah |
| --- | ---: |
| `manufacturing.tsx` | 2 |
| `salesorders`, `projects`, `marketplace`, `currencies`, `crm`, `consolidation`, `budget`, `attendance` | 1 masing-masing |

Di luar itu, **7 tabel dikecualikan permanen** (5 `print.tsx` + 2 struk POS)
karena merupakan dokumen cetak.

**10 modul** selesai: Stok, Keuangan, Laporan, Penggajian, Master Data, Pajak,
Admin, Kas & Bank, Dimensi, Pemeliharaan.

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

Halaman Pemeliharaan dibaca `F0`-series lewat sapuan `AUDIT_ROUTES`; halaman
Dimensi juga. Seperti beberapa fase sebelumnya, isinya tidak diperiksa asersi
teks — yang dijaga adalah rutenya bebas galat dan seluruh 231 cek tetap hijau.

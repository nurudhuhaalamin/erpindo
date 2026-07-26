# Fase 17g — Modul Stok memakai komponen `Table`

Sub-fase ketujuh, dan yang **pertama** dari rangkaian migrasi tabel per modul.
Sasaran: `apps/web/src/pages/stok.tsx` — 4 tabel tangan → komponen `Table`
(disediakan 17b tapi sampai sekarang belum dipakai satu pun).

## Koreksi urutan yang direncanakan

Rencana Fase 17 menyebut urutan `commerce` → `stok` → `finance` → …
**`commerce.tsx` dilewati** setelah diperiksa: berkas itu **tidak punya satu pun
`<table>`**. Daftar transaksinya dibangun dari baris CSS grid
(`sm:grid-cols-[1fr_5rem_9rem_5.5rem_9rem_2.5rem]`), bukan tabel HTML.
Memindahkannya ke `<Table>` adalah perubahan struktur yang jauh lebih besar
daripada "migrasi tabel", dan bukan itu yang dijanjikan sub-fase ini.

Jadi 17g mulai dari **Stok** — modul harian dengan 4 tabel nyata.

## Yang dikerjakan

Keempat tabel (kartu stok, lot & kedaluwarsa, usulan pembelian, level stok per
gudang) dipindahkan ke `Table`/`Thead`/`Tr`/`Th`/`Td`. Yang hilang bersamanya:

- Konstanta lokal `const th = "pb-2 pr-4 text-left font-medium …"` — salah satu
  dari dua gaya header yang bersaing di repo ini. Sekarang tidak ada lagi.
- Pengulangan `border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60`
  yang ditulis tangan **di setiap `<td>`** — sekitar 25 kali di berkas ini saja.
- `tabular-nums` manual pada kolom angka, digantikan `Td numeric` yang memakai
  utilitas `num` dari 17a (**mono + tabular-nums + rata kanan**).

### Dua tempat yang sengaja TIDAK memakai `numeric`

1. Kolom "stok" pada usulan pembelian berisi **lencana**, bukan angka telanjang.
   Dipakai `className="text-right"` saja supaya lencananya tidak ikut dipaksa
   font mono.
2. Kolom aksi (tombol "Kartu") — bukan angka.

Tombol "Kartu" juga berpindah dari `className="h-8"` ke `size="xs"`. Sejak
`twMerge` masuk di 17b penimpaan `h-8` memang sudah berlaku, tetapi memakai
`size` adalah cara yang benar dan tidak bergantung pada resolusi konflik kelas.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **222** cek lolos (naik dari 221) |

Cek baru **`F24`**: kolom angka di halaman Stok **benar-benar ter-render** mono
+ `tabular-nums` + rata kanan, dibaca dari `getComputedStyle` — bukan sekadar
memeriksa kelasnya menempel. Perbedaan itu penting: pada Fase 17b terbukti
sebuah kelas bisa ada di DOM tetapi kalah oleh urutan CSS, dan asersi berbasis
kelas akan lolos secara hampa.

Cek ini **bisa gagal**: pada versi `stok.tsx` sebelum fase ini tidak ada satu pun
pemakaian `Td`/`numeric` (diverifikasi dengan `git show HEAD:… | grep`), jadi
`document.querySelector("td.num")` akan mengembalikan `null` dan asersinya
melaporkan `→ tidak ada td.num`.

Diperiksa juga dengan mata (`UI_SIM_SHOT` kini ikut merekam `/app/stok`): kolom
rupiah kini benar-benar berbaris — itulah gunanya font angka yang ditambahkan
17a, dan baru sekarang terlihat hasilnya di halaman nyata.

## Sisa pekerjaan, dengan angka yang jujur

Tersisa **45 `<table>` tangan** di `apps/web/src/pages/`. Angka ini lebih besar
daripada "31" yang disebut rencana Fase 17 — hitungan lama hanya menghitung
sebagian berkas. Sebarannya:

| Berkas | Jumlah | Catatan |
| --- | ---: | --- |
| `reports.tsx` | 5 | |
| **`print.tsx`** | **5** | **JANGAN dimigrasikan** |
| `payroll.tsx`, `finance.tsx` | 4 masing-masing | |
| `pajak.tsx`, `masterdata.tsx`, `admin.tsx` | 3 masing-masing | |
| `pos.tsx`, `manufacturing.tsx`, `maintenance.tsx`, `kasbank.tsx`, `dimensi.tsx` | 2 masing-masing | |
| 8 berkas lain | 1 masing-masing | |

**`print.tsx` dikecualikan secara permanen.** Isinya dokumen cetak (faktur, slip)
yang **wajib tetap putih** apa pun tema layarnya — itu sebabnya sapuan `bg-white`
di Fase 17a juga dibatalkan untuk berkas ini. Komponen `Table` sadar tema gelap,
jadi memakainya di sana justru merusak hasil cetak.

Jadi sasaran migrasi yang sebenarnya adalah **40 tabel**, bukan 45.

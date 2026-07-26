# Fase 18l — Modul Pajak memakai `Table` + kartu di HP

Lanjutan rangkaian 18i+. Sasaran: `apps/web/src/pages/pajak.tsx` — 3 tabel.

## Yang dikerjakan

1. **PPh Final UMKM** — riwayat setoran per masa pajak.
2. **PPh 23** — bukti potong, 8 kolom termasuk aksi setor.
3. **SPT Masa PPN 1111** — rincian transaksi ber-PPN (dipakai dua kali: pajak
   keluaran dan masukan), lengkap dengan baris total.

Dua konstanta lokal (`const th`, `const td`) ikut terhapus.

Empat tombol di dalam sel PPh 23 berpindah dari penimpaan `className="h-8"` ke
`size="xs"` — cara yang benar dan tidak bergantung pada resolusi konflik kelas.

## Catatan: `min-w-[720px]` hilang, dan itu memang tujuannya

Dua dari tiga tabel ini memakai `min-w-[640px]`/`min-w-[720px]` — cara lama
memaksa lebar minimum lalu menyerahkan sisanya ke gulir mendatar.

Kelas itu **tidak dibawa** ke komponen `Table`. Prop `minWidth` memang sudah
dihapus pada 18d dengan alasan yang persis berlaku di sini: di layar kecil,
lebar minimum akan memaksa kembali gulir mendatar yang baru saja dihilangkan
pola kartu.

Di layar lebar tabelnya tetap lega karena isi selnya sendiri yang menentukan
lebar kolom — yang hilang hanya paksaan, bukan keterbacaannya.

## Sisa pekerjaan

Tersisa **26 `<table>` tangan**, 5 di `print.tsx` yang dikecualikan permanen.
Sasaran sebenarnya **21 tabel di 14 berkas**:

| Berkas | Jumlah |
| --- | ---: |
| `admin.tsx` | 3 |
| `pos.tsx`, `manufacturing.tsx`, `maintenance.tsx`, `kasbank.tsx`, `dimensi.tsx` | 2 masing-masing |
| 8 berkas lain | 1 masing-masing |

**6 modul** sudah selesai: Stok, Keuangan, Laporan, Penggajian, Master Data,
dan Pajak.

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

Ujian sebenarnya adalah asersi `F19` yang membuka halaman Pajak dan membaca
kartu PPh Final serta PPh 23 — keduanya menyentuh tabel yang diganti bentuknya.

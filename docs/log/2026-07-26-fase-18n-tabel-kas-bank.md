# Fase 18n — Modul Kas & Bank memakai `Table` + kartu di HP

Lanjutan rangkaian 18i+. Sasaran: `apps/web/src/pages/kasbank.tsx` — 2 tabel.

## Koreksi hitungan: dua "tabel" di POS ternyata bukan tabel layar

Saat menyiapkan fase ini, `pos.tsx` diperiksa karena tercatat punya 2 `<table>`.
Ternyata **keduanya berada di dalam string HTML struk termal**
(`buildReceiptHtml`, dipisahkan pada Fase 16t):

```
<hr/><table>${rows}</table><hr/>
<table>
  <tr><td>${opts.label.subtotal}</td>…
```

Itu **dokumen cetak**, bukan tabel React. Sama kategorinya dengan `print.tsx`
dan **harus dikecualikan permanen**: komponen `Table` sadar tema gelap dan
memakai kelas Tailwind, sementara struk dicetak ke kertas termal 260px lewat
`window.print()` dengan CSS-nya sendiri. Memakainya di sana akan merusak
hasil cetak.

Jadi angka sisa yang saya laporkan pada fase-fase sebelumnya **kelebihan 2**.
Hitungan yang benar setelah fase ini: **21 `<table>` tersisa**, di mana
**7 dikecualikan permanen** (5 `print.tsx` + 2 struk POS) → sasaran migrasi
sebenarnya **14 tabel di 11 berkas**.

## Yang dikerjakan

1. **Mutasi kas/bank** — tanggal, keterangan, masuk, keluar, saldo berjalan.
2. **Rekonsiliasi rekening koran** — baris mutasi bank dengan aksi
   cocokkan/lepas per baris.

Tabel kedua memuat `<Select>` dan tombol di dalam selnya. `Tr` mendapat
`align-top` supaya baris yang selnya tinggi (karena pemilih jurnal terbuka)
tetap rapi. Satu tombol berpindah dari `className="h-8"` ke `size="xs"`.

Kelas `min-w-[560px]`/`min-w-[640px]` **tidak dibawa** — alasan yang sama
seperti 18l: lebar minimum akan memaksa kembali gulir mendatar yang justru
dihilangkan pola kartu.

## Sisa pekerjaan

| Berkas | Jumlah |
| --- | ---: |
| `manufacturing.tsx`, `maintenance.tsx`, `dimensi.tsx` | 2 masing-masing |
| `salesorders`, `projects`, `marketplace`, `currencies`, `crm`, `consolidation`, `budget`, `attendance` | 1 masing-masing |

**8 modul** selesai: Stok, Keuangan, Laporan, Penggajian, Master Data, Pajak,
Admin, Kas & Bank.

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

Halaman Kas & Bank dilalui `AUDIT_ROUTES` (bebas `console.error`), tetapi
seperti Admin di 18m, isinya tidak dibaca asersi teks mana pun. Dicatat supaya
cakupan ujinya tidak dikira lebih luas daripada kenyataannya.

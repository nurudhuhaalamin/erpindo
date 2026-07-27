# Fase 19f — Pengadaan dwibahasa (+ koreksi bug dari 19e)

Sasaran `apps/web/src/pages/procurement.tsx` — alur PR → PO → GRN.

**38 → 0 temuan teks layar**, **4 → 0 pesan toast**. Berkas ini kini
`BERSIH ✅` sepenuhnya (LAYAR=0 TOAST=0 BERKAS=0). **±30 entri kamus baru.**

## Penyesuaian lingkup

Rencana memasangkan `procurement` + `salesorders` (66 temuan). Dipecah:
`procurement` sendiri memakan lima komponen dan memunculkan tiga temuan yang
perlu dicatat. `salesorders` menjadi 19g.

## Judul halaman dipindah ke `PAGE_HEADINGS`

Berkas ini masih memakai `<h1>` tulisan tangan alih-alih komponen `PageHeading`
— sisa yang terlewat saat Fase 16a menyeragamkan judul seluruh halaman.
Ditambahkan kunci `pengadaan` ke `PAGE_HEADINGS` dan `<h1>`-nya diganti.

**Koreksi (ditulis saat 19g):** log ini semula menyebut `procurement.tsx`
**"satu-satunya"** halaman yang masih begitu. Itu salah — saya menyimpulkannya
tanpa memeriksa. Penelusuran sebenarnya menemukan **empat**: `procurement`
(dibereskan di sini), `salesorders`, `approvals`, dan `attendance`. Ketiganya
menyusul di sub-fase masing-masing.

## Dua jebakan "nama cocok, makna tidak" — dalam satu berkas

Pelajaran Fase 16u muncul **dua kali sekaligus** di sini, dan keduanya akan
menghasilkan terjemahan yang sekilas benar:

| Kunci yang sudah ada | Isinya | Yang dibutuhkan di sini |
| --- | --- | --- |
| `jumlah` | "Jumlah" / **"Amount"** (nominal rupiah) | jumlah **unit** barang → `qtyBarang` ("Qty") |
| `diterima` | "Diterima" / **"Accepted"** (persetujuan) | barang **diterima** → `barangDiterima` ("Received") |

Dan satu lagi saat menambahkan kunci baru: `batalkan` ternyata sudah ada berisi
"Batalkan"/**"Void"** — untuk membatalkan *faktur*. Di pengadaan yang dibatalkan
adalah *pesanan*, jadi dibuat `batalkanPesanan` ("Cancel order"). Sebaliknya
`pilihProdukOpsi` **memang** duplikat sejati dan dibuang.

Jadi dari tiga tabrakan nama: dua butuh kunci baru, satu harus dipakai ulang.
Tidak ada aturan mekanis untuk membedakannya selain membaca isinya.

## Koreksi: bug yang saya buat di 19e

Saat `pnpm lint` dijalankan di fase ini, muncul peringatan pada **`pajak.tsx`**
— berkas 19e, bukan 19f:

```
582:6  warning  React Hook useMemo has a missing dependency: 'u'
```

Ini **bug nyata, bukan sekadar keluhan linter.** `netLabel` di
`SptPpnSection` di-memo dengan `[data]` saja:

```ts
const netLabel = useMemo(() => {
  return data.net >= 0 ? u("ppnKurangBayar") : u("ppnLebihBayar");
}, [data]);          // ← `u` tidak ada di sini
```

`useUi()` mengembalikan closure baru tiap render yang menangkap bahasa aktif.
Karena `data` tidak berubah saat pengguna menekan tombol EN, `netLabel`
**tetap berbahasa lama** — label "PPN Kurang Bayar" bertahan di halaman yang
selebihnya sudah Inggris.

**Kenapa lolos gerbang 19e:** ini peringatan, bukan galat, dan `pnpm lint`
hanya gagal pada galat. Cek `F1e` pun tidak menangkapnya karena penandanya
mengambil teks lain di halaman yang sama.

Diperbaiki di sini (`}, [data, u]);`). Dicatat sebagai koreksi alih-alih
diselipkan diam-diam, karena polanya akan terulang: **setiap `useMemo`/
`useCallback` yang memanggil `u` wajib mencantumkan `u` di daftar
dependensinya**, dan sub-fase berikutnya perlu mengingatnya.

## Kehati-hatian yang kurang: substitusi substring merusak dirinya sendiri

Substitusi dilakukan lewat skrip pengganti string. Satu pasangan urut membuat
hasilnya rusak:

1. `"Jumlah barang diterima:"` → `{u("jumlahBarangDiterima")}`
2. `"Diterima"` → `{u("barangDiterima")}`

Langkah 2 mencocokkan **"Diterima" di dalam nama kunci yang baru saja
disisipkan langkah 1**, menghasilkan `{u("jumlahBarang{u("barangDiterima")}")}`
dan galat sintaks. Tertangkap `tsc` seketika, jadi tidak berbahaya — tetapi
mengingatkan bahwa penggantian substring buta harus diperiksa hasilnya, bukan
dipercaya karena "0 gagal cocok".

## Cek baru `F1f`

Penandanya ketiga judul kartu tahapan (PR → PO → GRN), yang dirender tanpa
syarat data maupun peran.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) — termasuk peringatan `pajak.tsx` yang kini hilang |
| `pnpm test` | **246** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **239** cek lolos (naik dari 238) |
| `node scripts/sapu-i18n.mjs` | `procurement.tsx` **BERSIH ✅** (38 → 0) |

## Sisa program i18n

16 berkas, ±475 teks. Berikutnya **19g — `salesorders.tsx`** (28).

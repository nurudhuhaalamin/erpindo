# Fase 16o — Lunasi utang i18n halaman Keuangan

Sub-fase keempat pelunasan utang hasil audit Fase 16k. Sasaran:
`apps/web/src/pages/finance.tsx` — empat halaman inti pembukuan (Bagan Akun,
Jurnal Umum, Buku Besar, Neraca Saldo) plus kartu template jurnal berulang,
yang pada audit tercatat 40 temuan meski Fase 16f menyatakannya "tuntas".

## Yang dikerjakan

- **30 entri kamus baru** di `apps/web/src/i18n/ui.ts` (492 → 522).
- **26 blok teks + opsi `— pilih akun —` (2×)** diganti ke `u("…")`.

Setelah alat mengenali `downloadCsv()` sebagai format berkas (Fase 16m) dan
memakai tumpang-tindih rentang (Fase 16n), temuan halaman ini turun 40 → 32,
dan **hampir seluruhnya utang nyata** — berbeda dari `reports.tsx` yang
sebagian besar temuannya ternyata header ekspor. Setelah dilunasi, sisa
temuannya 2, keduanya positif-palsu (potongan kode dan string yang justru
sudah memakai `u()`).

Yang diperbaiki:

| Layar | Yang diperbaiki |
| --- | --- |
| Bagan Akun | `aria-label` ubah nama akun |
| Jurnal Umum | placeholder memo & nama template, empat `aria-label` baris, opsi `— pilih akun —`, tombol `+ Tambah baris` dan `Posting Jurnal`, lencana `seimbang`/`belum seimbang`, pesan daftar kosong, lencana `DIBALIK`/`PEMBALIK`, footer `Menampilkan {n} dari {total}` |
| Buku Besar | opsi pilih akun, tombol `Memuat…`/`Muat lebih lama`, baris `Saldo akhir` |
| Neraca Saldo | lencana `seimbang ✓` |
| Template jurnal | lencana `bulanan · berikutnya {tanggal}` dan `manual`, pratinjau baris `D`/`K` |

## Dua hal yang mudah terlewat

**Kunci lama dipakai ulang.** `aria-label={\`Hapus baris ${i+1}\`}` di sini
identik dengan yang ada di `commerce.tsx`, jadi memakai kunci `hapusBaris`
yang sudah dibuat pada Fase 16l — bukan menambah kunci kembar. Inilah gunanya
kamus dipusatkan sejak 16b; nilainya baru terasa setelah beberapa halaman.

**Singkatan satu huruf juga teks.** Pratinjau baris template menampilkan
`D {nominal}` / `K {nominal}` untuk Debit/Kredit. Dalam bahasa Inggris `K`
harus menjadi `C` (Credit). Satu huruf tidak terlihat seperti teks yang perlu
diterjemahkan — sapuan menemukannya karena ia menyapu **isi template literal**,
bukan hanya teks JSX.

## Tabrakan nama di ui-sim

Cek baru sempat gagal `pnpm lint` dengan `'tanpaJurnalId' is already defined`:
nama variabel itu sudah dipakai cek lain di berkas yang sama. Diganti menjadi
`tanpaJurnalSisaId`/`adaJurnalSisaEn`/`jrSisaEn`. Catatan untuk sub-fase
berikutnya: `scripts/ui-sim.mjs` adalah satu ruang lingkup panjang, jadi nama
variabel cek baru harus diberi awalan yang khas.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 234 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **203** cek lolos (naik dari 202) |

Cek baru `F0s` — rute `/app/keuangan/jurnal` diverifikasi ke `main.tsx` lebih
dulu. Penanda positif `Post Entry` + `Add line` (form jurnal manual selalu
tampil untuk admin, jadi tak bergantung ada/tidaknya jurnal tersimpan);
penanda negatifnya murni teks UI.

## Sisa utang setelah fase ini

| Halaman | Temuan | Fase yang menyatakan "tuntas" |
| --- | ---: | --- |
| `projects.tsx` | 24 | 16j |
| `stok.tsx` | 18 | 16d |
| `payroll.tsx` | 15 | 16i |
| `pos.tsx` | 11 | 16g |
| `crm.tsx` | 9 | 16h |
| `commerce.tsx` | 21 | 16l — sudah diverifikasi seluruhnya positif-palsu |

Di luar itu masih ada **26 halaman yang belum pernah masuk program i18n**
(~789 temuan mentah), sebagaimana dicatat pada Fase 16n. Itu bukan utang dari
klaim keliru, melainkan pekerjaan yang memang belum dimulai.

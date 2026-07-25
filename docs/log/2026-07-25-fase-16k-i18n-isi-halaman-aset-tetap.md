# Fase 16k — Isi halaman Aset Tetap dwibahasa

## Yang dikerjakan

Melanjutkan program i18n per-modul (16b–16j) ke halaman **Aset Tetap**
(`apps/web/src/pages/assets.tsx`, rute `/app/keuangan/aset`).

- Menambah **41 entri** ke kamus bersama `apps/web/src/i18n/ui.ts`
  (371 → 412 entri): istilah ikhtisar (`asetAktif`, `nilaiBukuTotal`,
  `penyusutanPerBulan`), form pendaftaran aset (`namaAset`, `tanggalPerolehan`,
  `masaManfaatBulan`, `nilaiResidu`, `dibayarDariAkun`, …), form penyusutan
  bulanan (`periode`, `tanggalJurnal`, `jalankanPenyusutan`), baris daftar aset
  (`perolehan`, `nilaiBuku`, `sejak`, `masa`, `tersusut`, `statusAktif`,
  `statusDilepas`), dan blok pelepasan aset (`tanggalPelepasan`,
  `hasilPenjualanAset`, `diterimaDiAkun`, `lepasAset`, `yaLepasAset`).
- Mengganti **30 titik teks** di `assets.tsx` menjadi `u("…")`, mencakup dua
  komponen (`AssetsPage` dan `AssetRow`).
- `ConfirmDialog` pelepasan aset ikut dwibahasa. Judul dan deskripsinya memakai
  template, jadi dipecah agar tetap tersusun benar di kedua bahasa:
  `` `${u("lepasAsetTanya")} ${asset.name}?` `` dan
  `` `${u("nilaiBuku")} ${formatIDR(asset.bookValue)} ${u("descLepasAset")}` ``.
- Kata `batal`/`lepas` pada tombol toggle baris aset memakai kunci kamus yang
  sudah ada (`batal`) — tidak menambah duplikat.

## Alat baru: `scripts/sapu-i18n.mjs`

Skrip sapuan yang sebelumnya hidup sebagai catatan sesi kini masuk repo sebagai
`scripts/sapu-i18n.mjs`, supaya sub-fase berikutnya memakai alat yang sama dan
hasilnya bisa ditinjau orang lain:

```sh
node scripts/sapu-i18n.mjs apps/web/src/pages/*.tsx
```

## Perbaikan alat: skrip sapuan diperketat

Sebelum menyentuh `assets.tsx`, skrip sapuan lima pola dijalankan dan
melaporkan 33 sisa. Skrip itu **kurang teliti**; setelah diperketat, sapuan yang
sama menemukan **49 sisa** — 16 di antaranya luput pada versi pertama:

| Luput | Contoh di `assets.tsx` |
| --- | --- |
| String di ternary dalam ekspresi JSX | `{open ? "Batal" : "Lepas"}` (baris 360) |
| Teks *sebelum* ekspresi (`>teks{`) | `Sejak {asset.acquisitionDate}` (baris 364) |
| Penanda huruf kecil | `<Badge>dilepas</Badge>`, `<Badge>aktif</Badge>` |
| Argumen string biasa ke `toast()` | `"Tidak ada aset yang perlu disusutkan bulan ini."` |

Penyebabnya: kamus kata pemicu bersifat *case-sensitive*, dan pola JSX hanya
menangkap teks di antara `>` dan `<` — bukan `>` dan `{`. Versi baru menyapu
**semua** literal string, semua template literal, dan semua potongan teks JSX
(`[>}] … [<{]`), lalu menyaring dengan kamus kata yang tidak peka huruf besar.

Agar hitungannya bisa dipercaya, skrip juga membuang kelas positif-palsu yang
sudah terbukti: komentar kode, sisi `id:` dari pasangan `Dual { id, en }` (yang
memang harus berbahasa Indonesia), argumen kunci kamus `u("namaKunci")`, dan
nama kelas Tailwind. Sisanya dikelompokkan menjadi `LAYAR` (teks layar — utang
nyata), `TOAST`, dan `XLSX`.

## Koreksi jujur: 16b–16j belum setuntas yang diklaim

Skrip versi baru dijalankan ulang atas **sepuluh** halaman yang sudah memakai
`useUi()`. Hasilnya **bukan** bersih:

| Halaman | Utang teks layar | Fase yang menyatakan "tuntas" |
| --- | ---: | --- |
| `commerce.tsx` | 61 | 16c |
| `masterdata.tsx` | 60 | 16b |
| `reports.tsx` | 44 | 16e |
| `finance.tsx` | 40 | 16f |
| `projects.tsx` | 25 | 16j |
| `stok.tsx` | 25 | 16d |
| `payroll.tsx` | 18 | 16i |
| `pos.tsx` | 13 | 16g |
| `crm.tsx` | 11 | 16h |
| `assets.tsx` | 0 | 16k (fase ini) |
| **Total** | **~297** | |

Contoh utang nyata yang sudah diperiksa satu per satu di `commerce.tsx`:
tombol `+ Tambah barang`, `description` pada `EmptyState` (judulnya sudah
dwibahasa, deskripsinya belum), lencana `lunas`/`belum lunas`, teks
`Menampilkan {n} dari {total}`, label `Akun refund tunai (…)`, opsi
`— pilih kas/bank —`, `Kurs saat bayar (IDR/{mata uang})`, serta judul dan
deskripsi dua `ConfirmDialog` (batalkan & ubah dokumen).

Kesimpulannya: klaim "tuntas" pada 16b–16j harus dibaca sebagai **"tuntas
menurut alat sapu saat itu"**, bukan tuntas sungguhan. Angka di atas menjadi
daftar utang yang akan dilunasi pada sub-fase lanjutan (16l dan seterusnya),
bukan pekerjaan yang dianggap selesai.

Catatan ketelitian angka: klasifikasi `LAYAR`/`TOAST` masih bocor sedikit pada
panggilan `toast()` yang memanjang beberapa baris — empat temuan di
`assets.tsx` ternyata potongan template toast, bukan teks layar. Jadi ~297 itu
batas atas, bukan angka pasti.

## Batas lingkup yang disengaja

Pesan `toast()` **tetap berbahasa Indonesia**, konsisten dengan 16b–16j: pesan
toast bersifat sementara, tidak menjadi bagian permukaan yang diuji `ui-sim`,
dan belum pernah masuk lingkup program i18n ini. Sapuan tetap melaporkannya agar
utang itu terlihat, bukan tersembunyi.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 234 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **197** cek lolos (naik dari 196) |

Cek baru `F0m` — rute `/app/keuangan/aset` diverifikasi ke `main.tsx` **sebelum**
cek ditulis. Asersi memakai penanda **positif** (`Active assets`,
`Total book value`, `Asset list`/`No assets yet`) agar tidak lolos secara hampa
bila halaman gagal render, dan penanda negatifnya murni teks UI
(`Aset aktif`, `Nilai buku total`, `Daftarkan aset baru`) — bukan nama akun atau
data pengguna, sesuai pelajaran Fase 16e.

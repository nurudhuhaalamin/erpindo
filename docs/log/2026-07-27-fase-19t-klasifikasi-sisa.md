# Fase 19t — memeriksa sisa temuan satu per satu

Sub-fase ini tidak menambah terjemahan besar. Tugasnya **memeriksa 110 temuan
sisa satu per satu** dan memutuskan mana yang disengaja dan mana utang nyata —
persis yang saya janjikan di 19s dan yang selama beberapa sub-fase saya
lewatkan dengan menulis "sebagian sudah diketahui disengaja".

## Hasil klasifikasi

| Kelas | Jumlah | Putusan |
| --- | ---: | --- |
| Potongan kode (artefak parser penyapu) | ±45 | Positif palsu. |
| Atribut `id`/`htmlFor` DOM (`bank-recon`, `tk-status`, `refund-acct`, …) | ±20 | Positif palsu — tak pernah tampil. |
| Sisi Inggris & Indonesia di dalam `L(lang, …)` pada landing | ±10 | Positif palsu — halaman itu sudah dwibahasa sejak 13d. |
| Contoh data CSV (`kode,debit,kredit`, `sku,gudang,qty,biaya`, mutasi bank) | 5 | **Disengaja** — nama kolom yang harus diketik pengguna; parser mencocokkannya. |
| Nilai parameter URL (`gagal-tukar-token`, `belum-dikonfigurasi`, …) | 4 | **Disengaja** — diset callback server. |
| Argumen `.replace()` di `dashboard.tsx` | 1 | **Disengaja** — aturan 16u. |
| Slug rute di `GUIDE_SLUG_BY_PREFIX` | 3 | **Disengaja** — bagian dari URL. |
| Surat Jalan tercetak (`salesorders.tsx`) | 6 | **Di luar lingkup** — dokumen cetak tetap Indonesia (keputusan pemilik). |
| `note:` permintaan pembelian (`stok.tsx`) | 2 | **Disengaja** — teks itu DISIMPAN ke basis data sebagai catatan permintaan. Menerjemahkannya membuat isi rekaman berbeda-beda tergantung bahasa pembuatnya. |
| Galat invarian pengembang (`WorkspaceContext belum tersedia`) | 1 | **Disengaja** — tak pernah tampil ke pemakai. |
| **Utang nyata** | **12** | Dikerjakan di sub-fase ini (di bawah). |

## Utang nyata yang dikerjakan

- **`panduan-app.tsx` (5 → 0)** — halaman panduan dalam aplikasi ternyata
  belum punya `useUi()` sama sekali. Kotak pencarian, pesan "tidak ada yang
  cocok", "panduan tidak ditemukan", dan tautan kembali kini dwibahasa.
  **Isi panduannya sengaja tetap Indonesia** — itu korpus dokumentasi untuk
  UKM Indonesia, sekeluarga dengan keputusan pemilik soal dokumen cetak.
- **`commerce.tsx` (2)** — dua pecahan pesan toast (`, refund tunai …` dan
  `(selisih kurs laba/rugi …)`) yang dirakit ke variabel **di luar** panggilan
  `toast()`, sehingga alat menggolongkannya LAYAR dan saya lewatkan berkali-kali.
- **`reports.tsx` (3)** — label kartu HP `Kode`, `Akun`, `Jumlah` pada rincian
  laporan.

## Kelas buta yang baru ketahuan — dan sekarang diukur

Saat memeriksa `reports.tsx` terlihat sesuatu yang lebih besar dari ketiga
labelnya: **`label="Kode"` tidak pernah dilaporkan penyapu sama sekali.**

Sebabnya saringan `isID` menuntut ada kata penanda Indonesia. Label satu kata
seperti "Kode", "Akun", "Aksi", atau "No." tidak punya penanda apa pun, jadi
lolos — padahal `label=` pada `<Td>` adalah **judul kartu yang dibaca pemakai
di layar HP**, dan `title=` pada `<Card>` adalah judul kartu yang selalu
terlihat. Ini persis pelajaran yang sudah tercatat sejak Fase 16 (`<Th>Kode</Th>`
lolos `BERSIH ✅`) tetapi tidak pernah ditindaklanjuti sebagai kelas.

Penyapu kini punya kategori **`ATRIBUT`** dengan penanda **posisi, bukan
kosakata**: teks di dalam `label=`, `title=`, `placeholder=`, `aria-label=`,
`confirmLabel=`, `cancelLabel=` memang teks tampilan, titik. Bentuk yang sah
(`={u("…")}`) bukan literal sehingga tidak tertangkap.

Hasil ukurannya: **123 teks tampilan tersembunyi di atribut, tersebar di 23
berkas** (terbanyak `manufacturing` 12, `pajak` 9, `reports` 9, `maintenance`
7, `dimensi` 6, `stok` 6).

**Angka itu bukan positif palsu** — seluruhnya memang teks tampilan. Tetapi
supaya tidak dilebih-lebihkan: sebagian di antaranya **istilah resmi yang sama
di kedua bahasa** (`DPP`, `PPN`, `PPh 23`, `No.`, `QC`, `Work center`), yang
tetap perlu dilewatkan `u()` demi konsistensi tetapi tidak berarti pemakai
berbahasa Inggris melihat kata Indonesia. Sampel dua berkas menunjukkan
kira-kira sepertiganya berjenis itu; pemisahan pastinya adalah pekerjaan 19u,
dan saya tidak menaksirnya di sini.

Yang jelas: teks seperti `title="Perintah produksi"`, `label="Rekanan"`,
`label="Tahap"`, dan `placeholder="Potong bahan"` **memang muncul berbahasa
Indonesia di mode Inggris**. Itu tidak dikerjakan di sub-fase ini — dan saya
menyatakannya terang-terangan alih-alih menutupnya: program i18n Fase 19
**belum tuntas**. Yang berubah adalah utangnya kini **terukur dan terjaga**,
bukan tak terlihat seperti sebelumnya.

Sub-fase **19u** mengerjakan 123 atribut itu.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **252** |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **863** |
| `node scripts/ui-sim.mjs` | 0 | **254** |

Tidak ada cek ui-sim baru: yang dikerjakan di sini adalah label kartu layar
HP dan pecahan toast, keduanya sudah dinaungi cek `F28`/`F33` (kartu HP) dan
tak ada keadaan halaman baru yang bisa dijadikan penanda stabil. Menambah cek
yang hampa hanya demi menaikkan angka justru melanggar semangat aturannya.
Penjagaan untuk kelas atribut datang dari penyapu, dan itulah yang ditambahkan.

## Catatan kejujuran

Ini ketiga kalinya dalam Fase 19 saya menemukan bahwa **angka sapuan bukan
ukuran kemajuan yang bisa dipercaya**:

1. `app.tsx` — 64 temuan, 40 di antaranya palsu, tetapi angka palsu itu
   menutupi 17 utang nyata (19s).
2. `dukungan.tsx` — hanya 5 temuan, padahal halamannya nol dwibahasa (19r).
3. `label="Kode"` — nol temuan, padahal 123 teks tampilan tersembunyi di
   atribut (19t).

Ketiganya kesalahan yang sama dari tiga arah: **memakai keluaran alat sebagai
pengganti membaca berkasnya.** Aturan yang berlaku sekarang: klaim "tinggal
sekian" harus berasal dari perintah yang dijalankan saat itu **dan** dari
pemeriksaan bahwa alatnya memang mampu melihat kelas yang diklaim.

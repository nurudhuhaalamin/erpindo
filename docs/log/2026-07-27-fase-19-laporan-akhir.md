# Fase 19 — Laporan akhir: aplikasi dwibahasa tuntas

Dua puluh satu sub-fase (19a–19u), dua puluh PR, semuanya ter-merge. Laporan
ini menutup fase dan mencatat apa yang benar-benar terjadi — termasuk yang
tidak berjalan sesuai rencana, dan terutama itu.

## Apa yang diminta

Program i18n ditunda pada Fase 16 ketika pemilik meminta perombakan desain
lebih dulu ("yg ii8n nanti aja dilanjutnya"). Fase 19 melanjutkannya, ditambah
dua sisa Fase 18 yang sengaja tidak diputuskan sendiri karena menyentuh merek
dan data demo.

| Pertanyaan ke pemilik | Jawaban | Hasilnya |
| --- | --- | --- |
| Cakupan i18n | Semua sampai tuntas | ✅ Seluruh aplikasi |
| Bahasa dokumen cetak | Tetap Indonesia | ✅ `print.tsx` dikecualikan |
| Sisa Fase 18 | Keduanya | ✅ 19a wordmark, 19b demo |

## Hasil

**Titik awal:** 781 utang teks layar, 21 halaman tanpa mekanisme dwibahasa
sama sekali.

**Sekarang:**

```
TOTAL utang teks layar: 102   ← seluruhnya sudah diklasifikasikan
TOTAL teks tampilan di atribut: 0
```

102 sisanya bukan utang yang belum dikerjakan, melainkan **keputusan yang
sudah diambil dan dicatat** (rinciannya di log 19t):

| Kelas | Alasan tetap Indonesia |
| --- | --- |
| Dokumen cetak (faktur, penawaran, slip gaji, surat jalan) | Keputusan pemilik — dibaca pelanggan & pegawai Indonesia |
| Korpus panduan (`panduan/content`) | Dokumentasi untuk UKM Indonesia, bukan teks antarmuka |
| Contoh kolom CSV (`kode,debit,kredit`) | Nama kolom yang harus DIKETIK pengguna; parser mencocokkannya |
| `note:` yang disimpan ke basis data | Isi rekaman tidak boleh berbeda tergantung bahasa pembuatnya |
| Parameter URL, slug rute, argumen `.replace()` | Bukan teks tampilan |
| Nama contoh (`PT Maju Jaya`, `Budi Santoso`) | Contoh realistis lebih menolong di pasar ini |

Sisanya positif palsu alat: potongan kode, `id` DOM, dan sisi ganda
`L(lang, …)` di landing.

## Dua sisa Fase 18

- **19a — wordmark tanpa kotak putih.** Logonya RGB tanpa kanal alfa; latar
  putihnya *terbakar di dalam berkas*, dan chip `bg-white` selama ini
  menyamarkannya. Dibuat dua varian ber-alfa (terang & gelap). Saya juga
  berterus terang bahwa "jadikan SVG" tidak bisa dipenuhi dengan setia tanpa
  berkas vektor aslinya — melacak-ulang PNG bergradien menghasilkan hasil yang
  lebih buruk untuk identitas merek.
- **19b — demo berhenti merugi.** Dasbor demo menampilkan **−Rp 42 juta**
  kepada setiap calon pelanggan yang mengeklik "Lihat Demo". Dua sebab: gaji
  bulan lalu terhitung di bulan berjalan (dobel), dan penjualan demo terlalu
  kecil dibanding 5 karyawannya. Kini **+Rp 5,9 juta** dengan angka yang saling
  masuk akal.

## Jumlah cek: naik, tidak pernah turun

| | Awal Fase 19 | Akhir |
| --- | ---: | ---: |
| Unit test | 246 | **252** |
| Smoke | 863 | **863** |
| ui-sim | 233 | **254** |

Cek ui-sim baru `F1a`–`F1u` (21). Tiga sub-fase terakhir sengaja **tidak**
menambah cek: halamannya sudah dinaungi cek yang ada, dan menambah asersi
hampa hanya demi menaikkan angka melanggar semangat aturannya — aturan itu
menuntut **cakupan** bertambah, bukan angkanya.

## Yang tidak berjalan sesuai rencana

Ini bagian terpenting laporan. Fase ini menemukan **empat cacat yang lolos
seluruh gerbang**, dan tiga di antaranya adalah kesalahan saya sendiri dalam
membaca alat.

### 1. Penjaga terjemahan ternyata hampa (19k)

Kamus dianotasi `const UI: Record<string, Dual>`. Anotasi itu melebarkan
`keyof typeof UI` menjadi `string`, sehingga **seluruh penjaga
`satisfies Record<…, UiKey>` yang ditambahkan sejak Fase 16u tidak membatasi
apa pun**. Akibatnya dua tulisan sempat tampil sebagai **kode mentah di layar**
(`ppnLebihBayar` di Pajak, `laba` di Proyek).

Yang membuatnya lebih buruk: saya sudah **mengklaim sebaliknya di empat log**.
Diperbaiki, dan ditambah tiga uji yang menjaga *penyebabnya*, bukan gejalanya.

### 2. Terjemahan yang ditulis tapi tidak pernah tersambung (19q)

`i18n/index.ts` memuat kunci auth lengkap dengan terjemahan Inggrisnya sejak
Fase 13d — dan `useT()` **tidak pernah dipanggil satu berkas pun**. Halaman
masuk/daftar, layar yang dilihat setiap calon pelanggan, tetap satu bahasa
selama tiga belas fase. Kamus mati itu dihapus, dan uji kelengkapannya —
yang selama ini menjaga kamus mati — dipindahkan ke kamus yang hidup.

Halaman masuk juga akhirnya mendapat **tombol bahasa**; sebelumnya ia
satu-satunya layar publik tanpa itu.

### 3. Angka alat dipercaya tanpa diperiksa — tiga kali, dari tiga arah

| Berkas | Yang saya klaim | Yang benar |
| --- | --- | --- |
| `app.tsx` | "64 temuan, hampir semua palsu — yang nyata cuma 2" | 40 palsu, tetapi **menutupi 17 utang nyata** |
| `dukungan.tsx` | "cuma 5 temuan, hampir beres" | **Nol dwibahasa sama sekali** — halaman yang dipakai pelanggan |
| `label="Kode"` | tidak pernah dilaporkan | **123 teks tampilan tersembunyi di atribut** |

Ketiganya kesalahan yang sama: **memakai keluaran alat sebagai pengganti
membaca berkasnya.** Alat diperbaiki tiga kali (pola tabel-lookup, kategori
`ATRIBUT`, daftar istilah `NETRAL`), dan tiap perbaikan dibuktikan bisa gagal
— misalnya dengan sengaja menghapus satu padanan Inggris lalu memastikan alat
melaporkannya dan keluar dengan status 1.

Aturan yang berlaku sekarang: klaim "tinggal sekian" harus berasal dari
perintah yang dijalankan saat itu **dan** dari pemeriksaan bahwa alatnya
memang mampu melihat kelas yang diklaim.

### 4. Cacat yang hanya ketahuan dari melihat

Beberapa cacat lolos seluruh asersi dan hanya ketahuan dari tangkapan layar:
kategori di halaman Catat yang berhenti berfungsi setelah bahasa diganti
(19d — labelnya sekaligus kunci pencarian), dan status langganan yang tampil
sebagai kode mentah `past_due` di kedua bahasa (19r).

## Pelajaran yang paling mahal

**Nama kunci yang cocok belum tentu makna yang cocok** — tujuh kali dalam
fase ini. Yang paling berbahaya: kamus punya `masuk` yang artinya **stok
MASUK** (`en: "In"`), bukan sign-in; dan `tahapBaru`/`tahapPenawaran` yang
merupakan **tahap pipeline CRM**, bukan langkah routing produksi. Dipakai
ulang tanpa diperiksa, tombol "Masuk" akan berbunyi "In" dan tabel routing
akan berbunyi "New"/"Proposal".

## Sisa yang tidak dikerjakan

Tidak ada utang i18n yang tersembunyi. Yang tetap Indonesia sudah didaftar di
tabel keputusan di atas, dan semuanya bisa diubah kapan saja bila pemilik
berubah pikiran — pekerjaannya kini kecil karena mekanismenya sudah terpasang
di semua berkas.

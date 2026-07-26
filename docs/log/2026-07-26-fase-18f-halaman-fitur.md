# Fase 18f — Halaman `/fitur`: penjelasan mendalam per modul

Sub-fase keenam arah "bersih & lapang", dan bagian yang menjawab permintaan
pemilik: **"detail penjelasan di landing page perlu diperdalam"**.

## Kenapa halaman tersendiri, bukan ditambahkan ke halaman depan

Kedalaman yang dibutuhkan calon pembeli yang sedang **membandingkan produk**
akan membuat halaman depan kepanjangan bagi pengunjung yang **baru mampir**.
Keduanya pembaca yang berbeda dengan kebutuhan berbeda.

Halaman terpisah juga memberi satu alamat sendiri untuk mesin pencari — orang
mencari "software akuntansi PPh 21 TER", bukan "ERPindo".

## Isi: masalah → cara kerja → hasil

Sembilan modul, masing-masing ditulis mengikuti urutan yang benar-benar
dipikirkan calon pemakai:

1. **Masalah** yang ia rasakan hari ini (dikutip miring, bukan klaim produk).
2. **Bagaimana ERPindo mengerjakannya** — langkah konkret, bukan kata sifat.
3. **Hasil** yang didapat, sedapat mungkin bisa diperiksa sendiri.

Contoh, modul Stok — bukan "stok akurat & real-time", melainkan:

> *Stok di catatan tidak sama dengan stok di rak. HPP ditebak, jadi laba yang
> dilaporkan sebenarnya tidak diketahui.*
>
> → HPP rata-rata bergerak dihitung ulang otomatis di setiap transaksi; lot
> FEFO; ambang stok minimum; opname tercatat sebagai jurnal penyesuaian.
>
> → **Nilai persediaan di neraca berasal dari perhitungan, bukan perkiraan.**

Modul yang dibahas: Akuntansi & Jurnal, Faktur & Pembayaran, Kasir (POS), Stok
& Gudang, Gaji & PPh 21, Pajak & e-Faktur, Laporan Keuangan, Multi-perusahaan &
Konsolidasi, serta Keamanan & Kepemilikan Data.

Kontennya di `apps/web/src/pages/landing/fiturDetail.ts` — **dipisah dari
`sections.ts` tapi tetap di folder yang sama**, karena landing dan `/fitur`
harus dirawat bersama supaya tidak saling bertentangan.

Gambar memakai tangkapan layar produk **nyata** yang sudah ada
(`public/landing/`, `public/panduan/`), yang sudah diregenerasi tema terang di
18a — jadi tidak ada aset baru dan tidak ada gambar yang salah tema.

## Tiga hal yang harus benar sekaligus supaya SEO-nya berguna

Rute SPA saja **tidak cukup**. Halaman ini butuh:

1. **`run_worker_first`** di `wrangler.jsonc` — tanpa ini Worker tidak pernah
   dipanggil untuk `/fitur`, dan yang tersaji ke crawler hanya SPA kosong.
2. **Handler SEO** di `apps/api/src/routes/landingSeo.ts` yang menyisipkan
   `canonical` + JSON-LD + `<noscript>`. Fungsi penyaji di-ekstrak jadi
   `sajikan()` supaya `/` dan `/fitur` memakai jalur yang sama, dengan
   `canonical` yang **menunjuk ke dirinya sendiri** — bukan ke `/`.
3. **`sitemap.xml`** (`apps/api/src/routes/blog.ts`).

Blok `<noscript>` untuk `/fitur` sengaja **diringkas**, bukan menyalin seluruh
isi halaman: menyalin ratusan baris ke shell HTML akan memperbesar setiap muat
halaman bagi pengunjung yang JavaScript-nya normal, demi pembaca yang tidak ada.

## Tautan dari landing

Ditambahkan di tiga tempat: menu utama ("Fitur" kini menuju `/fitur`, bukan
anchor `#fitur`), kartu ajakan di kisi modul, dan footer. Seksi `#fitur` di
halaman depan **tetap ada** sebagai ringkasan — yang berubah hanya ke mana
tautan navigasinya mengarah.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) — **lihat koreksi di bawah** |
| `pnpm build` | ok |
| `pnpm smoke` | **863** cek lolos (naik dari 861) |
| `node scripts/ui-sim.mjs` | **231** cek lolos (naik dari 229) |

### Koreksi: unit test sempat MERAH dan saya melewatkannya

Dorongan pertama fase ini **gagal di CI** pada `apps/api`:

```
penjaga RBAC per-registrasi rute > semua endpoint non-publik memakai requireAuth
expected [ 'landingSeo.ts GET "/fitur"' ] to deeply equal []
```

Dua hal salah, dan keduanya perlu dicatat:

**1. Rutenya memang belum didaftarkan.** `apps/api/test/rbac-guard.test.ts`
menelusuri seluruh registrasi rute dan menuntut setiap endpoint tanpa
`requireAuth` **dinyatakan publik secara eksplisit** di `PUBLIC_ALLOWLIST`.
`/fitur` memang publik — halaman pemasaran, tidak memuat data tenant sama
sekali — tetapi harus ditulis, bukan diasumsikan. Penjaga ini bekerja persis
seperti seharusnya: rute publik baru tidak boleh lolos diam-diam.

**2. Saya sempat mengira gerbangnya hijau.** Verifikasi lokal dijalankan
dengan `pnpm test | grep -E "Tests +[0-9]+ passed"` — dan pola itu **hanya
cocok pada format lolos-semua**. Saat `apps/api` gagal, ringkasannya berbunyi
`1 failed | 131 passed`, tidak cocok pola, jadi barisnya **hilang dari keluaran
alih-alih muncul sebagai kegagalan**. Ketiadaan terbaca seperti keberhasilan.

Pelajaran yang sama bentuknya dengan yang berulang di Fase 17: **penyaring
keluaran bisa menyembunyikan kegagalan.** Yang menentukan adalah **status
keluar** perintahnya, bukan baris yang berhasil ditangkap `grep`.

Cek baru:

- **`F29`** — `/fitur` diuji **dari sisi pengunjung**: dicapai dengan
  **mengklik tautan di landing**, bukan dengan mengetik URL. Rute yang ada
  tetapi tak tertaut dari mana pun sama saja tidak ada bagi pengunjung.
  Lalu memastikan lima modul kunci benar-benar termuat, plus bebas galat.
- **Smoke `/fitur`** — memeriksa **tiga hal sekaligus** karena ketiganya harus
  benar bersamaan: status 200 (bukti `run_worker_first` bekerja),
  `canonical` menunjuk ke `/fitur` **bukan** ke `/`, dan `<noscript>` berisi
  konten modul yang benar (bukan salinan landing).
- **Smoke sitemap** — `/fitur` terdaftar.

Pemeriksaan canonical sengaja memakai regex `\/fitur"` alih-alih sekadar
`includes('rel="canonical"')`: kalau `sajikan()` kelak salah dan menyisipkan
canonical halaman depan ke `/fitur`, cek longgar akan tetap hijau sambil
memberi tahu mesin pencari bahwa halaman ini duplikat.

## Diperiksa dengan mata

Tangkapan layar `/fitur` dilihat: hero besar, chip modul sebagai daftar isi
yang bisa diklik, tiap seksi berselang-seling latar, kutipan masalah dengan
garis kiri, dan tangkapan layar produk nyata yang menempel (`lg:sticky`) saat
daftar "cara kerja" digulir.

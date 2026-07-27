# Fase 18 — Laporan akhir: perombakan desain "bersih & lapang", terang-dulu

Dua puluh sub-fase (18a–18t), dua puluh PR, semuanya ter-merge. Laporan ini
menutup fase dan mencatat apa yang benar-benar terjadi — termasuk yang tidak
berjalan sesuai rencana.

## Apa yang diminta, dan apa yang diberikan

Fase 17 baru saja merombak tampilan ke arah **"alat pro padat" yang
gelap-dulu**. Setelah melihat hasilnya, pemilik mengubah arah di tengah jalan:

> *"saya mau rubah rencana saya ingin desain modern ke kinian, tata letak nya
> juga, tampilan disemua perangkatnya juga, copywriting nya perlu diperbaharui,
> lalu detail detail penjelasan dilanding page juga perlu di perdalam seperti
> fitur dll. tema default nya pengennya putih."*

| Yang diminta | Hasilnya |
| --- | --- |
| Desain modern & kekinian | Token warna, sudut, dan bayangan disetel ulang ke bahasa "bersih & lapang" (18a–18b) |
| Tata letak ikut dirombak | Kerangka aplikasi, landing, dan halaman masuk ditulis ulang (18c, 18e, 18g) |
| **Tampilan di semua perangkat** | Inilah yang paling berubah — lihat bagian berikutnya |
| Copywriting diperbarui | Landing ditulis ulang menyeluruh, dwibahasa (18e) |
| Penjelasan fitur diperdalam | Halaman `/fitur` tersendiri, sembilan modul, lengkap dengan SEO (18f) |
| Tema bawaan putih | `theme-init.js` dibalik; mode gelap tetap ada sebagai pilihan (18a) |

## Yang paling penting: "responsif" dulu tidak dijaga apa pun

Sebelum fase ini, klaim "responsif" tidak punya bukti. Seluruh **222 cek
ui-sim berjalan pada satu ukuran layar** (1360×900) — tidak ada satu pun asersi
yang pernah menyentuh layar kecil. Dan di 36 berkas halaman hanya ada **10**
kelas `md:`.

Lebih buruk lagi, **40 tabel memakai gulir mendatar**. Di HP, tabel tujuh kolom
berarti menggeser-geser layar untuk membaca satu baris.

Sekarang:

- ui-sim punya lintasan **390×844** dengan cek yang benar-benar bisa gagal.
- **Seluruh 24 tabel layar** menumpuk jadi kartu berlabel di HP. Tidak ada lagi
  `<table>` tulisan tangan di layar aplikasi.
- Delapan tabel sisanya **dikecualikan permanen** karena dokumen cetak (5
  `print.tsx`, 2 struk POS, 1 surat jalan) — dokumen cetak wajib putih terlepas
  dari tema layar.

## Jumlah cek: naik, tidak pernah turun

| | Awal Fase 18 | Akhir Fase 18 |
| --- | ---: | ---: |
| Unit test | 244 | **246** |
| Smoke (end-to-end) | 861 | **863** |
| ui-sim (browser nyata) | 222 | **233** |
| **Total** | **1.327** | **1.342** |

Cek baru yang lahir di fase ini: `F26`/`F27` (layar kecil, drawer), `F28`
(tabel jadi kartu), `F29` (`/fitur` dicapai dari tautan, bukan URL), `F30`/`F31`
(tanpa `text-transform`, tinggi tombol nyata), `F32` (baris ber-`colSpan`),
`F33` (lebar kartu), plus penjaga sumber label kolom dinamis.

## Empat cacat yang lolos semua asersi

Ini bagian yang paling perlu dicatat jujur. Empat kali dalam fase ini, seluruh
gerbang hijau sementara tampilannya salah — dan **semuanya ketahuan dari
melihat tangkapan layar**, bukan dari asersi:

| Cacat | Sub-fase | Kenapa asersi diam |
| --- | --- | --- |
| Tabel Stok terpotong di HP | 18c | `F26` mengukur gulir **dokumen**; tabelnya menggulir di dalam wadahnya sendiri |
| **Kartu baris hanya selebar isinya** | 18q | `F28` mengukur **bentuk** (blok, label, kepala tersembunyi), bukan **lebar** |
| Sel "Alfa" kosong terbaca "data hilang" | 18r | Tidak ada asersi yang mengukur keterbacaan |
| Tombol Menu 32px, bukan 44px | 18c | `size-11` diberikan, tapi item flex menciut tanpa `shrink-0` |

Yang kedua paling mahal: cacatnya **ada sejak 18d dan bertahan dua belas
sub-fase**, karena tabel yang dimigrasikan lebih dulu isinya kebetulan cukup
lebar sehingga kartunya penuh. Baru terlihat pada tabel Mata Uang yang hanya
tiga kolom pendek. Satu baris di `ui.tsx` memperbaikinya untuk 24 tabel
sekaligus.

**Pelajarannya, dalam satu kalimat:** asersi hanya membuktikan apa yang
benar-benar diukurnya — dan pemeriksaan mata bukan formalitas.

## Dua kali salah hitung, dan koreksinya

Jumlah tabel yang tersisa **meleset dua kali**, keduanya karena menghitung
`<table>` dari hasil grep tanpa membaca konteksnya: dua "tabel" di `pos.tsx`
ternyata struk termal (18n), satu di `salesorders.tsx` ternyata surat jalan
(18p). Keduanya string HTML dokumen cetak.

Sejak itu daftar pengecualian ditulis lengkap dalam bentuk tabel di setiap log,
bukan sebagai catatan kaki.

## Satu kegagalan CI yang sempat terlewat

Dorongan pertama 18f **merah di CI** (rute `/fitur` belum didaftarkan sebagai
publik di penjaga RBAC), dan sempat dilaporkan hijau. Sebabnya verifikasi lokal
memakai `pnpm test | grep -E "Tests +[0-9]+ passed"` — pola itu hanya cocok
pada format lolos-semua, jadi saat `apps/api` gagal ringkasannya (`1 failed |
131 passed`) **hilang dari keluaran alih-alih muncul sebagai kegagalan**.
Ketiadaan terbaca seperti keberhasilan.

Sejak itu **setiap gerbang diverifikasi lewat status keluar**, bukan lewat
baris yang berhasil ditangkap `grep`. Semua log setelahnya mencatat
`typecheck=0 lint=0 test=0 build=0 smoke=0 ui-sim=0`.

## Berapa banyak pekerjaan Fase 17 yang terbuang?

Pertanyaan yang wajar, dan jawabannya: **sebagian besar tidak terbuang.** Yang
berubah adalah nilai token dan kerapatan — justru bagian termurah, karena 17a
sengaja memusatkan semuanya di satu berkas. Komponen `Table`, perbaikan `cx()`
+ `tailwind-merge`, palet perintah ⌘K, anti-FOUC, dan perbaikan
`screenshots.mjs` semuanya bertahan. Yang benar-benar ditulis ulang: penyetelan
kerapatan di `ui.tsx`, markup landing, dan panel `auth.tsx` — tiga berkas.

## Dua hal yang menunggu keputusan pemilik

Sengaja tidak diputuskan sendiri:

1. **Wordmark SVG.** `BrandWordmark` masih PNG berlatar chip putih. Di tema
   terang chip itu hampir selalu melebur, tetapi di atas panel `brand-50`
   halaman masuk ia masih samar terlihat. Menggantinya menyentuh identitas
   merek, jadi bukan keputusan teknis.
2. **Kartu "Laba Bulan Ini" di hero landing menampilkan rugi.** Angkanya
   berasal dari data semaian demo yang juga menopang 863 cek smoke, sehingga
   mengubah semaiannya berisiko memecahkan banyak cek sekaligus. Perlu
   diputuskan apakah angkanya diubah, atau kartunya diganti metrik lain.

# Fase 18h — Regenerasi gambar produk (versi final)

Sub-fase kedelapan, dan yang menutup fondasi Fase 18.

## Kenapa diregenerasi dua kali

Rencana semula menaruh regenerasi tangkapan layar **hanya** di 18h. Itu diubah
saat mengerjakan 18a: begitu landing jadi putih sementara gambar produk di
dalamnya masih gelap dari 17e, kontrasnya langsung terlihat salah — bukan
sekadar kurang rapi. Jadi 33 gambar sudah diregenerasi terang di 18a.

Tetapi 18a berjalan **sebelum** primitif dilonggarkan. Gambar hasil 18a
memotret aplikasi yang **sudah terang tetapi masih rapat** — tombol `h-8`,
bantalan kartu sempit, sudut tegas, kepala tabel huruf besar.

Fase ini meregenerasinya sekali lagi, sekarang setelah:

| Sub-fase | Yang memengaruhi tampilan gambar |
| --- | --- |
| 18b | Tombol & isian `h-9`, sudut `rounded-lg`, bantalan kartu naik, judul kartu `text-base`, bayangan halus kembali, kepala tabel tanpa `uppercase` |
| 18c | Topbar lebih tinggi di layar kecil, sasaran sentuh 44px |
| 18d | Baris tabel `px-3 py-2.5` |

Menjalankan skripnya hanya butuh beberapa menit. Meregenerasi dua kali jauh
lebih murah daripada memajang gambar salah warna ke calon pelanggan selama
beberapa sub-fase — dan itulah pertukaran yang dipilih.

## Yang dikerjakan

**33 gambar diregenerasi**: 6 landing (579 KB) + 27 panduan (3.053 KB).

Tidak ada perubahan kode sama sekali di fase ini. Manifes `landing` & `panduan`
sudah bertema `light` sejak 18a, dan tiga perbaikan `screenshots.mjs` dari 17e
(`COMPED_EMAILS`, `locale: "id-ID"`, penanda tur "sudah dilihat") tetap dipakai
— tanpa ketiganya skrip ini tidak bisa jalan sama sekali, ter-render bahasa
Inggris, dan tertutup tur onboarding.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar** — pelajaran dari koreksi
di 18f, di mana penyaringan keluaran sempat menyembunyikan kegagalan.

| Gerbang | Status keluar |
| --- | --- |
| `pnpm typecheck` | 0 |
| `pnpm lint` | 0 |
| `pnpm test` | 0 — 244 unit test |
| `pnpm build` | 0 |
| `pnpm smoke` | 0 — 863 cek |
| `node scripts/ui-sim.mjs` | 0 — 231 cek |

Cek `F22` (gambar hero landing benar-benar termuat, `naturalWidth > 800`)
tetap menjaga kegagalan paling kasarnya. Ia **tidak** bisa tahu gambarnya basi
— itu tetap tidak terjangkau asersi, dan tetap harus diperiksa mata.

## Diperiksa dengan mata

`hero-dashboard.webp` dirender ulang dan dilihat: kartu KPI kini punya ruang
napas dan bayangan halus, kepala tabel tidak lagi huruf besar semua, dan
seluruhnya berbahasa Indonesia bertema terang. Sesuai tampilan aplikasi hari
ini.

## Keadaan fondasi Fase 18 setelah sub-fase ini

| Sub-fase | Isi | Keadaan |
| --- | --- | --- |
| 18a | Token & tema terang-dulu | selesai |
| 18b | Primitif lapang | selesai |
| 18c | Kerangka responsif + uji layar kecil | selesai |
| 18d | Tabel jadi kartu di HP | selesai |
| 18e | Landing lapang + copywriting | selesai |
| 18f | Halaman `/fitur` | selesai |
| 18g | Halaman masuk ikut terang | selesai |
| 18h | Regenerasi gambar final | **selesai** |

Yang tersisa adalah pekerjaan panjang bertahap: **18i+**, menyebarkan pola
tabel-kartu (18d) dan tata letak lapang ke sekitar 38 tabel di modul lain,
satu modul per PR. `print.tsx` (5 tabel) tetap dikecualikan permanen — dokumen
cetak wajib putih apa pun tema layarnya.

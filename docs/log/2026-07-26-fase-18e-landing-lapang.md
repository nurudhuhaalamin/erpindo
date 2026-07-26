# Fase 18e — Landing: tata letak lapang + copywriting diperbarui

Sub-fase kelima arah "bersih & lapang". Sasaran:
`apps/web/src/pages/landing/index.tsx` + `landing/sections.ts`.

## Klaim yang salah, dan cara memperbaikinya

`TRUST_POINTS` memajang **"800+ uji otomatis"**. Angka itu sudah lama
tertinggal. Hitungan nyata hari ini:

| Lapisan | Jumlah |
| --- | ---: |
| Smoke (end-to-end) | 861 |
| Unit test | 244 |
| Simulasi UI (Chromium nyata) | 229 |
| **Total** | **1.334** |

Diperbarui menjadi **"1.300+"** — sengaja dibulatkan **ke bawah** supaya
klaimnya tetap benar meski suite bertambah atau berkurang sedikit. Ini koreksi
kedua dari jenis yang sama; yang di `auth.tsx` sudah dikerjakan pada 17f.

Membiarkan klaim yang **meremehkan** produk sendiri sama tidak jujurnya dengan
melebih-lebihkan — dan angka yang salah di halaman jualan adalah utang yang
menumpuk diam-diam.

## Copywriting: dari daftar fitur menjadi masalah yang dirasakan

Teks lama benar tapi terbaca seperti daftar kemampuan. Yang diubah menonjolkan
**apa yang hilang tiap bulan**, bukan apa yang dimiliki aplikasi.

| Tempat | Sebelum | Sesudah |
| --- | --- | --- |
| Sub-judul hero | "Catat transaksi sekali — jurnal double-entry, stok, laporan keuangan, PPN, sampai PPh 21 karyawan beres sendiri." | "**Berhenti menyalin angka dari nota ke Excel.** Sekali catat, … ikut terisi sendiri — dan **neracanya dijamin seimbang**." |
| Sub-teks CTA | "siap dipakai dalam 1 menit" | "**bagan akun standar Indonesia sudah terpasang**" (klaim yang bisa diperiksa, bukan janji kecepatan) |
| Showcase | "Lima alur yang paling sering dipakai UMKM" | "Lima **pekerjaan yang paling menyita waktu tiap hari**. Pilih satu untuk melihat bentuk nyatanya di dalam aplikasi." |
| Fitur | "Semua modul saling terhubung" | "**Tidak ada modul yang berdiri sendiri.** Apa pun yang Anda catat di satu tempat langsung terbaca di tempat lain — tanpa impor-ekspor antar aplikasi." |
| Perbandingan | "Waktu Anda lebih berharga daripada menyalin angka." | "Bukan soal rapi atau tidak rapi — soal **berapa jam yang hilang tiap bulan**, dan **berapa selisih yang baru ketahuan saat tutup buku**." |
| Keamanan | "…bukan sekadar aman, tapi juga bebas." | "**Aman itu perlu, tapi tidak cukup.** Anda juga harus bisa pergi kapan saja dan membawa seluruh data Anda." |

Seluruhnya dwibahasa. **Kontrak string ui-sim dipertahankan** — kalimat yang
dibaca asersi (`beres dalam satu aplikasi`, `all in one app`, `Most popular`,
`Hemat sekitar`, dst.) tidak disentuh.

## Tata letak

Dari gaya padat 17d ke gaya lapang:

- Bantalan seksi `py-14` → **`py-20`**; judul seksi `text-2xl/3xl` →
  **`text-3xl/4xl`**; teks isi `text-[13px]/[15px]` → **`text-sm/base`**
  dengan `leading-relaxed`.
- Hero: bantalan atas `pt-12/16` → **`pt-16/24`**, judul `text-3xl/5xl` →
  **`text-4xl/6xl`**, chip jadi `rounded-full`.
- **Kisi berbagi-garis diganti kartu terpisah berbayang.** Pada gaya padat,
  `gap-px` di atas latar garis membuat modul terbaca sebagai satu sistem; pada
  gaya lapang, kartu berjarak dengan bayangan halus yang justru terasa modern.
- Tab showcase: dari bilah alat berdempetan → **pil `rounded-full` berjarak**.
- Kartu paket, keamanan, FAQ, dan badge integrasi ikut dilonggarkan.
- Kisi tipis di hero diturunkan opasitasnya (`0.06` → `0.035`) — pada latar
  putih, kisi yang sama terbaca jauh lebih keras.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **229** cek lolos (tetap) |
| `sapu-i18n` pada landing | 6 (tetap — seluruhnya positif palsu yang sudah dijelaskan di 17d) |

Tidak ada cek baru di fase ini, dan itu disengaja: seluruh kontrak landing
**sudah** dijaga 12 asersi `F15` + `F21`, dan kedua belasnya harus tetap hijau
setelah copywriting berubah. Itulah ujian yang sebenarnya untuk fase ini —
mengubah teks tanpa memecah satu pun kontrak.

## Diperiksa dengan mata

Tangkapan layar penuh dilihat: halaman kini bernapas, seksi berselang-seling
latar, kartu punya bayangan halus, dan `1.300+` tampil di bilah kepercayaan.

## Yang sengaja belum dikerjakan

**Tautan menuju `/fitur` belum dipasang.** Rencana menyebutnya di 18e, tetapi
halaman itu baru dibuat di **18f** — memasang tautan ke rute yang belum ada
berarti mengirim pengunjung ke halaman kosong. Tautannya ditambahkan bersama
halamannya.

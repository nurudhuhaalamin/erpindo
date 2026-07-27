# Fase 19s — i18n kerangka aplikasi & komponen, plus alat sapu diajari

## Yang dikerjakan

Tiga hal yang saling terkait: memperbaiki **alatnya** dulu, karena angka palsu
yang dilaporkannya selama ini justru menyembunyikan utang nyata di berkas yang
sama.

### 1. `sapu-i18n.mjs` diajari pola tabel-lookup

`app.tsx` menerjemahkan menu bukan lewat `u("kunci")` melainkan lewat dua
tabel: `NAV_ITEMS` (label Indonesia + rute) dipasangkan dengan `NAV_LABEL_EN`
(rute → label Inggris), dan nama seksi dengan `SECTION_EN`. Alat tidak
mengenalinya, jadi melaporkan **64 temuan** di berkas yang sudah dwibahasa
sejak Fase 13e.

Angka palsu itu bukan sekadar berisik — ia **menutupi 17 utang nyata di berkas
yang sama**. Selama empat sub-fase saya sendiri menulis di tabel sisa bahwa
`app.tsx` "sebagian besar positif palsu, yang nyata cuma spanduk verifikasi
dan tombol Keluar". Itu **salah**: yang nyata ada 17, dan baru terlihat
setelah 40 positif palsu disingkirkan.

**Ini bukan pembungkaman.** Pasangannya diperiksa betulan: label yang rutenya
tidak ada di tabel EN tetap dilaporkan, lengkap dengan nama menunya, dan
membuat alat keluar dengan status 1. Dibuktikan dengan sengaja menghapus satu
padanan:

```
⚠️  apps/web/src/pages/app.tsx:118  Mata Uang — tanpa padanan Inggris (rute /app/keuangan/kurs)
TOTAL item menu tanpa padanan Inggris (BUG, bukan sekadar utang): 1
exit 1
```

Setelah dipulihkan: exit 0. Jadi menu baru yang lupa diberi label Inggris akan
langsung ketahuan — sesuatu yang **sebelumnya tidak dijaga sama sekali**.

### 2. `app.tsx` — kerangka aplikasi

**64 → 8** temuan. Kedelapan sisanya bukan teks layar: potongan kode artefak
penyapu, slug URL di `GUIDE_SLUG_BY_PREFIX` (yang memang tidak boleh
diterjemahkan), dan satu galat invarian pengembang yang tak pernah tampil ke
pemakai.

Yang diterjemahkan adalah bagian yang muncul di **setiap halaman**: tombol
keluar, spanduk verifikasi email, spanduk mode demo, spanduk trial berakhir
dan sisa hari trial, lonceng notifikasi, pemilih perusahaan, pencarian menu,
tombol panduan & tur, dan label aksesibilitas tombol tema/drawer. Satu kalimat
yang tertinggal di sini terlihat di seluruh aplikasi sekaligus — itulah
sebabnya bagian ini paling merugikan ketika luput.

### 3. `src/components/` — `asisten.tsx` & `ui.tsx`

- `asisten.tsx` (**17 → 3**): seluruh panel Asisten AI — tiga mode, ajakan dan
  contoh pertanyaannya, pesan galat, sisa kuota. Panel ini hanya terlihat
  setelah tombol mengambangnya ditekan, jadi tak pernah tersentuh asersi
  `innerText` halaman mana pun.
- `ui.tsx` (**5 → 1**): `SearchSelect` dan `ConfirmDialog`. Keduanya menyimpan
  teks Indonesia sebagai **nilai bawaan parameter**, yang tidak bisa memanggil
  hook; diselesaikan di dalam badan komponen dengan `?? u("…")` sehingga
  pemanggil yang sudah mengoper labelnya sendiri tidak berubah perilakunya.
- `palet.tsx` sudah bersih sejak awal.

Sisa temuan di ketiganya seluruhnya potongan kode.

## Perbaikan CI di luar lingkup i18n

Dua cek ui-sim gagal di CI pada PR 19r — **keduanya di dasbor tenant baru**,
yang tidak disentuh PR itu sama sekali:

```
✗ dashboard tenant baru menampilkan Rp 0 (bukan skeleton abu-abu)
✗ dashboard tenant baru tanpa skeleton tersisa di kartu KPI
```

Sebabnya `waitForTimeout(1200)` lalu langsung diasersi: ambang tetap yang
cukup di mesin pengembang tetapi tidak di runner CI yang lebih lambat — kartu
KPI masih shimmer saat diperiksa. Sekarang **kondisinya** yang ditunggu (maks
15 detik), bukan waktunya. Kekuatan asersi tidak diturunkan: tetap menuntut ≥3
nilai "Rp 0" dan nol shimmer, dan bila memang macet keduanya tetap merah
dengan diagnostik yang sama.

## Validasi

Semua gerbang dinilai dari **status keluar**.

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **252** |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **863** |
| `node scripts/ui-sim.mjs` | 0 | **254** (dari 252) |

Dua cek baru:

- **`F1t`** — kerangka aplikasi dalam mode EN memuat "Sign out" dan "Your
  email is not verified yet", tanpa padanan Indonesianya. Penandanya dipilih
  dari yang pasti dirender untuk akun simulasi (akun itu memang belum
  terverifikasi — terlihat di tiap tangkapan layar Fase 19).
- **`F1u`** — panel Asisten AI dibuka lewat tombolnya lalu diperiksa isinya.
  Tanpa membukanya, panel ini tak terjangkau asersi mana pun.

### Pemeriksaan mata

Dasbor dengan panel Asisten terbuka dilihat langsung dalam mode EN. Seluruh
kerangka kini Inggris — termasuk tombol keluar dan spanduk verifikasi email
yang **terlihat masih Indonesia di tangkapan layar 19p dan 19q**. Blok
tangkapan sementara sudah dihapus lagi dari `ui-sim.mjs`.

## Sisa program i18n

Total utang teks layar halaman: **152** (titik awal Fase 19: 781).

Setelah `print.tsx` (36, di luar lingkup atas keputusan pemilik) dikeluarkan,
sisanya **116 temuan tersebar di ±25 berkas, terbanyak 15** — seluruhnya di
halaman yang sudah dikerjakan pada sub-fase sebelumnya.

Sub-fase penutup **19t** memeriksa sisa itu **satu per satu** dan
mengklasifikasikannya: disengaja (contoh kolom CSV, parameter URL, kode API,
istilah pajak resmi) atau utang nyata yang harus dikerjakan. Tidak
diasumsikan aman.

Pelajaran `dukungan.tsx` di 19r membuat langkah itu wajib, dan pelajaran
`app.tsx` hari ini menegaskannya dari arah sebaliknya: **angka sapuan yang
kecil tidak berarti hampir beres, dan angka yang besar tidak berarti banyak
utang.** Keduanya hanya berarti "alat ini melihat sekian hal"; yang menentukan
tetap membaca berkasnya.

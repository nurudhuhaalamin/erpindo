# Fase 20e — Revaluasi aset tetap

Model revaluasi PSAK 16: nilai buku aset disetel ke **nilai wajar** hasil
penilaian, dengan selisihnya masuk ke pos yang benar.

## Perlakuan akuntansinya — bagian yang paling mudah salah

| Arah | Masuk ke | Alasan |
| --- | --- | --- |
| **Naik** (wajar > buku) | **Surplus Revaluasi — EKUITAS** (`3-3000`) | Kenaikan nilai wajar **belum terealisasi**; mengakuinya sebagai pendapatan akan menggelembungkan laba atas untung yang belum ada |
| **Turun** (wajar < buku) | **Beban** (`5-4000`) | Kehati-hatian menuntut rugi diakui begitu diketahui |

Asimetri itu sengaja. Jurnal yang **seimbang tetapi salah arah** tidak akan
memicu galat apa pun — `postJournal` hanya menolak yang tidak seimbang — jadi
inilah yang paling perlu dijaga uji, bukan keseimbangannya.

## Metode eliminasi

Akumulasi penyusutan **dinolkan**, harga perolehan disetel ke nilai wajar.
Penyusutan setelahnya berjalan lurus dari nilai baru.

Alternatifnya (metode proporsional) menuntut menyimpan dua basis angka untuk
tiap aset — mahal dipahami pemakai, tanpa manfaat nyata di skala UKM.

Aljabarnya (C perolehan, A akumulasi, B = C−A nilai buku, F wajar, D = F−B):

```
Dr Akum. Penyusutan   A          menolkan akumulasi
Dr/Cr Aset Tetap      F − C      menyetel perolehan ke nilai wajar
Cr Surplus Revaluasi  D          bila D > 0
Dr Rugi Revaluasi    −D          bila D < 0
```

Seimbang karena `D = F − C + A`, sehingga `A + (F−C) − D ≡ 0`. Itu **sifat
rumusnya**, bukan kebetulan yang harus dicek kasus per kasus.

## Yang dibangun

- Migrasi `0039_asset_revaluation`: akun sistem `3-3000 Surplus Revaluasi`
  (ekuitas) + tabel `asset_revaluations` (riwayat nilai sebelum & sesudah).
- `buildRevaluationJournal()` — fungsi murni, terpisah agar bisa diuji.
- `POST /assets/:id/revaluation` dan `GET /assets/:id/revaluations`.
- Panel revaluasi di halaman Aset, dwibahasa sejak awal.

Endpoint menolak aset yang sudah dilepas dan **menghormati periode terkunci**,
sama seperti pelepasan — revaluasi menulis jurnal bertanggal, jadi tunduk pada
aturan tutup buku yang sama.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **273** (dari 268) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **872** (dari 867) |
| `node scripts/ui-sim.mjs` | 0 | **256** (dari 255) |
| `sapu-i18n` | — | `assets.tsx` **BERSIH**, atribut 0 |

Lima uji unit menjaga arah dan keseimbangan, termasuk **kasus yang paling
mudah salah**: nilai wajar **di bawah harga perolehan tetapi di atas nilai
buku** (F 70jt < C 100jt, tetapi F > B 60jt). Di situ baris asetnya
dikreditkan sementara selisihnya tetap **surplus**. Kalau arah ditentukan dari
perbandingan `F vs C` alih-alih `F vs B`, hasilnya terbalik — dan jurnalnya
tetap seimbang, jadi tidak ada yang menyalak.

Lima cek smoke: surplus 13jt dari buku 47jt ke wajar 60jt, **neraca saldo tetap
seimbang** sesudahnya, metode eliminasi benar-benar menolkan akumulasi,
riwayat tersimpan, dan nilai wajar negatif ditolak 400.

Cek ui-sim baru **`F1w`**: panel revaluasi hanya terlihat setelah tombolnya
ditekan — tak pernah tersentuh sapuan `innerText` halaman mana pun, kelas yang
sama dengan panel Asisten AI (`F1u`).

**Pemeriksaan mata:** panel dilihat langsung dalam mode EN. Seluruhnya Inggris,
termasuk keterangan metodenya. Blok tangkapan sementara sudah dihapus lagi.

## Asersi smoke yang ikut berubah

`COA template Indonesia tersemai (22 akun)` → **23 akun**, di dua tempat.

Migrasi 0039 menambah akun sistem `3-3000`. Angkanya **naik karena COA-nya
memang bertambah satu**, bukan karena asersi dilonggarkan — pola yang sama
dengan migrasi 0011 yang dulu menambahkan `5-5000 Beban Penyusutan`. Alasannya
ditulis di `smoke.mjs`.

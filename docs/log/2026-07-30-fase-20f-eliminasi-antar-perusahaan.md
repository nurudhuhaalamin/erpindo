# Fase 20f — Eliminasi transaksi antar-perusahaan

Laporan gabungan tidak boleh menghitung jual-beli **internal grup** sebagai
omzet grup. Fase ini menambahkan lapis eliminasinya.

## Penandanya di AKUN, bukan di transaksi

Keputusan rancangan yang paling menentukan.

Pemilik grup UKM **sudah** memisahkan piutang/utang afiliasi ke akun
tersendiri — "Piutang Antar-Perusahaan", "Penjualan ke Afiliasi". Menandai
per-transaksi menuntut mereka mengingatnya **setiap kali menjurnal**, dan
sekali lupa laporan gabungannya dobel tanpa ada yang tahu.

Menandai akunnya **sekali** membuat eliminasinya otomatis dan tak bisa lupa.

## Angkanya tetap terlihat

Baris antar-perusahaan **tetap ditampilkan**, hanya ditandai dan diredupkan;
yang berubah adalah ia tidak ikut ke total.

Ini disengaja. Eliminasi yang menghilangkan angka diam-diam membuat laporan
**mustahil ditelusuri** ketika totalnya tidak cocok dengan pembukuan
masing-masing perusahaan — dan saat itulah orang paling butuh melihatnya.
Total yang dikeluarkan juga dilaporkan tersendiri (`eliminatedIncome`,
`eliminatedExpense`, `eliminatedAssets`, `eliminatedLiabilities`).

## Neraca: dua sisi harus dieliminasi bersama

Piutang afiliasi (aset) dan utang afiliasi (kewajiban) adalah **sisi yang sama
dari transaksi yang sama**. Keduanya dikeluarkan bersama supaya neraca tetap
seimbang.

Kalau hanya satu sisi yang ditandai, `balanced` langsung merah — dan itu
**bukan bug melainkan pertanda**: eliminasinya salah pasang, dan lebih baik
ketahuan seketika daripada menghasilkan neraca yang tampak wajar tetapi salah.

## Yang dibangun

- Migrasi `0040_intercompany`: kolom `is_intercompany` pada `accounts`.
- `PATCH /accounts/:id/intercompany` — menandai/melepas, ber-audit log.
- `mergeRows()` menerima himpunan kode tereliminasi; `sumEliminated()`
  menghitung yang dikeluarkan.
- Bagan Akun: tombol tandai/lepas + lencana; Konsolidasi: baris bertanda
  "Dieliminasi" dan diredupkan.

## Dua kesalahan saya sendiri sepanjang pengerjaan

**Field mendarat di tipe yang salah — dua kali.** `eliminatedIncome` pertama
masuk ke `ApiIncomeStatement` (per-tenant), bukan `ApiConsolidatedIncomeStatement`;
hal yang sama terulang untuk `eliminatedAssets` di `ApiBalanceSheet`. Sebabnya
kedua tipe berakhir dengan deretan field yang identik, jadi pola pencarian
saya cocok di tempat pertama yang salah.

Ini persis kelas kesalahan yang sudah tercatat di Fase 19 ("pola pendek cocok
di dalam pola panjang"). Ditangkap `tsc` keduanya, bukan oleh mata.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **273** |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **879** (dari 872) |
| `node scripts/ui-sim.mjs` | 0 | **257** (dari 256) |

Tujuh cek smoke, dan yang penting bukan sekadar "angkanya berkurang":

- akun awalnya **bukan** antar-perusahaan (memastikan bawaannya benar),
- baris bertanda **tetap tampil** dengan `total > 0` — bukan hilang,
- total konsolidasi berkurang **tepat sebesar** baris itu,
- laba ikut turun sebesar yang sama,
- setelah tanda dilepas, totalnya **kembali persis seperti semula**.

Yang terakhir itu yang menjaga fitur ini tidak merusak apa pun secara permanen.

Cek ui-sim baru **`F1x`**: tombol penanda di Bagan Akun ikut EN.

**Pemeriksaan mata** menemukan cacat lain: lencana **"sistem"** pada Bagan Akun
masih berbahasa Indonesia di mode Inggris. Bukan dari perubahan ini — kelas
buta yang sudah didokumentasikan di 19t (kata pendek tanpa penanda bahasa,
sehingga penyapu tak melihatnya). Ikut diperbaiki.

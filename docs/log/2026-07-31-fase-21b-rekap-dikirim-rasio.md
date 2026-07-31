# Fase 21b — Rekap bulanan dikirim & rasio keuangan dilengkapi

Dua baris 🟡 dari audit Fase 21a ditutup sekaligus karena keduanya tentang hal
yang sama: laporan yang sudah dihitung tetapi tidak pernah sampai ke pemilik.

## Yang dikerjakan

- Email rekap bulanan di blok cron `apps/api/src/index.ts` + penyusun teksnya
  `teksRekapBulanan()` di `routes/scheduledReports.ts`.
- `MONTHLY_JOBS_OVERRIDE` di `apps/api/src/env.ts` supaya jalur bulanan bisa
  diuji di tanggal berapa pun.
- `hitungRasioKeuangan()` di `packages/shared/src/reporting.ts` + kartu **Rasio
  keuangan** di halaman Neraca.
- Perbaikan `ExportButton` (temuan pemeriksaan mata) + pelebaran pola penyapu.

## Rekap yang tak pernah dikirim

`runMonthlyRecap()` sudah menyusun rekap tiap awal bulan **sejak Fase 7h** dan
menyimpannya rapi di `report_snapshots`. Ia tidak pernah memanggil mailer sama
sekali — jadi rekapnya mengendap di database, dan pemilik tak pernah tahu ia ada.

Roadmap terlanjur mengklaim "narasi kinerja **dikirim email** tiap awal bulan".
Klaim itu saya yang tulis di Fase 20l tanpa memeriksa isi fungsinya; ketahuan di
audit 21a. Ini penutupannya.

`getMailer(env)` sudah tersedia di handler cron dan `ownerEmails()` sudah ada —
yang kurang benar-benar hanya sambungannya.

### Bulan kosong bukan kesalahan

`teksRekapBulanan()` dipisah sebagai fungsi murni supaya isinya bisa diuji tanpa
cron dan tanpa mailer. Yang paling mudah salah pada email otomatis bukan
pengirimannya melainkan **kalimatnya saat data kosong**.

Toko yang tutup sebulan tetap layak menerima laporan yang tenang. Karena itu
bulan tanpa faktur tidak dilaporkan sebagai "Omzet Rp 0" telanjang — yang
terbaca seperti sistemnya rusak — melainkan dijelaskan, lengkap dengan jalan
keluar bila pemilik merasa seharusnya ada transaksi.

## Jalur yang hanya hidup 3 hari sebulan

Blok tugas bulanan hanya berjalan pada tanggal 1–3. Artinya jalur email rekap
**praktis tak bisa diuji**: hari ini tanggal 31.

Ditambahkan `MONTHLY_JOBS_OVERRIDE`, mengikuti pola `TRIAL_DAYS_OVERRIDE` yang
sudah ada untuk alasan yang sama persis. Tanpa itu ceknya hanya bisa hijau tiga
hari sebulan dan merah — atau lebih buruk, terlewat — di 28 hari sisanya.

**Cek smoke dibuktikan bisa gagal**: daftar penerima email dikosongkan
sementara, dan ceknya langsung merah (`email rekap bulanan terkirim ke Owner →
tidak ada di log`).

## Rasio keuangan: yang disebut apa adanya

Margin kotor & bersih sudah ada sejak lama di halaman Laba Rugi. Yang kurang
**rasio lancar** dan **perputaran persediaan**.

Dua keputusan yang dinyatakan di kode, bukan disembunyikan:

**Batas aset lancar dibuat eksplisit.** Aset tetap dimulai di `1-1500`, jadi akun
aset ber-kode di bawah itu diperlakukan lancar. Keterbatasannya nyata: pemilik
boleh menambah akun sendiri, dan akun aset baru ber-kode ≥ 1-1500 akan salah
klasifikasi. Aturannya ditaruh di satu konstanta bernama supaya bisa diperbaiki
di satu tempat, bukan tersebar sebagai tebakan di layar.

**Perputaran memakai persediaan AKHIR, bukan rata-rata.** Neraca yang diambil
layar hanya satu titik waktu; rasio rata-rata butuh saldo awal periode. Memakai
saldo akhir lalu menyebutnya "rata-rata" menghasilkan angka yang terlihat wajar
tetapi salah nama — jadi layar menyebutnya apa adanya di keterangan kartunya.

Pembagi nol mengembalikan `null`, bukan `Infinity`. `Infinity` akan ter-render
sebagai "∞" di laporan keuangan.

Angka di data demo diverifikasi manual: aset lancar 142.496.795 ÷ kewajiban
71.332.735 = **2,00** — cocok dengan yang tampil.

## Temuan pemeriksaan mata: sebelas tombol berbahasa Indonesia

Tangkapan layar mode Inggris memperlihatkan tombol **"Ekspor CSV"** masih
Indonesia di tengah halaman "Balance Sheet".

Sebabnya `ExportButton` punya nilai bawaan parameter `label = "Ekspor CSV"` di
tanda tangan fungsinya. **Sebelas** tombol ekspor memakainya tanpa mengirim
label sendiri — jadi semuanya berbahasa Indonesia walau aplikasi disetel
Inggris.

Penyapu i18n tak melihatnya: pola `ATRIBUT_TAMPILAN` menuntut `label="…"` tanpa
spasi, sedangkan nilai bawaan parameter ditulis `label = "…"`. Bentuknya bukan
atribut JSX, bukan pula teks layar.

**Gerbangnya diperbaiki, bukan hanya isinya.** Pola diperlebar jadi
`\s*=\s*`, lalu dibuktikan: dengan bentuk lama dikembalikan sementara, penyapu
melaporkan `[atribut] label="Ekspor CSV"` dan utang atribut naik ke 1; setelah
diperbaiki, kembali 0. Sapuan penuh tetap 0 — pelebaran ini tidak menghasilkan
positif palsu.

Ini blind spot ketiga pada penyapu yang sama (setelah `label="Kode"` di Fase 19
dan glob subfolder di Fase 20m). Polanya konsisten: alat hanya membuktikan apa
yang diukurnya, dan bentuk penulisan yang sedikit berbeda cukup untuk lolos.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **331** (dari 319) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **930** (dari 928) |
| `node scripts/ui-sim.mjs` | 0 | **284** (dari 281) |
| `sapu-i18n` (pola diperlebar) | 0 | utang atribut tetap **0** |

Dua belas unit test baru (5 email rekap + 7 rasio), dua cek smoke, tiga cek
ui-sim (`F3a`).

**Kedua cek baru dibuktikan bisa gagal**: kartu rasio dilumpuhkan → `F3a` merah
(`61/63`); penerima email dikosongkan → cek smoke merah.

**Pemeriksaan mata** lewat `UI_SIM_SHOT` — dari situlah tombol ekspor ketahuan.
Blok tangkapan sementara sudah dihapus lagi.

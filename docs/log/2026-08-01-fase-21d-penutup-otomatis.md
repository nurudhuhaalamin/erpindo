# Fase 21d — Jurnal berulang & jurnal penutup tahunan otomatis

Dua baris 🟡 dari audit 21a ditutup. Salah satunya ternyata **sudah jadi sejak
lama** — roadmap yang salah, bukan fitur yang kurang.

## Koreksi: satu baris 🟡 yang sebenarnya sudah selesai

Roadmap menandai "jurnal berulang terjadwal via Cron" sebagai 🟡 **SEBAGIAN**
dengan alasan "tidak dijadwalkan Cron". Itu keliru: `runScheduledTemplates()`
sudah dipanggil di blok cron harian `apps/api/src/index.ts` sejak lama.

Kalau saya percaya begitu saja, saya akan "membangun" sesuatu yang sudah ada.
Ini kali keempat roadmap salah menggambarkan keadaan, jadi baris itu tidak
sekadar ditandai ✅ — ditambahkan **cek smoke yang membuktikan template memang
terposting lewat jalur cron**, plus cek bahwa jadwalnya dimajukan sebulan
sesudahnya. Klaimnya sekarang berdiri di atas cek, bukan di atas pembacaan saya.

## Yang dikerjakan

- `postClosingEntry()` **diekstrak** dari route `POST /:tenantId/closing-entry`
  di `routes/financeExtras.ts`; route dan cron memakai fungsi yang sama.
  Menyalinnya berarti dua definisi "laba ditahan" yang bisa menyimpang diam-diam,
  dan selisih antara tutup buku manual & otomatis adalah jenis selisih yang
  paling sulit ditelusuri pemilik.
- `runYearlyClosing()` + blok cron **4b** di `index.ts`, jalan 1–3 Januari untuk
  tahun buku sebelumnya (`asOf = 31 Desember`).
- **Opt-in per tenant** (`auto_closing_entry`, bawaan **mati**), sakelarnya
  khusus Pemilik. Endpoint settings sendiri terbuka untuk admin, jadi medan itu
  dinaikkan haknya di route — sejajar dengan tombol penutup manualnya.
- `YEARLY_JOBS_OVERRIDE` supaya jalurnya bisa diuji di tanggal berapa pun;
  tanpa itu ia hanya hidup tiga hari **setahun**.

### Sakelar mati tidak ditandai selesai

Penanda KV dipasang untuk semua hasil **kecuali** `mati`. Menandai tenant yang
sakelarnya mati akan menghukum orang yang menyalakannya tanggal 2 Januari:
fiturnya baru aktif tahun depan, tanpa penjelasan apa pun. Biayanya hanya satu
query settings per tenant per run.

### Periode terkunci

`postJournal()` melempar `PeriodLockedError`, dan justru tenant yang rajin tutup
buku yang paling mungkin sudah mengunci Desember sebelum cron sempat jalan. Itu
keadaan wajar, bukan kegagalan sistem: cron menangkapnya, mencatat alasannya di
`audit_logs`, lalu lanjut ke tenant berikutnya.

**Yang tidak teruji, dinyatakan apa adanya:** cabang "terkunci" di dalam cron
tidak diuji langsung — penanda KV per tenant/tahun membuatnya butuh tenant kedua
dalam satu run. Yang teruji adalah `PeriodLockedError` merambat lewat
`postClosingEntry()` yang sama ke route (409). Cabang cron-nya sendiri hanya
terbaca, tidak terbukti.

## Bug urutan yang ditemukan justru saat membuktikan cek bisa gagal

Ketika penjaga sakelar dilumpuhkan untuk memastikan ceknya merah, keluarannya
memperlihatkan blok penutup berjalan **sebelum** tugas harian. Artinya template
jurnal yang jatuh tempo akhir Desember diposting **sesudah** tahun bukunya
ditutup — entri itu mendarat di tahun yang sudah tertutup dan tak pernah ikut
tersapu ke Laba Ditahan.

Blok dipindah jadi **4b**, sesudah tugas harian.

Ceknya membuktikan urutan dari **nomor jurnal**, bukan dari keberadaan entrinya:
entri template tetap ada walau diposting belakangan, jadi asersi "entrinya ada"
akan hijau pada urutan yang salah sekalipun. Dibuktikan dengan mengembalikan
blok ke posisi lama → dua cek merah, salah satunya menyebut `e=125000` — persis
beban template yang terlantar.

Ini pembuktian-bisa-gagal yang menemukan bug produksi, bukan sekadar memvalidasi
ceknya.

## Dua flake kalender yang ikut terbongkar

Tengah malam UTC lewat di tengah sesi: tanggal berubah dari 31 Juli ke 1
Agustus. Dua gerbang langsung merah — keduanya **bukan** akibat perubahan fase
ini, tetapi keduanya memang harus diperbaiki karena memblokir gerbang.

**`F1b` — dasbor demo menampilkan rugi −Rp 26,8 jt.** Siklus grosir "bulan
berjalan" dari Fase 19b memakai `daysAgo(4..10)`; pada tanggal 1–3 semuanya
mendarat di bulan **lalu**, sehingga bulan berjalan menanggung sebulan gaji
tanpa satu pun penjualannya. Bentuk bug yang sama persis dengan yang diperbaiki
Fase 19b, hanya pemicunya kalender. Ditambahkan `dalamBulanIni(n)` yang menjepit
tanggal ke bulan berjalan, plus satu faktur grosir keempat (dan kulakan yang
dinaikkan seiring itu agar tak ada stok minus) supaya sebulan penjualan memang
menutup sebulan gaji. **Ini bukan cuma soal cek**: yang melihat rugi itu setiap
calon pelanggan yang mengeklik "Lihat Demo" pada tanggal 1–3.

**Arus kas Juli meleset 300rb masuk & 10rb keluar.** POS adalah satu-satunya
modul yang menanggalkan transaksinya dari **jam server**, bukan dari isian
pengguna, sedangkan suite smoke hidup di dunia bertanggal tetap (Juli 2026).
Selama "hari ini" masih Juli, entri POS kebetulan jatuh di dalam jendela yang
diasersi. Ditambahkan `POS_DATE_OVERRIDE`, mengikuti pola tiga override yang
sudah ada. Ceknya sekarang deterministik di tanggal berapa pun.

Keduanya satu pola: **cek yang hijau karena kalender, bukan karena kode benar.**

## Temuan pemeriksaan mata

Label peristiwa webhook (`Faktur penjualan dibuat`, `Pembayaran diterima`,
`Stok menipis`) masih Indonesia di mode Inggris. Petanya ada di
`packages/shared` dan memang harus tetap Indonesia karena `apps/api` memakainya
— jadi sisi web wajib memetakan kode→kunci kamus, pola Fase 16t. Diperbaiki
dengan cek `F35c`.

Pemeriksaan matanya sendiri sempat salah: tangkapan "EN" ternyata berbahasa
Indonesia, karena di titik itu suite sudah kembali ke ID dan saya memotret
sebelum menukar bahasa. Urutannya dibalik — kalau tidak, "pemeriksaan mata EN"
yang saya laporkan tidak pernah benar-benar ada.

## Satu kesalahan saya sendiri

Untuk membatalkan pelumpuhan sementara pada `ui.ts`, saya menjalankan
`git checkout apps/web/src/i18n/ui.ts`. Berkas itu berisi pekerjaan fase ini
yang **belum di-commit**, jadi perintah tersebut tidak mengembalikan satu baris
percobaan — ia menghapus seluruh kunci kamus Fase 21d. Ketahuan langsung karena
`typecheck` dan ui-sim dijalankan sesudahnya, lalu ditulis ulang. Cara yang
benar adalah menyalin berkasnya lebih dulu, seperti yang saya lakukan untuk
berkas lain di fase ini.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **343** (tetap) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **955** (dari 944) |
| `node scripts/ui-sim.mjs` | 0 | **292** (dari 289) |
| `sapu-i18n` | 0 | utang atribut tetap **0** |

Sebelas cek smoke baru (blok `14c2` + penjaga owner-only di `11u`), tiga cek
ui-sim (`F35a`–`F35c`).

**Dibuktikan bisa gagal**, semuanya dikembalikan sesudahnya:

| Penjaga dilumpuhkan | Cek yang merah |
| --- | --- |
| pemeriksaan peran pada medan sakelar | `sakelar penutup otomatis oleh ADMIN → 403` (dapat 200) |
| pemeriksaan `auto_closing_entry` | `sakelar NYALA … saldo P/L jadi nol` + idempotensi |
| blok `4b` dikembalikan ke posisi lama | urutan template↔penutup (`e=125000`) |
| sakelar dipaksa `checked` & deskripsi dikosongkan | `F35a`, `F35b` |
| kunci EN webhook disamakan dengan ID | `F35c` |

**Pemeriksaan mata** lewat `UI_SIM_SHOT`, mode Indonesia **dan** Inggris. Blok
tangkapan sementara sudah dihapus.

# Fase 16n — Lunasi utang i18n halaman Laporan

Sub-fase ketiga pelunasan utang hasil audit Fase 16k. Sasaran:
`apps/web/src/pages/reports.tsx` — enam layar laporan (Laba Rugi, Arus Kas,
Umur Piutang/Hutang, Ekspor e-Faktur, Neraca, Laporan Penjualan) yang pada
audit tercatat 44 temuan meski Fase 16e menyatakannya "tuntas".

## Angka 44 itu menyesatkan — 27 di antaranya bukan teks layar

Begitu `scripts/sapu-i18n.mjs` mengenali `downloadCsv()` sebagai **format
berkas** (dipasang pada Fase 16m), temuan `reports.tsx` turun dari 44 menjadi
23. Halaman ini penuh ekspor, jadi sebagian besar "utang"-nya ternyata **header
kolom CSV** — bukan sesuatu yang boleh diterjemahkan.

Sisanya masih memuat 7 potongan palsu: pola teks JSX kerap mulai **tepat
sebelum** `downloadCsv(`, sehingga posisi awalnya di luar zona padahal isinya
jelas milik panggilan itu. Diperbaiki dengan menguji **tumpang-tindih rentang**,
bukan posisi awal saja. Setelah itu utang nyatanya **17**, dan seluruhnya
dilunasi di fase ini.

## Yang dikerjakan

- **14 entri kamus baru** di `apps/web/src/i18n/ui.ts` (478 → 492).
- **12 blok teks** di `reports.tsx` diganti ke `u("…")`:

| Layar | Yang diperbaiki |
| --- | --- |
| Laba Rugi | headline `Laba Bersih`/`Rugi Bersih`, blok `Periode sebelumnya (…)`, tiga label array pembanding (`Pendapatan`, `Beban`, `Laba bersih`) |
| Arus Kas | lima baris ringkasan: saldo awal, total kas masuk, total kas keluar, perubahan bersih, saldo akhir |
| Umur Piutang/Hutang | pesan kosong `Tidak ada {piutang\|hutang} yang belum lunas. 🎉` |
| Ekspor e-Faktur | paragraf penjelas Coretax XML + baris total `Total ({n} faktur)` |
| Neraca | lencana `seimbang ✓` |

Pesan kosong umur tagihan dulu menyisipkan kata `piutang`/`hutang` ke tengah
kalimat. Dalam bahasa Inggris urutannya berbeda ("No outstanding receivables"),
jadi kalimatnya **tidak** dijahit dari potongan — disediakan dua kunci utuh
(`tidakAdaPiutangBelumLunas`, `tidakAdaHutangBelumLunas`).

## Gambaran menyeluruh: 893 temuan di 36 halaman

Sapuan kini cukup dipercaya untuk dijalankan atas **seluruh** halaman, bukan
hanya sepuluh yang sudah memakai `useUi()`. Hasilnya perlu dicatat terang-terangan:

| Kelompok | Jumlah halaman | Temuan teks layar |
| --- | ---: | ---: |
| Sudah masuk program i18n (16b–16n) | 10 | ~104 |
| **Belum pernah disentuh program i18n** | **26** | **~789** |

Halaman terbesar yang belum tersentuh: `dashboard.tsx` (65), `app.tsx` (64),
`catat.tsx` (47), `admin.tsx` (45), `manufacturing.tsx` (43), `pajak.tsx` (42),
`auth.tsx` (40), `kasbank.tsx` (38), `procurement.tsx` (38), `print.tsx` (36).

Dua kelompok itu **berbeda sifatnya** dan tidak boleh disamakan:

- Yang pertama adalah **utang** — halaman yang pernah dinyatakan tuntas padahal
  belum. Itu kesalahan pelaporan, dan sedang dilunasi 16l–16n.
- Yang kedua **bukan utang, melainkan pekerjaan yang memang belum dimulai**.
  Tidak ada klaim yang perlu dikoreksi di sana; yang perlu hanyalah kejujuran
  bahwa program i18n modul masih jauh dari selesai.

Catatan: `app.tsx` (64) sebagian besar bukan bug — label navigasinya
diterjemahkan lewat `NAV_LABEL_EN`, sebagaimana sudah diverifikasi pada Fase
16j lewat cek `F0b`. Angka per halaman di atas adalah **temuan mentah**, bukan
utang terverifikasi.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 234 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **202** cek lolos (naik dari 200) |

Dua cek baru, rutenya diverifikasi ke `main.tsx` lebih dulu:

- `F0q` — `/app/keuangan/arus-kas`: `Opening cash balance` + `Closing cash balance`.
- `F0r` — `/app/keuangan/neraca`: lencana `balanced ✓` / `NOT balanced`.

`F0r` sengaja menerima **dua** penanda positif karena lencananya bergantung
keadaan data (seimbang atau tidak) — asersi yang hanya menuntut satu di
antaranya akan rapuh terhadap data demo, pelajaran dari Fase 16g.

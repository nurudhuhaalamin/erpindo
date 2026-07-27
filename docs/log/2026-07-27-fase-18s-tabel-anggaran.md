# Fase 18s — Anggaran memakai `Table` + kartu di HP

Satu berkas, tetapi bentuk paling padat sejauh ini: **tabelnya dirender dua
kali** (Pendapatan dan Beban) dari satu sub-komponen, barisnya **bisa
disunting**, dan ia punya **dua macam baris ber-`colSpan`** sekaligus.

## Yang dikerjakan

`apps/web/src/pages/budget.tsx` — 1 tabel, dirender dua kali oleh `BudgetTable`.

### Baris yang bisa disunting

`BudgetRow` memuat `<Input type="number">` yang menyimpan saat blur. `Tr`
diberi `align-top` supaya baris lain tidak ikut merenggang mengikuti tinggi
input — pola yang sama dengan work order (18o) dan routing (18p).

Kolom Anggaran **tidak** memakai `numeric`. Bagi admin selnya memuat kontrol
form, bukan nilai — kategori yang sama dengan sel berisi lencana (17g).
Perataan kanan dipasang manual supaya kolomnya tetap berbaris, dan tampilan
baca-saja (untuk viewer) memakai `num` langsung.

`aria-label={\`Anggaran ${row.name}\`}` pada input **dipertahankan utuh** —
diperiksa lebih dulu bahwa tidak ada asersi ui-sim yang bergantung padanya,
tetapi ia tetap satu-satunya nama yang dibaca pembaca layar untuk input itu.

### Dua macam baris ber-`colSpan`

| Baris | `colSpan` | Perlakuan di mode kartu |
| --- | --- | --- |
| Kosong ("Belum ada akun …") | 5 | Tanpa `label`; `text-center` dibatasi ke `md:` saja |
| Total (per seksi) | 2 pada sel judul | Sel judul tanpa `label`; tiga sel nilainya diberi `label` |

`text-center` pada baris kosong sengaja dibuat `md:text-center`. Di layar lebar
sel itu membentang lima kolom dan rata tengah masuk akal; di mode kartu ia
membentang penuh sendirian, dan rata tengah membuatnya terbaca seperti **judul
seksi**, bukan keterangan "tidak ada isi".

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**, bukan penyaringan
keluaran (pelajaran 18f).

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **244** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **233** cek lolos (tetap) |
| `node scripts/sapu-i18n.mjs` | tidak ada utang baru |

Tidak ada cek baru: baris ber-`colSpan` sudah dijaga `F32` (18p) dan lebar
kartu oleh `F33` (18q). Bentuk "baris bisa disunting" pun bukan hal baru sejak
18o — dan seperti dicatat di 18p, blok layar kecil berjalan dalam sesi demo
berperan viewer, sehingga input anggaran memang tidak dirender di sana.

## Diperiksa dengan mata

Tangkapan layar 390px **halaman penuh** dilihat: tiap akun tersaji sebagai
kartu berlabel (Kode, Akun, Anggaran, Realisasi, Selisih), kedua baris
"Total Pendapatan"/"Total Beban" terbaca sebagai kartu ringkas dengan judul di
atas dan tiga nilai berlabel di bawahnya, dan ringkasan Laba/rugi di kaki
halaman tidak terganggu.

## Sisa cakupan

Tersisa **2 tabel di 2 berkas**: `consolidation` (kolom dinamis per perusahaan)
dan `projects`.

**8 tabel dikecualikan permanen** — 5 `print.tsx`, 2 struk POS
(`buildReceiptHtml`), 1 surat jalan (`printDeliveryNote`) — karena merupakan
dokumen cetak yang wajib putih terlepas dari tema layar.

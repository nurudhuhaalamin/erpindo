# Fase 18r — Absensi & CRM memakai `Table` + kartu di HP

Dua tabel, dua hal yang perlu diperhatikan: **label kartu yang ikut dwibahasa**,
dan **sel kosong yang berubah arti** begitu tata letaknya menumpuk.

## Yang dikerjakan

### `apps/web/src/pages/attendance.tsx` — 1 tabel

Rekap bulanan (Karyawan, Hadir, Izin, Sakit, Alfa, Cuti, Total) dipindahkan ke
`Table`/`Thead`/`Tr`/`Th`/`Td`. Enam kolom hitungan memakai `numeric`; kolom
Karyawan tidak.

`<thead>` lama memakai `uppercase` — hilang dengan sendirinya karena `Thead`
memang melarangnya sejak 18b (pelajaran 17d: `text-transform` ikut mengubah
`innerText` dan memecahkan asersi).

`divide-y` pada `<tbody>` dihapus: `Tr` sudah membawa garis barisnya sendiri,
dan di mode kartu pemisah itu justru berlebihan.

### `apps/web/src/pages/crm.tsx` — 1 tabel

Konversi per sumber lead. Judul kolomnya datang dari `u()` (kamus i18n), jadi
**prop `label` wajib ikut `u()`** — bukan string Indonesia keras. Kalau tidak,
pengguna yang memilih EN akan melihat judul kolom berbahasa Inggris di layar
lebar tetapi label kartu berbahasa Indonesia di HP. Alasannya ditulis sebagai
komentar di tempatnya, karena ini jebakan yang mudah terulang di berkas lain
yang memakai `u()`.

## Sel kosong yang berubah arti di mode kartu

Kolom Alfa ditulis `{r.alfa || ""}` — nol sengaja dikosongkan supaya angka yang
bukan nol menonjol. Di tabel lebar itu bekerja: sel kosong terbaca sebagai
"tidak ada" karena kolom di kiri-kanannya berisi angka.

Di mode kartu artinya berubah. Sel itu berdiri sendiri di sebelah label "Alfa",
dan yang terbaca bukan "nol" melainkan **"datanya tidak ada"**. Nol sekarang
ditulis `—` dengan warna redup, dan merah hanya dipakai saat memang ada alfa.

Ini bukan temuan asersi — semua cek hijau sebelum dan sesudah. Ketahuan dari
melihat tangkapan layar, sama seperti cacat lebar kartu di 18q.

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

Tidak ada cek baru di sub-fase ini: kedua tabel tidak memperkenalkan bentuk
baru. `F33` (18q) sudah menjaga lebar kartunya, `F28` bentuknya.

## Diperiksa dengan mata

Tangkapan layar 390px **halaman penuh** (bukan sekadar viewport) untuk kedua
halaman — perlu penuh karena tabel konversi CRM berada jauh di bawah pipeline
dan tidak terlihat pada tangkapan viewport biasa. Keduanya benar: kartu
memenuhi lebar, label di kiri, nilai di kanan, dan kolom Alfa kini terbaca.

## Sisa cakupan

Tersisa **3 tabel di 3 berkas**: `budget`, `consolidation`, `projects`.

**8 tabel dikecualikan permanen** — 5 `print.tsx`, 2 struk POS
(`buildReceiptHtml`), 1 surat jalan (`printDeliveryNote`) — karena merupakan
dokumen cetak yang wajib putih terlepas dari tema layar.

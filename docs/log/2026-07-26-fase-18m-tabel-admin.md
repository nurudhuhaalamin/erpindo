# Fase 18m — Modul Admin Platform memakai `Table` + kartu di HP

Lanjutan rangkaian 18i+. Sasaran: `apps/web/src/pages/admin.tsx` — 3 tabel.

## Yang dikerjakan

1. **Pendaftar terbaru** — 20 perusahaan terakhir beserta email pemiliknya.
2. **Semua perusahaan** — 7 kolom: nama+slug, pemilik, status, paket, jumlah
   anggota, akhir trial, tanggal daftar.
3. **Perusahaan tertinggal migrasi** — nama + perpindahan versi skema.

## Satu sel yang sengaja bukan `numeric`

Kolom **Versi skema** berisi `v12 → v38` — sebuah **perpindahan**, bukan nilai
yang perlu dirata-kanankan terhadap kolom lain. Dipakai utilitas `num` langsung
(mono + `tabular-nums`, supaya angka versinya tetap sejajar antarbaris) **tanpa**
`numeric`, yang akan ikut memaksa rata kanan.

Ini kasus keempat dari pola yang sama, dan aturannya makin jelas:

| Kasus | Fase | Kenapa bukan `numeric` |
| --- | --- | --- |
| Kolom stok berisi lencana | 17g | Lencana ikut dipaksa mono |
| Kode akun | 17h | Pengenal, bukan nilai — rata kanan menyulitkan pemindaian |
| PPh 21 (TER) | 18j | Sel memuat nominal **dan** keterangan tarif |
| Versi skema | 18m | Perpindahan (`v12 → v38`), bukan nilai tunggal |

**`numeric` untuk sel yang isinya murni nilai** — bukan untuk setiap sel yang
kebetulan memuat angka.

## Sisa pekerjaan

Tersisa **23 `<table>` tangan**, 5 di `print.tsx` yang dikecualikan permanen.
Sasaran sebenarnya **18 tabel di 13 berkas**, semuanya berukuran kecil:

| Berkas | Jumlah |
| --- | ---: |
| `pos.tsx`, `manufacturing.tsx`, `maintenance.tsx`, `kasbank.tsx`, `dimensi.tsx` | 2 masing-masing |
| `salesorders`, `projects`, `marketplace`, `currencies`, `crm`, `consolidation`, `budget`, `attendance` | 1 masing-masing |

**7 modul** selesai: Stok, Keuangan, Laporan, Penggajian, Master Data, Pajak,
Admin.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Status keluar |
| --- | --- |
| `pnpm typecheck` | 0 |
| `pnpm lint` | 0 |
| `pnpm test` | 0 — 244 unit test |
| `pnpm build` | 0 |
| `pnpm smoke` | 0 — 863 cek |
| `node scripts/ui-sim.mjs` | 0 — 231 cek |

Catatan: halaman Admin **tidak** dilalui `ui-sim` sebagai admin platform —
`F17` justru memastikan menu "Admin" **tersembunyi** untuk pengguna biasa.
Jadi perubahan ini bersandar pada typecheck, lint, dan sapuan rute
`AUDIT_ROUTES` (yang menuntut tiap rute bebas `console.error`), bukan pada
asersi isi. Dicatat supaya cakupan uji fase ini tidak dikira lebih luas
daripada kenyataannya.

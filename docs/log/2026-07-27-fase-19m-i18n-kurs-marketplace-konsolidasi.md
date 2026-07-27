# Fase 19m — Mata Uang, Marketplace & Konsolidasi dwibahasa

Tiga berkas, **ketiganya `BERSIH ✅`**:

| Berkas | Teks layar | Toast |
| --- | --- | --- |
| `currencies.tsx` | **10 → 0** | 1 → 0 |
| `marketplace.tsx` | **15 → 0** | 0 |
| `consolidation.tsx` | **15 → 0** | 0 |

**±50 entri kamus baru.**

## Aturan 19l diterapkan, dan berhasil

Log 19l menyimpulkan bahwa penggantian massal harus dilakukan **dari frasa
terpanjang ke terpendek**, karena frasa pendek adalah substring dari yang
panjang. Fase ini menerapkannya sejak awal — dan **tidak ada satu pun artefak
penggantian**, setelah tiga sub-fase berturut-turut yang selalu menghasilkan
minimal satu.

Aturan kedua (menegaskan anchor skrip) juga dipakai konsisten: setiap
penyisipan kamus memakai `assert anchor in s`, dan hasilnya diverifikasi
per-kunci sesudahnya — akibat langsung dari kegagalan senyap di 19k.

## Empat kunci kembar sekaligus

`gudangStokKeluar`, `tidakSeimbang`, `perTanggal` (ketiganya sudah ada sejak
Fase 16), plus `periodeBulan` di 19l. Semua dipakai ulang.

Ini kejadian **ketujuh** berturut-turut. Kamus kini ±1.050 entri, jadi
tabrakan nama praktis pasti terjadi tiap sub-fase — memeriksa lebih dulu bukan
lagi kehati-hatian ekstra, melainkan langkah wajib.

## Dua string yang alat sapu lewatkan

Setelah `currencies.tsx` dilaporkan `BERSIH ✅`, membaca berkasnya sendiri
memperlihatkan dua teks yang **tetap berbahasa Indonesia di mode EN**:

- `<Th>Kode</Th>` — judul kolom
- `<Badge>dasar</Badge>` — penanda mata uang dasar

Keduanya lolos sapuan karena "Kode" cocok dengan nama kunci `kode` (pemeriksaan
`KUNCI.has()` bersifat case-sensitive, tetapi "dasar" memang ada sebagai nama
kunci lain) — jadi alat menganggapnya argumen kamus, bukan teks layar.

Pelajaran yang sama bentuknya dengan yang berulang sejak Fase 17: **alat hanya
membuktikan apa yang benar-benar diperiksanya.** `BERSIH ✅` berarti "tidak ada
yang cocok pola", bukan "tidak ada utang". Keduanya diperbaiki.

## `parseCsv` kedua, perlakuan sama

`marketplace.tsx` punya `parseCsv` di tingkat modul seperti `kasbank.tsx` (19c)
— penerjemah diterima sebagai argumen, bukan hook. Dan `useMemo` yang
memanggilnya diberi `u` di daftar dependensi, menerapkan langsung pelajaran 19f
(bug `netLabel` di `pajak.tsx`).

## Cek baru `F1m`

Satu cek untuk tiga rute sekaligus, semuanya diverifikasi ke `audit-routes.mjs`
lebih dulu.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **249** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **246** cek lolos (naik dari 245) |

## Sisa program i18n

4 berkas: `admin`, `alat`, `migration`, `mulai` (±130 teks), ditambah sisa
`app.tsx` + `src/components/`.

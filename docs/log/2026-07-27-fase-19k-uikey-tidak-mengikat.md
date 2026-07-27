# Fase 19k — Absensi dwibahasa, dan penemuan bahwa `UiKey` tidak mengikat apa pun

Sub-fase ini dimulai sebagai penerjemahan `attendance.tsx` biasa dan berakhir
dengan menemukan bahwa **penjaga tipe yang saya andalkan sepanjang program ini
sama sekali tidak bekerja.**

## Bagaimana ketahuannya

Blok kamus untuk Absensi ternyata **tidak pernah masuk** ke `ui.ts` — skrip
penyisipnya memakai anchor yang tidak cocok, dan karena tidak ada assert, ia
menulis berkas tanpa perubahan lalu melaporkan sukses.

Yang mengagetkan bukan itu. Yang mengagetkan: **`pnpm typecheck` tetap hijau**
padahal `attendance.tsx` memanggil ±30 kunci yang tidak ada.

## Sebabnya: satu anotasi tipe

```ts
const UI: Record<string, Dual> = { … };
export type UiKey = keyof typeof UI;
```

`Record<string, Dual>` membuat `keyof typeof UI` menjadi **`string`**. Jadi
`UiKey` **adalah** `string`, dan:

- `u("kunciApaPunBoleh")` lolos kompilasi;
- seluruh penjaga `satisfies Record<…, UiKey>` yang saya tambahkan di 19d, 19h,
  19i, 19j, dan 19k **hampa** — mereka hanya memeriksa bahwa nilainya *string*;
- kunci yang hilang tidak pernah gagal keras. `useUi` mengembalikan
  `String(key)`, jadi **pemakai melihat nama kuncinya sendiri di layar.**

Beberapa log sebelumnya menyatakan bahwa `satisfies` "memastikan kunci yang
salah tulis tertangkap saat kompilasi". **Pernyataan itu salah**, dan saya
mengulanginya di empat sub-fase.

## Dua bug nyata yang sudah terlanjur terkirim

Setelah anotasinya dibuang (`const UI = { … } satisfies Record<string, Dual>`),
TypeScript langsung menemukan **dua kunci yang dipakai tetapi tidak pernah ada**
— keduanya di luar berkas yang sedang saya kerjakan:

| Berkas | Kunci | Sejak | Yang dilihat pemakai |
| --- | --- | --- | --- |
| `pajak.tsx:581` | `ppnLebihBayar` | **19e** | tulisan `ppnLebihBayar` saat PPN lebih bayar |
| `projects.tsx:278` | `laba` | Fase 16 | tulisan `laba` di ringkasan proyek |

Yang pertama saya sendiri yang membuatnya, di fase ini juga (19e), dan lolos
seluruh gerbang termasuk cek `F1e` — karena penandanya kebetulan mengambil teks
lain di halaman yang sama. Yang kedua sudah ada sejak program i18n dimulai.

Keduanya diperbaiki di sini.

## Yang dikerjakan

- **`ui.ts`**: anotasi dibuang, diganti `satisfies` di akhir objek — bentuk
  yang memberi pemeriksaan nilai yang sama **tanpa** melebarkan tipe kuncinya.
- **`attendance.tsx`**: 28 → 4 temuan (sisanya potongan kode & `id` elemen),
  toast 1 → 0, `<h1>` ke `PAGE_HEADINGS` — **yang terakhir dari empat** berkas
  yang salah saya hitung di 19f. `ATTENDANCE_STATUS_LABELS` dipetakan ke kunci
  (pola 16t), dan importnya dibuang karena ekspor CSV memang tetap Indonesia.
- **Uji baru** `apps/web/test/ui-key-ketat.test.ts` (3 uji) menjaga
  **penyebabnya**, bukan gejalanya: selama anotasi `Record<string, …>` tidak
  kembali, TypeScript menangkap kunci asing sendiri.

### Dibuktikan mengikat

`u("bulan")` diganti `u("kunciYangTidakAda")`:

```
src/pages/attendance.tsx(132,41): error TS2345:
  Argument of type '"kunciYangTidakAda"' is not assignable to parameter of
  type '"masuk" | "anggaran" | … 998 more … | "toastKehadiranDihapus"'
```

Sebelum perbaikan, baris yang sama lolos tanpa keluhan.

## Akar penyebab prosesnya: skrip tanpa assert

Blok kamus hilang karena skrip penggantinya tidak memeriksa apakah anchor-nya
cocok. Ini pola yang sama dengan yang saya catat di 19j — dan **saya
mengulanginya lagi**. Kali ini perbaikannya bukan catatan melainkan kebiasaan
yang sudah dipakai di sisa fase ini: **setiap skrip penyisip menegaskan
anchor-nya (`assert anchor in s`) dan memverifikasi hasilnya**, bukan
mengandalkan laporan "sukses".

Ironinya pas: kalau `UiKey` bekerja sejak awal, kegagalan sisip itu akan
langsung merah di typecheck.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **249** unit test lolos (naik dari 246) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **244** cek lolos (naik dari 243) |
| `node scripts/sapu-i18n.mjs` | `attendance.tsx` **28 → 4** (sisanya positif palsu) |

## Sisa program i18n

9 berkas, ±272 teks. Berikutnya **19l — `dimensi` + `budget`** (37).

Catatan untuk sub-fase berikutnya: dengan `UiKey` yang kini benar-benar
mengikat, kunci yang belum ditambahkan akan **gagal keras saat typecheck** —
jadi urutan kerja yang benar adalah menambah kamusnya lebih dulu, lalu
memakainya.

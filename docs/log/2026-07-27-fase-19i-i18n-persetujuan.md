# Fase 19i — Persetujuan dwibahasa

Sasaran `apps/web/src/pages/approvals.tsx` — alur persetujuan berjenjang.

**29 → 5 temuan**, **5 → 0 toast**. Kelima sisanya positif palsu: dua potongan
kode yang tertangkap regex, dan tiga `docType: "pembelian"` yang merupakan
**nilai data** (kode jenis dokumen), bukan teks tampilan.

**±40 entri kamus baru.**

## Penyesuaian lingkup

Rencana memasangkan `approvals` + `contracts` + `helpdesk` (64 temuan).
`approvals` sendiri ternyata memuat **tujuh komponen** dan dua peta label yang
perlu dipindahkan, jadi dipecah. `contracts` + `helpdesk` menjadi 19j.

## Judul halaman ke `PAGE_HEADINGS`

`<h1>` tulisan tangan diganti `<PageHeading k="persetujuan" />`. Ini yang ketiga
dari **empat** berkas yang saya salah hitung di 19f (lihat koreksi di log 19g);
tersisa `attendance.tsx`.

## Dua peta label dipindahkan

**`LEGACY_STATUS_LABEL`** (menunggu/disetujui/ditolak) dan
**`APPROVAL_DOC_TYPE_LABELS`** dari `packages/shared`. Keduanya jadi peta
kode → kunci ber-`satisfies` di sisi web:

```ts
const DOC_TYPE_KEY = {
  pembelian: "docPembelian", pesanan_pembelian: "docPesananPembelian",
  pengeluaran: "docPengeluaran", jurnal: "docJurnal",
} satisfies Record<ApprovalDocType, UiKey>;
```

Alasannya sama dengan PPh 23 di 19e: `packages/shared` tetap berbahasa Indonesia
karena `apps/api` ikut memakainya, jadi pemetaan dilakukan di web.

## Kunci kembar kelima berturut-turut

`statusDitolak` sudah ada sejak Fase 16 dengan isi persis sama. Sudah kejadian
kelima berturut-turut sejak 19c — polanya sekarang jelas, dan sudah menjadi
langkah rutin: **periksa dulu sebelum menambah**, kompilator hanya jaring
terakhir.

## Kehati-hatian yang kurang (lagi), dua bentuk baru

**1. Penggantian bertanda kurung merusak keseimbangan.** Mengganti
`LEGACY_STATUS_LABEL[` menjadi `u(LEGACY_STATUS_KEY[` menambah `(` tanpa
menambah `)`, menghasilkan `{u(LEGACY_STATUS_KEY[r.status]}`. Tertangkap `tsc`.

**2. Hook ditaruh di komponen yang tidak memakainya.** `StepTrail` diberi
`const u = useUi();` padahal tidak memanggilnya — tertangkap ESLint
(`no-unused-vars`), bukan `tsc`.

Dua-duanya sepele dan langsung ketahuan. Dicatat karena bersama bug template
literal di 19h, polanya konsisten: **penggantian string massal selalu perlu
diperiksa hasilnya**, dan tiga alat berbeda (`tsc`, ESLint, `sapu-i18n`)
masing-masing menangkap jenis kesalahan yang tidak bisa ditangkap yang lain.

## Cek baru `F1i`

Penandanya judul halaman + label tab "Antrean saya". Tab "Aturan" dan
"Pembelian (ambang)" **sengaja tidak dipakai** — keduanya hanya tampil untuk
peran owner, dan asersi yang bergantung peran akan rapuh bila alur uji berubah.
Alasan yang sama dengan `F0y` di Fase 16u.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **246** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **242** cek lolos (naik dari 241) |
| `node scripts/sapu-i18n.mjs` | `approvals.tsx` **29 → 5** (sisanya positif palsu), toast **5 → 0** |

## Sisa program i18n

12 berkas, ±334 teks. Berikutnya **19j — `contracts.tsx` + `helpdesk.tsx`** (35).

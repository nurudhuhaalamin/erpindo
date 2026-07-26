# Fase 16s — Lunasi utang i18n Kasir & CRM + temuan lingkup baru

Sub-fase kedelapan dan **terakhir** dari pelunasan utang audit Fase 16k.
Sasaran: `pos.tsx` (11 temuan, Fase 16g menyatakannya tuntas) dan `crm.tsx`
(9 temuan, Fase 16h).

## Koreksi penting: sapuan selama ini hanya melihat satu folder

Selama delapan sub-fase, `scripts/sapu-i18n.mjs` hanya pernah dijalankan atas
`apps/web/src/pages/`. Teks tampilan ternyata juga hidup di **dua tempat lain**:

| Lingkup | Temuan | Pernah disapu sebelum fase ini? |
| --- | ---: | --- |
| `apps/web/src/pages/` | (sudah dilunasi 16l–16s) | ya |
| `packages/shared/src/` | ~335 | **tidak** |
| `apps/web/src/components/` | ~28 | **tidak** |

Di `packages/shared` ada **20+ peta label** bertipe `Record<…, string>` berisi
teks Indonesia murni: `LEAD_STAGE_LABELS`, `APPROVAL_STATUS_LABELS`,
`PO_STATUS_LABELS`, `TICKET_STATUS_LABELS`, `ATTENDANCE_STATUS_LABELS`,
`MODULE_LABELS`, dan seterusnya. Peta-peta itu **dirender langsung oleh halaman
web**.

Akibat nyatanya: `crm.tsx` menampilkan `LEAD_STAGE_LABELS` pada lencana tahap,
ringkasan funnel, papan kanban, dan dropdown Detail. Dalam mode Inggris papan
CRM tetap terbaca **"Baru / Dihubungi / Terkualifikasi / Penawaran / Menang /
Kalah"**. Fase 16h menyatakan halaman ini tuntas, dan cek `F0j` lolos — karena
`F0j` hanya memeriksa teks kartu lead dan laporan konversi sumber, tidak pernah
menyentuh lencana tahap.

Jadi klaim "bersih" pada 16l–16r **benar untuk berkas halamannya**, tetapi
**terlalu jauh untuk apa yang benar-benar dilihat pemakai**. Halaman mana pun
yang merender peta label dari `packages/shared` masih berbahasa Indonesia dalam
mode Inggris. Itu dicatat di sini, bukan diam-diam dimasukkan ke hitungan
"selesai".

## Arah ketergantungan menentukan bentuk perbaikannya

`packages/shared` **tidak boleh** mengimpor kamus web: `shared` dipakai juga
oleh `apps/api`, dan membuatnya bergantung pada `apps/web` membalik arah
ketergantungan monorepo.

Karena itu labelnya dibiarkan di `shared` apa adanya, dan **web memetakan
sendiri** tahap → kunci kamusnya:

```ts
const LEAD_STAGE_KEY: Record<LeadStage, UiKey> = {
  new: "tahapBaru",
  contacted: "tahapDihubungi",
  qualified: "tahapTerkualifikasi",
  proposal: "tahapPenawaran",
  won: "tahapMenang",
  lost: "tahapKalah",
};
```

Empat titik render `LEAD_STAGE_LABELS[…]` diganti ke `u(LEAD_STAGE_KEY[…])`,
dan impornya dilepas (ESLint menangkapnya sebagai impor tak terpakai).

## Yang dikerjakan

- **23 entri kamus baru** (572 → 595).
- **`pos.tsx`** — 8 blok: rekap `Per jam ({n} transaksi · {total})`, lencana
  `refund {nominal}`, tombol `Tutup`/`Refund`, `(sisa {n} dari {m})`,
  `aria-label` qty refund, ringkasan shift, `Sisa: {nominal}`, `aria-label`
  nama tahan, dan nama produk cadangan saat memanggil transaksi tertahan.
- **`crm.tsx`** — 7 blok + `QUOTE_LABEL` (konstanta tingkat modul **ketujuh**)
  + `LEAD_STAGE_KEY`.

Satu hal kecil yang berulang: `KanbanBoard` perlu `const u = useUi()` lagi —
hook itu **saya lepas sendiri di Fase 16j** karena saat itu tidak terpakai.
Sekarang terpakai lagi.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 234 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **207** cek lolos (naik dari 206) |

Cek baru `F0w` — rute `/app/crm/leads` (**tidak ada** `/app/crm` telanjang;
pelajaran Fase 16h). Cek ini sengaja menguji tepat lubang yang baru ditemukan:
tahap lead ikut bahasa Inggris **meski labelnya berasal dari
`packages/shared`**. Sebelum perbaikan ini, cek tersebut akan gagal.

## Keadaan setelah fase ini

**Utang audit 16k: LUNAS.** Sepuluh halaman yang pernah dinyatakan tuntas
padahal belum, kini benar-benar bersih di tingkat berkas halaman.

Yang tersisa, dicatat jujur sebagai pekerjaan yang **belum dimulai**, bukan
utang dari klaim keliru:

| Lingkup | Perkiraan temuan |
| --- | ---: |
| 26 halaman yang belum pernah masuk program i18n | ~789 |
| Peta label di `packages/shared` (dirender lintas halaman) | ~335 |
| `apps/web/src/components/` | ~28 |

Angka-angka itu **temuan mentah**, bukan utang terverifikasi — pengalaman
delapan sub-fase menunjukkan angka nyatanya jauh lebih kecil (44 → 17 pada
`reports.tsx`, 54 → 0 pada `masterdata.tsx`). Tetapi urutannya jelas: peta
label `shared` sebaiknya didahulukan, karena satu peta memengaruhi banyak
halaman sekaligus.

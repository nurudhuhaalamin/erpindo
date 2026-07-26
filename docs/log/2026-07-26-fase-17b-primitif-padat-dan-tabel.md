# Fase 17b — Primitif padat, komponen `Table`, dan bug penimpaan kelas

Sub-fase kedua perombakan desain. Sasaran: `apps/web/src/components/ui.tsx`
(791 baris, diimpor **47 dari 61** berkas frontend).

## Bug yang ditemukan saat menyiapkan fase ini

`cx()` hanya **menyambung** string kelas. Itu terlihat berfungsi — sampai
disadari bahwa konflik antar-utilitas Tailwind diselesaikan oleh **urutan CSS**,
bukan urutan penulisan. Tailwind memancarkan `.h-7 → .h-8 → .h-9 → .h-10`
menaik, sehingga **nilai terbesar selalu menang**.

Dibuktikan dengan mengukur langsung di Chromium atas CSS hasil build, bukan
dengan menalar:

| Kelas pada tombol | Tinggi nyata |
| --- | --- |
| `h-10` (bawaan) + `h-8` (pemanggil) | **40px** — penimpaan diabaikan |
| `h-10` (bawaan) + `h-7` (pemanggil) | **40px** — diabaikan |
| `h-8` (bawaan) + `h-10` (pemanggil) | 40px — berlaku |

Sebaran penimpaan `<Button className="h-…">` di seluruh aplikasi:

| Diminta | Jumlah | Status sebelum fase ini |
| --- | ---: | --- |
| `h-7` | 5 | diabaikan |
| `h-8` | 76 | diabaikan |
| `h-9` | 15 | diabaikan |
| `h-10` / `h-12` | 2 | berlaku |

Jadi **96 dari 98** upaya membuat tombol ringkas tidak pernah berpengaruh.
Selama belasan fase kode berusaha merapatkan tombol di 96 tempat dan tak satu
pun terlihat hasilnya — ini salah satu sebab tampilan terasa longgar dan
"seperti SaaS umum". Bukan sekadar pilihan gaya; ini bug yang diam.

### Perbaikannya menambah satu dependensi — dan itu disengaja

`tailwind-merge` dipakai di `cx()`. Berkas `ui.tsx` menyandang komentar "tanpa
dependensi eksternal", jadi ini melanggar niat awalnya. Pertimbangannya:

- Menurunkan bawaan ke `h-8` saja **hanya** memperbaiki 91 dari 96 — yang
  meminta `h-7` tetap mati.
- Jebakan yang sama berlaku untuk padding, warna, dan radius, bukan cuma
  tinggi. Tanpa merge semantik, `className` tidak bisa diandalkan **di seluruh
  design system** yang justru sedang dibangun fase ini.

Membiarkannya berarti setiap komponen baru mewarisi jebakan yang sama.

### Diuji di lapisan yang benar

Percobaan pertama menaruh asersi ini di `ui-sim`: membuat elemen di DOM lalu
mengukur tingginya. **Itu keliru** — `twMerge` bekerja saat React me-render,
bukan di DOM, jadi asersi tersebut akan menguji urutan CSS Tailwind, bukan
perbaikannya. Dan tidak ada tombol `h-7` nyata yang bisa dijangkau `ui-sim`
secara andal (yang ada hanya di transaksi POS tertahan dan detail proyek, yang
tidak dilalui alur uji).

`cx()` adalah fungsi murni, jadi lapisan yang tepat adalah unit test.
Ditambahkan `apps/web/test/cx.test.ts` (6 uji). Uji-ujinya memeriksa **string
hasil merge** (`not.toContain("h-8")`), bukan sekadar "kelas penimpa ada" —
sebab pada versi lama kelas penimpa memang ADA di DOM, hanya kalah di CSS.
Asersi "mengandung `h-7`" akan lolos secara hampa.

## Yang dikerjakan

- `cx()` memakai `twMerge`; `cx` diekspor agar bisa diuji.
- `Button`: bawaan `h-10` → **`h-8`**, ditambah size `xs`/`sm`/`md`/`lg`.
  Gradien dua-warna dihapus — primary jadi warna datar. Sudut `rounded-lg` →
  `rounded`, jarak ikon 2 → 1.5.
- `Input`/`Select`: `h-10` → `h-8`, padding & sudut dirapatkan, memakai
  `bg-surface` (dari 17a) agar sadar tema tanpa pasangan `dark:` manual.
- `Label`: `text-sm` → `text-xs`, margin dirapatkan.
- `Card`: bayangan dihapus (sudah jadi garis lewat `--shadow-card` di 17a);
  efek `hover` tidak lagi mengangkat kartu, hanya menegaskan garis.
- `CardHeader`/`CardBody`: padding `px-5 py-4` → `px-3 py-2.5` / `px-3 py-3`;
  judul `text-base` → `text-sm`. **`title` & `description` kini `ReactNode`**
  agar bisa memuat lencana, bukan hanya teks polos.
- `Alert`: tambah tone **`warning`**. Sebelumnya hanya ada info/success/error,
  sehingga peringatan "belum fatal" terpaksa memakai merah dan terbaca lebih
  gawat daripada semestinya.
- `Badge`: `rounded-full` → `rounded`, lebih rapat.
- **`Table` + `Thead`/`Tr`/`Th`/`Td` baru.** Sebelumnya komponen ini tidak ada
  sama sekali: `<table>` ditulis tangan **31 kali** dengan dua gaya bersaing —
  header `pb-2 pr-4` (61×) vs `py-2 pr-3` (20×), dan garis baris
  `border-slate-100` (53×) vs `border-slate-200` (51×). `Td numeric` memakai
  utilitas `num` dari 17a (mono + `tabular-nums`) supaya kolom rupiah
  benar-benar berbaris.

Kelas `animate-pulse` pada `Skeleton` **dipertahankan** — dipakai asersi
"dashboard tanpa skeleton tersisa". Begitu pula `role="tablist"` pada `Tabs`.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | **244** unit test lolos (naik dari 238: +6 uji `cx`) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | 210 cek lolos (tetap) |

Jumlah cek `ui-sim` **tidak turun**; kenaikan fase ini ada di unit test, karena
di situlah perbaikannya benar-benar bisa dibuktikan.

## Catatan: `Table` belum dipakai

Komponen `Table` baru **belum** menggantikan 31 tabel tangan — itu pekerjaan
17g+, satu modul per PR, supaya tiap migrasi bisa diperiksa terpisah. Fase ini
hanya menyediakan alatnya.

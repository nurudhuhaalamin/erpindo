# Fase 18b — Primitif lapang (`ui.tsx`)

Sub-fase kedua arah "bersih & lapang". Sasaran: `apps/web/src/components/ui.tsx`
— diimpor **47 dari 61** berkas frontend, jadi perubahannya langsung berlaku ke
seluruh aplikasi.

Setelah 18a, aplikasi **sudah terang tetapi belum lapang**: kerapatannya masih
milik Fase 17b (tombol `h-8`, teks `text-[13px]`, sudut tegas, bantalan kartu
rapat). Fase ini yang mengubahnya.

## Yang dikerjakan

| Komponen | Dari (17b) | Menjadi (18b) |
| --- | --- | --- |
| `Button` bawaan | `h-8 px-3` | **`h-9 px-4`** |
| `Button` `lg` | `h-10 px-5` | **`h-11 px-6 text-[15px]`** |
| `Button` `sm` / `xs` | `h-7` / `h-6` | **`h-8` / `h-7`** |
| Sudut tombol | `rounded` | **`rounded-lg`** |
| `Input`/`Select` | `h-8 rounded px-2.5` | **`h-9 rounded-lg px-3`** |
| `Label` | `text-xs`, `mb-1` | **`text-sm`**, `mb-1.5` |
| `CardHeader` | `px-3 py-2.5`, judul `text-sm` | **`px-4 py-3.5 sm:px-5`**, judul **`text-base`** |
| `CardBody` | `px-3 py-3` | **`px-4 py-4 sm:px-5`** |
| `Th` / `Td` | `px-2 py-1.5` | **`px-3 py-2.5`** |
| `Alert` | `rounded px-3 py-2` | **`rounded-lg px-3.5 py-2.5`** |
| `Badge` | `rounded px-1.5 text-[11px]` | **`rounded-full px-2 text-xs`** |

Selain ukuran:

- **`Card` memakai bayangan lagi** lewat token `--shadow-card` yang sudah
  diganti di 18a. Efek `hover` berpindah dari "menegaskan garis" menjadi
  mengangkat bayangan — sesuai gaya lapang.
- **Cincin fokus dipertegas**: `focus-visible:ring-offset-1` → `ring-offset-2`.
  Ini soal aksesibilitas, bukan gaya: dengan sudut yang lebih membulat, offset
  1px membuat cincin fokus nyaris menempel dan sulit terlihat.
- `Button` primary/secondary/danger mendapat `shadow-sm` supaya terasa bisa
  ditekan; `ghost` sengaja tidak.
- Ukuran `sm` naik ke `h-8` karena **itu tinggi minimum yang masih nyaman
  disentuh**; `xs` (`h-7`) disisakan khusus untuk tombol di dalam sel tabel,
  tempat ruangnya memang sempit dan aksinya sekunder.

**Yang sengaja dipertahankan**: `cx()` + `twMerge`, `animate-pulse` pada
`Skeleton`, `role="tablist"` pada `Tabs`, utilitas `num`, dan `PageHeading`
tetap Fragment (29 pemakaian bergantung padanya sebagai anak langsung
`space-y-6`).

## `Thead` kehilangan `uppercase` — dan itu disengaja

Kepala tabel dulu memakai `uppercase`. Itu **dihapus permanen**, bukan karena
selera, melainkan karena `text-transform` **ikut mengubah nilai `innerText`**.
Pada Fase 17d hal itu memecah asersi `F15`: kode mencari `"Most popular"`
sementara halaman melaporkan `"MOST POPULAR"` — bug yang mahal dicari karena
kodenya terlihat benar dan hanya CSS yang berubah.

Aturannya sekarang tertulis sebagai komentar di komponennya **dan** dijaga cek.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **225** cek lolos (naik dari 223) |

Dua cek baru, keduanya **mengukur hasil render, bukan kelas yang menempel**:

- **`F30`** — kepala tabel tidak memakai `text-transform`
  (`getComputedStyle(th).textTransform === "none"`). Penjaga permanen atas
  pelajaran 17d; akan berbunyi kalau `uppercase` dikembalikan kelak.
- **`F31`** — tombol bawaan ter-render **tepat 36px** (`h-9`). Memeriksa kelas
  saja tidak cukup: sampai Fase 17b, **96 dari 98** penimpaan tinggi tombol ada
  di DOM tetapi kalah oleh urutan CSS. Yang diukur di sini tinggi nyatanya.

## Diperiksa dengan mata

`UI_SIM_SHOT` dijalankan dan gambarnya dilihat. Dasbor dan halaman Stok
sekarang benar-benar terbaca lapang: kartu KPI punya ruang napas, judul kartu
lebih besar, baris tabel tidak lagi berdempetan — sementara kolom rupiah tetap
berbaris lurus karena utilitas `num` dipertahankan.

## Catatan: tombol dalam sel tabel masih tertutup tombol asisten

Pada halaman Stok, tombol "Kartu" di kolom terakhir sebagian tertutup tombol
melayang asisten AI di pojok kanan bawah. Ini **bukan akibat fase ini** —
sudah terlihat sejak 17g. Diperbaiki saat halaman Stok digarap ulang di 18d
(pola tabel responsif), karena di sanalah tata letak kolom aksi ditinjau.

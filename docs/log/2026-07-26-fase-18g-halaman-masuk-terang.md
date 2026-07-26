# Fase 18g — Halaman masuk & daftar ikut terang-lapang

Sub-fase ketujuh. Berkas kecil (`apps/web/src/pages/auth.tsx`, 427 baris)
tetapi **paling berbahaya disentuh** di seluruh repo.

## Kenapa berkas ini berisiko tinggi

`/masuk` adalah **gerbang seluruh suite uji**. Setiap cek F0–F29 melewati form
ini lebih dulu. Mengganti `id` atau tombol kirimnya tidak menghasilkan satu
kegagalan yang jelas — ia mematikan **200-an asersi sekaligus** dengan pesan
timeout yang tidak menyebut sebabnya.

Sejak 17f kontraknya sudah dijaga cek eksplisit **`F23`** (`#email`,
`#password`, `button[type=submit]` diperiksa **sebelum** dipakai), jadi
perombakan gaya kali ini berjalan di atas jaring yang sudah terpasang.

## Masalah yang terlihat setelah 18a–18f

Panel kiri masih memakai bidang pekat `bg-slate-950` dari 17f — peninggalan
arah "alat pro gelap". Setelah seluruh aplikasi jadi terang, hasilnya:
**slab hitam di sebelah form putih**, terbaca seperti dua halaman berbeda yang
ditempel. Chip putih di balik logo pun kembali menonjol.

Ini hanya ketahuan dari **melihat** tangkapan layar `/masuk` — tidak ada asersi
yang bisa menyatakan "dua bagian halaman ini tidak terasa satu keluarga".

## Yang dikerjakan

- Panel kiri: `bg-slate-950` → **`bg-brand-50`** bernuansa merek yang lembut,
  teks jadi gelap, kisi tipis diwarnai `text-brand-600` agar menyatu.
  Mode gelap tetap dipertahankan lewat pasangan `dark:`.
- Judul panel `text-xl` → `text-2xl`; daftar nilai jual `text-[13px]` →
  `text-sm` dengan jarak baris lebih lega dan pembatas bernuansa merek.
- Baris penutup: `font-mono text-[11px]` → `text-xs` biasa. Mono adalah bahasa
  visual arah "alat pro" yang sudah ditinggalkan; di sini ia justru terbaca
  seperti sisa dari desain lama.
- Kartu form `max-w-sm` → `max-w-md`, judul `text-lg` → `text-xl`, bantalan
  naik — mengikuti primitif lapang 18b.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**, bukan penyaringan
keluaran — pelajaran dari koreksi di 18f.

| Gerbang | Status keluar |
| --- | --- |
| `pnpm typecheck` | 0 |
| `pnpm lint` | 0 |
| `pnpm test` | 0 — 244 unit test lolos |
| `pnpm build` | 0 |
| `pnpm smoke` | 0 — 863 cek |
| `node scripts/ui-sim.mjs` | 0 — **231** cek |

Tidak ada cek baru, dan itu disengaja: kontrak halaman ini **sudah** dijaga
`F23`, dan bahwa seluruh 231 cek tetap lolos **adalah** buktinya — kalau
`#email` / `#password` / `button[type=submit]` rusak, tak satu pun dari 231 cek
itu bisa jalan.

## Catatan jujur: chip logo belum sepenuhnya hilang

Pada Fase 18a saya menulis bahwa chip putih di balik `BrandWordmark`
"melebur dengan latar" di tema terang. Itu benar **di atas putih** — tetapi
panel `/masuk` sekarang bernuansa biru muda (`brand-50`), dan di atasnya chip
itu **masih sedikit terlihat** sebagai kotak putih.

Bukan masalah besar, tapi lebih baik dikatakan daripada dibiarkan terbaca
seolah sudah tuntas. Perbaikan sebenarnya tetap sama: wordmark SVG yang bisa
diwarnai. Itu menyentuh identitas merek, jadi menunggu keputusan pemilik.

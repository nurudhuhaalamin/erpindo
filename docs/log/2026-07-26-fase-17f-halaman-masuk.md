# Fase 17f — Halaman masuk & daftar (`auth.tsx`)

Sub-fase keenam perombakan desain. Berkas kecil (427 baris) tetapi **paling
berbahaya disentuh** di seluruh repo.

## Kenapa berkas ini berisiko tinggi

`/masuk` adalah **gerbang seluruh suite uji**. Setiap cek F0–F22 melewati form
ini lebih dulu; `scripts/ui-sim.mjs` melakukan:

```js
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
await page.click("button[type=submit]");
```

Mengganti `id` atau tombol kirimnya tidak menghasilkan satu kegagalan yang
jelas — ia mematikan **200-an asersi sekaligus** dengan pesan timeout yang tidak
menyebut sebabnya sama sekali.

Karena itu dua hal dikerjakan lebih dulu, sebelum sebaris gaya diubah:

1. Kontraknya ditulis sebagai komentar tepat di atas `AuthLayout`, menyebut
   ketiga selektor dan akibat mengubahnya.
2. Ditambahkan cek **`F23`** yang memeriksa ketiganya **secara eksplisit dan
   lebih dulu**, sebelum dipakai. Tanpa itu kegagalan hanya berupa timeout
   `page.fill("#email")`; dengan itu, laporan uji langsung menyebut
   `→ email=0 password=1 submit=1`.

## Yang dikerjakan

- **Panel kiri tidak lagi bergradien.** Dulu `bg-gradient-to-br from-brand-700
  via-brand-800 to-brand-950` — pola yang sama persis dengan ribuan halaman
  masuk SaaS. Sekarang bidang pekat datar (`bg-slate-950`) + **kisi garis tipis
  yang sama seperti hero landing**, sehingga halaman masuk terasa satu keluarga
  dengan aplikasi dan halaman depannya.
- Daftar nilai jual: dari kartu berjarak lebar menjadi **daftar berpembatas
  garis** (`divide-y`), teks `text-sm` → `text-[13px]`.
- Baris penutup memakai `font-mono` — detail kecil yang menegaskan rasa "alat".
- Kartu form: `max-w-md` → `max-w-sm`, judul `text-xl` → `text-lg`, jarak antar
  bidang `space-y-4` → `space-y-3`.
- Tombol Google: `h-10 rounded-lg text-sm` → `h-8 rounded text-[13px]`, mengikuti
  primitif 17b.

## Koreksi klaim yang sudah lama tertinggal

Panel kiri memuat klaim **"890+ uji otomatis menjaga setiap rilis"**. Angka itu
sudah lama tidak benar. Hitungan nyata hari ini:

| Lapisan | Jumlah |
| --- | ---: |
| Smoke (end-to-end) | 861 |
| Unit test | 244 |
| Simulasi UI (Chromium nyata) | 221 |
| **Total** | **1.326** |

Diperbarui menjadi **"1.300+"**. Sudah diperiksa bahwa angka ini tidak dibaca
asersi mana pun, jadi mengubahnya aman — dan membiarkan klaim yang meremehkan
produk sendiri sama tidak jujurnya dengan melebih-lebihkan.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **221** cek lolos (naik dari 220) |

Bahwa seluruh 221 cek lolos **adalah** buktinya: kalau kontrak `#email` /
`#password` / `button[type=submit]` rusak, tak satu pun dari 221 cek itu bisa
jalan.

Diperiksa juga dengan mata (`UI_SIM_SHOT` kini ikut merekam `/masuk`, setelah
membuang cookie — tanpa itu `/masuk` mengalihkan ke `/app` dan yang terekam
halaman yang salah).

## Yang tidak dikerjakan

`auth.tsx` masih **sepenuhnya berbahasa Indonesia hardcoded** — 40 potong teks,
tidak berubah sebelum maupun sesudah fase ini (diverifikasi dengan menyapu versi
lama dan baru). Menerjemahkannya adalah pekerjaan program i18n (Fase 16), bukan
perombakan desain; dicatat supaya tidak terlihat seolah sudah tergarap.

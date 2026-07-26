# Fase 18a — Token desain & tema terang-dulu

Sub-fase pertama arah desain baru: **"bersih & lapang", terang-dulu**.

## Kenapa arahnya berubah

Fase 17 membangun arah **"alat pro padat" yang gelap-dulu**. Setelah melihat
hasilnya, pemilik memutuskan arah lain: modern & kekinian, bersih dan lapang,
dengan **tema putih sebagai bawaan**. Rinciannya ada di rencana Fase 18.

Yang perlu dikatakan terus terang: **sebagian besar pekerjaan Fase 17 tidak
terbuang.** Justru karena 17a memusatkan seluruh token di satu berkas, membalik
arah desain sebesar ini hanya menyentuh **lima berkas** dan tidak satu pun dari
36 berkas halaman (~24.500 baris).

| Hasil Fase 17 | Nasib |
| --- | --- |
| `styles.css` — token terpusat (1.753 titik `slate-*`) | Nilainya diganti; mekanismenyalah yang membuat pivot ini murah |
| `cx()` + `tailwind-merge` (bug 96 penimpaan mati) | **Tetap** — perbaikan bug, bukan gaya |
| `Table`/`Th`/`Td` + utilitas `num` | **Tetap** |
| Palet perintah ⌘K, topbar & sidebar melekat | **Tetap** |
| `screenshots.mjs` yang mati sejak Fase 13b | **Tetap diperbaiki** |
| Cek `F20`–`F25` | **Tetap**; `F20a` dibalik arahnya |
| Kerapatan ekstrem (`h-8`, sudut tegas) | Inilah yang diganti — dikerjakan di 18b |

## Yang dikerjakan

**`apps/web/src/styles.css`** — satu berkas, efek ke seluruh aplikasi:

- Ramp `--color-slate-*` dipetakan ulang ke **neutral "kertas"**: abu netral
  bersih, ujung terangnya nyaris putih (`#fafafa`) supaya kartu putih di atas
  latar terbaca sebagai lapisan, bukan kotak abu-abu. Ujung gelapnya tetap
  pekat — mode gelap masih didukung penuh, hanya bukan bawaan lagi.
- `--color-brand-*` disetel ulang **untuk latar putih**. Nilai 600/700 dipakai
  sebagai teks & tombol, jadi keduanya wajib berkontras cukup di atas putih.
- `--radius-card` **0.375rem → 0.75rem**: sudut membulat lembut, tapi tidak
  sebesar 1rem yang membuat tabel di dalamnya terlihat seperti gelembung.
- `--shadow-card` dari garis 1px menjadi **bayangan halus berlapis**: satu
  garis rambut untuk tepi + dua bayangan ambient sangat tipis. Yang dicari
  kesan "melayang sedikit di atas kertas", bukan bayangan tebal.
- `color-scheme` dibalik: `:root` terang, `:root.dark` gelap.

**`apps/web/public/theme-init.js`** — `var gelap = false`. Yang berubah hanya
**nilai bawaannya**; preferensi pengguna yang sudah tersimpan tetap dihormati
dan tombol ganti tema tidak berubah perilakunya.

**Tiga tempat warna yang tidak saling tertaut** disamakan manual seperti pada
17a, hanya arahnya dibalik: `vite.config.ts` (`background_color` `#fafafa`,
`theme_color` `#ffffff`), meta `theme-color` di `index.html`, dan token di
`styles.css`.

## Gambar produk ikut dibalik — dan itu memang bagian dari fase ini

Rencana menaruh regenerasi tangkapan layar di **18h**. Setelah melihat hasil
18a, itu keliru: landing sudah putih sementara **gambar produk di dalamnya
masih gelap** dari 17e — kontras yang langsung terlihat salah, bukan sekadar
kurang rapi. Gambar produk adalah bagian dari "tema", bukan pelengkap.

Jadi manifes `landing` & `panduan` di `scripts/screenshots.mjs` dibalik ke
`theme: "light"` dan **33 gambar diregenerasi** di fase ini juga.

18h tetap ada di rencana: setelah 18b (primitif lapang) dan 18e (landing
ditulis ulang), gambar-gambar ini **diregenerasi sekali lagi** supaya
mencerminkan tampilan final. Menjalankan skripnya hanya butuh beberapa menit —
jauh lebih murah daripada memajang gambar yang salah warna selama beberapa
sub-fase.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **223** cek lolos (tetap) |

**`F20a` dibalik, bukan dihapus.** Yang diuji tetap hal yang sama — apakah
skrip anti-FOUC memasang tema **sebelum** React jalan — hanya arahnya diputar:
`data-theme-init === "light"`, kelas `.dark` **tidak** terpasang,
`color-scheme` terang, dan latar `<body>` benar-benar terang (jumlah RGB > 600,
kebalikan dari ambang gelap < 160). Jumlah cek tidak turun.

Penanda `data-theme-init` tetap jadi kunci: tanpa itu asersi akan lolos secara
hampa dari efek React yang berjalan belakangan.

## Diperiksa dengan mata

Dijalankan `UI_SIM_SHOT` lalu gambarnya dilihat satu per satu. Dua hal yang
memang hanya bisa dinilai begitu:

1. **Chip putih di balik logo kini melebur dengan latar.** Masalah yang
   menggantung sejak 17a — logo PNG dibungkus `bg-white` supaya terbaca di tema
   gelap, dan pada desain gelap terlihat seperti tambalan — hilang dengan
   sendirinya di tema terang.
2. Ketidakcocokan gambar gelap di landing putih (dijelaskan di atas) hanya
   ketahuan dari melihat, bukan dari asersi mana pun.

## Yang belum dikerjakan di fase ini

Kerapatan masih milik Fase 17b — tombol `h-8`, teks `text-[13px]`, bantalan
kartu rapat. Aplikasi hari ini **sudah terang tetapi belum lapang**. Itu
pekerjaan **18b**, yang menyentuh `ui.tsx` (diimpor 47 dari 61 berkas).

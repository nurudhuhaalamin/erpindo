# Fase 17a — Fondasi token & tema gelap-dulu

Sub-fase pertama perombakan total desain (Fase 17). Arah yang dipilih pemilik:
**"alat pro padat"** — rapat, gelap-dulu, informasi padat, cepat. Pemakainya
staf akunting dan kasir yang menatap layar berjam-jam; kerapatan dan kecepatan
baca angka lebih berharga daripada kartu berbayang lembut.

## Mekanisme: satu berkas 51 baris mengubah 1753 titik

Halaman-halaman ERPindo menulis warna secara **literal** — ada **1753
pemakaian `slate-*`** tersebar di 36 berkas halaman (~24.500 baris). Menyunting
semuanya satu per satu mustahil dilakukan aman.

Di Tailwind v4 seluruh token hidup di `apps/web/src/styles.css` (dulu 51 baris,
tanpa `tailwind.config.js`). Karena itu ramp `slate` **dipetakan ulang di
sana**, bukan diganti di halaman:

| Kelas | Jumlah pemakaian | Cara ditangani |
| --- | ---: | --- |
| `slate-*` | 1753 | ramp dipetakan ulang di `@theme` — berubah serentak |
| `brand-*` | 364 | ramp dipetakan ulang (dulu **persis** palet blue Tailwind) |
| `dark:` | 1072 | ikut berubah karena memakai ramp yang sama |

Yang **sengaja tidak** dipetakan ulang: `--color-white`. Kelas `text-white`
(37×) dipakai untuk teks di atas tombol — memetakannya akan mengubah warna
teks, bukan permukaan.

## Koreksi rencana: sapuan `bg-white` ternyata tidak perlu

Rencana awal menyebut "sapu `bg-white` (68×) ke utilitas permukaan baru".
Setelah diperiksa satu per satu, langkah itu **dibatalkan** karena justru
merusak:

| Kelompok | Jumlah | Alasan |
| --- | ---: | --- |
| Sudah berpasangan `dark:bg-slate-*` | 55 | sudah sadar tema — tidak ada bug |
| Overlay `bg-white/5` dsb. | 7 | lapisan putih transparan, bukan permukaan |
| Dokumen cetak (`print.tsx`) | 4 | **wajib** putih; faktur tidak dicetak berlatar gelap |
| Latar logo | 2 | disengaja (lihat catatan logo di bawah) |

Jadi tidak ada satu pun `bg-white` yang benar-benar perlu disapu. Utilitas
`bg-surface` / `bg-surface-sunken` / `num` tetap ditambahkan karena akan
dipakai primitif baru pada 17b.

## Dua kegagalan CI yang mengajarkan sesuatu

### 1. Skrip anti-FOUC inline ditolak CSP → 45 asersi gagal sekaligus

Skrip anti-FOUC ditulis inline di `index.html`. Peramban menolaknya:

```
Refused to execute inline script because it violates the following
Content Security Policy directive: "script-src 'self'"
```

CSP itu **sengaja dikeraskan pada Fase 10h**. Melonggarkannya menjadi
`'unsafe-inline'` demi kosmetik jelas bukan pertukaran yang sepadan — jadi
skripnya dipindah ke `apps/web/public/theme-init.js` (same-origin, memenuhi
`'self'`, tanpa perlu mengelola hash).

Efeknya persis seperti yang diperkirakan di rencana: **satu `console.error`
baru dari shell menggagalkan 45 asersi sapuan rute sekaligus**.

### 2. Font mono ter-inline sebagai `data:` URI → gagal lagi

Setelah CSP skrip beres, muncul kegagalan kedua dengan bentuk sama:

```
Refused to load the font 'data:font/woff2;base64,…' because it violates
the following Content Security Policy directive: "font-src 'self'"
```

Vite meng-inline aset di bawah 4 KB, dan sebagian subset JetBrains Mono lolos
di bawah ambang itu. Sekali lagi pilihannya: longgarkan CSP, atau tahan inline.
Dipilih menahan inline lewat `assetsInlineLimit` yang menolak berkas font —
**keamanan tidak ditukar demi kenyamanan build**.

### 3. Asersi yang lolos secara hampa

Versi pertama cek `F20a` memeriksa kelas `.dark` + `color-scheme`. Cek itu
**lolos padahal skrip anti-FOUC-nya tidak pernah jalan** — yang lolos adalah
efek React yang berjalan belakangan. Persis jebakan Fase 16g.

Perbaikannya: `theme-init.js` memasang penanda `data-theme-init`, dan asersi
menuntut penanda itu. Tanpa skrip berjalan, penanda tidak ada dan cek gagal.

## Yang dikerjakan

- `apps/web/src/styles.css` — ramp `slate` & `brand` baru, `accent` jadi oranye
  hangat, `--radius-card` 1rem → **0.375rem**, `--shadow-card` diganti **garis
  1px** (kartu dipisahkan batas, bukan kedalaman), `--font-mono` baru, utilitas
  `bg-surface` / `bg-surface-sunken` / `num`, dan `color-scheme` gelap-dulu.
- `apps/web/public/theme-init.js` (baru) — anti-FOUC; sebelumnya **tidak ada
  sama sekali**, jadi pemakai tema gelap melihat kilatan putih tiap muat.
- `apps/web/index.html` — muat `theme-init.js` sinkron, `theme-color` gelap.
- `apps/web/vite.config.ts` — `theme_color`/`background_color` manifest PWA
  disamakan (dulu tiga tempat berbeda tak tertaut), plus `assetsInlineLimit`.
- `apps/web/src/components/ui.tsx` — `useDarkMode` tidak lagi menyentuh
  `document` **saat render** (tidak aman untuk React 19); dipindah ke
  `useEffect`, nilai awal dibaca dari kelas yang sudah dipasang anti-FOUC
  sehingga state React dan DOM tak pernah berselisih.
- `@fontsource-variable/jetbrains-mono` ditambahkan. Aplikasi akuntansi ini
  memakai `tabular-nums` **217 kali** tetapi belum pernah punya font mono.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 238 unit test lolos |
| `pnpm build` | ok — tidak ada `data:font` tersisa di CSS |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **210** cek lolos (naik dari 209) |

Cek baru `F20a` menguji anti-FOUC lewat penanda `data-theme-init`, bukan lewat
kelas `.dark` yang juga dipasang React.

## Catatan terbuka: logo menghalangi gelap-dulu

`BrandWordmark` memakai PNG dengan **chip putih paksa** (`bg-white`) supaya
terbaca di tema gelap. Setelah melihat berkasnya, alasannya jelas: kata "indo"
dan tagline "Integrate. Automate. Grow." berwarna gelap, jadi akan hilang di
latar gelap.

Pada desain gelap-dulu, chip putih itu akan tampak seperti tambalan. Solusinya
wordmark SVG yang bisa diwarnai — tetapi itu menyentuh **identitas merek**,
jadi tidak diputuskan sepihak di sini. Diangkat sebagai pertanyaan ke pemilik.

# Fase 17e — Regenerasi 33 tangkapan layar produk

Sub-fase kelima perombakan desain. Ke-33 gambar produk (6 di landing, 27 di
panduan) masih memajang tampilan **sebelum** Fase 17a: terang, kartu membulat,
berbayang lembut. Gambar-gambar ini ter-commit dan dilihat calon pelanggan.

## Temuan utama: skripnya sendiri sudah rusak sejak Fase 13b

Riwayat git menunjukkan gambar terakhir disentuh pada **Fase 10a**. Awalnya itu
terlihat seperti kelalaian; ternyata bukan — `scripts/screenshots.mjs` memang
**tidak bisa dijalankan** sejak Fase 13b:

```
Anda masih memiliki perusahaan dalam masa trial. Aktifkan langganannya dulu
sebelum menambah perusahaan baru (satu perusahaan trial per akun).
```

Fase 13b menambahkan pagar anti-abuse "satu perusahaan trial per akun"
(`apps/api/src/routes/auth.ts`). Skrip ini mendaftar akun lalu meminta
`seed-demo.mjs` membuat perusahaan **kedua** (PT Demo Sejahtera) — dan ditolak
pagar itu. `ui-sim.mjs` kebal karena melewatkan `--var COMPED_EMAILS:<email>`
ke `wrangler dev`; `screenshots.mjs` terlewat.

Perbaikannya satu baris. Yang mahal bukan perbaikannya, melainkan **belasan fase
memakai skrip yang tak seorang pun tahu sudah mati** — tidak ada yang menjalankan
CI atasnya, dan tidak ada asersi yang menyentuh isinya.

## Dua cacat lagi yang hanya ketahuan dari MELIHAT hasilnya

Setelah skrip jalan, hasil putaran pertama tetap tidak layak pakai. Keduanya
lolos tanpa satu pun galat:

1. **Seluruh aplikasi ter-render berbahasa Inggris.** "Good evening, Dewi",
   "Sales This Month", "TRANSACTIONS". Sebabnya `newContext()` tidak menyetel
   `locale`, jadi Chromium memakai `en-US` dan i18n (Fase 13e) mengikutinya.
   Gambar produk berbahasa Inggris di halaman jualan berbahasa Indonesia.
   `ui-sim.mjs` sudah menyetel `locale: "id-ID"` sejak lama; skrip ini terlewat
   — pola yang sama persis dengan bug `COMPED_EMAILS` di atas.
2. **Tur onboarding menutupi kartu KPI** tepat di tengah tangkapan hero.
   Tur dasbor (Fase 10f) muncul otomatis sekali untuk pengguna baru. `ui-sim`
   menandainya "sudah dilihat" lewat `addInitScript`; skrip ini, lagi-lagi,
   terlewat.

Ketiga cacat ini punya bentuk yang sama: **`ui-sim.mjs` sudah memecahkannya,
`screenshots.mjs` tidak pernah ikut diperbarui.** Keduanya menyalakan
`wrangler dev` dan login lewat Playwright, tetapi tumbuh terpisah.

## Yang dikerjakan

- `scripts/screenshots.mjs`: tambah `--var COMPED_EMAILS`, `locale: "id-ID"`,
  dan penanda tur "sudah dilihat". Ketiganya diberi komentar yang menyebut
  sebabnya, supaya tidak dihapus orang lain kelak.
- Manifes `landing` & `panduan`: `theme: "light"` → **`"dark"`**. Aplikasi dan
  landing sudah gelap-dulu sejak 17a; gambar terang di halaman gelap terbaca
  seperti tambalan. Manifes lain (set ops sekali-pakai yang menulis ke direktori
  sementara, tidak ter-commit) sengaja dibiarkan — mengubahnya hanya churn.
- **33 gambar diregenerasi**: 6 landing (572 KB) + 27 panduan (3,0 MB).

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **220** cek lolos (naik dari 219) |

Cek baru **`F22`**: gambar hero landing benar-benar termuat (`naturalWidth`
> 800). Cek ini **tidak** bisa tahu gambarnya basi — itu tidak terjangkau asersi
— tetapi menangkap kegagalan paling kasarnya (berkas hilang atau rusak).
Diperiksa dengan mata sebelum di-commit; itulah lapisan yang benar-benar
menangkap ketiga cacat di atas.

## Catatan jujur: bukan semua sudah ideal

**Kartu "Laba Bulan Ini" pada hero menampilkan angka merah (rugi).** Itu berasal
dari data semaian demo, bukan dari perombakan ini — dasbor lama tidak punya
kartu laba, jadi baru sekarang terlihat. Memperbaikinya berarti mengubah data
semaian, yang juga dipakai 861 cek smoke dan seluruh `ui-sim`. Di luar lingkup
17e dan berisiko; dicatat di sini supaya pemilik bisa memutuskan, bukan
diam-diam dibiarkan.

**`screenshots.mjs` masih tidak dijalankan CI.** Perbaikan hari ini
mengembalikannya, tetapi tidak ada yang menjaganya tetap hidup. Skrip ini akan
mati diam-diam lagi begitu ada pagar baru di alur registrasi. Menyatukannya
dengan `ui-sim.mjs` (keduanya menyalakan `wrangler dev` + login Playwright)
adalah perbaikan yang benar, tetapi itu pekerjaan tersendiri — bukan bagian dari
perombakan desain.

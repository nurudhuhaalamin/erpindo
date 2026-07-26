# Fase 17c — Kerangka aplikasi melekat + palet perintah ⌘K

Sub-fase ketiga perombakan desain. Sasaran: `apps/web/src/pages/app.tsx`
(772 baris) — **satu-satunya layout route**, sehingga perubahannya otomatis
berlaku ke 47 halaman `/app`.

## Risiko yang diukur dulu, sebelum menulis kode

`scripts/ui-sim.mjs` mengunci **struktur** navigasi, bukan hanya teks. Sebelas
asersi bergantung pada hitungan elemen di dalam `<nav>`:

```
page.locator("aside nav a:visible").count()        → F13 (navBefore - navSimple === 4), F14
page.locator("aside nav button:visible")           → dianggap HANYA header seksi
navLinks() = a:visible difilter hasNotText "Panduan"
```

Artinya: menambahkan **satu** `<a>` atau `<button>` ke dalam `<nav>` memecah
kesebelasnya sekaligus, dan pesan galatnya hanya berupa angka yang tidak cocok
— tidak menyebutkan sebabnya. Karena itu palet dirancang sejak awal dengan dua
aturan: **pemicunya di topbar**, **panelnya di akar shell** (di luar
`<aside>`). Keduanya ditulis sebagai komentar di berkasnya supaya tidak
"diperbaiki" orang lain kelak.

## Yang dikerjakan

### Palet perintah (`apps/web/src/components/palet.tsx`, baru)

- ⌘K / Ctrl+K membuka; pintasan **diabaikan saat fokus ada di kolom isian**
  supaya tidak merebut pengetikan pengguna.
- Daftar isinya memakai `navItems` yang **sudah tersaring izin peran dan Mode
  Sederhana** — palet tidak boleh jadi jalan pintas ke halaman yang menunya
  sengaja disembunyikan.
- Label sudah diterjemahkan oleh shell lewat `navLabel()`, seksi lewat
  `SECTION_EN` — palet sendiri tidak menyentuh kamus.
- Panah atas/bawah, Enter, Escape, klik latar untuk menutup.

### Kerangka aplikasi (`app.tsx`)

- **Topbar melekat** (`sticky top-0 z-30`, tinggi tetap `h-12`). Sebelumnya
  ikut mengalir, jadi pada tabel panjang tombol tema/keluar hilang dari
  jangkauan.
- **Sidebar melekat** (`sticky top-0 h-dvh self-start`), lebar `w-60` → `w-56`.
  `self-start` wajib: tanpa itu `<aside>` meregang setinggi konten (perilaku
  `stretch` bawaan flex) sehingga `sticky` tak punya ruang gerak dan terlihat
  seolah tidak berfungsi.
- Kerapatan menu: baris nav `px-3 py-2 text-sm` → `px-2.5 py-1.5 text-[13px]`,
  jarak antarbaris `gap-0.5` → `gap-px`, header seksi `text-[11px]` →
  `text-[10px]` dengan `tracking` lebih lebar, kotak cari `h-8`, wordmark
  `h-10` → `h-8`, padding `main` `p-4 sm:p-6` → `p-3 sm:p-4`.
- Penimpaan `className="h-9"` pada tombol Keluar **dihapus** — sejak `twMerge`
  masuk di 17b, bawaan `h-8` sudah berlaku dan penimpaan itu hanya kebisingan.

## Dua bug yang ketahuan dari MELIHAT, bukan dari asersi

### 1. Sorotan palet melompat ke baris di bawah kursor

Asersi F20b/F20c hijau semua, tapi tangkapan layar menunjukkan sorotan ada di
**"Manufaktur"**, bukan baris pertama. Sebabnya `onMouseEnter`: peristiwa itu
juga terpicu ketika daftar **muncul di bawah kursor yang diam**. Jadi membuka
palet lewat ⌘K memindahkan sorotan ke baris mana pun yang kebetulan berada di
posisi tetikus terakhir — lalu Enter membawa pengguna ke halaman yang tidak ia
pilih. Diganti `onMouseMove`, yang hanya terpicu oleh gerakan nyata.

Ini alasan `UI_SIM_SHOT` ditambahkan (lihat di bawah): perombakan desain tidak
bisa divalidasi oleh asersi saja.

### 2. Positif palsu di `sapu-i18n.mjs` untuk `className` berkondisi

Saringan Tailwind pada penyapu menuntut **seluruh** string hanya berisi
karakter kelas. Template literal seperti

```
`flex gap-2 ${aktif ? "bg-brand-600" : "text-slate-400"}`
```

gagal syarat itu (ada `$`, `{`, `?`, tanda kutip) lalu dilaporkan sebagai utang
teks layar. Bentuk ini akan muncul di hampir tiap berkas yang dirombak Fase 17,
jadi penyapu sekarang memecah isi template menjadi **potongan statis** (dengan
pencocokan kurung, agar interpolasi bersarang ikut terbuang) dan menilai tiap
potongan sendiri-sendiri.

Efeknya pada angka: total utang tersapu turun **765 → 761** — keempatnya
positif palsu, bukan perbaikan terjemahan. Disebut terang-terangan supaya
angkanya tidak dibaca sebagai kemajuan i18n.

## Alat baru: `UI_SIM_SHOT`

`node scripts/ui-sim.mjs` kini bisa dijalankan dengan `UI_SIM_SHOT=<dir>` untuk
merekam beberapa halaman kunci **di akhir suite**. Bukan cek — tidak menambah
hitungan.

Dipasang di `ui-sim`, bukan di `screenshots.mjs`, karena di sinilah sesi sudah
masuk dan datanya sudah tersemai penuh; set `audit` pada `screenshots.mjs`
menyemai ulang dan tertahan batas "satu perusahaan trial per akun".

Catatan pemakaian: harus memakai `page` yang sudah ada, bukan `ctx.newPage()`
— ada penjaga `ctx.on("page", …)` yang menutup setiap halaman selain `page`.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **218** cek lolos (naik dari 210) |
| `node scripts/sapu-i18n.mjs …/palet.tsx` | `BERSIH ✅ LAYAR=0` |

Cek baru fase ini (8): `F20b` × 6 (buka lewat ⌘K, sorotan baris pertama,
penyaringan + Enter menavigasi, tertutup setelah navigasi, tombol topbar,
Escape tanpa pindah halaman, bebas galat) dan `F20c` × 1 (penjaga hitungan
`<nav>`).

### Asersi diuji supaya bisa gagal

Dua jebakan "lolos hampa" ditutup sengaja:

- **Sorotan baris pertama**: kursor lebih dulu digerakkan ke tengah area daftar
  (`page.mouse.move(680, 470)`) baru palet dibuka lewat papan ketik. Tanpa itu
  kursor ada di sidebar, di luar panel, dan bug-nya tak akan pernah kambuh.
  Dibuktikan dengan mengembalikan `onMouseEnter` sementara: **217/218, cek ini
  yang gagal**. Setelah `onMouseMove` dipulihkan: 218/218.
- **Escape menutup palet**: keadaan "sudah terbuka" ikut dimasukkan ke dalam
  asersi. Kalau paletnya tak pernah terbuka, asersi "sudah tertutup + URL
  tetap" akan lolos tanpa menguji apa pun.

## Yang tidak dikerjakan, dan alasannya

**Mode rail (sidebar menciut jadi ikon) dibatalkan.** Rencana menyebutkannya,
tetapi menciutkan sidebar berarti menyembunyikan tautan nav — persis besaran
yang dihitung sebelas asersi F13/F14. Manfaatnya juga sudah banyak tertutup
oleh palet: kebutuhan "lompat ke mana saja dengan cepat" kini terjawab tanpa
mengorbankan menu yang terlihat. Ditunda, bukan dilupakan.

## Catatan terbuka yang makin terasa

Pada tangkapan layar tema gelap, **chip putih di balik `BrandWordmark` terlihat
jelas seperti tambalan** di pojok kiri atas — persis yang diperkirakan waktu
17a. Logonya PNG dengan tulisan "indo" dan tagline berwarna gelap, jadi tidak
bisa sekadar dilepas chip-nya. Perlu wordmark SVG yang bisa diwarnai. Menyentuh
identitas merek, jadi tetap menunggu keputusan pemilik.

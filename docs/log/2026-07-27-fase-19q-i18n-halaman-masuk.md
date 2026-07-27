# Fase 19q — i18n halaman masuk/daftar + hapus kamus mati

## Yang dikerjakan

`apps/web/src/pages/auth.tsx` berisi **tujuh layar publik** — masuk, daftar,
langkah perusahaan setelah masuk via Google, verifikasi email, lupa password,
atur ulang password, dan undangan tim. Seluruhnya satu bahasa sampai hari ini.

- **40 → 3** temuan sapuan layar. Tiga sisanya adalah nilai parameter URL
  (`gagal-tukar-token`, `tidak-diizinkan`, `belum-dikonfigurasi`) yang diset
  callback server; menerjemahkannya akan memutus pencocokan pesan Google.
- **44 entri kamus baru**, semuanya berawalan `auth`.
- `AUTH_BENEFITS` dan `GOOGLE_MESSAGES` kini menyimpan **kunci kamus**, bukan
  teks — `satisfies UiKey[]` dan `satisfies Record<string, UiKey>` membuat
  salah ketik gagal saat kompilasi (pola 19d).

### Tombol bahasa di halaman masuk

Sampai fase ini halaman auth adalah **satu-satunya layar publik tanpa tombol
bahasa**: landing punya, `/fitur` punya, aplikasi punya. Pengunjung yang tiba
langsung di `/masuk` — dari tautan undangan, tautan verifikasi email, atau
penanda halaman — tidak punya cara mengganti bahasa sama sekali. Menerjemahkan
teksnya tanpa memberi tombolnya berarti terjemahan itu hanya bisa dicapai
lewat jalan memutar. `LangSwitcher` yang sudah ada dipasang di `AuthLayout`.

### Awalan `auth` bukan sekadar rapi

Kamus sudah punya kunci `masuk` — artinya **stok MASUK** (`en: "In"`), bukan
sign-in. Memakainya untuk tombol masuk akan menghasilkan tombol bertuliskan
"In". Ini kejadian keenam dari pelajaran 16u ("nama kunci yang cocok belum
tentu makna yang cocok"). Hanya `email` yang benar-benar dipakai ulang.

## Kamus mati yang dihapus

Saat memeriksa `auth.tsx` ditemukan hal yang lebih besar daripada halamannya:

`apps/web/src/i18n/index.ts` memuat `DICT` — 17 entri, sembilan di antaranya
kunci auth siap pakai (`authMasukJudul`, `authDaftarJudul`, `authPerusahaan`,
`authPunyaAkun`, `authLupaPassword`, …) — dan hook `useT()` untuk membacanya.
**`useT()` tidak pernah dipanggil satu berkas pun.** Terjemahan halaman auth
ditulis pada Fase 13d, lalu tidak pernah tersambung ke halamannya, dan
tinggal di sana tiga belas fase.

Ini bukan sekadar kode mati; ia **menyesatkan**. Siapa pun yang membuka berkas
i18n akan melihat kunci auth lengkap dengan terjemahan Inggrisnya dan wajar
menyimpulkan halaman masuk sudah dwibahasa. Karena itu `DICT`, `TKey`, dan
`useT()` dihapus, diganti komentar yang menerangkan apa yang terjadi.
`pick()` dan `useLang()` tetap — keduanya dipakai landing lewat `sections.ts`.

### Penjaganya dipindahkan ke kamus yang hidup

`apps/web/test/i18n.test.ts` punya uji "setiap entri kamus punya kedua bahasa
terisi" — dan uji itu **menjaga `DICT`**. Jadi selama ini penjaga kelengkapan
mengawasi kamus 17 entri yang mati, sementara kamus yang benar-benar dipakai
(`UI`, kini 1.207 entri) tidak dijaga sama sekali.

Ujinya tidak dihapus melainkan **dipindahkan ke `UI`**, dan diperketat: bukan
hanya panjang > 0 tetapi juga bukan spasi kosong, plus penjaga jumlah entri
minimum agar uji tidak diam-diam menjadi hampa bila `UI` suatu saat kosong.
`satisfies Record<string, Dual>` sudah menjamin kedua kolom **ada** saat
kompilasi; yang belum dijamin adalah keduanya **terisi** — `en: ""` lolos tsc
tetapi membuat layar kosong saat bahasa Inggris dipilih.

## Validasi

Semua gerbang dinilai dari **status keluar**.

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **249** |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **863** |
| `node scripts/ui-sim.mjs` | 0 | **251** (dari 249) |

Dua cek ui-sim baru:

- **`F1q`** — halaman masuk punya pemilih bahasa (`role=group` bernama
  "Bahasa"). Diperiksa terpisah dari isinya supaya kegagalan terbaca sebagai
  "tombolnya hilang", bukan sebagai batas waktu klik yang membingungkan.
- **`F1r`** — setelah menekan EN, `/masuk` memuat "Welcome back", pengantar,
  tagline panel kiri, dan "Forgot your password?", serta **tidak** memuat
  padanan Indonesianya. Bahasa disetel ke ID lebih dulu secara eksplisit lalu
  dipastikan halaman memang berbahasa Indonesia — tanpa itu cek akan lulus
  bahkan bila tombolnya tidak berfungsi.

Keduanya diletakkan **paling akhir** dalam suite dengan sengaja. Halaman auth
hanya bisa dilihat tanpa sesi (dengan sesi hidup `/masuk` mengalihkan ke
`/app`), sementara seluruh suite di atasnya bergantung pada sesi yang sudah
masuk. Menaruhnya di awal berarti menyentuh gerbang `#email`/`#password` yang
menopang 200-an asersi lain — persis yang dilarang komentar kontrak di
`auth.tsx`.

### Pemeriksaan mata

Enam tangkapan layar diperiksa langsung: `/masuk`, `/daftar`, dan
`/lupa-password`, masing-masing dalam EN dan ID. Tata letak identik di kedua
bahasa; tidak ada teks yang terpotong meski kalimat Inggrisnya lebih panjang.
Blok tangkapan sementara sudah dihapus lagi dari `ui-sim.mjs`.

## Sisa program i18n

| Berkas | Layar | Catatan |
| --- | ---: | --- |
| `app.tsx` | 64 | Sebagian besar positif palsu (menu lewat tabel-lookup). Yang nyata: spanduk verifikasi email dan tombol "Keluar". |
| `admin.tsx` | 49 | Internal, hanya admin platform. |
| `print.tsx` | 36 | **Di luar lingkup** atas keputusan pemilik. |
| sisanya | ±105 | Tersebar di halaman yang sudah dikerjakan; sebagian sudah diketahui disengaja. Diperiksa satu per satu di sub-fase penutup. |

Berikutnya: **19r `admin`**, lalu **19s** ekor `app.tsx` + `src/components/` +
mengajari `sapu-i18n.mjs` pola tabel-lookup.

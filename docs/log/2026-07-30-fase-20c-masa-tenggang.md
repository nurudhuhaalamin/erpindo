# Fase 20c — Masa tenggang 3 hari

Menutup sisa terakhir butir roadmap "Dunning otomatis". Keputusan pemilik:
**3 hari**.

## Yang berubah

Sebelum ini, begitu trial/langganan lewat jatuh tempo, cron langsung
menurunkan status ke `past_due` dan akun **seketika** jadi baca-saja.
Sekarang ada jeda: selama 3 hari statusnya tidak disentuh, jadi seluruh
penegakan tulis yang sudah ada **otomatis tetap mengizinkan** — tidak ada
lapis izin baru yang perlu ditulis, dan itu memang inti rancangannya.

Rangkaian emailnya jadi utuh:

| Saat | Email |
| --- | --- |
| H-7, H-1 | Pengingat sebelum jatuh tempo (Fase 20a) |
| **H+0** | **Baru** — "masa tenggang dimulai, Anda MASIH bisa mencatat" |
| H+3 | Transisi ke baca-saja (email lama, kini bergeser 3 hari) |
| **H+6** | Susulan "masih baca-saja" — digeser dari H+3 |

Susulan digeser dari `dunningWindow(-3)` ke `dunningWindow(-(GRACE_DAYS + 3))`.
Tanpa itu, susulannya tiba di **hari yang sama** dengan email transisi — dua
email sekaligus, keduanya terasa mendadak.

Email H+0 adalah yang paling menentukan: pemiliknya masih punya jalan keluar,
dan hanya di titik itu nada "belum terlambat" masih jujur.

## Satu angka, tiga sisi

`GRACE_DAYS` diletakkan di `packages/shared/src/core.ts` karena dibaca **tiga**
sisi: cron (menurunkan status), web (spanduk), dan uji. Sisi API mengekspornya
ulang lewat `lib/dunning.ts` supaya pemanggil lama tak berubah.

Rumusnya tetap ditulis dua kali — web tidak bisa mengimpor kode Worker — jadi
`apps/web/src/lib/tenggang.ts` adalah salinan tipis. **Duplikasi itulah
risikonya**: bila satu sisi bergeser, spanduk akan berkata "masih bisa
mencatat" padahal server sudah menolak. Karena itu uji sisi web memakai
**ekspektasi yang sama persis** dengan uji sisi API — pergeseran sebelah
membuat salah satunya merah.

## Spanduk sengaja dibedakan warnanya

Spanduk tenggang **oranye**, bukan merah. Merah sudah dipakai `past_due` yang
artinya benar-benar terkunci. Menyamakan keduanya membuat pemilik mengira
sudah terlambat padahal justru sedang di jendela yang masih bisa diselamatkan
— kebalikan dari tujuan fitur ini.

## Asersi smoke diubah — dengan sengaja

`TRIAL_DAYS_OVERRIDE` diubah dari `0` ke `-4`.

Dengan nilai `0`, trial habis tepat saat tenant dibuat — dan setelah masa
tenggang diperkenalkan, tenant itu **masih di dalam tenggang**, jadi cron tidak
menurunkannya dan belasan asersi baca-saja akan merah. Nilai `-4` membuat
trial-nya benar-benar habis 4 hari lalu, yakni sudah lewat tenggang.

Ini **bukan pelonggaran asersi**: yang diuji tetap perilaku baca-saja yang
sama persis (tulis ditolak 402, baca 200, ekspor tetap jalan). Yang berubah
hanya umur fixture-nya. Perubahan disengaja, dan alasannya ditulis di
`smoke.mjs` supaya pembaca berikutnya tidak mengira ini kompromi.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **268** (dari 259) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **863** |
| `node scripts/ui-sim.mjs` | 0 | **254** |
| `sapu-i18n` | — | atribut **0**, layar 102 (semua terklasifikasi) |

Sembilan uji baru: lima di sisi API (batas tenggang, hari terakhir masih
boleh, tepat setelah habis sudah tidak, sebelum jatuh tempo belum masuk,
susulan H+6 tak bertabrakan dengan transisi H+3) dan empat di sisi web.

**Uji menangkap kesalahan saya sendiri.** Asersi pertama untuk jendela H+6
saya tulis dengan "5,5 hari lalu masuk" — salah: jendela `-(3+3)` mencakup
rentang 6–7 hari lalu, bukan 5,5. Kodenya benar, ekspektasi saya yang keliru,
dan uji itulah yang menangkapnya. Nilai yang benar (6,5) kini ada di berkas
uji beserta catatan ini.

## Yang TIDAK terverifikasi

**Spanduk tenggang tidak pernah dirender** dalam ui-sim. Akun simulasi punya
trial 30 hari (Kopi Nusantara) atau berstatus comped (PT Demo Sejahtera) —
tak satu pun berada di jendela tenggang, dan memaksakannya berarti mengubah
fixture yang menopang 200-an asersi lain.

Yang benar-benar diukur: logikanya (sembilan uji, dua sisi) dan kompilasinya.
Tampilan spanduknya sendiri belum pernah dilihat mata maupun asersi —
dinyatakan di sini supaya tidak ada yang mengira sebaliknya.

## Butir roadmap "Dunning otomatis" — TUNTAS

H-7 ✅ · H-1 ✅ · H+3 ✅ · masa tenggang ✅

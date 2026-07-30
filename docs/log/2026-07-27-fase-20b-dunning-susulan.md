# Fase 20b — Dunning susulan H+3

Melengkapi rangkaian yang diminta roadmap (H-7 / H-1 / **H+3**). 20a
mengerjakan dua tonggak maju; ini tonggak mundurnya — satu susulan untuk
tenant yang **sudah** dalam mode baca-saja.

## Yang dikerjakan

Blok baru `2b` di cron: tenant `past_due` yang jatuh tempo 3 hari lalu
menerima satu email susulan.

**Tanpa kolom basis data baru.** Blok 1/1b hanya mengubah `status`, jadi
`trial_ends_at`/`subscription_ends_at` tetap menyimpan tanggal jatuhnya —
cukup dibaca ulang. `dunningWindow(-3)` memberi jendela `[H-4, H-3]` ke
belakang memakai **aritmetika yang sama persis** dengan tonggak maju; tidak
ada rumus kedua yang harus ikut benar.

## Kenapa hanya SATU susulan

Roadmap menulis "rangkaian pengingat", dan godaannya adalah membuat rentetan
H+3, H+7, H+14. Sengaja tidak.

Akun `past_due` **sudah menampilkan spanduk merah setiap kali dibuka** —
pemiliknya tahu. Email berulang bukan mengingatkan, melainkan mengganggu, dan
itu cara tercepat masuk folder spam. Bila itu terjadi, yang ikut tenggelam
adalah pengingat **H-7/H-1** — pengingat yang justru masih bisa mencegah
akunnya terputus. Menambah susulan berisiko merusak bagian yang paling
berharga dari fitur ini.

Nada emailnya juga sengaja bukan tagihan: menegaskan data tetap aman, bisa
dibaca, dan **bisa diekspor** — karena itu memang benar, dan pelanggan yang
sedang menimbang berhenti berhak tahu datanya tidak disandera.

Marker KV-nya berumur 30 hari (bukan 4 seperti tonggak maju) supaya susulan
benar-benar sekali per siklus, bukan setiap kali jendelanya tersentuh.

## Koreksi sebelum merge

Saat memeriksa ulang kode yang baru saya tulis, kueri H+3 sempat mengambil
kolom `habis_pada` lewat `CASE WHEN trial_ends_at IS NOT NULL …`. Dua hal
salah sekaligus:

1. Tenant yang dulu trial lalu berbayar punya **kedua** kolom terisi, jadi
   ekspresi itu mengembalikan tanggal trial yang sudah basi — bukan tanggal
   langganannya.
2. Kolom itu **tidak dipakai sama sekali** di emailnya.

Klausa `WHERE`-nya sendiri benar (mencocokkan salah satu kolom di dalam
jendela), jadi tidak ada tenant yang salah dikirimi. Tetapi kolom yang tak
terpakai **dan** salah arti adalah ranjau bagi pembaca berikutnya — orang
yang kelak memakainya akan mendapat tanggal yang salah tanpa peringatan
apa pun. Dihapus, dengan komentar yang menerangkan sebabnya.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **259** (dari 258) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **863** |
| `node scripts/ui-sim.mjs` | 0 | **254** |

Uji baru menjaga jendela mundurnya: yang jatuh **3,5 hari lalu** masuk; yang
baru jatuh **kemarin** belum; yang jatuh **10 hari lalu** sudah lewat. Ketiganya
penting — tanpa batas bawah, susulan terkirim tiap hari selamanya.

## Sisa butir roadmap "Dunning otomatis"

Rangkaian pengingatnya **tuntas** (H-7, H-1, H+3). Yang tersisa dari butir itu
hanya **masa tenggang sebelum read-only**, dan itu tetap menunggu keputusan
pemilik: ia mengubah kapan pelanggan kehilangan akses tulis — keputusan bisnis,
bukan teknis. Alasan lengkapnya di log 20a.

# Fase 20a — Dunning: pengingat sebelum akun jadi baca-saja

Butir roadmap: *"Dunning otomatis — rangkaian pengingat gagal bayar/berakhir
(H-7/H-1/H+3) + masa tenggang sebelum read-only"*. Sub-fase ini mengerjakan
**rangkaian pengingatnya**; masa tenggang sengaja dipisah (alasannya di bawah).

## Celah yang ditemukan

Sebelum ini cron punya tiga blok langganan:

1. Trial habis → `past_due` + email.
2. Langganan berbayar habis → `past_due` + email.
3. Pengingat trial akan berakhir ≤3 hari — **hanya untuk trial**.

Yang ketiga itu masalahnya. `subscription_ends_at` hanya muncul **dua kali**
di seluruh `index.ts`: di kueri yang menurunkan status dan di UPDATE-nya.
Artinya:

> **Pelanggan yang MEMBAYAR tidak diperingatkan sama sekali.** Langganannya
> habis, akunnya mendadak baca-saja, dan email pertama yang mereka terima
> adalah pemberitahuan bahwa itu sudah terjadi.

Yang gratis diperingatkan; yang membayar tidak. Kebalikan dari yang masuk akal.

## Yang dikerjakan

Blok 3 diganti **rangkaian dua tonggak (H-7 dan H-1) untuk KEDUA jenis** —
trial dan berbayar. Tiap tonggak dikirim sekali per tenant dengan marker KV
terpisah per tonggak, supaya pengingat H-1 tetap terkirim walaupun H-7 sudah
lewat (marker tunggal yang lama justru memblokir pengingat kedua).

Isi emailnya menyesuaikan jenis: "Masa trial …" vs "Langganan …", dan
ajakannya "Aktifkan" vs "Perpanjang". Keduanya menegaskan data tetap aman,
bisa dilihat, dan bisa diekspor — karena itu memang benar (ekspor penuh tetap
jalan saat `past_due`, dijaga cek smoke sejak Fase 8b).

Aritmetika jendela dipindah ke `apps/api/src/lib/dunning.ts` supaya bisa diuji.

## Kenapa masa tenggang TIDAK ikut dikerjakan

Masa tenggang mengubah **kapan pelanggan kehilangan akses tulis** — itu
keputusan bisnis, bukan teknis, dan konsekuensinya nyata: penerimaan tertunda
beberapa hari untuk setiap pelanggan yang telat bayar. Ia juga mengubah asersi
smoke yang sudah ada (`status tenant menjadi past_due setelah cron`), yang
memang benar menjaga perilaku hari ini.

Menambahkannya diam-diam bersama pengingat akan menyelundupkan perubahan
kebijakan di balik pekerjaan yang tampak teknis. Jadi dipisah, dan pemilik
yang memutuskan berapa hari — atau tidak sama sekali.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **258** (dari 252) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **863** |
| `node scripts/ui-sim.mjs` | 0 | **254** |

Enam uji unit baru di `apps/api/test/dunning.test.ts`. Yang diuji adalah
**batas jendelanya**, bukan pengiriman emailnya — dan itu disengaja:

> Kalau batas jendela salah, pengingat **tidak pernah terkirim**, dan
> kegagalannya **senyap**. Tidak ada galat, tidak ada log merah; yang ada
> hanya pelanggan yang mendadak kehilangan akses tanpa peringatan.

Yang dijaga: kedua tonggak ada dan berurutan; jendelanya tidak tumpang-tindih;
H-1 menangkap yang habis 12 jam lagi tapi bukan yang masih 3 hari; H-7
sebaliknya; yang sudah lewat tidak masuk jendela mana pun (itu urusan blok
kedaluwarsa); dan **trial 3 hari tetap dapat H-1 walau tak pernah melewati
H-7** — perilaku yang benar, dan justru jenis kasus yang mudah rusak diam-diam.

Smoke tetap 863: perubahan ini menambah jalur baru yang tak tersentuh fixture
smoke (semua tenant smoke dibuat `TRIAL_DAYS_OVERRIDE=0`, jadi sudah lewat
dan tak pernah masuk jendela H-7/H-1). Menyetel ulang fixture demi menyentuhnya
akan mengubah belasan asersi siklus langganan yang sudah mapan — imbalannya
tidak sepadan, dan uji unit sudah menutup bagian yang berisiko.

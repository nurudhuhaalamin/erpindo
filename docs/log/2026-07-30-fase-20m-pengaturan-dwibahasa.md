# Fase 20m — Halaman Pengaturan dwibahasa & gerbang diperlebar

Menutup lubang yang ditemukan saat mengerjakan 20k: **enam berkas
`apps/web/src/pages/settings/` tidak pernah masuk program dwibahasa Fase 19.**

## Sebabnya: glob gerbang tidak turun ke subfolder

CI menjalankan penyapu dengan `apps/web/src/pages/*.tsx`. Pola itu **tidak**
mencakup subfolder, jadi `pages/settings/`, `pages/landing/`, dan
`pages/panduan/` tak pernah terhitung sekali pun.

```
apps/web/src/pages/settings  → 219 utang teks layar, 33 atribut
```

Lima dari enam berkasnya tidak memanggil `useUi()` sama sekali. Ini **kelima
kalinya** klaim cakupan i18n saya ternyata tidak lengkap, dan sebabnya selalu
sama: membaca daftar, bukan menjalankan alat pada seluruh sasarannya.

## Gerbangnya dulu, isinya kemudian

Urutan ini disengaja. Menerjemahkan lebih dulu berarti angkanya turun tanpa ada
yang menjamin ia tak naik lagi diam-diam.

`.github/workflows/ci.yml` kini memakai `shopt -s globstar` dan
`apps/web/src/pages/**/*.tsx`.

**Dibuktikan bisa merah, dan dibuktikan lebih baik dari yang lama.** Satu bug
`{u("simpan")}` di dalam template literal disisipkan ke `settings/data.tsx`:

| Glob | Hasil |
| --- | --- |
| lama (`pages/*.tsx`) | `EXIT=0` — tidak melihat apa pun |
| baru (`pages/**/*.tsx`) | `EXIT=1` + menyebut berkas & barisnya |

## Penyapu diajari mengenali peta label berpasangan

`AUDIT_ACTION_LABELS` berisi **117 pasangan kode→label**. Memindahkannya ke
kamus utama akan menambah 117 kunci untuk data yang bentuknya memang peta, bukan
kalimat layar. Solusinya tabel Inggris berdampingan (`_EN`) + `labelAudit()`.

Tetapi tabel berdampingan hanya aman selama keduanya bergerak bersama. Karena
itu penyapu diajari aturan baru: `const X = {…}` yang punya pasangan
`const X_EN = {…}` dianggap sah — **dan kunci yang ada di sisi Indonesia tetapi
hilang di sisi Inggris dilaporkan sebagai BUG (exit 1)**, bukan sekadar utang.

Dibuktikan: menghapus satu baris `"auth.login": "Sign-in"` membuat gerbangnya
merah dengan menyebut kunci yang hilang. Ada pula unit test yang menjaga hal
sama dari sisi kode.

Tanpa aturan ini, 117 positif palsu permanen akan menutupi utang nyata
selamanya — persis mekanisme yang membuat fase ini harus ada.

## Hasil per berkas

| Berkas | Sebelum | Sesudah | Sisa |
| --- | ---: | ---: | --- |
| `settings/account.tsx` | 26 | **0** | — |
| `settings/team.tsx` | 40 | **0** | — |
| `settings/integrations.tsx` | 39 | **1** | potongan kode |
| `settings/company.tsx` | 43 | **3** | potongan kode & `data-testid` |
| `settings/data.tsx` | 99 | **5** | potongan kode |
| `settings/index.tsx` | 7 | **2** | literal tipe |
| `landing/index.tsx` | 6/7 | **4/0** | istilah Inggris di data seksi |
| `panduan/index.tsx` | 7/2 | **7/0** | lihat di bawah |

Label izin modul (`PERMISSIONS` di `packages/shared`) dipetakan kode→kunci kamus
di sisi web, mengikuti pola Fase 16t — paketnya tetap berbahasa Indonesia karena
`apps/api` ikut memakainya.

## Yang sengaja TIDAK diterjemahkan: teks layar halaman Panduan

Atribut aksesibilitasnya diperbaiki (utang atribut wajib 0), tetapi teks
terlihatnya dibiarkan berbahasa Indonesia.

Alasannya: **isi panduannya sendiri** (`pages/panduan/content/`) hanya ada dalam
bahasa Indonesia. Kerangka berbahasa Inggris yang membungkus artikel berbahasa
Indonesia lebih membingungkan daripada halaman yang konsisten satu bahasa — ia
menjanjikan sesuatu yang tidak ada di dalamnya. Menerjemahkan isinya adalah
pekerjaan tersendiri, bukan pekerjaan fase ini.

Dinyatakan di sini supaya menjadi utang yang **tercatat**, bukan yang
tersembunyi.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **319** (dari 315) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **928** (tetap) |
| `node scripts/ui-sim.mjs` | 0 | **281** (dari 279) |
| `node scripts/sapu-i18n.mjs` (glob **baru**) | 0 | utang atribut **0** |

Angka utang teks layar pada glob baru: **162** — bukan turunan dari 105, karena
cakupannya berbeda. Membandingkannya dengan angka lama akan menyesatkan; yang
sebanding hanyalah per berkas, seperti tabel di atas.

Cek ui-sim baru **`F2d`** (× 2), **dibuktikan bisa gagal**: satu judul kartu
dikembalikan ke teks Indonesia harfiah dan ceknya langsung merah
(`280/281 — tanpaID=false`).

Empat unit test baru (`apps/web/test/audit-labels.test.ts`) menjaga kedua tabel
label audit tetap sekunci, termasuk bahwa aksi tak dikenal tampil apa adanya —
bukan menjadi `undefined` di layar yang justru dipakai orang untuk mencari
kejadian tidak biasa.

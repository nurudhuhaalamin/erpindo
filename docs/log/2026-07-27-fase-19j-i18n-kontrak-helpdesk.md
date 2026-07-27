# Fase 19j — Kontrak Berulang & Helpdesk dwibahasa

| Berkas | Teks layar | Toast |
| --- | --- | --- |
| `contracts.tsx` | **18 → 2** | 6 → 0 |
| `helpdesk.tsx` | **17 → 3** | 1 → 0 |

Sisanya positif palsu: potongan kode yang tertangkap regex dan nilai `id`
elemen (`tk-status`). **±35 entri kamus baru.**

`STATUS_LABEL` kontrak (berjalan/jeda/berakhir) dipindahkan ke peta kunci
ber-`satisfies`, pola yang sama dengan QC di 19h dan status persetujuan di 19i.

## Koreksi: saya mengulang kesalahan yang baru saja saya catat

Log 19i mencatat dua kecerobohan penggantian massal, salah satunya
**penggantian bertanda kurung yang merusak keseimbangan**:

```
LEGACY_STATUS_LABEL[  →  u(LEGACY_STATUS_KEY[      // menambah "(" tanpa ")"
```

Di fase ini saya **melakukannya lagi**, persis sama bentuknya:

```
STATUS_LABEL[  →  u(STATUS_KEY[
→ {u(STATUS_KEY[contract.status]}     // galat sintaks
```

Mencatat pelajaran ternyata tidak cukup untuk tidak mengulanginya. Yang
benar-benar mencegah adalah **berhenti memakai polanya**: penggantian yang
menambah tanda kurung pembuka tanpa penutupnya tidak boleh dilakukan sebagai
penggantian substring — pemanggilannya harus ditulis utuh berikut penutupnya.

Dua artefak lain di fase yang sama, keduanya dari sebab serupa:

- **`{u(...)}` masuk ke template literal lagi** (`helpdesk.tsx:268`) —
  ditangkap `sapu-i18n`, bukan `tsc`/ESLint. Kejadian kedua setelah 19h.
- **Teks yang terpotong dua baris.** `Buat\n  Kontrak` hanya tergantikan
  bagian pertamanya, menyisakan baris `Kontrak` yang menggantung — sah secara
  sintaks, dan hanya terlihat saat membaca hasilnya.

Ketiganya sepele dan tertangkap sebelum ter-commit. Yang perlu dicatat bukan
kerusakannya, melainkan bahwa **tiga sub-fase berturut-turut menghasilkan
artefak dari metode yang sama** — dan bahwa alat yang menangkapnya berbeda-beda
setiap kali.

## Cek baru `F1j`

Satu cek untuk dua rute (`/app/kontrak`, `/app/helpdesk`), rutenya diverifikasi
ke `audit-routes.mjs` lebih dulu. Penandanya judul kartu daftar di masing-masing
halaman — dirender tanpa syarat data.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **246** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **243** cek lolos (naik dari 242) |
| `node scripts/sapu-i18n.mjs` | keduanya bersih dari utang nyata; toast **7 → 0** |

## Sisa program i18n

10 berkas, ±299 teks. Berikutnya **19k — `attendance` + `dimensi` + `budget`**
(65). `attendance` sekalian memindahkan `<h1>`-nya ke `PAGE_HEADINGS` — yang
**terakhir** dari empat berkas yang salah saya hitung di 19f.

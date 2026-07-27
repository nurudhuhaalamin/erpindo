# Fase 19g — Pesanan Penjualan dwibahasa

Sasaran `apps/web/src/pages/salesorders.tsx` — alur SO → surat jalan → faktur.

**28 → 7 temuan**, dan ketujuh sisanya **berada di dalam `printDeliveryNote()`**
— string HTML surat jalan yang dibuka di jendela cetak. Sesuai keputusan pemilik
di awal Fase 19, **dokumen cetak tetap berbahasa Indonesia**, jadi ketujuhnya
memang di luar lingkup, bukan sisa yang terlewat.

Ini berkas yang sama yang di Fase 18p tabelnya dikecualikan permanen karena
alasan serupa — sekarang alasan itu berlaku lagi untuk teksnya.

## Judul halaman ke `PAGE_HEADINGS`

Seperti 19f: `<h1>` tulisan tangan diganti `<PageHeading k="pesananPenjualan" />`.

## Koreksi klaim di log 19f

Log 19f menyebut `procurement.tsx` **"satu-satunya"** halaman modul yang masih
memakai `<h1>` tulisan tangan. **Itu salah, dan saya menyimpulkannya tanpa
memeriksa.**

Penelusuran yang benar (`grep -l 'text-2xl font-bold tracking-tight'`) menemukan
**empat**:

| Berkas | Status |
| --- | --- |
| `procurement.tsx` | dibereskan 19f |
| `salesorders.tsx` | dibereskan di sini |
| `approvals.tsx` | menyusul |
| `attendance.tsx` | menyusul |

Log 19f sudah dikoreksi di tempatnya sebelum PR-nya ter-merge, dan deskripsi
PR #154 ikut diperbarui.

Bentuk kesalahannya sama persis dengan dua salah hitung tabel di Fase 18n/18p:
**menyimpulkan cakupan dari satu berkas yang kebetulan sedang dibuka, bukan dari
penelusuran.** Ini ketiga kalinya, jadi layak dijadikan kebiasaan: setiap klaim
"satu-satunya" atau "tinggal N" harus datang dari perintah pencarian yang
ditulis di log, bukan dari ingatan.

## Kunci kembar: dua-duanya dipakai ulang

Kali ini kedua tabrakan nama **memang duplikat sejati**, dan keduanya dibuang
demi kunci yang sudah ada:

| Kunci baru saya | Yang sudah ada | Keputusan |
| --- | --- | --- |
| `hargaSatuan` "Harga"/"Price" | "Harga satuan"/"Unit price" (Fase 16) | pakai yang lama — **lebih tepat** |
| `buatFaktur` "Buat faktur" | "Buat Faktur" (Fase 16) | pakai yang lama |

Yang kedua hanya berbeda kapitalisasi Indonesia, jadi tombolnya kini terbaca
"Buat Faktur". Perbedaan kosmetik itu lebih murah daripada dua kunci bermakna
sama di kamus yang sudah ±700 entri.

Berbeda dari 19f, di mana dari tiga tabrakan justru **dua** butuh kunci baru.
Tidak ada jalan pintas: isinya harus dibaca satu per satu.

## Cek baru `F1g`

Penandanya judul + pengantar halaman (kini dari `PAGE_HEADINGS`) dan judul kartu
daftar — semuanya dirender tanpa syarat data maupun peran.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **246** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **240** cek lolos (naik dari 239) |
| `node scripts/sapu-i18n.mjs` | `salesorders.tsx` **28 → 7** (seluruh sisanya dokumen cetak) |

## Sisa program i18n

15 berkas, ±447 teks. Berikutnya **19h — `manufacturing.tsx` + `maintenance.tsx`**
(84).

# Fase 20g — Picking multi-gudang

Satu baris faktur penjualan kini bisa mengambil stok dari **beberapa gudang
sekaligus**. Rencana Fase 20 menandai sub-fase ini sebagai **paling berisiko
terhadap akuntansi biaya rata-rata**, dan memang di situlah seluruh perhatian
diletakkan.

## Yang dikerjakan

- `stockOutMulti()` baru di `apps/api/src/lib/accounting.ts`.
- Bidang `picks` pada `commerceLineSchema` + aturan jumlahnya di
  `createInvoiceSchema` (`packages/shared/src/commerce.ts`).
- Percabangan di `apps/api/src/lib/commercePosting.ts`: baris tanpa `picks`
  berperilaku **persis seperti sebelumnya**.
- Panel picking per baris di `apps/web/src/pages/commerce.tsx` (hanya mode
  penjualan, hanya bila gudangnya lebih dari satu), dwibahasa sejak awal.

## HPP dijumlahkan per sumber, bukan dari satu rata-rata gabungan

Inilah alasan fitur ini berisiko. `avg_cost` disimpan **per (produk, gudang)**.
Mengambil 10 unit dari gudang berbiaya 1.000 dan 2 unit dari gudang berbiaya
3.000 harus menghasilkan HPP **16.000** — bukan 12 × rata-rata mana pun.

Yang membuatnya berbahaya: kalau salah, **totalnya tetap terlihat wajar**.
Faktur tetap seimbang, neraca saldo tetap seimbang, laporan tetap terbit.
Hanya angka HPP-nya yang keliru, dan tidak ada satu layar pun yang
menampilkannya sebagai kejanggalan.

Karena itu cek smoke-nya sengaja **tidak** menguji total faktur — ia membaca
**selisih saldo buku besar akun HPP** sebelum dan sesudah posting, dengan dua
gudang yang harga pokoknya sengaja dibedakan (1.000 vs 3.000).

## Validasi seluruh gudang dulu, baru kurangi

`stockOutMulti()` memeriksa ketersediaan di **semua** gudang sebelum satu pun
dikurangi. Tanpa itu, permintaan yang gagal di gudang kedua meninggalkan gudang
pertama sudah berkurang — stok hilang tanpa dokumen apa pun, dan D1 tidak
memberi transaksi untuk membatalkannya.

Diuji dari dua arah: unit test menegaskan `levels.gA.qty` **tidak berubah** dan
tabel mutasi **kosong** setelah penolakan; cek smoke menegaskan hal yang sama
lewat API sungguhan.

## Aturannya di SKEMA, bukan di route

Jumlah `picks` wajib sama persis dengan `qty` barisnya. Aturan itu diletakkan
di `createInvoiceSchema`, bukan di handler route, supaya **seluruh** pemanggil
tunduk padanya — termasuk API publik (`routes/publicApi.ts`) dan impor pesanan
marketplace, yang keduanya membangun faktur lewat skema yang sama.

Kalau jumlahnya tidak sama, stok yang keluar berbeda dari yang ditagihkan. Itu
selisih yang tidak akan pernah muncul di laporan mana pun.

## Koreksi: pemeriksaan mata menemukan lubang yang asersi lewatkan

Semua cek hijau, lalu tangkapan layar menunjukkan hal yang tidak masuk akal:
**baris picking kedua terisi gudang yang sama dengan baris pertama**, karena
isian bawaannya `warehouses[0]`.

Yang membuat ini bukan sekadar cacat kosmetik: `stockOutMulti()` memeriksa tiap
picking **secara terpisah terhadap keadaan sebelum perubahan**. Dua permintaan
3 unit ke gudang bersisa 4 karena itu **dua-duanya lolos** pemeriksaan awal,
lalu yang kedua gagal di tengah pengurangan — persis keadaan yang fungsi ini
dibuat untuk mencegah. Jaminan "validasi dulu, baru kurangi" bocor tepat pada
bentuk masukan yang layarnya sendiri sarankan.

Dua perbaikan:

1. `stockOutMulti()` **menjumlahkan permintaan per gudang** lebih dulu, jadi
   gudang yang sama disebut dua kali diperlakukan sebagai satu permintaan.
2. Baris picking baru di layar memilih gudang **yang belum terpakai**.

Keduanya dijadikan cek sendiri (dua unit test + `F7b`), karena asersi yang ada
saat itu hijau semua sementara cacatnya nyata.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **283** (dari 273) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **887** (dari 879) |
| `node scripts/ui-sim.mjs` | 0 | **263** (dari 257) |
| `node scripts/sapu-i18n.mjs` | 0 | utang atribut tetap **0** |

Delapan cek smoke (bagian `13y2`), delapan unit test baru (5 di
`apps/api/test/stockOutMulti.test.ts` + 3 di `packages/shared/test/schemas.test.ts`),
dan lima cek ui-sim (`F7b` × 4 + `F1y` untuk mode Inggris).

**Cek ui-sim dibuktikan bisa gagal.** Penjaga tombol posting
(`lines.some(pickingTimpang)`) dicabut sementara, dan `F7b` langsung merah
(`260/261 — disabled=false`). Setelah dikembalikan, hijau lagi. Tanpa langkah
ini cek tersebut hanya bukti bahwa halamannya ter-render.

**Pemeriksaan mata** dilakukan lewat `UI_SIM_SHOT`; blok tangkapan sementara
sudah dihapus lagi. Temuannya dicatat di bagian koreksi di atas.

## Yang sengaja tidak dikerjakan

- **Saran picking otomatis** (mengisi gudang menurut sisa stok). Menambah
  perilaku yang menebak, dan tebakannya baru bisa dinilai setelah pemilik
  memakai fitur ini pada data nyata.
- **Picking di POS.** Kasir bekerja pada satu gudang per shift; menambah
  pilihan gudang di sana memperlambat alur yang justru dioptimalkan untuk cepat.
- **Picking di Surat Jalan (SO→DO).** Alur itu sudah mengeluarkan stok lebih
  dulu (`skipStock`), jadi menambahkannya menuntut perombakan tersendiri —
  bukan penumpangan seperti di faktur langsung.

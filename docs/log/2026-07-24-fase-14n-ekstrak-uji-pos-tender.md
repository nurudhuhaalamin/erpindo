# Log Kerja — Fase 14n: Ekstrak & uji perhitungan uang POS

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Melanjutkan pola 14k–14m. Perhitungan uang di handler penjualan POS
(`routes/pos.ts`) — subtotal+diskon+PPN dan resolusi pembayaran multi-tender
(kembalian, nilai masuk pembukuan per metode) — tadinya inline & tak terjangkau
uji unit. Diekstrak jadi dua fungsi murni:

- **`computePosTotals(lines, taxRate)`** → `{ subtotal, taxAmount, total }`
  (diskon per baris dibulatkan sebelum dijumlahkan, lalu PPN).
- **`computePosTenders(total, tenders)`** → `{ error }` atau
  `{ change, cashApplied, nonCashApplied, applied }`. Kembalian **hanya dari
  tunai**; non-tunai (QRIS/kartu/e-wallet) masuk pembukuan persis; tunai =
  diserahkan − kembalian. Menolak kurang bayar & kembalian yang melebihi tunai.

Handler kini memanggil kedua fungsi; angka, urutan validasi, dan pesan error
**sama persis** dengan kode lama.

**`apps/api/test/posTenders.test.ts`** (9 uji): totals tanpa/dengan diskon+PPN
dan pembulatan per baris; tunai lebih bayar → kembalian; uang pas; kurang bayar →
error; **split QRIS+tunai** (kembalian dari tunai saja, non-tunai persis, total
pembukuan = total belanja); non-tunai pas; lebih bayar non-tunai tanpa tunai
penutup → error.

## Validasi

- **Unit 212 → 221** (+9): `apps/api` 110 → 119.
- **Smoke 850 (tetap)** — jalur route LULUS: "penjualan POS 2 pcs (201, total
  2.000)", "neraca saldo seimbang setelah refund POS", membuktikan ekstraksi
  behavior-preserving.
- typecheck 4/4 · lint bersih · build · ui-sim 184 (tak berubah).

## Catatan jujur

- **Temuan latent (tidak diubah di fase ini):** pada `applied`, `change`
  dikurangkan dari **tiap** baris tunai. Untuk kasus normal (satu tender tunai)
  hasilnya benar; namun bila satu transaksi memakai **>1 tender tunai**,
  kembalian akan terpotong berulang → pembukuan tunai kurang. UI kasir saat ini
  hanya mengirim satu entri tunai, jadi tak terpicu. Sengaja **tidak diperbaiki**
  di sini agar fase tetap behavior-preserving; dicatat sebagai kandidat perbaikan
  tersendiri (perlu keputusan: jumlahkan tunai lebih dulu, baru kurangi
  kembalian sekali). Uji tidak mengunci perilaku keliru ini.

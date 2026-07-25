# Fase 16l — Lunasi utang i18n halaman Penjualan & Pembelian

Sub-fase pertama yang melunasi utang yang ditemukan oleh audit Fase 16k.
Halaman sasaran: `apps/web/src/pages/commerce.tsx` — dipakai oleh dua rute
(`/app/penjualan` dan `/app/pembelian`) lewat `MODE_CFG`, dan menyandang utang
terbesar (61 temuan) meski Fase 16c menyatakannya "tuntas".

## Yang dikerjakan

- **30 entri kamus baru** di `apps/web/src/i18n/ui.ts` — dihitung langsung dari
  berkas: **410 → 440** (angka "412" di log 16k adalah taksiran dari pola grep
  yang sedikit berbeda; yang dipakai mulai sekarang adalah hitungan berkas).
- **26 titik teks** di `commerce.tsx` diganti ke `u("…")`.

Yang sebelumnya tertinggal berbahasa Indonesia, dikelompokkan menurut sebabnya:

| Bentuk | Contoh yang diperbaiki |
| --- | --- |
| Tombol biasa | `+ Tambah barang`, `Posting Faktur`, `Posting Retur`, `Terima Pembayaran`/`Bayar` |
| Lencana huruf kecil | `lunas`, `belum lunas` |
| `description` pada `EmptyState` | judulnya sudah dwibahasa sejak 16c, **deskripsinya belum** — dua kalimat |
| Label dengan sisipan | `Kurs (IDR/{mata uang})`, `Kurs saat bayar (IDR/{mata uang})`, `Jumlah ({mata uang})` |
| Opsi `<select>` | `— pilih kas/bank —`, `— tanpa refund tunai —` |
| `aria-label` | `Hapus baris {n}`, `Nomor lot baris {n}`, `Tanggal kedaluwarsa baris {n}`, `Qty retur {produk}` |
| Teks bantu | peringatan FEFO, `Faktur pada kurs … selisih kurs`, `Menampilkan {n} dari {total}` |
| `ConfirmDialog` | judul + deskripsi untuk **batalkan dokumen**, **ubah dokumen**, dan **hapus pembayaran** |

Deskripsi `ConfirmDialog` berisi `<strong>` di tengah kalimat, jadi tiap kalimat
dipecah menjadi beberapa kunci (`descUbahDokumen1`…`4`) agar penekanannya tetap
di tempat yang benar pada kedua bahasa — bukan dijahit dari potongan kata.

Satu jebakan halus: kunci `dari` yang sudah ada berisi `{ id: "Dari", en: "From" }`
(kapital, untuk label rentang tanggal). Memakainya pada `Menampilkan 5 dari 20`
akan menghasilkan **"Showing 5 From 20"**. Karena itu ditambah kunci terpisah
`dariTotal: { id: "dari", en: "of" }`.

## Perbaikan alat: klasifikasi positif-palsu

`scripts/sapu-i18n.mjs` (dipasang di 16k) masih melaporkan banyak temuan yang
bukan utang. Dua kelas terbesar kini dikenali:

1. **Isi panggilan `toast()` dan `downloadXlsx()`** — dulu ditebak dari konteks
   beberapa ratus karakter sebelumnya, sehingga panggilan yang memanjang
   beberapa baris salah dikelompokkan sebagai teks layar. Sekarang rentangnya
   dihitung dengan **mencocokkan kurung**, jadi tepat.
2. **Ternary dwibahasa yang sah** — `lang === "en" ? "…" : "…"`. Sisi
   Indonesianya memang harus ada; ditandai `SAH`, tidak lagi dihitung utang.

Efeknya pada angka: `assets.tsx` yang di 16k tercatat "4 sisa" ternyata
**benar-benar 0** — keempatnya potongan template toast. Ini menegaskan catatan
di log 16k bahwa ~297 adalah *batas atas*, bukan angka pasti.

Setelah perbaikan, sisa temuan `commerce.tsx` tinggal **22**, dan seluruhnya
sudah diperiksa satu per satu sebagai positif-palsu: potongan kode, id teknis
(`refund-acct`), jalur impor (`./stok`), string yang sudah memakai `u()`, dan
template toast.

## Batas lingkup yang disengaja

Dua hal sengaja **tidak** diterjemahkan:

- **Pesan `toast()`** — konsisten dengan 16b–16l; sifatnya sementara dan tidak
  termasuk permukaan yang diuji `ui-sim`.
- **Pesan tagihan WhatsApp** (`Halo {nama}, berikut tagihan faktur…`) — ini
  dikirim **kepada pelanggan**, bukan ditampilkan kepada pemakai aplikasi.
  Bahasa pelanggan tidak selalu sama dengan bahasa antarmuka operator, jadi
  mengikutkannya ke tombol bahasa justru berisiko mengirim pesan Inggris ke
  pelanggan Indonesia. Bila nanti diinginkan, itu pantas menjadi setelan
  tersendiri, bukan efek samping tombol bahasa.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 234 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **198** cek lolos (naik dari 197) |

Cek baru `F0n` menguji tepat teks yang baru diterjemahkan pada rute
`/app/penjualan` (`Add item`, `Post Invoice`), dengan penanda negatif murni
teks UI — bukan nama produk atau kontak yang berasal dari data pengguna.

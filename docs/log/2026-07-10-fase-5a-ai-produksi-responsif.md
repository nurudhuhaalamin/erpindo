# Log Kerja — Fase 5a: Diagnosa AI Produksi + Perbaikan Responsif + Matriks Visual

**Tanggal:** 10 Juli 2026 · **Temuan review pemilik #1 & #3:** beberapa halaman tidak responsif
(bukti: daftar Penjualan di HP berantakan); Asisten AI menjawab "belum aktif" di produksi.

## Asisten AI — diagnosa & perbaikan jalur error

1. `routes/ai.ts`: kegagalan panggilan model **tidak lagi bisu** — alasan asli dicatat ke log
   Worker (`console.error`) dan respons 503 kini membawa field `detail` tersanitasi
   (`binding-absent` / nama error model). Sebelumnya semua kegagalan tampak sama sehingga
   penyebab produksi tidak bisa dibedakan dari dev.
2. Perbaikan kuota: jatah harian (50/hari/perusahaan) kini **hanya terpotong bila model
   benar-benar menjawab** — sebelumnya panggilan gagal ikut memakan kuota.
3. **Probe produksi tanpa rahasia**: `scripts/ai-probe.mjs` + workflow `ai-probe.yml`
   (push ke branch `ops/ai-probe`) — mendaftarkan akun scratch acak di produksi, memanggil
   `/ai/chat`, mencetak status + `detail`. Dijalankan SETELAH fase ini terdeploy; hasilnya
   menentukan tindak lanjut (perbaikan config deploy, atau aktivasi Workers AI sekali klik
   oleh pemilik di dashboard Cloudflare).

## Responsif — perbaikan terarah (dari audit kode + matriks visual)

- **Akar bug Penjualan/Pembelian (HP)**: grup tombol aksi `DocRow` (`commerce.tsx`) tidak bisa
  turun baris (`flex` tanpa `flex-wrap`) sehingga Cetak+Retur+Batalkan+Terima Pembayaran meluber
  keluar kartu di 390px → header kartu kini menumpuk vertikal di HP dan tombol membungkus rapi.
- **Header halaman rusak** (judul + paragraf pengantar + tombol berdesakan dalam satu baris flex)
  di 4 halaman: Anggaran, Laba Rugi, Arus Kas, Ekspor e-Faktur → pola diperbaiki (judul+pengantar
  dibungkus, baris membungkus dengan `flex-wrap`).
- **Landing**: menu **hamburger mobile** (tautan Fitur/Harga/Panduan/FAQ sebelumnya tak
  terjangkau di HP), tombol header dirapikan di 390px, kartu harga kini 3 kolom mulai tablet
  (`md:`), ringkasan Laba/rugi Anggaran `grid-cols-1 sm:grid-cols-3`.

## Matriks visual QA (alat baru, dipakai ulang tiap PR visual)

`scripts/screenshots.mjs` set **audit**: 36 halaman (aplikasi + landing + panduan + auth) ×
3 viewport (390/768/1280), halaman penuh (di-cap 8000px — batas WebP), scroll paksa agar gambar
lazy termuat, keluaran ke direktori sementara (bukan repo). 108 gambar direview; bukti sebelum/
sesudah dikirim ke pemilik. Temuan minor yang MASIH wajar: tabel lebar menggulung horizontal di
HP (by design), input tanggal native mengikuti bahasa perangkat.

## Validasi

Typecheck · unit test · build · **smoke 395 → 397** (kontrak 503 wajib membawa
`detail: binding-absent` di kedua endpoint AI) · CI +`node --check scripts/ai-probe.mjs`.

## Berikutnya

Setelah merge & deploy: jalankan probe AI produksi → tindak lanjut sesuai `detail`.
Lalu Fase 5b: audit tata bahasa menyeluruh.

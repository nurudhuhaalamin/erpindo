# Log Kerja — Fase 16f: Isi halaman Keuangan dwibahasa

**Tanggal:** 25 Juli 2026.

## Yang dikerjakan

Lapis keenam program i18n modul. `finance.tsx` memuat **empat halaman inti
pembukuan** — Bagan Akun, Jurnal Umum, Buku Besar, dan Neraca Saldo — plus kartu
Template Jurnal Berulang. Semuanya dipatch: **25 entri kamus baru + 47
penggantian**.

Cakupan: label kolom (Kode, Nama, Tipe, Debit, Kredit, Saldo, No. Jurnal),
form jurnal manual (Pilih akun, Deskripsi, Proyek), aksi (Balik, Muat ke form,
Ubah nama, Simpan sebagai template), dan kartu template berulang (Terbit
otomatis tiap bulan, Terbit pertama, Terbitkan sekarang).

## Efek kamus terpusat makin besar

Survei awal berkas ini menemukan **13 dari 29 teks terlihat (45%) sudah tersedia
di kamus** dari fase sebelumnya — tinggal dipasang, tanpa menulis terjemahan
baru. Bandingkan dengan 16b (halaman pertama) yang hampir semuanya entri baru.
Ini persis alasan kamus dibuat terpusat di 16b alih-alih menerjemahkan per
halaman: biaya per halaman menurun, dan konsistensi terjaga otomatis.

## Validasi

- **UI-sim 191 → 192** (+1, cek `F0h`): mode EN pada Jurnal Umum memuat "Posted
  entries" & "New manual entry", dan **tidak lagi** memuat judul Indonesia-nya.
- typecheck 4/4 · lint bersih · build · unit 234 · smoke 861 (tak berubah).

## Catatan jujur

- **Aturan penanda negatif diterapkan sejak awal** (pelajaran 16c/16e): asersi
  memakai **judul kartu** yang murni antarmuka, bukan kata "Debit"/"Kredit" atau
  nama akun yang juga muncul sebagai **data pengguna** di bagan akun.
- **Sengaja tidak diterjemahkan:** contoh isian pada placeholder (`1-1600`,
  "Piutang Karyawan", "Setoran modal awal", "mis. Sewa ruko bulanan") — itu
  contoh nilai, bukan label antarmuka.
- **Cakupan kumulatif: ±14 layar** tuntas isinya.

## Koreksi jujur: klaim "tuntas" fase sebelumnya terlalu percaya diri

Cek `F0h` gagal dengan `posted=true newEntry=true tanpaID=false` — kali ini
**bukan** asersi yang salah (seperti 16c/16e), melainkan **string yang benar-benar
terlewat**: `description="Total debit harus sama dengan total kredit. Jurnal
terposting tidak dapat diubah…"`.

**Akar masalahnya ada di alat survei saya, bukan di halamannya.** Regex yang
saya pakai untuk mendaftar string membatasi panjang atribut ke **≤60 karakter**,
sehingga setiap kalimat panjang (justru yang paling terlihat pengguna) **tidak
pernah muncul di daftar** — dan saya menyatakan halaman "tuntas" berdasarkan
daftar yang bolong itu.

Setelah batas dihapus, sapuan ulang atas **seluruh halaman yang sudah dikerjakan**
menemukan **5 kalimat panjang tertinggal** di fase-fase sebelumnya:

| Berkas | Fase | Teks tertinggal |
|---|---|---|
| `masterdata.tsx` | 16b | "Belum punya produk? Pilih jenis usaha…" |
| `commerce.tsx` | 16c | "Pembayaran POS menyatu dengan struknya…" |
| `stok.tsx` | 16d | "Samakan stok sistem dengan hasil hitung fisik…" |
| `stok.tsx` | 16d | "Produk dengan total stok di bawah/di ambang minimum…" |
| `stok.tsx` | 16d | "Catat faktur pembelian untuk mengisi stok…" |

Semuanya diperbaiki di fase ini (7 entri kamus tambahan), dan sapuan tanpa batas
panjang kini menjadi langkah wajib sebelum menyatakan sebuah halaman selesai.

**Pelajaran:** alat verifikasi yang diam-diam menyaring sebagian data lebih
berbahaya daripada tidak punya alat sama sekali — karena menghasilkan rasa
selesai yang keliru. Klaim "tuntas" di log 16b–16d sebaiknya dibaca sebagai
"tuntas untuk label & tombol", dan baru benar-benar tuntas setelah koreksi ini.

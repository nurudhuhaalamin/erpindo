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

# Log Kerja — Fase 5c: Mode Pemula — Akuntansi Tanpa Jargon

**Tanggal:** 10 Juli 2026 · **Temuan review pemilik #5:** bagaimana bila pemakainya pebisnis baru
yang tidak paham SAK/jurnal?

## Jawaban desain

Sebagian besar alur SUDAH otomatis berjurnal (faktur, POS, gaji, aset, produksi). Yang tersisa —
pencatatan kas manual dan rasa "takut istilah" — dibereskan dengan paket lengkap ini:

1. **Wizard "Catat Transaksi"** (`/app/keuangan/catat`, menu teratas grup Keuangan): 3 tab
   Uang Masuk / Uang Keluar / Pindah Dana. Pengguna memilih **kategori berbahasa sehari-hari**
   ("Bayar listrik, air & internet", "Sewa tempat", "Gaji karyawan", "Setoran modal", "Prive",
   dst. — dipetakan ke kode akun template COA; kategori tersembunyi bila akunnya tak ada; ada
   pilihan "Lainnya — pilih akun sendiri"). Pratinjau kalimat "yang akan dicatat" tampil sebelum
   simpan. Submit memakai **endpoint jurnal yang sudah ada** (2 baris seimbang) — tanpa jalur
   pembukuan baru, tanpa migrasi.
2. **Mode Sederhana** (Pengaturan → Tampilan, per pengguna via localStorage): sidebar
   menyembunyikan Jurnal Umum, Buku Besar, Neraca Saldo, dan Bagan Akun. Catat Transaksi dan
   semua laporan tetap tampil. Bisa dimatikan kapan saja; tidak menyentuh data.
3. **Kamus Istilah** (`/panduan/istilah`): ±35 istilah dalam 5 kelompok (dasar pembukuan,
   jual-beli, stok & HPP, laporan, pajak & gaji) dengan penjelasan sederhana.
4. **Panduan "Akuntansi untuk Pemula"** (`/panduan/akuntansi-pemula`): 5 konsep inti — juga jadi
   target tombol `?` di halaman Catat Transaksi.
5. **Asisten AI**: grounding ditambah 2 entri (akuntansi-pemula + kamus istilah) sehingga bisa
   menjawab "apa itu HPP?" atau "beli galon air masuk kategori apa?".

## Validasi

- Typecheck · unit test (24) · build · **smoke 397 → 400** (COA comped punya akun kategori
  wizard; jurnal bentukan wizard 201; neraca saldo tetap seimbang).
- Screenshot 390+1280 (wizard terisi + pratinjau), toggle Mode Sederhana, halaman Kamus Istilah —
  dikirim ke pemilik. `docs/panduan/` kini 25 modul (2 baru).

## Berikutnya

Fase 5d: Keuangan lanjut (Kas & Bank, template jurnal berulang, rekonsiliasi bank v1,
Laba Rugi 2 periode, rasio, jurnal penutup tahunan).

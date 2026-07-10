# Log Kerja — Fase 5d: Keuangan Lanjut

**Tanggal:** 10 Juli 2026 · **Temuan review pemilik #4:** fitur Keuangan butuh pengembangan lagi.

## Yang dikerjakan

1. **Halaman Kas & Bank** (`/app/keuangan/kas-bank`): kartu saldo per akun kas/bank, mutasi
   dengan saldo berjalan (memakai API buku besar yang ada), dan **rekonsiliasi rekening koran**:
   tempel CSV mutasi dari internet banking (kolom tanggal;keterangan;jumlah bertanda) →
   auto-match ke baris jurnal akun itu (nominal sama, tanggal ±3 hari) → sisanya dicocokkan
   manual (pilih baris jurnal → Cocokkan / lepas), dengan ringkasan cocok/belum. Rekonsiliasi
   hanya menandai — tidak pernah mengubah jurnal.
2. **Template jurnal berulang**: tombol "Simpan sebagai template" di form Jurnal Umum (nama +
   opsi terbit otomatis bulanan dengan tanggal pertama); kartu Template Jurnal (terbitkan sekali
   klik / muat ke form / hapus); **cron harian** memposting template berjadwal yang jatuh tempo
   lalu memajukan jadwal sebulan (gagal karena periode terkunci → dilewati, jadwal tetap maju).
3. **Jurnal penutup tahunan** di kartu Tutup Buku (Pengaturan, khusus Owner): menolkan semua
   saldo pendapatan/beban s.d. tanggal pilihan, laba/rugi bersih dipindahkan ke Laba Ditahan
   (3-2000) — jurnal biasa yang terlihat di Jurnal Umum, dengan dialog konfirmasi.
4. **Laba Rugi**: centang "Bandingkan dengan periode sebelumnya" (panjang periode sama otomatis)
   dengan selisih % per baris ringkasan; chip **margin kotor & margin bersih**.
5. Migrasi tenant `0020_finance_extras` (journal_templates, bank_statement_items) —
   backward-compatible; skema shared + klien API baru; seed-demo +3 langkah (template bulanan,
   jurnal internet, impor 3 mutasi → 1 cocok otomatis).

## Validasi

- Typecheck · unit test (24) · build · **smoke 400 → 413** (+13: template CRUD/seimbang/terbit,
  impor & auto-match, match/unmatch manual + ringkasan, jurnal penutup −1,5jt lalu saldo P/L
  nol & idempoten, neraca saldo tetap seimbang — semuanya di tenant comped agar assert angka
  lama tak terganggu).
- Screenshot Kas & Bank, template jurnal, Laba Rugi perbandingan — dikirim ke pemilik.

## Berikutnya

Fase 5e: CRM lanjut (kanban, follow-up ber-due-date + pengingat, laporan konversi per sumber,
penawaran cetak/PDF).

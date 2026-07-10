# Log Kerja — Fase 5g: Proyek Lanjut

**Tanggal:** 10 Juli 2026 · **Temuan review pemilik #8:** Manajemen Proyek juga minim.

## Yang dikerjakan

1. **Termin penagihan**: tabel `project_milestones` (nama + nominal). Tombol "Buat faktur dari
   termin" menerbitkan **faktur penjualan jasa** (produk jasa "Jasa/Termin Proyek" otomatis, tanpa
   stok) yang **tertaut ke proyek** — pendapatan langsung masuk profitabilitas proyek, dan faktur
   muncul di daftar Penjualan + piutang. Termin yang sudah difakturkan terkunci (tak bisa dihapus /
   difakturkan ulang). Butuh proyek ber-pelanggan.
2. **RAB (anggaran biaya vs realisasi)**: tabel `project_budgets` (kategori + anggaran). Kartu RAB
   menampilkan total anggaran vs **realisasi biaya nyata** (dari jurnal ber-tag proyek) dengan
   progress bar (merah bila melebihi anggaran).
3. **Papan tugas kanban**: kolom Belum / Proses / Selesai dengan **drag-and-drop** (HTML5, khusus
   admin) memakai kolom status `project_tasks` yang sudah ada; **progres proyek otomatis** =
   tugas selesai ÷ total tugas, tampil di kartu proyek (progress bar).
4. **Timesheet**: tabel `time_entries` (jam × tarif per karyawan). Menampilkan **estimasi biaya
   tenaga kerja** dan **laba setelah tenaga kerja**. Bersifat informatif — gaji sudah dibebankan
   lewat penggajian, jadi timesheet **tidak dijurnal ulang** agar tidak dobel-hitung (dinyatakan
   jelas di UI).
5. Migrasi tenant `0023_project_extras` (3 tabel baru, backward-compatible); skema shared +
   klien API; halaman Proyek diperluas (papan kanban + kartu termin/RAB/timesheet + progres di
   kartu). Seed-demo +13 langkah: proyek "Desain Interior Kafe Koperasi" ber-pelanggan dengan
   2 termin (1 difakturkan), 2 baris RAB, 3 tugas (todo/proses/selesai), 2 entri timesheet →
   156 langkah.

## Validasi

- Typecheck · unit test (24) · build · **smoke 441 → 456** (+15: RBAC termin/RAB 403; termin
  201 + nominal 0 ditolak; buat faktur dari termin 5jt + pendapatan proyek 5jt + tertaut faktur;
  faktur ulang 400; hapus termin terfaktur 409; termin proyek tanpa pelanggan 400; RAB 2 baris
  total 5jt; timesheet estimasi 1jt; progres 50%; neraca saldo tetap seimbang). Proyek uji BARU
  terpisah agar assert profitabilitas proyek lama (10jt/4jt/6jt) tak terganggu; faktur termin
  hanya membentuk piutang (tak menyentuh kas) sehingga asersi arus kas & konsolidasi relatif
  tetap valid.
- Screenshot detail proyek (kanban + termin + RAB + timesheet dalam satu layar) — dikirim ke
  pemilik.

## Berikutnya

Fase 5h: pelengkap modul lain (laporan penjualan analitik, dashboard delta, anggaran salin+%,
aset revaluasi+CSV, manufaktur cek bahan, helpdesk umur tiket, stok filter+CSV, POS nominal
cepat) + **laporan akhir Fase 5** dengan checklist siap-launching.

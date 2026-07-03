# 📋 Status Proyek erpindo

> Halaman ini ditulis untuk pemilik produk (non-teknis). Selalu diperbarui setiap ada kemajuan.
> Log teknis per fase ada di folder [docs/log/](./log/).

**Terakhir diperbarui:** 3 Juli 2026

## Di mana kita sekarang?

| Fase | Isi | Status |
|---|---|---|
| Perencanaan | Blueprint bisnis & teknis | ✅ Selesai |
| Fase 0 — Fondasi | Kerangka aplikasi, akun & login, multi-tenant, keamanan dasar, design system, CI/CD | ✅ Selesai |
| Fase 1a — Akuntansi inti & master data | Bagan akun (template Indonesia), jurnal double-entry, buku besar, neraca saldo; produk, kontak, gudang | ✅ Selesai |
| Fase 1b — Penjualan & Pembelian | Faktur jual/beli dengan jurnal & stok otomatis (biaya rata-rata), pembayaran, PPN, level stok | ✅ Selesai |
| Fase 1c — Laporan & dashboard | Laba Rugi, Neraca (selalu seimbang), dashboard angka nyata | ✅ Selesai |
| Fase 1d — Pelengkap MVP | Kartu stok, umur piutang/hutang, ekspor CSV, tutup buku | ✅ Selesai — MVP inti lengkap |
| Fase 2a — PWA & cetak faktur | Aplikasi bisa di-install & offline; faktur bisa dicetak/PDF | ✅ Selesai |
| Fase 2b-1 — Fondasi langganan & arus kas | Paket & batasnya, siklus trial otomatis, mode baca-saja saat menunggak, laporan arus kas | ✅ Selesai |
| Fase 2c — Keamanan 2FA & landing page | Verifikasi dua langkah (authenticator) + halaman depan siap jualan | ✅ Selesai |
| Fase 2d — Impor CSV | Impor produk & kontak dari Excel/CSV dengan laporan per baris | ✅ Selesai |
| Fase 2e — Opname & audit log | Penyesuaian stok berjurnal otomatis + riwayat aktivitas untuk Owner | ✅ Selesai |
| **Fase 2f — Retur jual/beli** | Nota kredit/debit dengan jurnal pembalik & stok otomatis | ✅ **Selesai** |
| Fase 2b-2 — Pembayaran langganan | Checkout Midtrans/Xendit, aktivasi otomatis | ⏸ **Menunggu akun gateway dari Anda** |
| Fase 2 — Peluncuran SaaS | Pendaftaran mandiri, pembayaran langganan, PWA penuh | Belum |
| Fase 3+ | POS, HR & Payroll, dan modul lanjutan | Belum |

## Apa yang sudah bisa dilakukan aplikasi hari ini?

1. **Mendaftar sebagai perusahaan baru** — sistem otomatis membuatkan "database pribadi" untuk perusahaan tersebut (inilah pondasi multi-tenant: data tiap perusahaan benar-benar terpisah).
2. **Login/logout dengan aman** — password tersimpan terenkripsi, sesi aman, ada verifikasi email dan lupa-password.
3. **Mengundang anggota tim dengan peran berbeda** — Owner/Admin bisa mengubah data, Viewer hanya bisa melihat. Sistem menolak orang luar yang mencoba mengakses data perusahaan lain.
4. **Mengatur profil perusahaan** (nama, alamat, NPWP) — tersimpan di database milik perusahaan itu sendiri.
5. **Tampil rapi di HP, tablet, dan komputer**, dengan mode terang/gelap.
6. **Pembukuan double-entry sungguhan** *(baru — Fase 1a)*: bagan akun standar Indonesia langsung tersedia (18 akun, bisa ditambah), mencatat jurnal umum (sistem menolak jurnal yang tidak seimbang), melihat buku besar per akun dan neraca saldo yang selalu seimbang. Jurnal yang sudah diposting tidak bisa diubah-ubah — sesuai prinsip audit.
7. **Master data** *(Fase 1a)*: daftar produk (dengan harga jual/beli), kontak pelanggan & pemasok, dan gudang.
8. **Jual-beli lengkap** *(baru — Fase 1b)*: membuat faktur penjualan dan pembelian dengan PPN — sistem **otomatis** membuat catatan akuntansinya dan menambah/mengurangi stok (dengan perhitungan harga pokok rata-rata). Menjual barang yang stoknya kurang otomatis ditolak.
9. **Pencatatan pembayaran** *(baru — Fase 1b)*: menerima pembayaran pelanggan atau membayar pemasok; status faktur otomatis menjadi "lunas"; membayar melebihi tagihan ditolak.
10. **Pantauan stok** *(Fase 1b)*: level stok per gudang beserta nilai persediaan.
11. **Laporan keuangan** *(baru — Fase 1c)*: **Laba Rugi** per periode dan **Neraca** per tanggal yang selalu seimbang (laba berjalan otomatis diperhitungkan) — dihitung langsung dari jurnal, jadi pasti konsisten dengan buku besar.
12. **Dashboard angka nyata** *(Fase 1c)*: kas & bank, penjualan bulan berjalan, piutang/hutang belum lunas, dan nilai persediaan terpampang begitu Anda masuk.
13. **Kartu stok** *(baru — Fase 1d)*: riwayat keluar-masuk setiap barang dengan saldo berjalan.
14. **Umur piutang/hutang** *(baru — Fase 1d)*: siapa berutang berapa dan sudah berapa lama (belum jatuh tempo / 1–30 / 31–60 / 61–90 / >90 hari).
15. **Ekspor CSV** *(baru — Fase 1d)*: Laba Rugi, Neraca, dan aging dapat diunduh dan dibuka di Excel.
16. **Tutup buku** *(Fase 1d)*: Owner dapat mengunci periode — transaksi bertanggal pada periode terkunci ditolak sistem dari jalur mana pun.
17. **Di-install seperti aplikasi native** *(baru — Fase 2a)*: buka aplikasi di HP/komputer → menu "Install"/"Add to Home Screen"; aplikasi tetap terbuka saat offline dan meng-update dirinya otomatis.
18. **Cetak / simpan PDF faktur** *(Fase 2a)*: setiap faktur penjualan punya tampilan cetak profesional dengan kop perusahaan Anda.
19. **Laporan arus kas** *(baru — Fase 2b-1)*: kas masuk/keluar per periode dengan saldo awal & akhir.
20. **Siklus langganan otomatis** *(Fase 2b-1)*: paket dengan batas pengguna yang ditegakkan sistem; trial 14 hari dengan banner pengingat; saat trial habis akun otomatis menjadi baca-saja (data aman, tidak hilang) sampai langganan diaktifkan.
21. **Verifikasi dua langkah (2FA)** *(baru — Fase 2c)*: aktifkan di Pengaturan → Keamanan; login lalu membutuhkan kode 6 digit dari aplikasi authenticator di HP Anda — standar keamanan yang sama dengan internet banking.
22. **Halaman depan siap jualan** *(Fase 2c)*: hero, fitur unggulan, dan daftar harga paket.
23. **Impor dari Excel/CSV** *(Fase 2d)*: pindahkan daftar produk & kontak lama sekaligus — unduh template, isi, unggah; baris bermasalah dilaporkan satu per satu tanpa menggagalkan sisanya.
24. **Stok opname** *(baru — Fase 2e)*: hitung fisik gudang, masukkan angkanya — sistem menyamakan stok dan otomatis membukukan nilai selisihnya (barang hilang/rusak menjadi beban).
25. **Riwayat aktivitas** *(Fase 2e)*: Owner bisa melihat 100 aktivitas terakhir — siapa melakukan apa dan kapan.
26. **Retur penjualan & pembelian** *(baru — Fase 2f)*: barang dikembalikan? Klik Retur pada fakturnya — pembukuan terbalik otomatis (termasuk PPN proporsional), stok kembali bergerak, dan sisa tagihan langsung menyesuaikan.

Semua hal di atas **diuji otomatis oleh mesin setiap kali ada perubahan kode** (110 skenario ujian end-to-end + 20 unit test). Perubahan tidak bisa masuk ke versi utama bila ada ujian yang gagal.

## Apakah sudah bisa diakses di internet?

**Ya — jalur deploy otomatis sudah aktif.** Anda telah menghubungkan repo GitHub ke Cloudflare (Workers Builds), dan infrastruktur produksi sudah dibuat di akun Cloudflare Anda: 1 database pusat + 5 database tenant (D1) + penyimpanan rate-limit (KV). Setiap perubahan yang masuk ke versi utama kini otomatis di-build dan di-deploy oleh Cloudflare. Alamat aplikasi bisa dilihat di dashboard Cloudflare → Workers & Pages → **erpindo** (format `erpindo.<nama-akun>.workers.dev`; domain sendiri bisa dipasang kapan saja lewat menu yang sama).

Catatan kapasitas: mode saat ini memakai pool 5 database tenant (cukup untuk 5 perusahaan pertama / masa pengembangan). Peralihan ke pembuatan database dinamis tanpa batas sudah disiapkan di kode — tinggal diaktifkan saat mendekati peluncuran komersial.

## Yang dikerjakan berikutnya

Seluruh mekanik langganan sudah jadi — tinggal pembayarannya. **Yang dibutuhkan dari Anda untuk Fase 2b-2** (±15 menit):

1. Daftar akun di https://dashboard.midtrans.com/register (gratis; siapkan data usaha & rekening bank).
2. Setelah masuk dashboard, buka **Settings → Access Keys**, salin **Server Key** yang berlabel *Sandbox*.
3. Kabari di sesi pengembangan — kunci akan disimpan sebagai *secret* terenkripsi (tidak pernah masuk ke kode), lalu seluruh alur checkout (QRIS/VA/e-wallet), webhook, dan aktivasi paket otomatis dibangun & diuji di mode sandbox dulu.

Sementara menunggu, pengembangan berlanjut ke hal-hal yang tidak butuh akun tersebut (notifikasi email, polising tampilan, keamanan 2FA).

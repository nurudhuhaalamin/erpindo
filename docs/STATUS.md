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
| **Fase 1c — Laporan & dashboard** | Laba Rugi, Neraca (selalu seimbang), dashboard angka nyata | ✅ **Selesai** |
| Sisa MVP + Fase 2 | Ekspor laporan, kartu stok, aging, tutup buku; lalu billing langganan & peluncuran | ⏳ Berikutnya |
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
12. **Dashboard angka nyata** *(baru — Fase 1c)*: kas & bank, penjualan bulan berjalan, piutang/hutang belum lunas, dan nilai persediaan terpampang begitu Anda masuk.

Semua hal di atas **diuji otomatis oleh mesin setiap kali ada perubahan kode** (61 skenario ujian end-to-end + 16 unit test). Perubahan tidak bisa masuk ke versi utama bila ada ujian yang gagal.

## Apakah sudah bisa diakses di internet?

**Ya — jalur deploy otomatis sudah aktif.** Anda telah menghubungkan repo GitHub ke Cloudflare (Workers Builds), dan infrastruktur produksi sudah dibuat di akun Cloudflare Anda: 1 database pusat + 5 database tenant (D1) + penyimpanan rate-limit (KV). Setiap perubahan yang masuk ke versi utama kini otomatis di-build dan di-deploy oleh Cloudflare. Alamat aplikasi bisa dilihat di dashboard Cloudflare → Workers & Pages → **erpindo** (format `erpindo.<nama-akun>.workers.dev`; domain sendiri bisa dipasang kapan saja lewat menu yang sama).

Catatan kapasitas: mode saat ini memakai pool 5 database tenant (cukup untuk 5 perusahaan pertama / masa pengembangan). Peralihan ke pembuatan database dinamis tanpa batas sudah disiapkan di kode — tinggal diaktifkan saat mendekati peluncuran komersial.

## Yang dikerjakan berikutnya

Sisa MVP: ekspor laporan (Excel/PDF), kartu stok per barang, umur piutang/hutang (aging), dan tutup buku. Setelah itu Fase 2: pendaftaran mandiri yang dipoles, paket & pembayaran langganan (Midtrans/Xendit), dan PWA penuh — menuju peluncuran komersial.

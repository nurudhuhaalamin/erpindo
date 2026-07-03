# 📋 Status Proyek erpindo

> Halaman ini ditulis untuk pemilik produk (non-teknis). Selalu diperbarui setiap ada kemajuan.
> Log teknis per fase ada di folder [docs/log/](./log/).

**Terakhir diperbarui:** 2 Juli 2026

## Di mana kita sekarang?

| Fase | Isi | Status |
|---|---|---|
| Perencanaan | Blueprint bisnis & teknis | ✅ Selesai |
| Fase 0 — Fondasi | Kerangka aplikasi, akun & login, multi-tenant, keamanan dasar, design system, CI/CD | ✅ Selesai |
| **Fase 1a — Akuntansi inti & master data** | Bagan akun (template Indonesia), jurnal double-entry, buku besar, neraca saldo; produk, kontak, gudang | ✅ **Selesai** |
| Fase 1b–1c — MVP lanjutan | Siklus penjualan & pembelian (faktur + jurnal & stok otomatis), kas & bank, laporan keuangan, dashboard | ⏳ Berikutnya |
| Fase 2 — Peluncuran SaaS | Pendaftaran mandiri, pembayaran langganan, PWA penuh | Belum |
| Fase 3+ | POS, HR & Payroll, dan modul lanjutan | Belum |

## Apa yang sudah bisa dilakukan aplikasi hari ini?

1. **Mendaftar sebagai perusahaan baru** — sistem otomatis membuatkan "database pribadi" untuk perusahaan tersebut (inilah pondasi multi-tenant: data tiap perusahaan benar-benar terpisah).
2. **Login/logout dengan aman** — password tersimpan terenkripsi, sesi aman, ada verifikasi email dan lupa-password.
3. **Mengundang anggota tim dengan peran berbeda** — Owner/Admin bisa mengubah data, Viewer hanya bisa melihat. Sistem menolak orang luar yang mencoba mengakses data perusahaan lain.
4. **Mengatur profil perusahaan** (nama, alamat, NPWP) — tersimpan di database milik perusahaan itu sendiri.
5. **Tampil rapi di HP, tablet, dan komputer**, dengan mode terang/gelap.
6. **Pembukuan double-entry sungguhan** *(baru — Fase 1a)*: bagan akun standar Indonesia langsung tersedia (18 akun, bisa ditambah), mencatat jurnal umum (sistem menolak jurnal yang tidak seimbang), melihat buku besar per akun dan neraca saldo yang selalu seimbang. Jurnal yang sudah diposting tidak bisa diubah-ubah — sesuai prinsip audit.
7. **Master data** *(baru — Fase 1a)*: daftar produk (dengan harga jual/beli), kontak pelanggan & pemasok, dan gudang.

Semua hal di atas **diuji otomatis oleh mesin setiap kali ada perubahan kode** (40 skenario ujian end-to-end + 16 unit test). Perubahan tidak bisa masuk ke versi utama bila ada ujian yang gagal.

## Apakah sudah bisa diakses di internet?

Belum — aplikasi sudah berjalan penuh di lingkungan pengembangan. Untuk tayang di internet (akun Cloudflare Anda), ada **satu langkah 5 menit yang hanya bisa dilakukan pemilik akun**:

1. Buka https://dash.cloudflare.com/profile/api-tokens → klik **Create Token** → pilih template **Edit Cloudflare Workers** → Create.
2. Buka https://github.com/nurudhuhaalamin/erpindo/settings/secrets/actions → **New repository secret**:
   - Nama: `CLOUDFLARE_API_TOKEN`, isi: token dari langkah 1.
   - Tambahkan juga `CLOUDFLARE_ACCOUNT_ID` (terlihat di dashboard Cloudflare, sisi kanan halaman utama).
3. Selesai. Setiap perubahan yang masuk ke versi utama akan otomatis ter-deploy.

## Yang dikerjakan berikutnya

Fase 1b: siklus penjualan & pembelian — faktur penjualan/pembelian yang **otomatis** membuat jurnal akuntansi dan menggerakkan stok, ditambah kas & bank. Setelah itu laporan keuangan (neraca, laba-rugi) dan dashboard berisi angka nyata.

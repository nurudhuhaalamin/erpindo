# 📋 Status Proyek erpindo

> Halaman ini ditulis untuk pemilik produk (non-teknis). Selalu diperbarui setiap ada kemajuan.
> Log teknis per fase ada di folder [docs/log/](./log/).

**Terakhir diperbarui:** 2 Juli 2026

## Di mana kita sekarang?

| Fase | Isi | Status |
|---|---|---|
| Perencanaan | Blueprint bisnis & teknis | ✅ Selesai |
| **Fase 0 — Fondasi** | Kerangka aplikasi, akun & login, multi-tenant, keamanan dasar, design system, CI/CD | ✅ **Selesai** |
| Fase 1 — MVP | Modul Keuangan, Penjualan, Pembelian, Inventori, Laporan | ⏳ Berikutnya |
| Fase 2 — Peluncuran SaaS | Pendaftaran mandiri, pembayaran langganan, PWA penuh | Belum |
| Fase 3+ | POS, HR & Payroll, dan modul lanjutan | Belum |

## Apa yang sudah bisa dilakukan aplikasi hari ini?

1. **Mendaftar sebagai perusahaan baru** — sistem otomatis membuatkan "database pribadi" untuk perusahaan tersebut (inilah pondasi multi-tenant: data tiap perusahaan benar-benar terpisah).
2. **Login/logout dengan aman** — password tersimpan terenkripsi, sesi aman, ada verifikasi email dan lupa-password.
3. **Mengundang anggota tim dengan peran berbeda** — Owner/Admin bisa mengubah data, Viewer hanya bisa melihat. Sistem menolak orang luar yang mencoba mengakses data perusahaan lain.
4. **Mengatur profil perusahaan** (nama, alamat, NPWP) — tersimpan di database milik perusahaan itu sendiri.
5. **Tampil rapi di HP, tablet, dan komputer**, dengan mode terang/gelap.

Semua hal di atas **diuji otomatis oleh mesin setiap kali ada perubahan kode** (22 skenario ujian end-to-end + unit test). Perubahan tidak bisa masuk ke versi utama bila ada ujian yang gagal.

## Apakah sudah bisa diakses di internet?

Belum — aplikasi sudah berjalan penuh di lingkungan pengembangan. Untuk tayang di internet (akun Cloudflare Anda), ada **satu langkah 5 menit yang hanya bisa dilakukan pemilik akun**:

1. Buka https://dash.cloudflare.com/profile/api-tokens → klik **Create Token** → pilih template **Edit Cloudflare Workers** → Create.
2. Buka https://github.com/nurudhuhaalamin/erpindo/settings/secrets/actions → **New repository secret**:
   - Nama: `CLOUDFLARE_API_TOKEN`, isi: token dari langkah 1.
   - Tambahkan juga `CLOUDFLARE_ACCOUNT_ID` (terlihat di dashboard Cloudflare, sisi kanan halaman utama).
3. Selesai. Setiap perubahan yang masuk ke versi utama akan otomatis ter-deploy.

## Yang dikerjakan berikutnya

Fase 1 dimulai dari master data & bagan akun (template akuntansi standar Indonesia), lalu jurnal & buku besar, kemudian siklus penjualan/pembelian/stok — masing-masing melalui proses uji dan merge yang sama.

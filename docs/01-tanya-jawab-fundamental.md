# Tanya-Jawab Fundamental: Membangun Bisnis ERP Modern

Dokumen ini menjawab 9 pertanyaan fundamental sebelum memulai pengembangan **erpindo** — ERP berbasis SaaS untuk pasar Indonesia. Ditulis untuk pembaca non-programmer, namun cukup teknis untuk menjadi acuan developer.

> Rencana pengembangan lengkap (arsitektur, modul, stack, monetisasi, roadmap) ada di [02-rencana-pengembangan.md](./02-rencana-pengembangan.md).

---

## 1. Modul-modul utama apa saja yang perlu ada dalam ERP yang lengkap?

ERP yang lengkap umumnya terdiri dari modul inti berikut. Tidak semuanya harus dibangun sekaligus — kolom "Prioritas" menunjukkan urutan yang disarankan.

| Modul | Fungsi Utama | Prioritas |
|---|---|---|
| **Keuangan & Akuntansi** | Bagan akun (COA), jurnal umum, buku besar, piutang (AR), hutang (AP), kas & bank, rekonsiliasi, pajak (PPN, PPh), laporan keuangan (neraca, laba-rugi, arus kas) | **MVP** — jantung ERP |
| **Penjualan & CRM** | Data pelanggan, penawaran (quotation), pesanan penjualan (SO), faktur/invoice, pengiriman, piutang terintegrasi | **MVP** |
| **Pembelian (Procurement)** | Data pemasok, permintaan pembelian (PR), pesanan pembelian (PO), penerimaan barang, faktur pembelian, hutang terintegrasi | **MVP** |
| **Inventori & Gudang** | Master barang, stok multi-gudang, mutasi/transfer, stok opname, penilaian persediaan (FIFO/average), batas stok minimum | **MVP** |
| **Pelaporan & Dashboard** | Dashboard ringkasan bisnis, laporan per modul, ekspor Excel/PDF | **MVP** |
| **Administrasi & Pengaturan** | Manajemen pengguna, peran & hak akses (RBAC), audit log, pengaturan perusahaan/tenant | **MVP** — wajib sejak awal |
| **HR & Payroll** | Data karyawan, absensi, cuti, penggajian (PPh 21, BPJS Kesehatan & Ketenagakerjaan), slip gaji | v2 |
| **Aset Tetap** | Registrasi aset, penyusutan otomatis, pelepasan aset | v2 |
| **Manajemen Proyek** | Proyek, tugas, pencatatan biaya & waktu per proyek | v2 |
| **Manufaktur** | Bill of Materials (BoM), perintah produksi, perhitungan biaya produksi | v3 |

**Prinsip penting:** semua modul berbagi satu sumber data (misalnya faktur penjualan otomatis membuat jurnal akuntansi dan mengurangi stok). Integrasi inilah yang membedakan ERP dari kumpulan aplikasi terpisah.

---

## 2. Technology stack apa yang paling cocok untuk ERP modern, ringan, dan skalabel?

Rekomendasi: **TypeScript end-to-end** di atas platform **Cloudflare**, karena satu bahasa untuk frontend + backend, biaya operasional sangat rendah, dan skalabilitas otomatis.

| Lapisan | Pilihan | Alasan Singkat |
|---|---|---|
| Bahasa | **TypeScript** | Satu bahasa untuk seluruh sistem; type-safety mengurangi bug; talenta melimpah |
| Backend/API | **Hono** di **Cloudflare Workers** | Framework super ringan yang dirancang untuk edge; startup < 1 ms; bayar per pemakaian |
| Database | **Cloudflare D1** (SQLite) + **Drizzle ORM** | Serverless, tanpa administrasi server DB; Drizzle memberi query type-safe dan migrasi terkelola |
| Frontend | **React + Vite** | Ekosistem terbesar, komponen UI siap pakai melimpah, build cepat |
| Routing & data | **TanStack Router + TanStack Query** | Navigasi SPA cepat, caching data otomatis |
| UI/Styling | **Tailwind CSS + shadcn/ui** | Standar de-facto SaaS modern; komponen dapat dikustomisasi penuh |
| Validasi | **Zod** | Satu skema validasi dipakai di frontend dan backend |
| File/lampiran | **Cloudflare R2** | Penyimpanan objek tanpa biaya egress |
| Struktur repo | **Monorepo pnpm workspaces** | Frontend, backend, dan kode bersama (tipe, skema) dalam satu repo |

Alternatif yang dipertimbangkan dan alasan tidak dipilih dibahas di [dokumen rencana](./02-rencana-pengembangan.md#3-pilihan-stack--alasan).

---

## 3. Apakah mungkin sistem ini multi-tenant dan dapat dimonetisasi (SaaS berlangganan)?

**Ya, sangat mungkin — dan justru itulah model bisnis yang disarankan.**

- **Multi-tenant** artinya satu sistem melayani banyak perusahaan (tenant), masing-masing dengan data terisolasi. Pendekatan yang dipilih: **satu database per tenant** (D1 mendukung ribuan database), dengan satu **database pusat (control-plane)** untuk registrasi tenant, langganan, dan penagihan. Keuntungannya: isolasi data paling kuat (data antar-perusahaan tidak mungkin bocor lewat bug query), backup/restore per pelanggan mudah, dan performa tiap tenant tidak saling mengganggu.
- **Monetisasi**: model langganan bertingkat (subscription tiers), misalnya:
  - **Free/Trial** — 1 pengguna, data terbatas, untuk mencoba.
  - **Starter** (~Rp 99–199 rb/bln) — UMKM, modul inti.
  - **Business** (~Rp 499–999 rb/bln) — multi-gudang, HR/Payroll, lebih banyak pengguna.
  - **Enterprise** (harga khusus) — kustomisasi, dukungan prioritas.
- **Pembayaran**: payment gateway lokal (**Midtrans** atau **Xendit**) mendukung transfer bank/VA, QRIS, e-wallet — penting untuk pasar Indonesia. Stripe bisa ditambahkan untuk pelanggan internasional.

---

## 4. Apakah ERP bisa berjalan ringan tanpa mengorbankan fitur penting?

**Ya.** Kuncinya bukan mengurangi fitur, tetapi arsitektur yang efisien:

1. **Serverless** — tidak ada server yang menyala 24 jam. Kode hanya berjalan saat ada permintaan, jadi biaya saat sepi mendekati nol dan otomatis meluas saat ramai.
2. **SQLite per tenant** — database kecil dan lokal per perusahaan berarti query sangat cepat tanpa server database besar.
3. **Frontend dipecah per modul (code-splitting)** — pengguna hanya mengunduh kode modul yang dibuka; aplikasi terasa ringan bahkan di ponsel murah dengan koneksi lambat.
4. **Caching berlapis** — aset statis dilayani CDN Cloudflare di 300+ kota (termasuk Jakarta), data yang jarang berubah dicache di KV/browser.
5. **PWA** — aset aplikasi tersimpan di perangkat setelah kunjungan pertama, sehingga pembukaan berikutnya nyaris instan.

Sebagai gambaran: ERP tradisional butuh server dedicated jutaan rupiah/bulan sebelum punya 1 pelanggan. Arsitektur ini bisa melayani ratusan tenant awal dengan biaya **~$5/bulan** (paket Workers Paid).

---

## 5. Apakah mungkin hanya mengandalkan GitHub + Cloudflare, tanpa AWS/GCP/Azure?

**Ya, hampir 100%.** Pembagian perannya:

| Kebutuhan | Layanan |
|---|---|
| Version control, kolaborasi, issue tracking | **GitHub** |
| CI/CD (build, test, deploy otomatis) | **GitHub Actions** → deploy via `wrangler` CLI |
| Hosting API + aplikasi web | **Cloudflare Workers** (dengan static assets) |
| Database | **Cloudflare D1** |
| Penyimpanan file (lampiran, logo, ekspor) | **Cloudflare R2** |
| Cache & sesi | **Cloudflare KV** |
| Job latar belakang & terjadwal | **Cloudflare Queues + Cron Triggers** |
| CDN, DNS, SSL, proteksi DDoS | **Cloudflare** (bawaan) |
| Anti-bot pada form publik | **Cloudflare Turnstile** (pengganti CAPTCHA, gratis) |
| Backup database | **D1 Time Travel** (restore hingga 30 hari ke belakang) |

**Dua pengecualian yang perlu diketahui (bukan "cloud besar", hanya layanan kecil):**
1. **Email transaksional** (verifikasi akun, kirim invoice) — Cloudflare tidak mengirim email keluar. Gunakan layanan seperti **Resend** (ada tier gratis).
2. **Payment gateway** (Midtrans/Xendit) — memang harus layanan eksternal, sama seperti semua bisnis online.

Tidak ada kebutuhan AWS/GCP/Azure sama sekali.

---

## 6. Apakah ERP ini dapat berjalan di semua perangkat (mobile, tablet, desktop)?

**Ya**, dengan pendekatan **responsive web app, mobile-first, satu codebase**:

- UI dirancang mulai dari layar ponsel, lalu menyesuaikan ke tablet dan desktop (Tailwind CSS membuat ini natural).
- Pola tampilan adaptif: tabel data di desktop menjadi kartu/daftar di ponsel; sidebar menjadi menu bawah; form panjang menjadi bertahap (wizard).
- Diuji rutin pada breakpoint standar: 360px (ponsel), 768px (tablet), 1280px+ (desktop).
- Karena berbasis web, ERP otomatis jalan di Android, iOS, Windows, macOS, Linux, ChromeOS — apa pun yang punya browser modern.

Satu codebase berarti setiap fitur baru langsung tersedia di semua perangkat tanpa pengembangan ganda.

---

## 7. Bisakah dikemas sebagai web app utama tapi tetap "diinstal" seperti aplikasi native?

**Ya, ini justru strategi yang paling efisien.** Bertahap:

1. **Tahap 1 — PWA (Progressive Web App)**, bawaan sejak awal:
   - Bisa "Install" / "Add to Home Screen" di Android, Windows, macOS, dan iOS (via Safari) — muncul dengan ikon sendiri, berjalan tanpa bilah browser, terasa seperti aplikasi native.
   - **Offline-capable**: service worker menyimpan aset & data tertentu, sehingga aplikasi tetap terbuka dan data terakhir tetap terbaca saat internet putus.
   - Tanpa proses review app store, update langsung sampai ke semua pengguna.
2. **Tahap 2 — Wrapper native** (opsional, saat butuh kehadiran di app store):
   - **Capacitor** membungkus frontend yang sama menjadi aplikasi **Android (Play Store)** dan **iOS (App Store)**, plus akses fitur native (notifikasi push, kamera untuk scan barcode/struk).
   - **Tauri** membungkusnya menjadi aplikasi desktop **Windows/macOS/Linux** yang sangat kecil (~beberapa MB).

Intinya: **satu frontend, empat bentuk distribusi** (web, PWA, mobile store, desktop) — tanpa menulis ulang aplikasi.

---

## 8. Bagaimana aspek keamanan dari awal hingga deployment?

Keamanan untuk ERP multi-tenant (menyimpan data keuangan banyak perusahaan) harus berlapis:

**Isolasi & akses**
- **Isolasi tenant di level database** — setiap perusahaan punya database sendiri; bug query tidak mungkin membocorkan data perusahaan lain.
- **Autentikasi**: sesi aman (cookie `HttpOnly` + `Secure`), hashing password modern (Argon2/scrypt), **2FA TOTP** untuk akun sensitif.
- **RBAC (Role-Based Access Control)**: hak akses per modul dan per aksi (misal staf gudang tidak bisa melihat laporan keuangan), dicek di sisi server, bukan hanya disembunyikan di UI.

**Kode & data**
- **Validasi semua input dengan Zod** di backend (frontend hanya untuk kenyamanan).
- **Parameterized query** via Drizzle ORM — menutup celah SQL injection.
- **Security headers**: CSP, HSTS, X-Frame-Options; HTTPS otomatis dari Cloudflare.
- **Audit log**: setiap perubahan data penting (jurnal, harga, hak akses) tercatat siapa-kapan-apa — juga kebutuhan audit akuntansi.

**Infrastruktur & operasional**
- **Rate limiting** dan **Turnstile** pada endpoint login/registrasi (menahan brute-force & bot).
- **Secrets** (API key gateway, kunci enkripsi) disimpan via `wrangler secret`, tidak pernah di kode/Git.
- **Backup**: D1 Time Travel (point-in-time restore 30 hari) + ekspor berkala ke R2.
- **CI security**: Dependabot untuk dependensi rentan, secret scanning GitHub, review kode sebelum merge, branch `main` diproteksi.
- **Prinsip least-privilege**: token deploy hanya bisa deploy, setiap kredensial hanya punya izin minimum.

---

## 9. Apakah bisa menerapkan desain antarmuka modern ala SaaS kekinian?

**Ya, dan relatif mudah dengan stack yang dipilih:**

- **shadcn/ui + Tailwind CSS** adalah kombinasi di balik tampilan banyak SaaS modern (gaya Linear, Vercel, Notion): bersih, banyak ruang kosong, tipografi rapi, komponen konsisten.
- **Component-based design**: tombol, tabel, form, dialog dibuat sekali sebagai komponen, dipakai di semua modul — konsistensi terjaga otomatis dan pengembangan modul baru makin cepat.
- **Design tokens** (warna, spasi, radius, tipografi) terpusat, sehingga rebranding atau tema per-tenant mudah.
- **Dark mode** bawaan.
- **Aksesibilitas** (WCAG AA): kontras cukup, navigasi keyboard, label form yang benar — juga menaikkan kualitas persepsi produk.
- Sentuhan khas SaaS modern: command palette (Ctrl+K), skeleton loading, empty state yang membimbing, notifikasi toast.

---

## Kesimpulan

Semua yang ditanyakan **mungkin dan saling mendukung**: PWA responsif berbasis React di atas Cloudflare Workers + D1, dikembangkan lewat GitHub, multi-tenant sejak hari pertama, ringan dan murah dioperasikan, aman berlapis, dan bergaya SaaS modern. Langkah konkretnya ada di [Rencana Pengembangan](./02-rencana-pengembangan.md).

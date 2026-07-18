# Roadmap Pengembangan Lanjutan per Modul — erpindo

> Dokumen ini menjawab permintaan pemilik: "pikirkan pengembangan lanjutan yang dapat dilakukan
> untuk setiap fitur". Tiap modul dinilai dari **kondisi saat ini**, lalu diberi **quick wins**
> (bisa selesai ≤ 1 hari kerja) dan **pengembangan lanjutan** dengan skor
> **Dampak** dan **Usaha** (T = tinggi, S = sedang, R = rendah) serta tanda **AI ✓** bila ide
> tersebut memanfaatkan Cloudflare Workers AI (kuota gratis 10.000 neuron/hari yang sudah aktif
> sejak Fase 4e).
>
> Konteks arsitektur & rencana induk: [02-rencana-pengembangan.md](./02-rencana-pengembangan.md) ·
> Status terkini: [STATUS.md](./STATUS.md)

## Daftar Isi

1. [Dashboard & Onboarding](#1-dashboard--onboarding)
2. [POS / Kasir](#2-pos--kasir)
3. [Penjualan](#3-penjualan)
4. [Pembelian & Persetujuan](#4-pembelian--persetujuan)
5. [Stok & Gudang](#5-stok--gudang)
6. [Akuntansi](#6-akuntansi)
7. [Kas & Bank](#7-kas--bank)
8. [Laporan](#8-laporan)
9. [Pajak](#9-pajak)
10. [HR & Penggajian](#10-hr--penggajian)
11. [Aset Tetap](#11-aset-tetap)
12. [CRM](#12-crm)
13. [Anggaran](#13-anggaran)
14. [Proyek](#14-proyek)
15. [Multi Mata Uang](#15-multi-mata-uang)
16. [Kontrak & Tagihan Berulang](#16-kontrak--tagihan-berulang)
17. [Konsolidasi](#17-konsolidasi)
18. [Manufaktur & QC](#18-manufaktur--qc)
19. [Pemeliharaan Aset](#19-pemeliharaan-aset)
20. [Helpdesk](#20-helpdesk)
21. [Asisten AI](#21-asisten-ai)
22. [Platform & Infrastruktur](#22-platform--infrastruktur)
23. [Monetisasi & Langganan](#23-monetisasi--langganan)
24. [Urutan Prioritas 6 Bulan](#24-urutan-prioritas-6-bulan)

---

## 1. Dashboard & Onboarding

**Kondisi saat ini:** grafik penjualan 30 hari, kartu KPI (kas & bank, penjualan bulan berjalan,
piutang/hutang, persediaan), widget jatuh tempo, feed aktivitas, checklist "Mulai cepat"
berprogres, lonceng notifikasi.

**Quick wins (≤ 1 hari):**
- ~~Filter rentang tanggal pada grafik penjualan (7/30/90 hari).~~ ✅ **Fase 12d**
- ~~Kartu KPI bisa diklik menuju laporan sumbernya.~~ ✅ **Fase 12d**
- ~~Sapaan kontekstual ("Selamat pagi, ada 3 faktur jatuh tempo minggu ini").~~ ✅ **Fase 12d**

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Dashboard bisa dikustomisasi (pilih & susun widget per pengguna) | S | S | – |
| ~~Ringkasan bisnis mingguan berbahasa alami di dashboard ("penjualan naik 12%, margin turun karena…")~~ ✅ **Fase 12f** | T | S | ✓ |
| Perbandingan periode otomatis (bulan ini vs bulan lalu vs tahun lalu) pada semua KPI — *sebagian di Fase 12d: delta bulan lalu pada KPI Penjualan & Laba* | T | R | – |
| Target bulanan owner + progress bar (terhubung modul Anggaran) | S | R | – |

## 2. POS / Kasir

**Kondisi saat ini:** layar kasir cepat, pencarian produk sisi server, diskon per baris, shift
dengan hitung kas fisik + selisih berjurnal, struk dengan logo, pembayaran tunai.

**Quick wins (≤ 1 hari):**
- ~~Tombol nominal cepat (Rp 50rb/100rb) + hitung kembalian menonjol.~~ ✅ **Fase 12e**
- Catatan per transaksi (nama pelanggan/meja) tercetak di struk.
- Produk favorit/pinned di atas hasil pencarian.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Barcode scanner via kamera HP (zxing di browser)** — scan langsung menambah item ke keranjang | T | S | – |
| ~~Pembayaran non-tunai tercatat (QRIS statis/transfer, pilih metode → jurnal ke akun bank)~~ ✅ **sudah ada sejak Fase 7a** (koreksi Fase 12e) | T | R | – |
| Mode offline penuh POS: antre transaksi di IndexedDB, sinkron saat online (PWA sudah ada — tinggal antrean) | T | T | – |
| Member/pelanggan di POS + riwayat belanja & poin sederhana | S | S | – |
| ~~Rekap penjualan per jam/kasir untuk analisis shift~~ ✅ **Fase 12e** | S | R | – |

## 3. Penjualan

**Kondisi saat ini:** faktur PPN (0/11/12%) dengan diskon per baris, jurnal & stok otomatis,
pembayaran parsial/lunas, retur, void berjurnal pembalik, quotation dari CRM, cetak/PDF berlogo,
faktur valas, faktur berulang dari kontrak.

**Quick wins (≤ 1 hari):**
- Duplikat faktur sekali klik (pelanggan sama, tanggal baru).
- Kirim faktur via tautan publik read-only (token acak) — pelanggan lihat & unduh tanpa login.
- Kolom "jatuh tempo dalam X hari" + sortir di daftar faktur.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Sinkronisasi marketplace Tokopedia/Shopee** — tarik pesanan jadi faktur + potong stok otomatis (butuh API key seller, pending pemilik) | T | T | – |
| Pengingat tagihan otomatis ke pelanggan (email; WhatsApp lihat §22) dengan eskalasi H-3/H/H+7 | T | S | – |
| Harga bertingkat per pelanggan/grup (harga grosir vs ecer) | S | S | – |
| Sales order terpisah dari faktur (pesan dulu, kirim & tagih bertahap) | S | T | – |
| Draf email penagihan sopan yang dihasilkan AI dari data faktur | S | R | ✓ |

## 4. Pembelian & Persetujuan

**Kondisi saat ini:** faktur pembelian dengan lot/exp & diskon, approval engine berambang
(pembelian besar menunggu persetujuan Owner), retur, void, pembayaran ke pemasok.

**Quick wins (≤ 1 hari):**
- Saran pembelian dari stok menipis ("5 produk di bawah ambang — buat PO?").
- Riwayat harga beli per produk per pemasok saat mengisi baris.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **OCR nota/faktur pemasok (AI vision)** — foto nota → draf faktur pembelian terisi otomatis, manusia memeriksa lalu simpan. Catatan: model vision gratis (`@cf/llava-hf/llava-1.5-7b-hf`) terbatas untuk teks Indonesia rapat — mulai dari nota tercetak sederhana, ukur akurasinya | T | T | ✓ |
| Purchase order (PO) formal terpisah → penerimaan barang bertahap → faktur | T | T | – |
| Perbandingan penawaran multi-pemasok per produk | S | S | – |
| Approval multi-level (ambang bertingkat: supervisor → owner) | S | S | – |

## 5. Stok & Gudang

**Kondisi saat ini:** stok per gudang dengan biaya rata-rata, transfer antar gudang, opname
berjurnal selisih, lot & kedaluwarsa FEFO dengan peringatan 30 hari, ambang stok minimum +
notifikasi, kartu stok.

**Quick wins (≤ 1 hari):**
- Ekspor CSV level stok + nilai per gudang.
- Filter "hanya yang menipis / hanya yang hampir kedaluwarsa" di halaman Stok.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Peramalan stok (AI)** — proyeksi kebutuhan per produk dari riwayat penjualan → saran jumlah & waktu beli ulang | T | S | ✓ |
| **Picking multi-gudang** — satu faktur mengambil stok dari beberapa gudang sekaligus (kini satu faktur satu gudang) | S | S | – |
| Satuan ganda (beli per dus, jual per pcs, konversi otomatis) | T | T | – |
| Reorder point otomatis: ambang dihitung dari kecepatan jual, bukan angka statis | S | S | ✓ |
| Stok konsinyasi (barang titipan terpisah dari milik sendiri) | R | T | – |

## 6. Akuntansi

**Kondisi saat ini:** double-entry immutable, COA template Indonesia (bisa tambah akun & ganti
nama), jurnal umum dengan validasi seimbang, buku besar, neraca saldo, tutup buku (kunci
periode), audit log, draf jurnal dari bahasa alami via Asisten AI.

**Quick wins (≤ 1 hari):**
- **Template jurnal berulang** — simpan jurnal rutin (sewa, listrik, penyusutan manual) sebagai template, terbitkan sekali klik tiap bulan.
- Lampiran memo panjang / referensi eksternal per jurnal.
- Pencarian jurnal berdasarkan akun tertentu.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Jurnal berulang terjadwal otomatis via Cron (dari template di atas) | S | R | – |
| **Deteksi anomali jurnal (AI)** — tandai entri tak lazim (nominal janggal, akun jarang dipakai, pola ganda) untuk direview | S | S | ✓ |
| Jurnal penutup tahunan otomatis (laba berjalan → laba ditahan) | S | S | – |
| Departemen/kelas sebagai dimensi tambahan pelaporan (di samping Proyek) | S | T | – |

## 7. Kas & Bank

**Kondisi saat ini:** akun kas & bank di COA, laporan arus kas, rekap kas shift POS. Belum ada
rekonsiliasi terhadap rekening koran.

**Quick wins (≤ 1 hari):**
- Halaman mutasi per akun kas/bank (buku besar terfilter dengan saldo berjalan) sebagai pijakan rekonsiliasi.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Rekonsiliasi bank** — impor mutasi rekening koran (CSV internet banking) → cocokkan otomatis dengan jurnal (tanggal + nominal), sisanya dicocokkan manual; status "sudah rekon" per baris | T | T | – |
| Auto-match cerdas (AI): pencocokan deskripsi mutasi bebas-format ke faktur/kontak ("TRSF DR PT MAJU JAYA" → faktur INV-0042) | T | S | ✓ |
| Kas kecil (petty cash) dengan pengisian ulang berjurnal | S | R | – |
| Proyeksi arus kas 30–90 hari dari piutang/hutang jatuh tempo + kontrak berulang | T | S | – |

## 8. Laporan

**Kondisi saat ini:** Laba Rugi, Neraca, arus kas, neraca saldo, buku besar, aging
piutang/hutang, kartu stok, profitabilitas proyek, budget vs realisasi, laporan konsolidasi —
semua ekspor CSV, sebagian bisa dicetak.

**Quick wins (≤ 1 hari):**
- Perbandingan dua periode berdampingan di Laba Rugi (+selisih %).
- Tombol cetak rapi (print stylesheet) untuk semua laporan, bukan hanya faktur.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Laporan penjualan analitik: per produk, per pelanggan, per kasir/pengguna, margin per produk | T | S | – |
| Laporan terjadwal via email bulanan (PDF Laba Rugi + ringkasan) ke owner | S | S | – |
| Narasi otomatis di bawah laporan ("beban naik terutama dari…") | S | R | ✓ |
| Ekspor Excel (.xlsx) berformat, bukan hanya CSV | S | S | – |
| Rasio keuangan otomatis (margin kotor, lancar, perputaran persediaan) + penjelasan | S | R | ✓ |

## 9. Pajak

**Kondisi saat ini:** PPN multi-tarif (0/11/12%) dengan DPP nilai lain 11/12 (PMK 131/2024),
ekspor e-Faktur CSV + **XML Coretax** (TaxInvoiceBulk, TIN 16 digit, kode transaksi 01/04
otomatis), PPh 21 TER di payroll.

**Quick wins (≤ 1 hari):**
- Rekap PPN masukan (dari faktur pembelian ber-PPN) per periode — pelengkap rekap keluaran.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Laporan SPT Masa PPN siap lapor** — kurang/lebih bayar per masa (keluaran − masukan) dengan kertas kerja | T | S | – |
| **PPh unifikasi** — rekap PPh 21/23/4(2) yang dipotong per masa + bukti potong sederhana | T | T | – |
| **Integrasi Coretax API langsung** (lapor tanpa unduh-unggah) — menunggu DJP membuka API publik & regulasinya; pantau | T | T | – |
| Pengingat kalender pajak Indonesia (jatuh tempo lapor/setor PPN, PPh 21, PPh 25) via notifikasi | S | R | – |
| Penjelasan aturan pajak kontekstual di Asisten AI (mis. "kapan pakai kode 04?") — perluas grounding | S | R | ✓ |

## 10. HR & Penggajian

**Kondisi saat ini:** data karyawan (PTKP, gaji pokok + tunjangan), payroll run bulanan dengan
PPh 21 TER + BPJS (batas upah JP 2026), slip gaji, jurnal beban gaji otomatis.

**Quick wins (≤ 1 hari):**
- Slip gaji versi cetak/PDF per karyawan (pola cetak faktur sudah ada).
- Komponen potongan/tunjangan ad-hoc per run (bonus, kasbon).

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Bukti potong 1721-A1 tahunan per karyawan | T | S | – |
| Absensi sederhana (hadir/izin/cuti) yang memengaruhi komponen gaji | S | T | – |
| Kasbon/pinjaman karyawan dengan cicilan otomatis memotong gaji | S | S | – |
| Portal karyawan read-only (lihat slip sendiri) — peran baru "employee" | S | T | – |

## 11. Aset Tetap

**Kondisi saat ini:** register aset, penyusutan garis lurus otomatis via Cron + jurnal,
pelepasan dengan laba/rugi, nilai buku berjalan, terhubung modul Pemeliharaan.

**Quick wins (≤ 1 hari):**
- Ekspor CSV daftar aset + akumulasi penyusutan (lampiran laporan keuangan).

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Revaluasi aset** — sesuaikan nilai wajar dengan jurnal selisih revaluasi + jejak riwayat | S | S | – |
| Metode penyusutan saldo menurun (pilihan per aset, relevan untuk fiskal) | S | S | – |
| Foto & lokasi aset + QR label untuk stock opname aset | R | S | – |
| Penyusutan fiskal vs komersial berdampingan (kelompok harta pajak) | S | T | – |

## 12. CRM

**Kondisi saat ini:** lead + nilai perkiraan, funnel 6 tahap, aktivitas follow-up, konversi ke
pelanggan, quotation → faktur sekali klik.

**Quick wins (≤ 1 hari):**
- Pengingat follow-up berjadwal masuk lonceng notifikasi ("3 lead belum di-follow-up 7 hari").
- Sumber lead (IG/WA/referensi) + rekap konversi per sumber.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Papan kanban funnel drag-and-drop | S | S | – |
| Skor prioritas lead (AI dari nilai, umur, aktivitas) | S | S | ✓ |
| Draf pesan follow-up WA/email dihasilkan AI dari riwayat aktivitas | S | R | ✓ |
| Form penangkap lead publik (embed di landing/IG bio) langsung masuk CRM | T | S | – |

## 13. Anggaran

**Kondisi saat ini:** target per akun per bulan, realisasi otomatis dari jurnal, varians
berwarna, ringkasan anggaran vs realisasi, ekspor CSV.

**Quick wins (≤ 1 hari):**
- Salin anggaran bulan/tahun lalu + kenaikan % sekali klik.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Peringatan dini saat realisasi beban menembus X% target sebelum akhir bulan | S | R | – |
| Usulan anggaran otomatis dari rata-rata realisasi 3–6 bulan (AI menyesuaikan musiman) | S | S | ✓ |
| Anggaran per proyek/departemen (menyusul dimensi §6) | S | S | – |

## 14. Proyek

**Kondisi saat ini:** proyek & tugas, tagging faktur/pembelian/jurnal ke proyek, laporan
profitabilitas per proyek (pendapatan − biaya, margin).

**Quick wins (≤ 1 hari):**
- Status tugas di kartu proyek (x dari y selesai) + progress bar.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Timesheet sederhana (jam kerja per proyek) → biaya tenaga kerja terhitung | S | T | – |
| Penagihan bertahap per termin proyek (uang muka, progres, pelunasan) | T | S | – |
| RAB proyek (anggaran per proyek) vs realisasi | S | S | – |

## 15. Multi Mata Uang

**Kondisi saat ini:** master kurs manual, faktur valas dikonversi ke IDR saat posting, laba/rugi
selisih kurs otomatis saat pelunasan.

**Quick wins (≤ 1 hari):**
- Riwayat kurs per mata uang (grafik kecil) di halaman kurs.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Tarik kurs referensi otomatis harian (kurs pajak Kemenkeu) via Cron | S | S | – |
| Revaluasi saldo valas akhir periode (unrealized gain/loss) | S | S | – |

## 16. Kontrak & Tagihan Berulang

**Kondisi saat ini:** kontrak bulanan/triwulan/tahunan, Cron menerbitkan faktur otomatis +
pengingat, produk jasa tanpa stok.

**Quick wins (≤ 1 hari):**
- Kenaikan harga terjadwal pada kontrak (efektif periode berikutnya).
- Rekap MRR (pendapatan berulang bulanan) di halaman kontrak.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Prorata saat mulai/berhenti di tengah periode | S | S | – |
| Email/WA faktur otomatis ke pelanggan saat kontrak menerbitkan faktur | T | S | – |
| Analisis churn kontrak (kontrak berhenti per bulan + alasannya) | R | S | – |

## 17. Konsolidasi

**Kondisi saat ini:** multi-perusahaan satu akun, Laba Rugi & Neraca gabungan lintas tenant
dengan rincian per perusahaan, filter perusahaan, ekspor CSV.

**Quick wins (≤ 1 hari):**
- Arus kas konsolidasi (pola sama dengan LR/Neraca gabungan).

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Eliminasi transaksi antar-perusahaan** — tandai akun/transaksi inter-company agar tidak dobel di laporan gabungan | S | T | – |
| Transaksi antar-perusahaan sekali input (faktur di A otomatis jadi pembelian di B) | S | T | – |

## 18. Manufaktur & QC

**Kondisi saat ini:** BoM, perintah produksi (bahan keluar → produk jadi masuk dengan biaya
gabungan), inspeksi QC lulus/karantina ke gudang khusus.

**Quick wins (≤ 1 hari):**
- Cek ketersediaan bahan sebelum mulai produksi ("kurang 2 komponen") + tautan saran beli.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Biaya overhead & tenaga kerja ke dalam HPP produksi (bukan hanya bahan) | S | S | – |
| BoM bertingkat (produk setengah jadi sebagai komponen) | S | T | – |
| Perencanaan produksi dari pesanan + peramalan (kaitan §5 AI) | S | T | ✓ |

## 19. Pemeliharaan Aset

**Kondisi saat ini:** jadwal servis berkala per aset (Cron menerbitkan work order), work order
ad-hoc, biaya dijurnal sebagai Beban Pemeliharaan, riwayat & total biaya per aset.

**Quick wins (≤ 1 hari):**
- Notifikasi lonceng saat work order terbit/terlambat.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Jadwal berbasis pemakaian (km/jam mesin), bukan hanya kalender | R | S | – |
| Analisis biaya pemeliharaan vs nilai buku ("aset ini lebih mahal dirawat daripada diganti") | R | R | ✓ |

## 20. Helpdesk

**Kondisi saat ini:** tiket prioritas & status, penugasan tim, utas balasan + catatan internal,
terhubung kontak, masuk lonceng notifikasi.

**Quick wins (≤ 1 hari):**
- SLA sederhana: umur tiket terbuka disorot (>24 jam kuning, >72 jam merah).

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| Email-to-ticket (alamat dukungan → tiket otomatis) | S | T | – |
| Saran balasan AI dari isi tiket + riwayat pelanggan | S | R | ✓ |
| Portal pelanggan publik untuk membuat & memantau tiket | S | T | – |

## 21. Asisten AI

**Kondisi saat ini (Fase 4e):** chat "Asisten erpindo" berbahasa Indonesia grounded ringkasan
23 modul panduan; draf jurnal dari bahasa alami (tervalidasi seimbang, manusia yang memposting);
kuota 50 permintaan/hari/perusahaan; degradasi anggun bila AI tak tersedia. Prinsip tetap:
**AI tidak pernah menulis data.**

**Quick wins (≤ 1 hari):**
- Perluas grounding dengan konteks angka ringan (nama perusahaan, jumlah faktur jatuh tempo) agar jawaban lebih personal.
- Tombol "tanya AI tentang halaman ini" di HelpLink (prompt awal terisi konteks halaman).

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Ringkasan bulanan otomatis** — narasi kinerja (penjualan, beban, margin, piutang) dikirim email tiap awal bulan | T | S | ✓ |
| **Deteksi anomali jurnal** (lihat §6) sebagai laporan mingguan Asisten | S | S | ✓ |
| Tanya-data ("berapa penjualan minggu lalu?") — AI memilih dari daftar query aman yang sudah ditentukan (bukan SQL bebas), hasil dari database | T | T | ✓ |
| Draf dokumen lain dari bahasa alami: penawaran, produk baru, kontak — pola sama dengan draf jurnal | S | S | ✓ |
| OCR nota (§4) & auto-match rekonsiliasi (§7) memakai fondasi yang sama | T | T | ✓ |

## 22. Platform & Infrastruktur

**Kondisi saat ini:** PWA installable + offline shell, 2FA TOTP, audit log, rate limit, email
transaksional, cron (trial, penyusutan, kontrak, maintenance), CI 395 uji e2e + deploy otomatis,
panduan 3 permukaan, seed demo.

**Quick wins (≤ 1 hari):**
- Halaman status kesehatan sistem sederhana (versi, waktu deploy) untuk debugging.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Notifikasi WhatsApp** (Fonnte / WA Business API) — pengingat tagihan, faktur baru, stok menipis; jauh lebih dibaca daripada email di Indonesia (butuh akun/token dari pemilik) | T | S | – |
| **Backup/restore per tenant** — ekspor penuh database perusahaan terjadwal ke penyimpanan (R2 bila aktif) + unduh mandiri; nilai jual kepercayaan | T | S | – |
| **API publik + webhook** — token API per perusahaan (baca faktur/produk/laporan; webhook faktur-dibuat/dibayar) untuk integrasi pihak ketiga | S | T | – |
| **Wrapper mobile (Capacitor)** — bungkus PWA jadi APK/AAB Play Store (dan iOS menyusul); kehadiran di store = kanal akuisisi | S | S | – |
| Manajemen dokumen/lampiran (R2) — **menunggu pemilik mengaktifkan R2** | T | S | – |
| Domain kustom `erpindo.id` + subdomain per tenant | S | S | – |
| Provisioning D1 dinamis (lepas dari pool 6 database) via API token — prasyarat skala komersial | T | S | – |

## 23. Monetisasi & Langganan

**Kondisi saat ini:** paket & limit ditegakkan, trial 30 hari + email pengingat, read-only saat
menunggak, akun comped (`COMPED_EMAILS`), harga di landing. Belum ada pembayaran online.

**Quick wins (≤ 1 hari):**
- Halaman "Langganan" di Pengaturan yang menampilkan paket aktif, sisa trial, dan instruksi pembayaran manual (transfer + konfirmasi) sebagai jembatan sebelum gateway.

**Pengembangan lanjutan:**

| Ide | Dampak | Usaha | AI |
|---|:---:|:---:|:---:|
| **Payment gateway Midtrans/Xendit** — checkout QRIS/VA/e-wallet, webhook aktivasi otomatis (**kunci monetisasi — menunggu Server Key dari pemilik**) | T | T | – |
| **Dunning otomatis** — rangkaian pengingat gagal bayar/berakhir (H-7/H-1/H+3) + masa tenggang sebelum read-only | T | S | – |
| Upgrade/downgrade paket mandiri dengan prorata | S | S | – |
| Kupon/referral untuk akuisisi awal | R | S | – |

---

## 24. Urutan Prioritas 6 Bulan

Prinsip urutan: (1) yang membuka **pendapatan** lebih dulu, (2) yang paling terasa oleh
**pengguna harian**, (3) manfaatkan **kuota AI gratis** untuk pembeda, (4) item ber-ketergantungan
pemilik dikerjakan begitu prasyaratnya tersedia.

| Bulan | Fokus | Isi utama |
|---|---|---|
| 1 | **Monetisasi** | Payment gateway + dunning (begitu Server Key Midtrans diserahkan; sementara itu: halaman langganan + pembayaran manual, quick wins penjualan) |
| 2 | **Retensi harian** | Notifikasi WhatsApp, pengingat tagihan otomatis, barcode POS, laporan penjualan analitik |
| 3 | **Kepercayaan & kepatuhan** | Rekonsiliasi bank (impor CSV + auto-match AI), SPT Masa PPN, backup/restore per tenant |
| 4 | **AI pembeda** | Ringkasan bulanan AI, peramalan stok, tanya-data aman, deteksi anomali |
| 5 | **Skala & kanal** | Provisioning D1 dinamis, domain kustom, wrapper mobile Play Store, form lead publik |
| 6 | **Pendalaman modul** | PO formal + OCR nota, penagihan termin proyek, bukti potong 1721-A1, PPh unifikasi |

**Kecocokan free tier Workers AI (10.000 neuron/hari ≈ ratusan panggilan model 8B):**

- **Muat dengan nyaman**: chat asisten & draf jurnal (sudah jalan, 50/hari/tenant), draf email/WA,
  narasi laporan, ringkasan bulanan (1×/bulan/tenant), skor lead, saran balasan tiket.
- **Muat dengan penjadwalan**: deteksi anomali & peramalan stok — jalankan lewat Cron malam hari
  secara bertahap per tenant, bukan on-demand, agar pemakaian merata.
- **Perlu diukur dulu / kemungkinan berbayar**: OCR nota (model vision lebih mahal neuron-nya dan
  akurasi teks Indonesia perlu diuji) dan tanya-data volume tinggi. Mulai di belakang kuota
  per-tenant yang sama; bila laris, biaya Workers AI berbayar tetap murah (bayar per neuron) dan
  bisa dibebankan ke paket Enterprise.

> Semua item di atas adalah **usulan** — tidak ada yang dikerjakan tanpa keputusan pemilik.
> Item yang menunggu keterlibatan pemilik: Server Key Midtrans, aktivasi R2, API key
> Biteship/Tokopedia/Shopee, token WhatsApp (Fonnte/WA Business), dan API token Cloudflare untuk
> provisioning D1 dinamis.

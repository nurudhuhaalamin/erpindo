# LAPORAN AKHIR FASE 7 — Pendalaman Tiap Modul (ROI UMKM + Enterprise)

**Tanggal:** 11 Juli 2026 · **8 PR (7a–7h) selesai & ter-merge ke `main`.**

## Latar

Setelah alur inti UMKM lengkap (Fase 0–6) dan 8 temuan pemilik beres, pemilik bertanya:
*“jika tiap fitur diperdalam, ada apa lagi?”* Fase 7 menjawab dengan **memperdalam modul yang
sudah ada** — dua gelombang: **ROI UMKM** (nilai langsung untuk usaha kecil) lalu **Enterprise**
(kapabilitas kelas menengah). Semua dibangun **ADDITIVE**: migrasi bernomor urut & kolom nullable,
middleware berdampingan, tanpa mengubah alur/`id`/nama ekspor lama — sehingga seluruh asersi lama
tetap hijau.

## Yang dibangun (8 PR)

### Gelombang A — ROI UMKM
- **7a — POS lanjut (retail).** Kasir **multi metode bayar** (Tunai/QRIS/Kartu/E-Wallet) +
  **pembayaran terpisah (split)** + kembalian dari tunai; **tahan/panggil transaksi**. Laci kas
  shift hanya menghitung porsi tunai; non-tunai masuk Bank.
- **7b — Penjualan bertahap.** Alur **SO → Surat Jalan (DO) → Faktur**: pesanan mencatat komitmen
  (belum menyentuh stok/pembukuan), **surat jalan** mengeluarkan stok + HPP **tepat sekali**,
  **faktur** mengakui pendapatan tanpa menggerakkan stok lagi. **Uang muka (DP)** otomatis terpakai
  saat difakturkan. Cetak surat jalan.
- **7c — Stok lanjut.** **Titik pesan otomatis** → usulan PO (tersambung Pengadaan); **multi-satuan
  (UOM)** + faktor konversi; **barcode**; **nomor seri** untuk barang bernilai tinggi/garansi.
- **7d — Pajak UMKM.** **PPh Final UMKM 0,5%** (PP 55/2022) dari omzet bulanan + setoran berjurnal;
  **PPh 23** + bukti potong; **SPT Masa PPN 1111** (rekap keluaran vs masukan + kurang/lebih bayar
  + ekspor).

### Gelombang B — Enterprise
- **7e — RBAC granular.** **Peran kustom** dengan **izin per modul**; Owner/Admin/Viewer jadi
  preset (aturan lama tak berubah). Sidebar menyaring modul tak diizinkan; API menolak akses modul
  terlarang.
- **7f — Akuntansi dimensi + rekonsiliasi v2.** **Cost center/departemen** opsional per baris
  jurnal + laporan **laba-rugi per dimensi**; **rekonsiliasi bank v2** (aturan auto-match tersimpan
  + impor format BCA/Mandiri/BRI).
- **7g — Proyek Gantt + Manufaktur routing.** **Gantt** (jadwal, dependensi, baseline);
  **work center + routing** produksi dengan biaya standar vs aktual & varian (WIP).
- **7h — Dashboard kustom + Excel + laporan terjadwal.** **Dashboard bisa disesuaikan** (pilih
  widget) + **grafik tren bulanan**; **ekspor Excel (.xlsx)** (tanpa pustaka pihak ketiga) di
  Laporan Penjualan & Neraca Saldo; **laporan terjadwal** — Cron menyusun rekap penjualan bulanan
  otomatis.

## Angka & mutu

- **Uji end-to-end: 523 → 617** (+94 sepanjang Fase 7) + **24 unit test**. Setiap PR: typecheck +
  test + build + smoke penuh hijau sebelum merge; CI “Typecheck, test, build & smoke” + deploy
  “Workers Builds: erpindo” hijau; screenshot dikirim ke pemilik.
- Migrasi tenant `0028_*` → **`0034_scheduled_reports`**; control-plane hingga `0003_custom_roles`.
  Semua backward-compatible.

## Checklist siap-launching

| Item | Status |
| --- | --- |
| Alur inti UMKM (jual–beli–stok–kas–pajak–gaji) lengkap & berjurnal otomatis | ✅ |
| Kualitas rapi & responsif (3 viewport), bahasa Indonesia baku | ✅ |
| Mode pemula (Catat Transaksi + mode Sederhana + glosarium) | ✅ |
| Asisten AI gratis (Workers AI) aktif + anti-macet (timeout klien) | ✅ |
| Pendalaman modul (POS, penjualan bertahap, stok, pajak UMKM, RBAC, dimensi, Gantt/routing, dashboard/Excel) | ✅ |
| Panduan 3 permukaan sinkron | ✅ |
| **Pembayaran langganan (Midtrans/Xendit)** | ⛔ **PEMBLOKIR #1 — menunggu Server Key pemilik** |
| Lampiran dokumen (R2) | ⏸ Menunggu aktivasi R2 pemilik |
| Integrasi kirim/marketplace (Biteship) | ⏸ Menunggu API key pemilik |
| Notifikasi WhatsApp | ⏸ Menunggu token pemilik |
| **Beta terbatas 5–10 UMKM nyata** | ⏭ Disarankan sebelum peluncuran publik |

## Kejujuran & rekomendasi

- **Midtrans tetap pemblokir launching #1.** Aplikasi belum bisa menerima pembayaran langganan
  hingga Server Key Midtrans/Xendit disediakan — ini **satu-satunya** yang menghalangi monetisasi,
  bukan kekurangan fitur. Semua prasyarat lain (R2, Biteship, WhatsApp) menunggu aset/keputusan
  pemilik dan **tidak** menghalangi pemakaian inti.
- **Saran langkah berikut:** aktifkan Midtrans → jalankan **beta terbatas 5–10 UMKM nyata**. Umpan
  balik pengguna sungguhan adalah penentu terakhir pendalaman mana yang benar-benar dipakai —
  lebih berharga daripada menambah fitur baru secara spekulatif.

Fase 7 selesai. Menunggu arahan pemilik untuk fase berikutnya.

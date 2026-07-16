# Log Kerja — Fase 9c: Efisiensi navigasi (taksonomi menu + pencarian + seksi lipat)

**Tanggal:** 16 Juli 2026 · Menjawab arahan pemilik "efisiensi layout menu dll".

## Masalah

39 item menu dalam daftar datar; grup **Keuangan membengkak 18 item**; dua item salah rumah
("Pemeliharaan" dan "Laporan Penjualan" nyangkut di Keuangan); 5 pasang ikon kembar
(Scale/Wallet/Layers/LineChart/ClipboardList dipakai 2 item); tak ada pencarian menu atau
cara meringkas sidebar.

## Yang diubah (hanya `apps/web/src/pages/app.tsx` — rute, label, izin TIDAK berubah)

**Taksonomi baru** (grup terburuk 18 → 9):

| Grup | Item |
| --- | --- |
| — | Dashboard |
| Transaksi (7) | Kasir (POS), Penjualan, Pesanan Penjualan, Pembelian, Pengadaan, Stok, Manufaktur |
| CRM (3) | Pipeline, Penawaran, Helpdesk |
| **Keuangan (9)** | Catat Transaksi, Kas & Bank, Bagan Akun, Jurnal Umum, Buku Besar, Anggaran, Dimensi & Rekon, Mata Uang, **Konsolidasi** (dari Lainnya) |
| **Laporan (6) — baru** | Neraca Saldo, Laba Rugi, Neraca, Arus Kas, Umur Piutang/Hutang, **Laporan Penjualan** (dari Keuangan) |
| **Aset & Pajak (4) — baru** | Aset Tetap, **Pemeliharaan** (dari Keuangan), Pajak, Ekspor e-Faktur |
| Master Data (3) | Produk, Kontak, Gudang |
| HR (2) | Penggajian, Absensi |
| Lainnya (4) | Proyek, Kontrak Berulang, Persetujuan, Pengaturan |

Ikon kembar dibereskan: Neraca Saldo→Sigma, Arus Kas→ArrowLeftRight, Konsolidasi→Combine,
Laporan Penjualan→BarChart3, Pengadaan→PackageSearch.

**Fitur baru:**
- **Pencarian menu** — kolom "Cari menu…" di atas sidebar; filter langsung, header grup kosong
  hilang, Escape membersihkan.
- **Seksi lipat** — semua header grup bisa diklik (chevron); pilihan tersimpan per pengguna
  (`localStorage erpindo-nav-collapsed`; tanpa simpanan = semua terbuka = perilaku lama);
  grup halaman aktif selalu dipaksa terbuka agar posisi pengguna tak tersembunyi.
- Mode Sederhana tak berubah semantik (4 item akuntansi teknisnya kini berada di
  Keuangan/Laporan).

## Validasi

Typecheck · lint bersih · unit test 33 · build · **smoke 668** (tak berubah) ·
**UI-SIM 122 → 130** (+8: taksonomi grup baru, Pemeliharaan terjangkau, filter pencarian +
Escape, lipat menyembunyikan 3 menu Master Data + persisten reload + pulih, bebas galat).
Screenshot sidebar baru (dashboard + grup Laporan aktif) dikirim ke pemilik.

## Berikutnya

Fase 9d (terakhir Fase 9): pecah `app.tsx`, komponen Modal/Tabs bersama, promosi job
UI simulation jadi wajib, + LAPORAN AKHIR FASE 9. Midtrans tetap pemblokir launching #1.

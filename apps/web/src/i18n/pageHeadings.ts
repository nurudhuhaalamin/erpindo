import { useLang, type Dual } from "./index";

/**
 * Judul + paragraf pengantar tiap halaman modul, dwibahasa (Fase 16a).
 *
 * Sebelumnya judul halaman selalu Bahasa Indonesia walau menu sidebar sudah
 * mengikuti bahasa aktif (Fase 13e) — menu "Products" tetapi isinya "Produk".
 * Kamus ini menutup ketidakselarasan itu untuk SELURUH halaman sekaligus,
 * dipakai lewat komponen `PageHeading`.
 *
 * Istilah standar Indonesia sengaja dipertahankan di teks Inggris (PPh 21 TER,
 * BPJS, e-Faktur, PP 55/2022, SPT Masa PPN) karena memang nama resmi —
 * konsisten dengan keputusan i18n landing (Fase 14f).
 */
export type PageHeadingEntry = { title: Dual; desc?: Dual };

export const PAGE_HEADINGS = {
  adminPlatform: {
    title: { id: "Admin Platform", en: "Platform Admin" },
    desc: {
      id: "Pantau pendaftar & langganan, tanggapi masukan pengguna, dan kelola artikel blog.",
      en: "Monitor sign-ups & subscriptions, respond to user feedback, and manage blog articles.",
    },
  },
  alatBantu: {
    title: { id: "Alat Bantu", en: "Tools" },
    desc: {
      id: "Kalkulator cepat untuk keputusan harga, pajak, dan gaji. Hitungan bantu perencanaan — bukan pencatatan resmi.",
      en: "Quick calculators for pricing, tax, and payroll decisions. Planning aids — not official records.",
    },
  },
  asetTetap: {
    title: { id: "Aset Tetap", en: "Fixed Assets" },
    desc: {
      id: "Register aset, penyusutan garis lurus otomatis tiap bulan (jurnal beban penyusutan), dan pelepasan aset.",
      en: "Asset register, automatic straight-line depreciation each month (depreciation expense journal), and asset disposal.",
    },
  },
  anggaran: {
    title: { id: "Anggaran", en: "Budget" },
    desc: {
      id: "Tetapkan target pendapatan & beban per akun tiap bulan, lalu bandingkan dengan realisasi dari jurnal.",
      en: "Set monthly income & expense targets per account, then compare them against actuals from your journals.",
    },
  },
  catatTransaksi: {
    title: { id: "Catat Transaksi", en: "Record a Transaction" },
    desc: {
      id: "Catat uang masuk, uang keluar, atau pindah dana dengan bahasa sehari-hari — pembukuan (jurnal) dibuat otomatis di belakang layar. Tanpa perlu paham debit-kredit.",
      en: "Record money in, money out, or a transfer in plain language — the bookkeeping entry is created automatically behind the scenes. No need to understand debits and credits.",
    },
  },
  kontrakBerulang: {
    title: { id: "Kontrak Berulang", en: "Recurring Contracts" },
    desc: {
      id: "Buat kontrak langganan — sistem menerbitkan faktur otomatis tiap periode. Bisa juga dipicu manual.",
      en: "Create subscription contracts — the system issues invoices automatically each period. Can also be triggered manually.",
    },
  },
  crmPipeline: {
    title: { id: "Pipeline", en: "Pipeline" },
    desc: {
      id: "Catat calon pelanggan, gerakkan lewat tahap funnel, lalu konversi jadi pelanggan.",
      en: "Track leads, move them through your funnel stages, then convert them into customers.",
    },
  },
  crmPenawaran: {
    title: { id: "Penawaran", en: "Quotations" },
    desc: {
      id: "Buat penawaran harga untuk pelanggan. Saat diterima, konversi sekali klik menjadi faktur penjualan.",
      en: "Create price quotes for customers. Once accepted, convert them into a sales invoice in one click.",
    },
  },
  mataUang: {
    title: { id: "Mata Uang", en: "Currencies" },
    desc: {
      id: "IDR adalah mata uang dasar. Tetapkan kurs valas untuk membuat faktur dalam mata uang asing — pembukuan tetap dalam Rupiah, dan selisih kurs saat pelunasan dijurnal otomatis.",
      en: "IDR is the base currency. Set exchange rates to issue invoices in foreign currencies — your books stay in Rupiah, and forex differences on settlement are journaled automatically.",
    },
  },
  dimensiRekonsiliasi: {
    title: { id: "Dimensi & Rekonsiliasi", en: "Dimensions & Reconciliation" },
    desc: {
      id: "Cost center / departemen untuk laporan laba-rugi per unit, dan aturan auto-match rekonsiliasi bank.",
      en: "Cost centers / departments for per-unit profit & loss reporting, plus auto-match rules for bank reconciliation.",
    },
  },
  dukungan: {
    title: { id: "Dukungan & Masukan", en: "Support & Feedback" },
    desc: {
      id: "Ada kendala, ide fitur, atau pertanyaan? Sampaikan di sini — masukan Anda dibaca langsung oleh pengelola ERPindo dan ikut menentukan prioritas pengembangan.",
      en: "Hit a problem, have a feature idea, or a question? Send it here — your feedback is read directly by the ERPindo team and helps shape our roadmap.",
    },
  },
  baganAkun: {
    title: { id: "Bagan Akun", en: "Chart of Accounts" },
    desc: {
      id: "Daftar akun pembukuan (COA) standar Indonesia — fondasi semua jurnal dan laporan.",
      en: "The Indonesian-standard chart of accounts (COA) — the foundation of every journal entry and report.",
    },
  },
  jurnalUmum: {
    title: { id: "Jurnal Umum", en: "General Journal" },
    desc: {
      id: "Catat transaksi manual dengan debit = kredit. Jurnal terposting tidak bisa diubah — koreksi lewat jurnal pembalik.",
      en: "Record manual entries with debits = credits. Posted entries cannot be edited — correct them with a reversing entry.",
    },
  },
  bukuBesar: {
    title: { id: "Buku Besar", en: "General Ledger" },
    desc: {
      id: "Riwayat lengkap satu akun: setiap jurnal yang menyentuhnya beserta saldo berjalan.",
      en: "The full history of one account: every entry that touches it, with a running balance.",
    },
  },
  neracaSaldo: {
    title: { id: "Neraca Saldo", en: "Trial Balance" },
    desc: {
      id: "Ringkasan saldo semua akun — total debit dan kredit harus selalu sama.",
      en: "A summary of every account balance — total debits and credits must always match.",
    },
  },
  kasBank: {
    title: { id: "Kas & Bank", en: "Cash & Bank" },
    desc: {
      id: "Saldo dan mutasi tiap akun kas/bank, plus rekonsiliasi dengan rekening koran — pastikan catatan Anda sama dengan catatan bank.",
      en: "Balances and movements for each cash/bank account, plus reconciliation against your bank statement — make sure your records match the bank's.",
    },
  },
  marketplace: {
    title: { id: "Pesanan Marketplace", en: "Marketplace Orders" },
    desc: {
      id: "Impor pesanan dari Shopee, Tokopedia, atau TikTok Shop (ekspor CSV) — tiap pesanan otomatis jadi faktur penjualan beserta pengurangan stok. Aman diulang: pesanan yang sudah masuk dilewati.",
      en: "Import orders from Shopee, Tokopedia, or TikTok Shop (CSV export) — each order automatically becomes a sales invoice with stock deducted. Safe to repeat: orders already imported are skipped.",
    },
  },
  produk: {
    title: { id: "Produk", en: "Products" },
    desc: {
      id: "Katalog barang & jasa Anda — harga jual/beli, satuan, pelacakan kedaluwarsa, dan ambang stok minimum.",
      en: "Your catalogue of goods & services — selling/buying prices, units, expiry tracking, and minimum stock thresholds.",
    },
  },
  kontak: {
    title: { id: "Kontak", en: "Contacts" },
    desc: {
      id: "Pelanggan dan pemasok dalam satu daftar — dipakai di faktur, kontrak, dan tiket dukungan.",
      en: "Customers and suppliers in a single list — used across invoices, contracts, and support tickets.",
    },
  },
  gudang: {
    title: { id: "Gudang", en: "Warehouses" },
    desc: {
      id: "Lokasi penyimpanan stok. Setiap transaksi barang selalu tercatat per gudang.",
      en: "Stock storage locations. Every goods movement is always recorded per warehouse.",
    },
  },
  migrasi: {
    title: { id: "Migrasi & saldo awal", en: "Migration & opening balances" },
    desc: {
      id: "Pindah dari sistem lama? Masukkan saldo awal akun & stok. Sistem menyusun satu jurnal pembuka yang otomatis seimbang — selisih masuk ke Ekuitas Saldo Awal (Laba Ditahan).",
      en: "Moving from an older system? Enter your opening account & stock balances. The system builds a single opening entry that balances automatically — any difference goes to Opening Equity (Retained Earnings).",
    },
  },
  pajak: {
    title: { id: "Pajak", en: "Tax" },
    desc: {
      id: "PPh Final UMKM 0,5% (PP 55/2022), pemotongan PPh 23 + bukti potong, dan rekap SPT Masa PPN 1111.",
      en: "0.5% final small-business income tax (PP 55/2022), PPh 23 withholding + withholding slips, and the SPT Masa PPN 1111 summary.",
    },
  },
  penggajian: {
    title: { id: "Penggajian", en: "Payroll" },
    desc: {
      id: "Kelola karyawan dan jalankan penggajian bulanan — PPh 21 (TER) & BPJS dihitung otomatis, jurnal beban gaji dibuat sendiri.",
      en: "Manage employees and run monthly payroll — PPh 21 (TER) & BPJS are calculated automatically, and the payroll expense journal is created for you.",
    },
  },
  proyek: {
    title: { id: "Proyek", en: "Projects" },
    desc: {
      id: "Kelompokkan pendapatan & biaya per proyek (tag faktur/jurnal ke proyek) dan lihat profitabilitasnya.",
      en: "Group income & costs per project (tag invoices/entries to a project) and see its profitability.",
    },
  },
  labaRugi: {
    title: { id: "Laba Rugi", en: "Profit & Loss" },
    desc: {
      id: "Pendapatan dikurangi beban untuk periode pilihan Anda — dihitung langsung dari jurnal.",
      en: "Income minus expenses for the period you choose — calculated straight from your journals.",
    },
  },
  arusKas: {
    title: { id: "Arus Kas", en: "Cash Flow" },
    desc: {
      id: "Uang masuk dan keluar dari akun kas & bank untuk periode pilihan, dengan saldo awal dan akhir.",
      en: "Money in and out of your cash & bank accounts for the chosen period, with opening and closing balances.",
    },
  },
  eFaktur: {
    title: { id: "Ekspor e-Faktur", en: "e-Faktur Export" },
    desc: {
      id: "Rekap faktur keluaran ber-PPN per periode — siap diunduh untuk pelaporan pajak.",
      en: "A per-period summary of VAT output invoices — ready to download for tax reporting.",
    },
  },
  laporanPenjualan: {
    title: { id: "Laporan Penjualan", en: "Sales Report" },
    desc: {
      id: "Produk terlaris dan pelanggan terbesar pada rentang tanggal — dari faktur (di luar yang dibatalkan).",
      en: "Best-selling products and biggest customers over a date range — from invoices (excluding voided ones).",
    },
  },
  stok: {
    title: { id: "Stok", en: "Stock" },
    desc: {
      id: "Level stok per gudang beserta nilai persediaan, kartu stok, transfer antar gudang, dan opname.",
      en: "Stock levels per warehouse with inventory value, stock cards, inter-warehouse transfers, and stock takes.",
    },
  },
  penjualan: {
    title: { id: "Penjualan", en: "Sales" },
  },
  pembelian: {
    title: { id: "Pembelian", en: "Purchases" },
  },
  konsolidasi: {
    title: { id: "Konsolidasi", en: "Consolidation" },
  },
  neraca: {
    title: { id: "Neraca", en: "Balance Sheet" },
  },
  kasirPos: {
    title: { id: "Kasir (POS)", en: "Cashier (POS)" },
  },
  umurPiutang: {
    title: { id: "Umur Piutang", en: "Receivables Aging" },
  },
  umurHutang: {
    title: { id: "Umur Hutang", en: "Payables Aging" },
  },
  pesananPenjualan: {
    title: { id: "Pesanan Penjualan", en: "Sales Orders" },
    desc: {
      id: "Alur bertahap: pesanan (SO) → surat jalan (barang keluar) → faktur. Bisa terima uang muka sebelum faktur.",
      en: "A staged flow: order (SO) → delivery note (goods out) → invoice. A down payment can be taken before invoicing.",
    },
  },
  absensi: {
    title: { id: "Absensi", en: "Attendance" },
    desc: {
      id: "Catat kehadiran harian karyawan dan lihat rekap bulanan per orang.",
      en: "Record daily staff attendance and review the monthly recap per person.",
    },
  },
  persetujuan: {
    title: { id: "Persetujuan", en: "Approvals" },
    desc: {
      id: "Alur persetujuan berjenjang — atur aturan per jenis dokumen & nominal, lalu setujui berurutan sesuai peran.",
      en: "Multi-step approval flows — set rules per document type and amount, then approve in sequence by role.",
    },
  },
  pengadaan: {
    title: { id: "Pengadaan (Procurement)", en: "Procurement" },
    desc: {
      id: "Alur pengadaan lengkap: permintaan barang → pesanan ke pemasok → penerimaan barang (otomatis jadi faktur pembelian & stok masuk).",
      en: "The full procurement flow: purchase requisition → supplier order → goods receipt (which automatically becomes a purchase invoice and stock in).",
    },
  },
  helpdesk: {
    title: { id: "Helpdesk", en: "Helpdesk" },
    desc: {
      id: "Kelola tiket dukungan pelanggan — prioritas, status, penugasan ke tim, dan riwayat balasan (termasuk catatan internal).",
      en: "Manage customer support tickets — priority, status, team assignment, and reply history (including internal notes).",
    },
  },
  pemeliharaan: {
    title: { id: "Pemeliharaan", en: "Maintenance" },
    desc: {
      id: "Jadwalkan servis berkala per aset — sistem menerbitkan work order otomatis saat jatuh tempo. Catat biaya servis yang langsung dijurnal sebagai Beban Pemeliharaan.",
      en: "Schedule recurring servicing per asset — the system issues work orders automatically when they fall due. Log servicing costs, journaled straight to Maintenance Expense.",
    },
  },
  manufaktur: {
    title: { id: "Manufaktur & QC", en: "Manufacturing & QC" },
    desc: {
      id: "Susun resep produk (BoM), lalu jalankan perintah produksi: bahan dikonsumsi dari stok dan produk jadi masuk stok dengan biaya gabungan. Inspeksi QC menentukan hasil siap jual atau dikarantina.",
      en: "Build product recipes (BoM), then run production orders: materials are consumed from stock and finished goods enter stock at a combined cost. QC inspection decides whether output is sellable or quarantined.",
    },
  },
  panduanApp: {
    title: { id: "Panduan", en: "Guide" },
    desc: {
      id: "Cara memakai setiap fitur — dari faktur pertama sampai ekspor pajak. Semua tanpa meninggalkan aplikasi.",
      en: "How to use every feature — from your first invoice to tax exports. All without leaving the app.",
    },
  },
} as const satisfies Record<string, PageHeadingEntry>;

export type PageHeadingKey = keyof typeof PAGE_HEADINGS;

/**
 * Judul & pengantar halaman dalam bahasa aktif, untuk halaman yang tata letak
 * headernya khas (judul dinamis, atau judul & pengantar terpisah) sehingga tak
 * bisa memakai komponen `PageHeading`.
 */
export function useHeading(k: PageHeadingKey): { title: string; desc: string } {
  const lang = useLang();
  const h = PAGE_HEADINGS[k];
  return { title: h.title[lang], desc: "desc" in h ? h.desc[lang] : "" };
}

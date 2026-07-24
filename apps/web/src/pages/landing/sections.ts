import {
  BookOpenCheck,
  Boxes,
  Coins,
  Factory,
  FileSpreadsheet,
  Landmark,
  LineChart,
  ReceiptText,
  ShieldCheck,
  Store,
  Target,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { TRIAL_DAYS } from "@erpindo/shared";
import type { Dual } from "../../i18n";

/**
 * Konten seksi landing — dipisah dari markup agar mudah dirawat. Seluruh teks
 * dwibahasa `{ id, en }` (Fase 14f); komponen memilih via `pick(x, lang)`.
 */

export const TRUST_POINTS: { value: Dual; label: Dual }[] = [
  { value: { id: "800+", en: "800+" }, label: { id: "uji otomatis menjaga tiap rilis", en: "automated tests guard every release" } },
  { value: { id: "1 database / perusahaan", en: "1 database / company" }, label: { id: "data Anda benar-benar terisolasi", en: "your data is truly isolated" } },
  { value: { id: "PPh 21 TER · Coretax", en: "PPh 21 TER · Coretax" }, label: { id: "standar pajak Indonesia 2026", en: "Indonesian tax standards 2026" } },
  { value: { id: "PWA offline", en: "Offline PWA" }, label: { id: "tetap jalan saat internet putus", en: "keeps working when the internet drops" } },
];

export type ShowcaseItem = {
  id: string;
  label: Dual;
  icon: LucideIcon;
  image: string;
  title: Dual;
  benefits: Dual[];
};

export const SHOWCASE: ShowcaseItem[] = [
  {
    id: "pos",
    label: { id: "Kasir (POS)", en: "POS Cashier" },
    icon: Store,
    image: "/landing/showcase-pos.webp",
    title: { id: "Kasir cepat yang langsung masuk pembukuan", en: "A fast cashier that flows straight into your books" },
    benefits: [
      { id: "Layar kasir ringkas dengan pencarian produk kilat & diskon per item", en: "A tidy cashier screen with instant product search & per-item discounts" },
      { id: "Sesi shift kas — buka, jual, tutup; selisih kas otomatis terjurnal", en: "Cash shift sessions — open, sell, close; cash variance auto-journaled" },
      { id: "Cetak struk berlogo dan tetap bisa berjualan saat offline (PWA)", en: "Print branded receipts and keep selling offline (PWA)" },
    ],
  },
  {
    id: "faktur",
    label: { id: "Faktur & PPN", en: "Invoices & VAT" },
    icon: ReceiptText,
    image: "/landing/showcase-penjualan.webp",
    title: { id: "Faktur profesional dalam hitungan detik", en: "Professional invoices in seconds" },
    benefits: [
      { id: "Sekali posting: jurnal, stok, dan piutang beres bersamaan", en: "Post once: journal, stock, and receivables all settle together" },
      { id: "PPN 0/11/12% + diskon per baris dihitung otomatis", en: "VAT 0/11/12% + per-line discounts calculated automatically" },
      { id: "Salah input? Batalkan atau retur — pembukuan terbalik dengan persis", en: "Mistake? Void or return — the books reverse exactly" },
    ],
  },
  {
    id: "laporan",
    label: { id: "Laporan Keuangan", en: "Financial Reports" },
    icon: LineChart,
    image: "/landing/showcase-laporan.webp",
    title: { id: "Laba rugi & neraca real-time, selalu seimbang", en: "Real-time P&L and balance sheet, always balanced" },
    benefits: [
      { id: "Laba Rugi, Neraca, Arus Kas & umur piutang dari satu sumber: jurnal", en: "P&L, Balance Sheet, Cash Flow & receivables aging from one source: the journal" },
      { id: "Double-entry sungguhan — neraca dijamin seimbang oleh sistem", en: "True double-entry — the system guarantees a balanced sheet" },
      { id: "Ekspor CSV untuk Excel, cetak rapi, dan tutup buku per periode", en: "CSV export for Excel, clean printing, and period close" },
    ],
  },
  {
    id: "gaji",
    label: { id: "Gaji & PPh 21", en: "Payroll & Tax" },
    icon: Wallet,
    image: "/landing/showcase-gaji.webp",
    title: { id: "Gajian sekali klik, pajak sudah dihitung", en: "One-click payroll with tax already computed" },
    benefits: [
      { id: "PPh 21 metode TER terbaru + BPJS Kesehatan & Ketenagakerjaan otomatis", en: "Latest PPh 21 (TER method) + BPJS health & employment, automatic" },
      { id: "Slip gaji per karyawan siap cetak/kirim", en: "Per-employee payslips ready to print/send" },
      { id: "Beban gaji langsung terjurnal — laporan keuangan ikut akurat", en: "Payroll expense auto-journaled — reports stay accurate" },
    ],
  },
  {
    id: "stok",
    label: { id: "Stok & FEFO", en: "Stock & FEFO" },
    icon: Boxes,
    image: "/landing/showcase-stok.webp",
    title: { id: "Stok akurat sampai ke lot kedaluwarsa", en: "Accurate stock down to expiry lots" },
    benefits: [
      { id: "Multi-gudang dengan HPP rata-rata otomatis di setiap penjualan", en: "Multi-warehouse with automatic moving-average COGS on every sale" },
      { id: "Lot & tanggal kedaluwarsa — keluar otomatis yang paling dekat exp (FEFO)", en: "Lots & expiry dates — nearest-expiry goes out first (FEFO)" },
      { id: "Ambang stok minimum + lonceng peringatan sebelum kehabisan", en: "Minimum-stock thresholds + bell alerts before you run out" },
    ],
  },
];

export const FEATURE_GROUPS: { icon: LucideIcon; title: Dual; desc: Dual }[] = [
  { icon: BookOpenCheck, title: { id: "Keuangan & Akuntansi", en: "Finance & Accounting" }, desc: { id: "Jurnal double-entry otomatis, buku besar, neraca, laba rugi, arus kas, dan tutup buku.", en: "Automatic double-entry journals, ledger, balance sheet, P&L, cash flow, and period close." } },
  { icon: ReceiptText, title: { id: "Faktur & Pembayaran", en: "Invoices & Payments" }, desc: { id: "Faktur jual/beli, PPN otomatis, cetak/PDF berkop, catat sampai lunas, retur nota kredit.", en: "Sales/purchase invoices, automatic VAT, branded print/PDF, payment tracking, credit-note returns." } },
  { icon: Boxes, title: { id: "Stok & Gudang", en: "Stock & Warehouse" }, desc: { id: "Stok multi-gudang, HPP rata-rata, lot & kedaluwarsa (FEFO), transfer, dan stok opname.", en: "Multi-warehouse stock, moving-average COGS, lots & expiry (FEFO), transfers, and stock counts." } },
  { icon: Store, title: { id: "Kasir (POS)", en: "POS Cashier" }, desc: { id: "Layar kasir cepat, sesi shift kas, cetak struk, dan tetap jalan saat offline.", en: "Fast cashier screen, cash shift sessions, receipt printing, and offline operation." } },
  { icon: Target, title: { id: "CRM & Helpdesk", en: "CRM & Helpdesk" }, desc: { id: "Pipeline lead & penawaran, konversi ke pelanggan, plus tiket dukungan pelanggan.", en: "Lead & quotation pipeline, conversion to customers, plus customer support tickets." } },
  { icon: UsersRound, title: { id: "HR & Payroll", en: "HR & Payroll" }, desc: { id: "Data karyawan, gaji, hitung PPh 21 metode TER + BPJS, slip gaji & jurnal otomatis.", en: "Employee data, payroll, PPh 21 (TER) + BPJS calculation, payslips & automatic journals." } },
  { icon: Landmark, title: { id: "Aset & Maintenance", en: "Assets & Maintenance" }, desc: { id: "Register aset, penyusutan otomatis, jadwal servis berkala, dan work order berbiaya.", en: "Asset register, automatic depreciation, scheduled servicing, and costed work orders." } },
  { icon: Factory, title: { id: "Manufaktur & QC", en: "Manufacturing & QC" }, desc: { id: "Bill of Materials, perintah produksi biaya gabungan, dan inspeksi QC lulus/karantina.", en: "Bill of Materials, combined-cost production orders, and QC inspection pass/quarantine." } },
  { icon: Coins, title: { id: "Multi-perusahaan & Valas", en: "Multi-company & FX" }, desc: { id: "Kelola banyak perusahaan satu akun, laporan konsolidasi, dan faktur multi mata uang.", en: "Manage many companies from one account, consolidated reports, and multi-currency invoices." } },
  { icon: FileSpreadsheet, title: { id: "Pajak & Kepatuhan", en: "Tax & Compliance" }, desc: { id: "Ekspor e-Faktur XML Coretax, PPN, dan PPh 21 — mengikuti standar perpajakan Indonesia.", en: "e-Faktur XML export for Coretax, VAT, and PPh 21 — following Indonesian tax standards." } },
  { icon: ShieldCheck, title: { id: "Keamanan & Platform", en: "Security & Platform" }, desc: { id: "Database terpisah tiap perusahaan, peran akses, 2FA, audit log, dan PWA offline.", en: "Separate database per company, access roles, 2FA, audit log, and offline PWA." } },
];

export const COMPARISON: { topic: Dual; manual: Dual; erpindo: Dual }[] = [
  { topic: { id: "Catat penjualan", en: "Record a sale" }, manual: { id: "Tulis nota, salin ke buku, hitung ulang di Excel", en: "Write a note, copy to a book, recompute in Excel" }, erpindo: { id: "Sekali input — jurnal, stok & piutang otomatis", en: "One entry — journal, stock & receivables automatic" } },
  { topic: { id: "Hitung PPN & e-Faktur", en: "Compute VAT & e-Faktur" }, manual: { id: "Rekap manual tiap masa pajak, rawan selisih", en: "Manual recap each tax period, error-prone" }, erpindo: { id: "PPN otomatis + unduh XML siap impor Coretax", en: "Automatic VAT + XML download ready for Coretax" } },
  { topic: { id: "Gaji & PPh 21", en: "Payroll & PPh 21" }, manual: { id: "Hitung TER per karyawan di kalkulator/Excel", en: "Compute TER per employee in a calculator/Excel" }, erpindo: { id: "Sekali klik — TER, BPJS, slip gaji & jurnal beres", en: "One click — TER, BPJS, payslips & journals done" } },
  { topic: { id: "Stok & HPP", en: "Stock & COGS" }, manual: { id: "Stok sering selisih, HPP ditebak", en: "Stock often mismatches, COGS is guessed" }, erpindo: { id: "HPP rata-rata otomatis, opname & FEFO tercatat", en: "Automatic moving-average COGS, counts & FEFO recorded" } },
  { topic: { id: "Laporan keuangan", en: "Financial reports" }, manual: { id: "Disusun berhari-hari di akhir bulan", en: "Compiled over days at month-end" }, erpindo: { id: "Laba Rugi & Neraca real-time kapan pun", en: "Real-time P&L & Balance Sheet anytime" } },
  { topic: { id: "Tagihan telat", en: "Late invoices" }, manual: { id: "Baru sadar saat kas menipis", en: "Only noticed when cash runs low" }, erpindo: { id: "Umur piutang + lonceng pengingat jatuh tempo", en: "Receivables aging + due-date reminder bells" } },
];

/** Daftar modul yang semuanya termasuk dalam paket (dipakai seksi Harga). */
export const SINGLE_PLAN_MODULES: Dual[] = [
  { id: "Akuntansi double-entry", en: "Double-entry accounting" },
  { id: "Faktur & PPN (Coretax)", en: "Invoices & VAT (Coretax)" },
  { id: "Kasir (POS) + shift kas", en: "POS cashier + cash shifts" },
  { id: "Stok multi-gudang & FEFO", en: "Multi-warehouse stock & FEFO" },
  { id: "Penjualan SO → Surat Jalan", en: "Sales SO → Delivery Order" },
  { id: "Pembelian & pengadaan", en: "Purchasing & procurement" },
  { id: "Gaji + PPh 21 TER + BPJS", en: "Payroll + PPh 21 TER + BPJS" },
  { id: "Absensi & cuti karyawan", en: "Attendance & employee leave" },
  { id: "CRM pipeline & penawaran", en: "CRM pipeline & quotations" },
  { id: "Proyek, RAB & timesheet", en: "Projects, budgets & timesheets" },
  { id: "Manufaktur, BoM & QC", en: "Manufacturing, BoM & QC" },
  { id: "Aset tetap & penyusutan", en: "Fixed assets & depreciation" },
  { id: "Pajak UMKM & e-Faktur", en: "SME tax & e-Faktur" },
  { id: "Anggaran & rekonsiliasi bank", en: "Budgets & bank reconciliation" },
  { id: "Persetujuan berjenjang", en: "Multi-level approvals" },
  { id: "Laporan lengkap + Excel", en: "Full reports + Excel" },
];

/**
 * Perbandingan implisit per KATEGORI (Fase 13c) — tanpa menyebut merek.
 */
export const CATEGORY_COMPARISON: { label: Dual; rows: Dual[] }[] = [
  { label: { id: "Biaya per pengguna", en: "Cost per user" }, rows: [{ id: "—", en: "—" }, { id: "Naik per user", en: "Rises per user" }, { id: "Rp 300–400rb/user", en: "Rp 300–400k/user" }, { id: "Lisensi mahal", en: "Expensive licenses" }, { id: "Rp 0 (tak terbatas)", en: "Rp 0 (unlimited)" }] },
  { label: { id: "Modul operasional (HR, manufaktur, proyek)", en: "Operational modules (HR, manufacturing, projects)" }, rows: [{ id: "✗", en: "✗" }, { id: "✗", en: "✗" }, { id: "Add-on berbayar", en: "Paid add-on" }, { id: "✓", en: "✓" }, { id: "✓ (paket Business)", en: "✓ (Business plan)" }] },
  { label: { id: "Waktu sampai aktif", en: "Time to go live" }, rows: [{ id: "—", en: "—" }, { id: "Beberapa hari", en: "A few days" }, { id: "Berminggu-minggu", en: "Weeks" }, { id: "Berbulan-bulan", en: "Months" }, { id: "Hari ini", en: "Today" }] },
  { label: { id: "Biaya implementasi", en: "Implementation cost" }, rows: [{ id: "—", en: "—" }, { id: "—", en: "—" }, { id: "Jutaan", en: "Millions" }, { id: "Ratusan juta", en: "Hundreds of millions" }, { id: "Mulai Rp 0 (mandiri)", en: "From Rp 0 (self-serve)" }] },
  { label: { id: "Multi-perusahaan + konsolidasi", en: "Multi-company + consolidation" }, rows: [{ id: "✗", en: "✗" }, { id: "Terbatas", en: "Limited" }, { id: "Add-on", en: "Add-on" }, { id: "✓", en: "✓" }, { id: "✓ (paket Enterprise)", en: "✓ (Enterprise plan)" }] },
];
export const CATEGORY_COMPARISON_HEADERS: Dual[] = [
  { id: "Spreadsheet", en: "Spreadsheet" },
  { id: "Software akuntansi", en: "Accounting software" },
  { id: "ERP per-pengguna", en: "Per-user ERP" },
  { id: "ERP konvensional", en: "Conventional ERP" },
  { id: "ERPindo", en: "ERPindo" },
];

export const SECURITY_POINTS: { title: Dual; desc: Dual }[] = [
  { title: { id: "Database terpisah per perusahaan", en: "Separate database per company" }, desc: { id: "Data Anda tidak bercampur dengan pengguna lain — setiap perusahaan berdiri di database sendiri.", en: "Your data never mixes with other users — each company sits in its own database." } },
  { title: { id: "Terenkripsi & jurnal terkunci", en: "Encrypted & locked journals" }, desc: { id: "Seluruh lalu lintas lewat HTTPS, kredensial sensitif tersimpan terenkripsi, dan jurnal akuntansi permanen — dikoreksi lewat jurnal pembalik, tak pernah dihapus.", en: "All traffic over HTTPS, sensitive credentials stored encrypted, and accounting journals are permanent — corrected via reversing entries, never deleted." } },
  { title: { id: "Verifikasi dua langkah (2FA)", en: "Two-factor authentication (2FA)" }, desc: { id: "Lindungi akun dengan kode dari aplikasi authenticator, bukan hanya password.", en: "Protect accounts with a code from an authenticator app, not just a password." } },
  { title: { id: "Peran akses & audit log", en: "Access roles & audit log" }, desc: { id: "Atur siapa boleh apa, dan setiap perubahan penting terekam jejaknya.", en: "Control who can do what, and every important change is traced." } },
  { title: { id: "Data Anda milik Anda", en: "Your data is yours" }, desc: { id: "Unduh seluruh data (ZIP berisi CSV) kapan pun — bahkan setelah langganan berakhir.", en: "Download all your data (a ZIP of CSVs) anytime — even after your subscription ends." } },
];

export const FAQ: { q: Dual; a: Dual }[] = [
  { q: { id: "Apakah butuh kartu kredit untuk mencoba?", en: "Do I need a credit card to try it?" }, a: { id: `Tidak. Uji coba ${TRIAL_DAYS} hari gratis dengan semua fitur — tanpa kartu kredit, siap dipakai dalam 1 menit.`, en: `No. A free ${TRIAL_DAYS}-day trial with all features — no credit card, ready in 1 minute.` } },
  { q: { id: "Bagaimana pilihan paketnya?", en: "How do the plans work?" }, a: { id: "Ada tiga paket — Starter, Business, dan Enterprise — yang dibedakan oleh kedalaman modul dan jumlah entitas, BUKAN jumlah pengguna. Pengguna selalu tak terbatas di semua paket. Akuntansi inti (jurnal, faktur, POS, stok, pajak, laporan) tersedia di semua paket.", en: "Three plans — Starter, Business, and Enterprise — differ by module depth and number of entities, NOT user count. Users are always unlimited on every plan. Core accounting (journals, invoices, POS, stock, tax, reports) is in every plan." } },
  { q: { id: "Bisakah melihat-lihat dulu tanpa mendaftar?", en: "Can I look around without signing up?" }, a: { id: "Bisa. Klik \"Lihat Demo\" untuk masuk ke perusahaan contoh yang datanya sudah terisi lengkap — mode baca-saja, tanpa membuat akun.", en: "Yes. Click \"View Demo\" to enter a sample company fully filled with data — read-only, no account needed." } },
  { q: { id: "Apakah data saya aman dan terpisah?", en: "Is my data safe and separated?" }, a: { id: "Ya. Setiap perusahaan punya database sendiri (terisolasi), dilengkapi peran & hak akses, verifikasi dua langkah (2FA), audit log, dan tutup buku.", en: "Yes. Each company has its own isolated database, with roles & permissions, two-factor authentication (2FA), an audit log, and period close." } },
  { q: { id: "Bisakah mengelola beberapa perusahaan?", en: "Can I manage multiple companies?" }, a: { id: "Bisa — dari satu akun Anda dapat membuat beberapa badan usaha, lalu melihat laporan Laba Rugi & Neraca konsolidasi lintas perusahaan.", en: "Yes — from one account you can create several entities, then view consolidated P&L & Balance Sheet across companies." } },
  { q: { id: "Apakah mendukung PPN dan Coretax?", en: "Does it support VAT and Coretax?" }, a: { id: "Ya. PPN dihitung otomatis di faktur (termasuk DPP nilai lain 11/12 sesuai PMK 131/2024), dan faktur keluaran bisa diunduh sebagai XML yang langsung diimpor ke Coretax DJP. Payroll menghitung PPh 21 metode TER + BPJS.", en: "Yes. VAT is computed automatically on invoices (including the 11/12 alternative tax base per PMK 131/2024), and output invoices export as XML that imports directly into Coretax (DJP). Payroll computes PPh 21 (TER) + BPJS." } },
  { q: { id: "Bisakah dipakai saat offline?", en: "Can it be used offline?" }, a: { id: "Bisa. erpindo adalah PWA yang bisa dipasang di HP/tablet/komputer dan tetap terbuka saat koneksi terputus.", en: "Yes. ERPindo is a PWA installable on phone/tablet/computer and stays open when the connection drops." } },
  { q: { id: "Berapa lama proses setup-nya?", en: "How long is setup?" }, a: { id: "Daftar, verifikasi email, dan langsung pakai — bagan akun standar Indonesia sudah tersedia otomatis. Checklist 'Mulai cepat' memandu langkah pertama Anda.", en: "Sign up, verify email, and start — a standard Indonesian chart of accounts is ready automatically. A 'Quick start' checklist guides your first steps." } },
  { q: { id: "Saya sudah punya data di Excel. Bisa dipindahkan?", en: "I already have data in Excel. Can it be migrated?" }, a: { id: "Bisa. Impor produk dan kontak dari berkas CSV/Excel dengan pratinjau & laporan per baris, jadi tidak perlu mengetik ulang.", en: "Yes. Import products and contacts from CSV/Excel with a preview & per-row report, so no retyping." } },
  { q: { id: "Bagaimana cara pembayaran langganan?", en: "How do I pay for a subscription?" }, a: { id: "Pembayaran online via Midtrans (QRIS/transfer/kartu/e-wallet) — akun aktif otomatis setelah pembayaran terkonfirmasi. Untuk grup/holding atau butuh pendampingan implementasi, jadwalkan demo dan tim kami akan menghubungi Anda.", en: "Online payment via Midtrans (QRIS/transfer/card/e-wallet) — your account activates automatically once payment is confirmed. For groups/holdings or implementation help, schedule a demo and our team will reach out." } },
  { q: { id: "Bagaimana jika saya berhenti berlangganan?", en: "What if I cancel my subscription?" }, a: { id: "Data Anda tetap milik Anda. Akun beralih ke mode baca-saja dan Anda tetap bisa mengunduh seluruh data (ZIP berisi CSV per tabel) kapan pun.", en: "Your data stays yours. The account switches to read-only and you can still download all your data (a ZIP of CSVs per table) anytime." } },
];

export function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

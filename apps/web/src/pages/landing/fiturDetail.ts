import {
  BookOpenCheck,
  Boxes,
  Combine,
  FileSpreadsheet,
  LineChart,
  ReceiptText,
  ShieldCheck,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Dual } from "../../i18n";

/**
 * Konten mendalam per modul untuk halaman `/fitur` (Fase 18f).
 *
 * Dipisah dari `sections.ts` supaya berkas itu tetap fokus pada halaman depan,
 * TETAPI sengaja tinggal di folder yang sama: keduanya harus dirawat bersama
 * agar landing dan `/fitur` tidak saling bertentangan.
 *
 * Bentuk tiap entri mengikuti urutan yang benar-benar dipikirkan calon pemakai:
 * masalah yang ia rasakan → apa yang aplikasi lakukan → apa hasilnya. Bukan
 * daftar kemampuan, karena daftar kemampuan tidak menjawab "buat saya apa".
 *
 * Gambar memakai tangkapan layar produk NYATA yang sudah ada di
 * `public/landing/` dan `public/panduan/` (diregenerasi tema terang pada 18a).
 */
export type ModulDetail = {
  id: string;
  icon: LucideIcon;
  nama: Dual;
  /** Masalah yang dirasakan sebelum memakai ERPindo. */
  masalah: Dual;
  /** Bagaimana ERPindo mengerjakannya — langkah konkret, bukan kata sifat. */
  cara: Dual[];
  /** Hasil yang didapat, sedapat mungkin bisa diperiksa sendiri. */
  hasil: Dual;
  gambar: string;
};

export const MODUL_DETAIL: ModulDetail[] = [
  {
    id: "akuntansi",
    icon: BookOpenCheck,
    nama: { id: "Akuntansi & Jurnal", en: "Accounting & Journals" },
    masalah: {
      id: "Pembukuan dikerjakan dua kali: sekali di buku penjualan, sekali lagi saat menyusun laporan. Begitu ada yang tidak cocok, tidak jelas angka mana yang benar.",
      en: "The books get done twice: once in the sales log, again when compiling reports. When something doesn't match, it's unclear which number is right.",
    },
    cara: [
      {
        id: "Setiap transaksi — faktur, kasir, gaji, penyusutan aset — otomatis membuat jurnal double-entry saat disimpan. Tidak ada langkah 'posting ke akuntansi' yang bisa terlupa.",
        en: "Every transaction — invoice, POS sale, payroll, depreciation — automatically creates a double-entry journal on save. There is no separate 'post to accounting' step to forget.",
      },
      {
        id: "Bagan akun standar Indonesia sudah terpasang sejak hari pertama, dan bisa ditambah sendiri.",
        en: "A standard Indonesian chart of accounts is preloaded from day one, and you can extend it yourself.",
      },
      {
        id: "Jurnal tidak pernah dihapus. Koreksi dilakukan lewat jurnal pembalik, sehingga jejaknya utuh untuk diperiksa.",
        en: "Journals are never deleted. Corrections happen through reversing entries, so the trail stays intact for review.",
      },
      {
        id: "Tutup buku per periode mengunci angka yang sudah final agar tidak berubah diam-diam.",
        en: "Period close locks finalised figures so they cannot change quietly.",
      },
    ],
    hasil: {
      id: "Neraca Saldo selalu seimbang — dan bila tidak, sistem menolak menyimpannya. Laporan dibaca dari satu sumber: jurnal.",
      en: "The trial balance always balances — and if it wouldn't, the system refuses to save. Reports read from a single source: the journal.",
    },
    gambar: "/panduan/akuntansi-1.webp",
  },
  {
    id: "faktur",
    icon: ReceiptText,
    nama: { id: "Faktur & Pembayaran", en: "Invoices & Payments" },
    masalah: {
      id: "Faktur dibuat di Word, PPN dihitung di kalkulator, piutang dicatat di buku terpisah. Yang lewat jatuh tempo baru terasa saat kas menipis.",
      en: "Invoices in Word, VAT on a calculator, receivables in a separate book. Overdue bills only register when cash runs low.",
    },
    cara: [
      {
        id: "Satu kali posting menyelesaikan tiga hal sekaligus: jurnal, pengurangan stok, dan pencatatan piutang.",
        en: "A single posting settles three things at once: the journal, the stock reduction, and the receivable.",
      },
      {
        id: "PPN 0/11/12% dan diskon per baris dihitung otomatis, termasuk DPP nilai lain 11/12 sesuai PMK 131/2024.",
        en: "VAT at 0/11/12% and per-line discounts are computed automatically, including the 11/12 alternative tax base per PMK 131/2024.",
      },
      {
        id: "Salah input bisa dibatalkan atau diretur — pembukuannya terbalik dengan persis, bukan ditimpa.",
        en: "Mistakes can be voided or returned — the books reverse exactly, rather than being overwritten.",
      },
      {
        id: "Umur piutang dan lonceng pengingat jatuh tempo muncul tanpa perlu dicari.",
        en: "Receivables aging and due-date reminder bells surface without being hunted for.",
      },
    ],
    hasil: {
      id: "Faktur berkop siap cetak atau PDF dalam hitungan detik, dan tidak ada tagihan yang lewat tanpa terlihat.",
      en: "Branded invoices ready to print or PDF in seconds, and no bill slips past unseen.",
    },
    gambar: "/landing/showcase-penjualan.webp",
  },
  {
    id: "pos",
    icon: Store,
    nama: { id: "Kasir (POS)", en: "POS Cashier" },
    masalah: {
      id: "Kasir memakai aplikasi terpisah, lalu setoran harian dicatat ulang ke pembukuan. Selisih kas ditemukan berhari-hari kemudian, tanpa tahu shift siapa.",
      en: "The cashier runs on a separate app, then daily takings get re-entered into the books. Cash variances surface days later, with no idea whose shift it was.",
    },
    cara: [
      {
        id: "Layar kasir dengan pencarian produk kilat, diskon per item, dan pembayaran non-tunai (QRIS, kartu, e-wallet) multi-tender.",
        en: "A cashier screen with instant product search, per-item discounts, and multi-tender non-cash payments (QRIS, card, e-wallet).",
      },
      {
        id: "Sesi shift kas: buka dengan kas awal, jual, tutup dengan hitungan fisik. Selisihnya otomatis terjurnal dan tercatat milik shift siapa.",
        en: "Cash shift sessions: open with a starting float, sell, close with a physical count. The variance is auto-journaled and attributed to that shift.",
      },
      {
        id: "Tetap bisa berjualan saat internet putus, karena aplikasinya PWA yang bisa dipasang di perangkat.",
        en: "Keeps selling when the internet drops, because the app is an installable PWA.",
      },
    ],
    hasil: {
      id: "Penjualan hari ini sudah masuk laporan keuangan hari ini — bukan besok, dan bukan setelah diketik ulang.",
      en: "Today's sales are in today's financial reports — not tomorrow, and not after being retyped.",
    },
    gambar: "/landing/showcase-pos.webp",
  },
  {
    id: "stok",
    icon: Boxes,
    nama: { id: "Stok & Gudang", en: "Stock & Warehouse" },
    masalah: {
      id: "Stok di catatan tidak sama dengan stok di rak. HPP ditebak, jadi laba yang dilaporkan sebenarnya tidak diketahui. Barang kedaluwarsa ditemukan saat sudah telat.",
      en: "Recorded stock doesn't match what's on the shelf. COGS is guessed, so reported profit is really unknown. Expired goods are found too late.",
    },
    cara: [
      {
        id: "Stok multi-gudang dengan HPP rata-rata bergerak dihitung ulang otomatis di setiap penjualan dan pembelian.",
        en: "Multi-warehouse stock with moving-average COGS recalculated automatically on every sale and purchase.",
      },
      {
        id: "Lot dan tanggal kedaluwarsa: penjualan mengambil lot yang paling dekat kedaluwarsa lebih dulu (FEFO), otomatis.",
        en: "Lots and expiry dates: sales pull the nearest-expiry lot first (FEFO), automatically.",
      },
      {
        id: "Ambang stok minimum memicu usulan pembelian yang bisa langsung jadi Permintaan Pembelian.",
        en: "Minimum-stock thresholds trigger purchase suggestions that can become a Purchase Request in one click.",
      },
      {
        id: "Stok opname mencatat selisih fisik sebagai jurnal penyesuaian, bukan sebagai angka yang diubah tanpa jejak.",
        en: "Stock counts record physical variances as adjusting journals, not as numbers silently edited.",
      },
    ],
    hasil: {
      id: "Nilai persediaan di neraca berasal dari perhitungan, bukan perkiraan — dan lot yang mau kedaluwarsa muncul sebelum jadi kerugian.",
      en: "Inventory value on the balance sheet comes from calculation, not estimation — and lots nearing expiry surface before they become a loss.",
    },
    gambar: "/landing/showcase-stok.webp",
  },
  {
    id: "payroll",
    icon: Wallet,
    nama: { id: "Gaji & PPh 21", en: "Payroll & Income Tax" },
    masalah: {
      id: "Gaji dihitung di Excel tiap bulan, PPh 21 metode TER dihitung ulang per karyawan, BPJS dicek manual. Beban gaji baru masuk pembukuan belakangan — kalau tidak lupa.",
      en: "Payroll in Excel every month, PPh 21 (TER method) recomputed per employee, BPJS checked by hand. Payroll expense hits the books later — if it isn't forgotten.",
    },
    cara: [
      {
        id: "PPh 21 metode TER terbaru dan BPJS Kesehatan & Ketenagakerjaan dihitung otomatis dari data karyawan.",
        en: "The latest PPh 21 TER method plus BPJS health & employment are computed automatically from employee data.",
      },
      {
        id: "Slip gaji per karyawan siap cetak atau kirim, termasuk formulir 1721-A1.",
        en: "Per-employee payslips ready to print or send, including the 1721-A1 form.",
      },
      {
        id: "Beban gaji, utang BPJS, dan utang PPh langsung terjurnal saat penggajian dijalankan.",
        en: "Payroll expense, BPJS payable, and tax payable are journaled the moment payroll runs.",
      },
      {
        id: "Absensi, cuti, dan kasbon karyawan tercatat di modul yang sama.",
        en: "Attendance, leave, and employee advances live in the same module.",
      },
    ],
    hasil: {
      id: "Gajian jadi pekerjaan sekali klik, dan laporan keuangan bulan itu sudah memuat beban gaji yang benar.",
      en: "Payroll becomes a one-click job, and that month's financial reports already carry the correct payroll expense.",
    },
    gambar: "/landing/showcase-gaji.webp",
  },
  {
    id: "pajak",
    icon: FileSpreadsheet,
    nama: { id: "Pajak & e-Faktur", en: "Tax & e-Faktur" },
    masalah: {
      id: "Tiap masa pajak dimulai dengan merekap ulang faktur satu per satu. Rekapnya rawan selisih, dan formatnya harus disesuaikan lagi untuk Coretax.",
      en: "Every tax period starts by re-tallying invoices one by one. The tally is error-prone, and the format needs reworking again for Coretax.",
    },
    cara: [
      {
        id: "PPN keluaran dan masukan terkumpul otomatis dari faktur yang sudah Anda buat — tidak ada rekap manual.",
        en: "Output and input VAT accumulate automatically from the invoices you already created — no manual tally.",
      },
      {
        id: "Faktur keluaran diekspor sebagai XML yang langsung diimpor ke Coretax DJP.",
        en: "Output invoices export as XML that imports straight into Coretax (DJP).",
      },
      {
        id: "PPh Final UMKM dan PPh 23 dihitung di modul yang sama, lengkap dengan dasar pengenaannya.",
        en: "SME final income tax and PPh 23 are computed in the same module, with their tax bases shown.",
      },
    ],
    hasil: {
      id: "Masa pajak selesai dari data yang sudah ada, bukan dari pekerjaan rekap baru.",
      en: "A tax period is completed from data you already have, not from fresh tallying work.",
    },
    gambar: "/panduan/pajak-1.webp",
  },
  {
    id: "laporan",
    icon: LineChart,
    nama: { id: "Laporan Keuangan", en: "Financial Reports" },
    masalah: {
      id: "Laporan disusun berhari-hari di akhir bulan, dan begitu selesai angkanya sudah tidak menggambarkan keadaan hari ini.",
      en: "Reports take days to compile at month-end, and by the time they're done the numbers no longer describe today.",
    },
    cara: [
      {
        id: "Laba Rugi, Neraca, Arus Kas, Buku Besar, dan Umur Piutang/Hutang dibaca langsung dari jurnal, kapan pun diminta.",
        en: "P&L, Balance Sheet, Cash Flow, General Ledger, and Receivables/Payables Aging read straight from the journal, whenever asked.",
      },
      {
        id: "Bisa dilihat per dimensi atau cost center per cabang, bukan hanya total perusahaan.",
        en: "Viewable per dimension or per-branch cost center, not just company totals.",
      },
      {
        id: "Ekspor Excel/CSV untuk diolah lanjut, dan tata cetak yang rapi untuk dilampirkan.",
        en: "Excel/CSV export for further work, and clean print layouts for attachments.",
      },
      {
        id: "Laporan terjadwal bisa dikirim otomatis ke email pada tanggal yang Anda tentukan.",
        en: "Scheduled reports can be emailed automatically on dates you choose.",
      },
    ],
    hasil: {
      id: "Pertanyaan 'bulan ini untung atau rugi' bisa dijawab sekarang, bukan dua minggu lagi.",
      en: "The question \"are we profitable this month\" can be answered now, not in two weeks.",
    },
    gambar: "/landing/showcase-laporan.webp",
  },
  {
    id: "multi",
    icon: Combine,
    nama: { id: "Multi-perusahaan & Konsolidasi", en: "Multi-company & Consolidation" },
    masalah: {
      id: "Tiap badan usaha punya pembukuan sendiri di berkas terpisah. Melihat gambaran gabungan berarti menyalin angka ke spreadsheet ketiga.",
      en: "Each entity keeps its own books in a separate file. Seeing the combined picture means copying figures into a third spreadsheet.",
    },
    cara: [
      {
        id: "Beberapa perusahaan dikelola dari satu akun, dan berpindah antar perusahaan cukup lewat pemilih di sidebar.",
        en: "Several companies managed from one account, switching between them via a sidebar picker.",
      },
      {
        id: "Laporan konsolidasi Laba Rugi & Neraca lintas perusahaan disusun sistem, bukan tangan.",
        en: "Consolidated P&L and Balance Sheet across companies are assembled by the system, not by hand.",
      },
      {
        id: "Faktur multi mata uang dengan kurs tercatat, termasuk selisih kurs saat pelunasan.",
        en: "Multi-currency invoices with recorded rates, including FX differences on settlement.",
      },
    ],
    hasil: {
      id: "Gambaran grup bisa dilihat tanpa menunggu tiap anak usaha mengirim rekap.",
      en: "The group picture is visible without waiting for each subsidiary to send a summary.",
    },
    gambar: "/panduan/konsolidasi-1.webp",
  },
  {
    id: "keamanan",
    icon: ShieldCheck,
    nama: { id: "Keamanan & Kepemilikan Data", en: "Security & Data Ownership" },
    masalah: {
      id: "Data usaha dipegang penyedia yang tidak jelas memisahkannya dari pelanggan lain, dan keluar dari layanan berarti kehilangan riwayat.",
      en: "Business data sits with a provider that isn't clear about separating it from other customers, and leaving means losing your history.",
    },
    cara: [
      {
        id: "Satu database terpisah untuk tiap perusahaan — data Anda tidak berada di tabel yang sama dengan pengguna lain.",
        en: "One separate database per company — your data does not sit in the same tables as anyone else's.",
      },
      {
        id: "Peran & hak akses per modul, verifikasi dua langkah (2FA), pembatasan IP, dan audit log untuk perubahan penting.",
        en: "Per-module roles & permissions, two-factor authentication, IP restrictions, and an audit log for important changes.",
      },
      {
        id: "Seluruh data bisa diunduh sebagai ZIP berisi CSV per tabel, kapan pun — termasuk setelah langganan berakhir.",
        en: "All data downloadable as a ZIP of per-table CSVs, anytime — including after your subscription ends.",
      },
    ],
    hasil: {
      id: "Anda bisa pergi kapan saja dan membawa seluruh riwayat pembukuan Anda. Itu yang membuat 'data Anda milik Anda' bukan sekadar slogan.",
      en: "You can leave whenever you want and take your entire accounting history with you. That is what makes \"your data is yours\" more than a slogan.",
    },
    gambar: "/panduan/pengaturan-1.webp",
  },
];

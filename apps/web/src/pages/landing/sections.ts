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
import { TRIAL_DAYS, type Plan } from "@erpindo/shared";

/** Konten seksi landing — dipisah dari markup agar mudah dirawat. */

export const TRUST_POINTS = [
  { value: "390+", label: "uji otomatis menjaga tiap rilis" },
  { value: "1 database / perusahaan", label: "data Anda benar-benar terisolasi" },
  { value: "PPh 21 TER · Coretax", label: "standar pajak Indonesia 2026" },
  { value: "PWA offline", label: "tetap jalan saat internet putus" },
];

export type ShowcaseItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  image: string;
  title: string;
  benefits: string[];
};

export const SHOWCASE: ShowcaseItem[] = [
  {
    id: "pos",
    label: "Kasir (POS)",
    icon: Store,
    image: "/landing/showcase-pos.webp",
    title: "Kasir cepat yang langsung masuk pembukuan",
    benefits: [
      "Layar kasir ringkas dengan pencarian produk kilat & diskon per item",
      "Sesi shift kas — buka, jual, tutup; selisih kas otomatis terjurnal",
      "Cetak struk berlogo dan tetap bisa berjualan saat offline (PWA)",
    ],
  },
  {
    id: "faktur",
    label: "Faktur & PPN",
    icon: ReceiptText,
    image: "/landing/showcase-penjualan.webp",
    title: "Faktur profesional dalam hitungan detik",
    benefits: [
      "Sekali posting: jurnal, stok, dan piutang beres bersamaan",
      "PPN 0/11/12% + diskon per baris dihitung otomatis",
      "Salah input? Batalkan atau retur — pembukuan terbalik dengan persis",
    ],
  },
  {
    id: "laporan",
    label: "Laporan Keuangan",
    icon: LineChart,
    image: "/landing/showcase-laporan.webp",
    title: "Laba rugi & neraca real-time, selalu seimbang",
    benefits: [
      "Laba Rugi, Neraca, Arus Kas & umur piutang dari satu sumber: jurnal",
      "Double-entry sungguhan — neraca dijamin seimbang oleh sistem",
      "Ekspor CSV untuk Excel, cetak rapi, dan tutup buku per periode",
    ],
  },
  {
    id: "gaji",
    label: "Gaji & PPh 21",
    icon: Wallet,
    image: "/landing/showcase-gaji.webp",
    title: "Gajian sekali klik, pajak sudah dihitung",
    benefits: [
      "PPh 21 metode TER terbaru + BPJS Kesehatan & Ketenagakerjaan otomatis",
      "Slip gaji per karyawan siap cetak/kirim",
      "Beban gaji langsung terjurnal — laporan keuangan ikut akurat",
    ],
  },
  {
    id: "stok",
    label: "Stok & FEFO",
    icon: Boxes,
    image: "/landing/showcase-stok.webp",
    title: "Stok akurat sampai ke lot kedaluwarsa",
    benefits: [
      "Multi-gudang dengan HPP rata-rata otomatis di setiap penjualan",
      "Lot & tanggal kedaluwarsa — keluar otomatis yang paling dekat exp (FEFO)",
      "Ambang stok minimum + lonceng peringatan sebelum kehabisan",
    ],
  },
];

export const FEATURE_GROUPS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: BookOpenCheck, title: "Keuangan & Akuntansi", desc: "Jurnal double-entry otomatis, buku besar, neraca, laba rugi, arus kas, dan tutup buku." },
  { icon: ReceiptText, title: "Faktur & Pembayaran", desc: "Faktur jual/beli, PPN otomatis, cetak/PDF berkop, catat sampai lunas, retur nota kredit." },
  { icon: Boxes, title: "Stok & Gudang", desc: "Stok multi-gudang, HPP rata-rata, lot & kedaluwarsa (FEFO), transfer, dan stok opname." },
  { icon: Store, title: "Kasir (POS)", desc: "Layar kasir cepat, sesi shift kas, cetak struk, dan tetap jalan saat offline." },
  { icon: Target, title: "CRM & Helpdesk", desc: "Pipeline lead & penawaran, konversi ke pelanggan, plus tiket dukungan pelanggan." },
  { icon: UsersRound, title: "HR & Payroll", desc: "Data karyawan, gaji, hitung PPh 21 metode TER + BPJS, slip gaji & jurnal otomatis." },
  { icon: Landmark, title: "Aset & Maintenance", desc: "Register aset, penyusutan otomatis, jadwal servis berkala, dan work order berbiaya." },
  { icon: Factory, title: "Manufaktur & QC", desc: "Bill of Materials, perintah produksi biaya gabungan, dan inspeksi QC lulus/karantina." },
  { icon: Coins, title: "Multi-perusahaan & Valas", desc: "Kelola banyak perusahaan satu akun, laporan konsolidasi, dan faktur multi mata uang." },
  { icon: FileSpreadsheet, title: "Pajak & Kepatuhan", desc: "Ekspor e-Faktur XML Coretax, PPN, dan PPh 21 — mengikuti standar perpajakan Indonesia." },
  { icon: ShieldCheck, title: "Keamanan & Platform", desc: "Database terpisah tiap perusahaan, peran akses, 2FA, audit log, dan PWA offline." },
];

export const COMPARISON: { topic: string; manual: string; erpindo: string }[] = [
  { topic: "Catat penjualan", manual: "Tulis nota, salin ke buku, hitung ulang di Excel", erpindo: "Sekali input — jurnal, stok & piutang otomatis" },
  { topic: "Hitung PPN & e-Faktur", manual: "Rekap manual tiap masa pajak, rawan selisih", erpindo: "PPN otomatis + unduh XML siap impor Coretax" },
  { topic: "Gaji & PPh 21", manual: "Hitung TER per karyawan di kalkulator/Excel", erpindo: "Sekali klik — TER, BPJS, slip gaji & jurnal beres" },
  { topic: "Stok & HPP", manual: "Stok sering selisih, HPP ditebak", erpindo: "HPP rata-rata otomatis, opname & FEFO tercatat" },
  { topic: "Laporan keuangan", manual: "Disusun berhari-hari di akhir bulan", erpindo: "Laba Rugi & Neraca real-time kapan pun" },
  { topic: "Tagihan telat", manual: "Baru sadar saat kas menipis", erpindo: "Umur piutang + lonceng pengingat jatuh tempo" },
];

export const PLAN_CARDS: { plan: Exclude<Plan, "trial">; tagline: string; highlight?: boolean; perks: string[] }[] = [
  {
    plan: "starter",
    tagline: "Untuk usaha kecil yang mulai rapi",
    perks: ["Semua fitur inti & lanjutan", "Laporan lengkap + ekspor Excel", "PWA — jalan di HP & offline", "Dukungan via email"],
  },
  {
    plan: "business",
    tagline: "Untuk tim yang sedang bertumbuh",
    highlight: true,
    perks: ["Semua fitur, tanpa batasan", "Lebih banyak anggota tim", "Multi-gudang & persetujuan", "Dukungan prioritas"],
  },
  {
    plan: "enterprise",
    tagline: "Skala besar & multi-perusahaan",
    perks: ["Pengguna tak terbatas", "Konsolidasi multi-perusahaan", "Onboarding & migrasi data", "SLA + manajer akun khusus"],
  },
];

export const FAQ = [
  { q: "Apakah butuh kartu kredit untuk mencoba?", a: `Tidak. Uji coba ${TRIAL_DAYS} hari gratis dengan semua fitur — tanpa kartu kredit, siap dipakai dalam 1 menit.` },
  { q: "Apakah data saya aman dan terpisah?", a: "Ya. Setiap perusahaan punya database sendiri (terisolasi), dilengkapi peran & hak akses, verifikasi dua langkah (2FA), audit log, dan tutup buku." },
  { q: "Bisakah mengelola beberapa perusahaan?", a: "Bisa — dari satu akun Anda dapat membuat beberapa badan usaha, lalu melihat laporan Laba Rugi & Neraca konsolidasi lintas perusahaan." },
  { q: "Apakah mendukung PPN dan Coretax?", a: "Ya. PPN dihitung otomatis di faktur (termasuk DPP nilai lain 11/12 sesuai PMK 131/2024), dan faktur keluaran bisa diunduh sebagai XML yang langsung diimpor ke Coretax DJP. Payroll menghitung PPh 21 metode TER + BPJS." },
  { q: "Bisakah dipakai saat offline?", a: "Bisa. erpindo adalah PWA yang bisa dipasang di HP/tablet/komputer dan tetap terbuka saat koneksi terputus." },
  { q: "Berapa lama proses setup-nya?", a: "Daftar, verifikasi email, dan langsung pakai — bagan akun standar Indonesia sudah tersedia otomatis. Checklist 'Mulai cepat' memandu langkah pertama Anda." },
  { q: "Saya sudah punya data di Excel. Bisa dipindahkan?", a: "Bisa. Impor produk dan kontak dari berkas CSV/Excel dengan pratinjau & laporan per baris, jadi tidak perlu mengetik ulang." },
  { q: "Bagaimana cara pembayaran langganan?", a: "Saat ini aktivasi paket dilakukan dengan menghubungi kami. Pembayaran online (QRIS/transfer/e-wallet) sedang disiapkan." },
];

export function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

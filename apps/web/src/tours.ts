import type { TourStep } from "./components/ui";

/**
 * Tur berpandu per halaman (Fase 10f). Setiap tur = id (kunci localStorage
 * `erpindo-tour:<id>`) + langkah. Langkah pertama biasanya menyorot judul
 * halaman (`main h1`); langkah tanpa `selector` tampil sebagai kartu tengah.
 *
 * Dipetakan ke rute lewat prefix (cocokkan terpanjang dulu). Hanya tur
 * "dashboard" yang tampil otomatis sekali untuk pengguna baru; sisanya dibuka
 * lewat tombol "Tur" di topbar.
 */

export type Tour = { id: string; steps: TourStep[] };

const SIDEBAR = "aside nav";
const HELP = '[title="Panduan halaman ini"]';

const TOURS: { prefix: string; exact?: boolean; tour: Tour }[] = [
  {
    prefix: "/app",
    exact: true,
    tour: {
      id: "dashboard",
      steps: [
        { selector: "main h1", title: "Selamat datang di ERPindo 👋", body: "Ini dasbor Anda — ringkasan kas, penjualan, dan tugas yang perlu perhatian. Angkanya terisi otomatis begitu Anda mulai bertransaksi." },
        { selector: SIDEBAR, title: "Menu di sisi kiri", body: "Semua modul ada di sini, dikelompokkan (Transaksi, Keuangan, Laporan, dst). Bisa dicari dengan kotak “Cari menu…” dan dilipat per grup." },
        { selector: HELP, title: "Bantuan kapan saja", body: "Tombol “?” membuka panduan halaman yang sedang Anda buka. Tombol “Tur” di sebelahnya memutar ulang tur seperti ini." },
        { title: "Mulai cepat", body: "Ikuti kartu “Mulai cepat” di dasbor: lengkapi profil, tambah produk & pelanggan, lalu buat faktur pertama. Butuh dituntun? Buka menu Panduan kapan saja." },
      ],
    },
  },
  {
    prefix: "/app/pos",
    tour: {
      id: "pos",
      steps: [
        { selector: "main h1", title: "Kasir (POS)", body: "Layar kasir cepat untuk penjualan tunai. Buka shift dulu, lalu tambahkan produk ke keranjang." },
        { title: "Cara berjualan", body: "Pindai/klik produk → jumlah otomatis masuk keranjang → tekan Bayar, masukkan uang diterima, kembalian dihitung otomatis. Struk & rekap kas langsung terjurnal." },
        { title: "Struk & Refund", body: "Saat shift terbuka, panel “Struk & Refund” memungkinkan Anda mengembalikan barang dari struk sebelumnya — kas laci menyesuaikan otomatis." },
      ],
    },
  },
  {
    prefix: "/app/penjualan",
    tour: {
      id: "penjualan",
      steps: [
        { selector: "main h1", title: "Penjualan", body: "Buat faktur penjualan di sini. Stok berkurang & jurnal terbentuk otomatis saat faktur diposting." },
        { title: "Pembayaran & status", body: "Tombol “Pembayaran” pada tiap faktur mencatat pelunasan (sebagian/penuh). Status berubah jadi Lunas otomatis. Salah input? Gunakan “Ubah” untuk membatalkan lalu buat ulang." },
      ],
    },
  },
  {
    prefix: "/app/pembelian",
    tour: {
      id: "pembelian",
      steps: [
        { selector: "main h1", title: "Pembelian", body: "Catat faktur pembelian dari pemasok. Stok bertambah (biaya rata-rata) & hutang tercatat otomatis." },
        { title: "Bertahap lewat Pengadaan", body: "Butuh alur permintaan → pesanan → penerimaan? Gunakan menu Pengadaan; penerimaan barang di sanalah yang menambah stok." },
      ],
    },
  },
  {
    prefix: "/app/stok",
    tour: {
      id: "stok",
      steps: [
        { selector: "main h1", title: "Stok", body: "Pantau level stok per gudang, kartu stok, dan barang yang menipis atau mendekati kedaluwarsa." },
        { title: "Opname & transfer", body: "Sesuaikan stok fisik lewat opname (selisih otomatis dijurnal) dan pindahkan barang antar gudang lewat transfer." },
      ],
    },
  },
  {
    prefix: "/app/keuangan/jurnal",
    tour: {
      id: "jurnal",
      steps: [
        { selector: "main h1", title: "Jurnal Umum", body: "Semua transaksi bermuara di sini sebagai jurnal double-entry yang selalu seimbang. Sebagian besar terbentuk otomatis dari faktur, gaji, dan POS." },
        { title: "Jurnal manual & pembalik", body: "Buat jurnal manual untuk penyesuaian. Salah? Tombol “Balik” membuat jurnal pembalik bertaut dua arah — buku besar tetap utuh (tak pernah dihapus)." },
      ],
    },
  },
  {
    prefix: "/app/keuangan/laba-rugi",
    tour: {
      id: "laporan",
      steps: [
        { selector: "main h1", title: "Laporan keuangan", body: "Laba Rugi, Neraca, dan Arus Kas dihitung langsung dari jurnal — selalu sinkron dengan transaksi Anda." },
        { title: "Bandingkan & ekspor", body: "Bandingkan dua periode untuk melihat tren, lalu ekspor ke CSV/Excel bila perlu dibagikan ke akuntan atau bank." },
      ],
    },
  },
  {
    prefix: "/app/hr/penggajian",
    tour: {
      id: "penggajian",
      steps: [
        { selector: "main h1", title: "Penggajian", body: "Jalankan gaji bulanan: PPh 21 (metode TER) & BPJS dihitung otomatis, slip gaji siap cetak, beban gaji langsung terjurnal." },
        { title: "Komponen & kasbon", body: "Tambahkan bonus/lembur/potongan sekali jalan, dan kasbon karyawan yang otomatis memotong gaji tiap periode." },
      ],
    },
  },
  {
    prefix: "/app/crm",
    tour: {
      id: "crm",
      steps: [
        { selector: "main h1", title: "CRM — Pipeline", body: "Kelola calon pelanggan (lead) di papan funnel. Geser kartu antar tahap dan catat aktivitas tindak lanjut." },
        { title: "Konversi ke penjualan", body: "Lead yang menang bisa dikonversi jadi pelanggan + penawaran sekali klik, lalu penawaran jadi faktur." },
      ],
    },
  },
  {
    prefix: "/app/pengaturan",
    tour: {
      id: "pengaturan",
      steps: [
        { selector: "main h1", title: "Pengaturan", body: "Atur profil perusahaan (logo & NPWP untuk kop faktur), anggota tim & peran, keamanan (2FA), serta cadangan data." },
        { title: "Data Anda milik Anda", body: "Kartu “Ekspor & Cadangan” mengunduh SELURUH data kapan pun — bahkan setelah langganan berakhir. Tanpa kunci vendor." },
      ],
    },
  },
];

/** Tur untuk rute aktif (prefix terpanjang menang; dashboard hanya di /app persis). */
export function tourForPath(pathname: string): Tour | undefined {
  const path = pathname.replace(/\/$/, "") || "/app";
  const matches = TOURS.filter((t) => (t.exact ? path === t.prefix : path.startsWith(t.prefix)));
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => b.prefix.length - a.prefix.length);
  return matches[0]!.tour;
}

/** Tur yang tampil otomatis sekali untuk pengguna baru (hanya dasbor). */
export const AUTO_TOUR_IDS = new Set(["dashboard"]);

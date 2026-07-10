import type { GuideModule } from "./types";

export const KEUANGAN: GuideModule[] = [
  {
    slug: "akuntansi",
    title: "Akuntansi & Jurnal",
    appPath: "/app/keuangan/jurnal",
    intro:
      "Fondasi erpindo adalah pembukuan double-entry sungguhan: setiap transaksi menjadi jurnal seimbang, buku besar per akun, dan neraca saldo yang dijamin balance.",
    sections: [
      {
        heading: "Bagan akun & jurnal umum",
        image: "/panduan/akuntansi-1.webp",
        imageAlt: "Jurnal umum",
        body: [
          "Bagan akun standar Indonesia (kas, bank, piutang, persediaan, PPN, modal, pendapatan, beban) sudah tersedia sejak daftar; Anda bisa menambah akun sendiri atau mengganti namanya (kode & tipe terkunci demi integritas laporan).",
          "Sebagian besar jurnal dibuat otomatis oleh modul lain. Untuk pencatatan manual (mis. bayar listrik, setoran modal), pakai Jurnal Umum — sistem menolak jurnal yang tidak seimbang.",
        ],
      },
      {
        heading: "Buku besar & neraca saldo",
        image: "/panduan/akuntansi-2.webp",
        imageAlt: "Neraca saldo",
        body: [
          "Buku besar menampilkan mutasi & saldo per akun. Neraca saldo merangkum semua akun — total debit selalu sama dengan total kredit; kalau tidak, sistemlah yang salah, bukan Anda (dan 390+ uji otomatis kami menjaganya).",
        ],
        tips: ["Jurnal terposting tidak bisa diedit (prinsip audit). Koreksi dilakukan lewat jurnal pembalik/void."],
      },
    ],
  },
  {
    slug: "laporan",
    title: "Laporan Keuangan",
    appPath: "/app/keuangan/laba-rugi",
    intro:
      "Laba Rugi, Neraca, Arus Kas, dan Umur Piutang/Hutang — semuanya dihitung real-time dari jurnal, bisa diekspor CSV dan dicetak.",
    sections: [
      {
        heading: "Laba Rugi & Neraca",
        image: "/panduan/laporan-1.webp",
        imageAlt: "Laporan laba rugi",
        body: [
          "Pilih periode → laporan tampil seketika. Neraca menyertakan laba berjalan sehingga selalu seimbang. Karena satu sumber (jurnal), angka antar laporan tidak mungkin saling bertentangan.",
        ],
      },
      {
        heading: "Arus Kas & Umur Tagihan",
        image: "/panduan/laporan-2.webp",
        imageAlt: "Laporan arus kas",
        body: [
          "Arus Kas menampilkan uang masuk/keluar per keterangan jurnal — memudahkan melihat ke mana kas mengalir. Umur Piutang/Hutang mengelompokkan tagihan per usia (lancar, 1–30, 31–60, 61–90, >90 hari) agar penagihan terprioritas.",
        ],
      },
      {
        heading: "Anggaran vs realisasi",
        body: [
          "Tetapkan target pendapatan & beban per akun per bulan di halaman Anggaran — realisasi terisi otomatis dari jurnal, selisihnya diberi warna.",
        ],
      },
    ],
  },
  {
    slug: "pajak",
    title: "Pajak & e-Faktur Coretax",
    appPath: "/app/keuangan/e-faktur",
    intro:
      "PPN dihitung otomatis di setiap faktur (0/11/12%), dan faktur keluaran bisa diunduh sebagai XML siap impor ke Coretax DJP — format satu-satunya yang diterima sejak 2025.",
    sections: [
      {
        heading: "Ekspor XML Coretax",
        image: "/panduan/pajak-1.webp",
        imageAlt: "Halaman ekspor e-Faktur",
        steps: [
          "Pastikan NPWP perusahaan terisi di Pengaturan, dan NPWP pembeli terisi di Kontak.",
          "Buka Ekspor e-Faktur → pilih periode → \"Unduh XML Coretax\".",
          "Impor berkas di Coretax DJP (menu e-Faktur → Impor Faktur Keluaran).",
        ],
        tips: [
          "Kode transaksi otomatis: 04 dengan DPP nilai lain 11/12 untuk non-mewah (PMK 131/2024), 01 untuk tarif 12% penuh.",
          "Faktur yang dibatalkan dan non-PPN otomatis dikecualikan. CSV rekap tetap tersedia.",
        ],
      },
    ],
  },
  {
    slug: "anggaran",
    title: "Anggaran",
    appPath: "/app/keuangan/anggaran",
    intro: "Target pendapatan & beban per akun per bulan, dengan realisasi otomatis dari jurnal dan selisih berwarna.",
    sections: [
      {
        heading: "Menetapkan & memantau anggaran",
        image: "/panduan/anggaran-1.webp",
        imageAlt: "Halaman anggaran",
        steps: [
          "Pilih bulan → isi angka anggaran di baris akun pendapatan/beban (tersimpan saat pindah kolom).",
          "Kolom realisasi terisi otomatis dan selalu cocok dengan Laba Rugi bulan itu.",
        ],
      },
    ],
  },
  {
    slug: "aset",
    title: "Aset Tetap",
    appPath: "/app/keuangan/aset",
    intro:
      "Register kendaraan, mesin, dan peralatan — penyusutan garis lurus dijurnal otomatis tiap bulan, pelepasan aset menghitung laba/rugi sendiri.",
    sections: [
      {
        heading: "Mendaftarkan & menyusutkan aset",
        image: "/panduan/aset-1.webp",
        imageAlt: "Register aset tetap",
        steps: [
          "Daftarkan aset: nama, kategori, tanggal & harga perolehan, umur manfaat (bulan), nilai residu, akun pembayar.",
          "Penyusutan bulanan berjalan otomatis (Cron) — akumulasi & nilai buku ikut terbarui, bebannya terjurnal.",
          "Melepas/menjual aset: isi tanggal & harga jual — laba/rugi pelepasan dihitung dan dijurnal otomatis.",
        ],
      },
    ],
  },
  {
    slug: "kurs",
    title: "Multi Mata Uang",
    appPath: "/app/keuangan/kurs",
    intro:
      "Terima order ekspor atau beli dari luar negeri: faktur valas dikonversi ke Rupiah saat posting, selisih kurs saat pelunasan dijurnal otomatis.",
    sections: [
      {
        heading: "Kurs & faktur valas",
        image: "/panduan/kurs-1.webp",
        imageAlt: "Master kurs mata uang",
        steps: [
          "Daftarkan mata uang & kursnya di halaman Mata Uang (mis. USD 16.200).",
          "Di form faktur, pilih mata uang + kurs transaksi — pembukuan tetap dalam Rupiah.",
          "Saat pembayaran dengan kurs berbeda, laba/rugi selisih kurs terjurnal otomatis.",
        ],
      },
    ],
  },
  {
    slug: "konsolidasi",
    title: "Multi-Perusahaan & Konsolidasi",
    appPath: "/app/konsolidasi",
    intro:
      "Punya beberapa badan usaha? Buat semuanya dari satu akun — data tiap perusahaan tetap terpisah total — lalu lihat Laba Rugi & Neraca gabungan.",
    sections: [
      {
        heading: "Menambah perusahaan & laporan gabungan",
        image: "/panduan/konsolidasi-1.webp",
        imageAlt: "Laporan konsolidasi",
        steps: [
          "Di pengalih perusahaan (kiri atas) pilih \"Tambah perusahaan\" — database baru dibuat otomatis.",
          "Berpindah workspace kapan saja lewat pengalih yang sama.",
          "Halaman Konsolidasi menjumlahkan Laba Rugi & Neraca semua perusahaan milik Anda.",
        ],
      },
    ],
  },
];

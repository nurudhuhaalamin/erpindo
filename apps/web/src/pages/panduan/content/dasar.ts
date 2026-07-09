import type { GuideModule } from "./types";

export const DASAR: GuideModule[] = [
  {
    slug: "mulai",
    title: "Mulai Cepat",
    appPath: "/app",
    intro:
      "Dari daftar sampai faktur pertama dalam hitungan menit. Panduan ini merangkum langkah awal yang disarankan agar pembukuan Anda langsung berjalan rapi.",
    sections: [
      {
        heading: "Daftar & masuk",
        steps: [
          "Buka halaman Daftar, isi nama perusahaan, nama Anda, email, dan kata sandi.",
          "Sistem otomatis membuatkan database khusus untuk perusahaan Anda + bagan akun standar Indonesia (22 akun).",
          "Verifikasi email lewat tautan yang dikirim — lalu Anda langsung berada di Dashboard.",
        ],
        tips: ["Uji coba 30 hari mencakup SEMUA fitur, tanpa kartu kredit."],
      },
      {
        heading: "Ikuti checklist \"Mulai cepat\"",
        image: "/panduan/mulai-1.webp",
        imageAlt: "Dashboard dengan checklist mulai cepat dan grafik penjualan",
        body: [
          "Dashboard tenant baru menampilkan checklist berprogres: lengkapi profil perusahaan (alamat & NPWP), tambah produk, tambah kontak, posting faktur pertama, dan undang tim. Checklist hilang sendiri saat semuanya selesai.",
        ],
      },
      {
        heading: "Alur harian yang umum",
        body: [
          "Penjualan tunai di toko → pakai Kasir (POS). Penjualan dengan tagihan → buat Faktur di menu Penjualan. Belanja stok → menu Pembelian. Semua transaksi otomatis membuat jurnal dan menggerakkan stok — Anda tidak perlu mencatat dua kali.",
        ],
      },
    ],
  },
  {
    slug: "pengaturan",
    title: "Pengaturan & Tim",
    appPath: "/app/pengaturan",
    intro:
      "Profil perusahaan, logo kop faktur, anggota tim dengan peran berbeda, keamanan 2FA, dan tutup buku — semuanya di halaman Pengaturan.",
    sections: [
      {
        heading: "Profil perusahaan & logo",
        image: "/panduan/pengaturan-1.webp",
        imageAlt: "Halaman pengaturan perusahaan",
        steps: [
          "Isi nama tampilan, alamat, dan NPWP (dipakai di kop faktur & ekspor e-Faktur/Coretax).",
          "Unggah logo — otomatis dikecilkan dan tampil di cetakan faktur serta struk kasir.",
        ],
      },
      {
        heading: "Undang tim dengan peran",
        steps: [
          "Buka bagian Anggota → Undang, masukkan email dan pilih peran.",
          "Owner: kendali penuh termasuk tutup buku & audit log. Admin: mengelola transaksi & master data. Viewer: hanya melihat.",
        ],
        tips: ["Pembelian besar oleh Admin bisa diwajibkan lewat persetujuan Owner — atur ambangnya di halaman Persetujuan."],
      },
      {
        heading: "Keamanan & tutup buku",
        body: [
          "Aktifkan verifikasi dua langkah (2FA) dengan aplikasi authenticator. Tutup buku mengunci semua transaksi sampai tanggal tertentu — jurnal baru di periode terkunci otomatis ditolak.",
        ],
      },
    ],
  },
  {
    slug: "produk",
    title: "Produk & Jasa",
    appPath: "/app/master/produk",
    intro:
      "Katalog barang dan jasa Anda: harga jual/beli, satuan, ambang stok minimum, pelacakan kedaluwarsa, dan impor massal dari Excel.",
    sections: [
      {
        heading: "Menambah & mengubah produk",
        image: "/panduan/produk-1.webp",
        imageAlt: "Daftar produk dengan form tambah",
        steps: [
          "Isi SKU (kode unik), nama, satuan, harga jual & beli, lalu Simpan.",
          "Centang \"Jasa\" untuk item tanpa stok (mis. ongkos kirim, jasa servis).",
          "Centang \"Lacak kedaluwarsa\" untuk produk ber-lot (makanan/obat) — penjualan otomatis mengambil lot paling dekat kedaluwarsa (FEFO).",
          "Isi \"Stok minimum\" agar lonceng notifikasi mengingatkan sebelum kehabisan.",
        ],
      },
      {
        heading: "Impor dari Excel/CSV",
        steps: [
          "Klik Impor → unduh contoh format → isi di Excel → simpan sebagai CSV.",
          "Unggah, periksa pratinjau per baris, lalu konfirmasi. Baris bermasalah dilaporkan satu per satu.",
        ],
      },
    ],
  },
  {
    slug: "kontak",
    title: "Pelanggan & Pemasok",
    appPath: "/app/master/kontak",
    intro:
      "Satu daftar untuk pelanggan dan pemasok, lengkap dengan NPWP (untuk e-Faktur), alamat, dan riwayat transaksinya.",
    sections: [
      {
        heading: "Menambah kontak",
        image: "/panduan/kontak-1.webp",
        imageAlt: "Daftar kontak pelanggan dan pemasok",
        steps: [
          "Pilih tipe: Pelanggan, Pemasok, atau Keduanya.",
          "Isi NPWP untuk pelanggan ber-PPN — dipakai otomatis di ekspor e-Faktur & XML Coretax.",
        ],
        tips: ["Kontak juga bisa diimpor massal dari CSV, sama seperti produk."],
      },
    ],
  },
];

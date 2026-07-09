import type { GuideModule } from "./types";

export const TRANSAKSI: GuideModule[] = [
  {
    slug: "pos",
    title: "Kasir (POS)",
    appPath: "/app/pos",
    intro:
      "Layar kasir cepat untuk penjualan tunai di toko: shift kas, pencarian produk kilat, diskon per item, struk berlogo, dan tetap berjalan saat offline.",
    sections: [
      {
        heading: "Buka shift, jual, tutup shift",
        image: "/panduan/pos-1.webp",
        imageAlt: "Layar kasir POS",
        steps: [
          "Buka shift: pilih gudang & isi kas awal laci.",
          "Cari produk (ketik nama/SKU), atur jumlah & diskon per item, terima uang tunai — kembalian dihitung otomatis, struk siap cetak.",
          "Tutup shift di akhir hari: hitung kas fisik — selisih kas otomatis dijurnal sehingga pembukuan tetap jujur.",
        ],
      },
      {
        heading: "Yang terjadi di balik layar",
        body: [
          "Setiap penjualan POS = faktur lunas: pendapatan & HPP terjurnal, stok berkurang (dengan biaya rata-rata), dan kas laci bertambah. Rekap shift masuk ke buku besar tanpa Anda menyentuh jurnal.",
        ],
        tips: ["Sebagai PWA, halaman kasir tetap terbuka saat internet putus — transaksi tersinkron saat koneksi kembali."],
      },
    ],
  },
  {
    slug: "penjualan",
    title: "Penjualan & Faktur",
    appPath: "/app/penjualan",
    intro:
      "Faktur penjualan dengan PPN & diskon per baris, pencatatan pembayaran sampai lunas, retur, dan pembatalan yang aman secara akuntansi.",
    sections: [
      {
        heading: "Membuat faktur",
        image: "/panduan/penjualan-1.webp",
        imageAlt: "Daftar faktur penjualan",
        steps: [
          "Pilih pelanggan (ketik untuk mencari), tanggal, jatuh tempo, dan tarif PPN (0/11/12%).",
          "Tambahkan baris produk — harga terisi otomatis, diskon % per baris opsional.",
          "Posting: jurnal (Piutang, Pendapatan, PPN Keluaran, HPP, Persediaan) dan stok keluar terjadi otomatis. Cetak/PDF berkop tersedia.",
        ],
      },
      {
        heading: "Pembayaran, retur, & pembatalan",
        steps: [
          "Catat pembayaran (bisa bertahap) — status berubah ke Lunas otomatis.",
          "Retur: pilih faktur → Retur → jumlah per baris; nota kredit + stok masuk kembali terjurnal proporsional (termasuk PPN).",
          "Salah input & belum dibayar? Batalkan — sistem memposting jurnal pembalik persis dan mengembalikan stok pada biaya asal.",
        ],
        tips: ["Faktur dalam mata uang asing? Set kurs di halaman Mata Uang lalu pilih mata uang di form faktur."],
      },
    ],
  },
  {
    slug: "pembelian",
    title: "Pembelian",
    appPath: "/app/pembelian",
    intro:
      "Faktur pembelian mengisi stok dengan biaya rata-rata otomatis, mendukung lot kedaluwarsa, diskon per baris, PPN Masukan, dan hutang usaha.",
    sections: [
      {
        heading: "Mencatat pembelian",
        image: "/panduan/pembelian-1.webp",
        imageAlt: "Daftar faktur pembelian",
        steps: [
          "Pilih pemasok, gudang tujuan, tarif PPN, dan baris produk.",
          "Untuk produk berpelacakan kedaluwarsa, isi nomor lot & tanggal exp per baris.",
          "Posting: Persediaan & PPN Masukan terjurnal, stok masuk pada biaya setelah diskon, hutang tercatat sampai dibayar.",
        ],
        tips: [
          "Pembelian oleh Admin di atas ambang tertentu bisa diwajibkan menunggu persetujuan Owner — lihat modul Persetujuan.",
        ],
      },
    ],
  },
  {
    slug: "stok",
    title: "Stok & Gudang",
    appPath: "/app/stok",
    intro:
      "Level stok multi-gudang dengan nilai persediaan real-time, kartu stok per produk, transfer antar gudang, opname, dan lot kedaluwarsa FEFO.",
    sections: [
      {
        heading: "Memantau & menelusuri stok",
        image: "/panduan/stok-1.webp",
        imageAlt: "Halaman stok dengan level per gudang",
        body: [
          "Tabel stok menampilkan jumlah, biaya rata-rata, dan nilai per produk per gudang — angkanya selalu sama dengan akun Persediaan di neraca. Klik produk untuk melihat kartu stok (riwayat masuk/keluar + saldo berjalan).",
        ],
      },
      {
        heading: "Transfer, opname, & kedaluwarsa",
        steps: [
          "Transfer: pindahkan stok antar gudang — nilai persediaan tidak berubah, tanpa jurnal.",
          "Opname: masukkan jumlah fisik hasil hitung — selisihnya otomatis dijurnal sebagai penyesuaian.",
          "Lot kedaluwarsa: penjualan otomatis mengambil lot ter-dekat exp (FEFO); peringatan muncul untuk lot yang akan kedaluwarsa ≤ 30 hari.",
        ],
      },
    ],
  },
  {
    slug: "persetujuan",
    title: "Persetujuan Pembelian",
    appPath: "/app/persetujuan",
    intro:
      "Kontrol pengeluaran: pembelian oleh Admin di atas ambang nominal harus disetujui Owner sebelum diposting.",
    sections: [
      {
        heading: "Cara kerjanya",
        image: "/panduan/persetujuan-1.webp",
        imageAlt: "Antrean persetujuan pembelian",
        steps: [
          "Owner mengatur ambang (mis. Rp 5.000.000) di halaman Persetujuan.",
          "Pembelian Admin di bawah ambang langsung diposting; di atasnya masuk antrean menunggu.",
          "Owner menyetujui (transaksi diposting persis seperti diajukan) atau menolak dengan alasan.",
        ],
      },
    ],
  },
];

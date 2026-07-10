import type { GuideModule } from "./types";

/** Modul untuk pengguna yang belum akrab dengan akuntansi (Mode Pemula, Fase 5c). */
export const PEMULA: GuideModule[] = [
  {
    slug: "akuntansi-pemula",
    title: "Akuntansi untuk Pemula",
    appPath: "/app/keuangan/catat",
    intro:
      "Tidak paham debit-kredit, SAK, atau jurnal? Tidak masalah. erpindo dirancang agar pembukuan berjalan benar tanpa Anda harus menjadi akuntan — panduan ini menjelaskan 5 hal inti yang cukup Anda tahu.",
    sections: [
      {
        heading: "1. Anda tidak perlu menulis jurnal",
        body: [
          "Hampir semua pencatatan terjadi otomatis: membuat faktur penjualan, belanja stok, menjalankan penggajian, transaksi kasir — semuanya langsung dibukukan dengan benar di belakang layar. Tugas Anda hanya mencatat kejadian bisnisnya, bukan akuntansinya.",
        ],
      },
      {
        heading: "2. Untuk uang keluar-masuk biasa, pakai \"Catat Transaksi\"",
        steps: [
          "Buka menu Keuangan → Catat Transaksi.",
          "Pilih jenisnya: Uang Masuk, Uang Keluar, atau Pindah Dana (kas ↔ bank).",
          "Isi jumlah, pilih dompet (kas/bank), pilih kategori berbahasa sehari-hari (mis. \"Bayar listrik, air & internet\", \"Sewa tempat\", \"Setoran modal\").",
          "Baca pratinjau kalimat \"yang akan dicatat\", lalu klik Catat — jurnal 2 baris yang seimbang dibuat otomatis.",
        ],
        tips: ["Ragu memilih kategori? Tanyakan ke Asisten AI (tombol ✨ kanan-bawah), mis. \"beli galon air masuk kategori apa?\""],
      },
      {
        heading: "3. Nyalakan Mode Sederhana",
        body: [
          "Di Pengaturan → Tampilan, aktifkan Mode Sederhana: menu teknis (Jurnal Umum, Buku Besar, Neraca Saldo, Bagan Akun) disembunyikan supaya tidak membingungkan. Data tidak berubah sama sekali — saat Anda siap, matikan lagi dan semua menu kembali.",
        ],
      },
      {
        heading: "4. Dua laporan yang perlu Anda buka",
        body: [
          "Laba Rugi menjawab \"bulan ini untung atau rugi berapa?\" — pendapatan dikurangi semua beban. Arus Kas menjawab \"uangnya ke mana?\" — kas masuk dan keluar. Cukup dua ini untuk mengelola usaha sehari-hari; laporan lain (Neraca, Umur Piutang) berguna saat berbicara dengan bank atau menagih pelanggan.",
        ],
      },
      {
        heading: "5. Istilah asing? Ada kamusnya",
        body: [
          "Buka modul \"Kamus Istilah\" di panduan ini untuk penjelasan singkat istilah yang sering muncul (debit, kredit, HPP, neraca, dll.) — atau tanyakan langsung ke Asisten AI di dalam aplikasi.",
        ],
      },
    ],
  },
  {
    slug: "istilah",
    title: "Kamus Istilah",
    intro:
      "Penjelasan singkat dan sederhana untuk istilah akuntansi & bisnis yang muncul di erpindo — tanpa teori yang berat.",
    sections: [
      {
        heading: "Dasar pembukuan",
        steps: [
          "Jurnal — catatan resmi satu transaksi; selalu punya dua sisi yang nilainya sama (itulah double-entry).",
          "Debit & kredit — dua sisi pencatatan. Tidak perlu dihafal: aset/beban bertambah di debit; kewajiban/modal/pendapatan bertambah di kredit.",
          "Akun & bagan akun (COA) — \"laci-laci\" tempat transaksi dikelompokkan: Kas, Bank, Piutang, Persediaan, Pendapatan, Beban, dst.",
          "Buku besar — riwayat lengkap satu akun beserta saldo berjalannya.",
          "Neraca saldo — daftar saldo semua akun; total debit harus sama dengan total kredit.",
          "Posting — menyimpan transaksi secara final ke pembukuan. Yang sudah diposting tidak bisa diedit, hanya bisa dikoreksi lewat pembalik/void — itu prinsip audit.",
          "Tutup buku — mengunci transaksi sampai tanggal tertentu agar laporan periode itu tidak berubah lagi.",
        ],
      },
      {
        heading: "Jual-beli & tagihan",
        steps: [
          "Faktur (invoice) — dokumen tagihan resmi atas penjualan/pembelian.",
          "Piutang usaha — uang yang belum dibayar pelanggan kepada Anda.",
          "Hutang usaha — uang yang belum Anda bayar ke pemasok.",
          "Jatuh tempo — batas tanggal pembayaran tagihan.",
          "Retur — pengembalian barang; pembukuannya otomatis dibalik secara proporsional.",
          "Void — membatalkan dokumen yang salah input (belum dibayar); jurnal pembalik dibuat otomatis.",
          "Umur piutang (aging) — pengelompokan tagihan menurut lamanya menunggak (1–30, 31–60 hari, dst.).",
          "Penawaran (quotation) — dokumen harga untuk calon pembeli; belum menyentuh stok/pembukuan sampai dikonversi jadi faktur.",
        ],
      },
      {
        heading: "Stok & harga pokok",
        steps: [
          "Persediaan — nilai barang dagangan yang Anda miliki.",
          "HPP (Harga Pokok Penjualan) — biaya perolehan barang yang terjual; penjualan dikurangi HPP = laba kotor.",
          "Biaya rata-rata (moving average) — metode menghitung nilai stok: harga beli dirata-rata setiap kali barang masuk.",
          "Stok opname — menghitung fisik barang lalu menyamakan angkanya di sistem; selisihnya dibukukan otomatis.",
          "FEFO — First Expired, First Out: barang yang paling dekat kedaluwarsa dijual lebih dulu.",
          "Lot/batch — kelompok barang dengan tanggal kedaluwarsa yang sama.",
        ],
      },
      {
        heading: "Laporan keuangan",
        steps: [
          "Laba Rugi — pendapatan dikurangi beban dalam satu periode: untung atau rugi.",
          "Neraca — potret kekayaan pada satu tanggal: aset = kewajiban + ekuitas (selalu seimbang).",
          "Arus kas — uang benar-benar masuk dan keluar dari kas & bank.",
          "Aset — semua yang dimiliki perusahaan (kas, piutang, stok, kendaraan).",
          "Kewajiban (liabilitas) — semua yang harus dibayar (hutang usaha, hutang gaji, PPN keluaran).",
          "Ekuitas (modal) — hak pemilik: aset dikurangi kewajiban.",
          "Penyusutan (depresiasi) — nilai aset tetap yang \"dipakai habis\" sedikit demi sedikit tiap bulan dan dibukukan sebagai beban.",
        ],
      },
      {
        heading: "Pajak & gaji",
        steps: [
          "PPN — Pajak Pertambahan Nilai yang dipungut saat menjual (keluaran) dan dibayar saat membeli (masukan).",
          "DPP — Dasar Pengenaan Pajak: nilai transaksi sebelum PPN.",
          "e-Faktur / Coretax — sistem faktur pajak elektronik DJP; erpindo menyiapkan berkas XML siap impor.",
          "NPWP — Nomor Pokok Wajib Pajak; sejak Coretax dinormalkan menjadi 16 digit.",
          "PPh 21 — pajak penghasilan karyawan yang dipotong dari gaji; dihitung dengan tarif efektif rata-rata (TER).",
          "BPJS — iuran jaminan kesehatan & ketenagakerjaan yang dipotong/ditanggung sesuai ketentuan.",
          "Prive — uang perusahaan yang diambil pemilik untuk keperluan pribadi (bukan beban usaha).",
        ],
      },
    ],
  },
];

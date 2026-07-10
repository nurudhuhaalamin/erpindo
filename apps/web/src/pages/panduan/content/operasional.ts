import type { GuideModule } from "./types";

export const OPERASIONAL: GuideModule[] = [
  {
    slug: "penggajian",
    title: "Penggajian & PPh 21",
    appPath: "/app/hr/penggajian",
    intro:
      "Data karyawan, gaji pokok & tunjangan, lalu jalankan penggajian bulanan sekali klik — PPh 21 metode TER dan BPJS dihitung otomatis, slip gaji siap cetak, beban gaji terjurnal.",
    sections: [
      {
        heading: "Karyawan & run penggajian",
        image: "/panduan/penggajian-1.webp",
        imageAlt: "Halaman penggajian",
        steps: [
          "Tambah karyawan: nama, jabatan, status PTKP (TK/0, K/1, dst.), gaji pokok & tunjangan.",
          "Jalankan penggajian per bulan: pilih periode, akun pembayar, dan tanggal bayar.",
          "Sistem menghitung PPh 21 (tarif efektif rata-rata/TER sesuai PMK 168/2023) + potongan BPJS Kesehatan & Ketenagakerjaan, mencetak slip per karyawan, dan menjurnal beban gaji.",
        ],
        tips: [
          "Parameter tarif (TER, batas upah BPJS) tersimpan dalam tabel yang mudah diperbarui saat aturan berubah — verifikasi akhir dengan konsultan pajak Anda tetap disarankan.",
        ],
      },
    ],
  },
  {
    slug: "crm",
    title: "CRM: Pipeline & Penawaran",
    appPath: "/app/crm/leads",
    intro:
      "Kelola calon pelanggan dari prospek sampai deal: tahapan funnel, catatan aktivitas, konversi menjadi pelanggan, dan penawaran yang berubah jadi faktur sekali klik.",
    sections: [
      {
        heading: "Pipeline lead",
        image: "/panduan/crm-1.webp",
        imageAlt: "Pipeline CRM",
        steps: [
          "Catat lead beserta nilai potensinya; geser tahapan (baru → dihubungi → terkualifikasi → penawaran → menang/kalah).",
          "Tambahkan aktivitas follow-up (telepon, meeting, catatan) agar riwayat komunikasi tersimpan.",
          "Lead yang siap dikonversi menjadi Pelanggan otomatis masuk daftar kontak.",
        ],
      },
      {
        heading: "Penawaran (quotation)",
        image: "/panduan/crm-2.webp",
        imageAlt: "Daftar penawaran",
        steps: [
          "Buat penawaran berisi baris produk + PPN untuk pelanggan.",
          "Saat disetujui pelanggan, tandai \"Diterima\" lalu Konversi — faktur penjualan terbit dengan stok & jurnal otomatis.",
        ],
      },
    ],
  },
  {
    slug: "proyek",
    title: "Proyek",
    appPath: "/app/proyek",
    intro:
      "Untuk usaha berbasis proyek: pantau tugas, tandai pendapatan & biaya per proyek dari faktur/jurnal, dan lihat profitabilitas tiap proyek.",
    sections: [
      {
        heading: "Proyek, tugas, dan profitabilitas",
        image: "/panduan/proyek-1.webp",
        imageAlt: "Halaman proyek",
        steps: [
          "Buat proyek dengan kode & anggaran; tambahkan tugas dan tandai selesai.",
          "Saat membuat faktur atau jurnal, pilih proyek terkait — pendapatan/biaya otomatis tertandai ke proyek itu.",
          "Detail proyek menampilkan realisasi vs anggaran dan laba proyek berjalan.",
        ],
      },
    ],
  },
  {
    slug: "kontrak",
    title: "Kontrak & Tagihan Berulang",
    appPath: "/app/kontrak",
    intro:
      "Langganan bulanan pelanggan (jasa maintenance, sewa, pasokan rutin) ditagih otomatis: sistem menerbitkan faktur setiap periode tanpa Anda ingat-ingat.",
    sections: [
      {
        heading: "Membuat kontrak berulang",
        image: "/panduan/kontrak-1.webp",
        imageAlt: "Daftar kontrak berulang",
        steps: [
          "Buat kontrak: pelanggan, frekuensi (bulanan), tanggal mulai, dan baris item + harga.",
          "Setiap jatuh tempo, faktur terbit otomatis (lewat cron harian) — muncul di menu Penjualan seperti faktur biasa.",
        ],
      },
    ],
  },
  {
    slug: "manufaktur",
    title: "Manufaktur & QC",
    appPath: "/app/manufaktur",
    intro:
      "Untuk yang memproduksi barang: resep (Bill of Materials), perintah produksi yang mengubah bahan menjadi barang jadi dengan biaya gabungan, plus inspeksi mutu.",
    sections: [
      {
        heading: "BoM → produksi → QC",
        image: "/panduan/manufaktur-1.webp",
        imageAlt: "Halaman manufaktur",
        steps: [
          "Definisikan BoM: komponen & jumlahnya untuk menghasilkan sekian unit barang jadi.",
          "Buat perintah produksi → Selesaikan: stok bahan keluar, barang jadi masuk dengan biaya gabungan bahan.",
          "Inspeksi QC: luluskan hasil produksi, atau karantina ke gudang terpisah bila bermasalah.",
        ],
      },
    ],
  },
  {
    slug: "maintenance",
    title: "Pemeliharaan Aset",
    appPath: "/app/maintenance",
    intro:
      "Jadwal servis berkala untuk aset (kendaraan, mesin, genset) yang menerbitkan work order otomatis, plus work order ad-hoc dengan biaya terjurnal.",
    sections: [
      {
        heading: "Jadwal servis & work order",
        image: "/panduan/maintenance-1.webp",
        imageAlt: "Halaman pemeliharaan",
        steps: [
          "Buat jadwal: aset, nama servis, interval bulan, tanggal mulai — work order terbit otomatis saat jatuh tempo.",
          "Selesaikan work order dengan biaya & akun pembayar — beban pemeliharaan terjurnal; riwayat per aset tersimpan.",
        ],
      },
    ],
  },
  {
    slug: "helpdesk",
    title: "Helpdesk",
    appPath: "/app/helpdesk",
    intro:
      "Tiket dukungan pelanggan dengan prioritas, penugasan ke anggota tim, balasan untuk pelanggan, dan catatan internal tim.",
    sections: [
      {
        heading: "Mengelola tiket",
        image: "/panduan/helpdesk-1.webp",
        imageAlt: "Daftar tiket helpdesk",
        steps: [
          "Buat tiket terhubung ke kontak, pilih prioritas (low/medium/high).",
          "Balas ke pelanggan atau tulis catatan internal (tidak terlihat pelanggan); tugaskan ke anggota tim.",
          "Tandai selesai — waktu penyelesaian tercatat.",
        ],
      },
    ],
  },
];

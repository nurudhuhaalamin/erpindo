/**
 * Ringkasan pengetahuan per modul untuk grounding Asisten erpindo.
 * Diringkas dari konten panduan (apps/web/src/pages/panduan/content) —
 * cukup padat agar muat di prompt tanpa memboroskan token/neuron.
 */

export type GuideKnowledge = { slug: string; title: string; keywords: string[]; summary: string };

export const GUIDE_KNOWLEDGE: GuideKnowledge[] = [
  {
    slug: "mulai",
    title: "Mulai Cepat",
    keywords: ["daftar", "mulai", "onboarding", "pertama", "setup", "trial"],
    summary:
      "Daftar → verifikasi email → langsung pakai; bagan akun Indonesia otomatis tersedia. Checklist 'Mulai cepat' di Dashboard memandu: profil perusahaan (alamat+NPWP), tambah produk, tambah kontak, faktur pertama, undang tim. Trial 30 hari semua fitur tanpa kartu kredit.",
  },
  {
    slug: "pengaturan",
    title: "Pengaturan & Tim",
    keywords: ["pengaturan", "logo", "npwp", "tim", "undang", "peran", "2fa", "tutup buku", "anggota"],
    summary:
      "Halaman Pengaturan: profil perusahaan (nama, alamat, NPWP untuk kop & e-Faktur), unggah logo (tampil di faktur & struk), undang anggota (peran Owner penuh / Admin transaksi / Viewer baca-saja), aktifkan 2FA authenticator, dan tutup buku (mengunci transaksi ≤ tanggal tertentu).",
  },
  {
    slug: "produk",
    title: "Produk & Jasa",
    keywords: ["produk", "sku", "barang", "jasa", "stok minimum", "kedaluwarsa", "impor", "csv"],
    summary:
      "Master Produk: SKU unik, harga jual/beli, satuan; centang Jasa untuk item tanpa stok; centang Lacak kedaluwarsa untuk lot FEFO; isi Stok minimum untuk peringatan lonceng. Impor massal dari CSV dengan pratinjau per baris.",
  },
  {
    slug: "kontak",
    title: "Pelanggan & Pemasok",
    keywords: ["kontak", "pelanggan", "pemasok", "customer", "supplier", "npwp pembeli"],
    summary:
      "Master Kontak: tipe Pelanggan/Pemasok/Keduanya; NPWP pembeli dipakai otomatis di ekspor e-Faktur & XML Coretax. Bisa impor CSV.",
  },
  {
    slug: "pos",
    title: "Kasir (POS)",
    keywords: ["kasir", "pos", "shift", "struk", "tunai", "kembalian", "offline", "laci"],
    summary:
      "Kasir: buka shift (gudang + kas awal) → jual (cari produk, qty, diskon per item, uang tunai, kembalian otomatis, struk berlogo) → tutup shift (kas fisik; selisih otomatis dijurnal). Tiap penjualan POS = faktur lunas: jurnal pendapatan+HPP dan stok keluar otomatis. PWA tetap jalan offline.",
  },
  {
    slug: "penjualan",
    title: "Penjualan & Faktur",
    keywords: ["faktur", "penjualan", "invoice", "ppn", "diskon", "piutang", "pembayaran", "retur", "void", "batal", "valas"],
    summary:
      "Faktur penjualan: pilih pelanggan, tanggal, jatuh tempo, tarif PPN 0/11/12%, baris produk + diskon% per baris. Posting otomatis menjurnal Piutang, Pendapatan, PPN Keluaran, HPP, Persediaan + stok keluar. Pembayaran bisa bertahap; retur membuat nota kredit proporsional; pembatalan (void) hanya untuk faktur belum dibayar — jurnal pembalik persis & stok kembali. Faktur valas: pilih mata uang + kurs (daftarkan dulu di Mata Uang).",
  },
  {
    slug: "pembelian",
    title: "Pembelian",
    keywords: ["pembelian", "purchase", "hutang", "lot", "restock", "ppn masukan"],
    summary:
      "Faktur pembelian: pemasok, gudang tujuan, PPN, baris produk (+lot & tanggal exp untuk produk berpelacakan kedaluwarsa). Posting menjurnal Persediaan & PPN Masukan; stok masuk pada biaya setelah diskon; hutang tercatat sampai dibayar.",
  },
  {
    slug: "stok",
    title: "Stok & Gudang",
    keywords: ["stok", "gudang", "opname", "transfer", "kartu stok", "fefo", "hpp", "persediaan"],
    summary:
      "Stok multi-gudang dengan HPP rata-rata; nilai stok selalu sama dengan akun Persediaan. Kartu stok = riwayat mutasi per produk. Transfer antar gudang tanpa jurnal; opname menjurnal selisih otomatis; lot kedaluwarsa keluar FEFO dengan peringatan ≤30 hari.",
  },
  {
    slug: "persetujuan",
    title: "Persetujuan Pembelian",
    keywords: ["persetujuan", "approval", "ambang", "otorisasi"],
    summary:
      "Owner set ambang nominal; pembelian Admin di atas ambang masuk antrean menunggu persetujuan Owner (disetujui → diposting persis; ditolak → alasan).",
  },
  {
    slug: "akuntansi",
    title: "Akuntansi & Jurnal",
    keywords: ["jurnal", "akun", "coa", "buku besar", "neraca saldo", "debit", "kredit", "double entry"],
    summary:
      "Bagan akun Indonesia bawaan (bisa tambah akun / ganti nama; kode & tipe terkunci). Jurnal Umum untuk pencatatan manual — harus seimbang (total debit = kredit) atau ditolak. Buku besar per akun; neraca saldo selalu balance. Jurnal terposting tidak bisa diedit; koreksi via jurnal pembalik/void.",
  },
  {
    slug: "laporan",
    title: "Laporan Keuangan",
    keywords: ["laporan", "laba rugi", "neraca", "arus kas", "aging", "umur piutang", "ekspor", "csv"],
    summary:
      "Laba Rugi, Neraca (selalu seimbang), Arus Kas, dan Umur Piutang/Hutang (bucket lancar/1-30/31-60/61-90/>90 hari) — real-time dari jurnal, bisa ekspor CSV & cetak. Anggaran vs realisasi per akun per bulan di halaman Anggaran.",
  },
  {
    slug: "pajak",
    title: "Pajak & e-Faktur Coretax",
    keywords: ["pajak", "ppn", "coretax", "e-faktur", "efaktur", "xml", "dpp", "npwp", "kode 04"],
    summary:
      "PPN otomatis di faktur (0/11/12%). Halaman Ekspor e-Faktur: pilih periode → 'Unduh XML Coretax' (format TaxInvoiceBulk siap impor ke Coretax DJP; kode transaksi 04 dengan DPP nilai lain 11/12 untuk non-mewah sesuai PMK 131/2024, kode 01 untuk 12% penuh; faktur void & non-PPN dikecualikan). Syarat: NPWP perusahaan diisi di Pengaturan, NPWP pembeli di Kontak. CSV rekap tetap ada.",
  },
  {
    slug: "penggajian",
    title: "Penggajian & PPh 21",
    keywords: ["gaji", "payroll", "pph 21", "ter", "bpjs", "slip", "karyawan", "ptkp"],
    summary:
      "Tambah karyawan (jabatan, status PTKP, gaji pokok, tunjangan) → jalankan penggajian per bulan (periode, akun pembayar, tanggal bayar). PPh 21 metode TER (PMK 168/2023) + BPJS Kesehatan & Ketenagakerjaan otomatis; slip gaji per karyawan; beban gaji terjurnal.",
  },
  {
    slug: "aset",
    title: "Aset Tetap",
    keywords: ["aset", "penyusutan", "depresiasi", "pelepasan", "nilai buku"],
    summary:
      "Register aset (harga perolehan, umur manfaat bulan, residu, akun pembayar); penyusutan garis lurus dijurnal otomatis bulanan; pelepasan/penjualan aset menghitung & menjurnal laba/rugi otomatis.",
  },
  {
    slug: "crm",
    title: "CRM: Pipeline & Penawaran",
    keywords: ["crm", "lead", "pipeline", "penawaran", "quotation", "funnel", "prospek"],
    summary:
      "Lead dengan nilai potensi & tahapan funnel + catatan aktivitas; konversi lead → pelanggan. Penawaran berisi baris produk + PPN; saat 'Diterima' bisa dikonversi jadi faktur sekali klik.",
  },
  {
    slug: "anggaran",
    title: "Anggaran",
    keywords: ["anggaran", "budget", "target", "realisasi", "varians"],
    summary: "Target pendapatan/beban per akun per bulan; realisasi otomatis dari jurnal (selalu cocok dengan Laba Rugi); selisih berwarna.",
  },
  {
    slug: "kurs",
    title: "Multi Mata Uang",
    keywords: ["kurs", "valas", "usd", "mata uang", "selisih kurs"],
    summary:
      "Daftarkan mata uang & kurs; faktur valas dikonversi ke Rupiah saat posting; selisih kurs saat pelunasan dijurnal otomatis.",
  },
  {
    slug: "konsolidasi",
    title: "Multi-Perusahaan & Konsolidasi",
    keywords: ["konsolidasi", "multi perusahaan", "cabang", "workspace", "gabungan"],
    summary:
      "Satu akun bisa membuat beberapa perusahaan (database terpisah per perusahaan); pengalih workspace di kiri atas; halaman Konsolidasi menggabungkan Laba Rugi & Neraca lintas perusahaan.",
  },
  {
    slug: "proyek",
    title: "Proyek",
    keywords: ["proyek", "tugas", "profitabilitas", "termin"],
    summary: "Proyek + tugas; tag pendapatan/biaya per proyek dari faktur & jurnal; laporan realisasi vs anggaran dan laba per proyek.",
  },
  {
    slug: "kontrak",
    title: "Kontrak & Tagihan Berulang",
    keywords: ["kontrak", "langganan", "berulang", "recurring", "tagihan otomatis"],
    summary: "Kontrak pelanggan (frekuensi bulanan, baris item) → faktur terbit otomatis tiap jatuh tempo lewat cron harian.",
  },
  {
    slug: "manufaktur",
    title: "Manufaktur & QC",
    keywords: ["manufaktur", "produksi", "bom", "resep", "qc", "karantina"],
    summary:
      "BoM (komponen → hasil); perintah produksi mengonsumsi bahan & menghasilkan barang jadi dengan biaya gabungan; QC lulus/karantina (pindah gudang).",
  },
  {
    slug: "maintenance",
    title: "Pemeliharaan Aset",
    keywords: ["maintenance", "servis", "work order", "perawatan"],
    summary:
      "Jadwal servis berkala per aset (work order otomatis saat jatuh tempo) + work order ad-hoc; penyelesaian berbiaya menjurnal Beban Pemeliharaan.",
  },
  {
    slug: "helpdesk",
    title: "Helpdesk",
    keywords: ["helpdesk", "tiket", "keluhan", "dukungan", "support"],
    summary: "Tiket terhubung kontak dengan prioritas, penugasan anggota, balasan pelanggan vs catatan internal, dan status sampai selesai.",
  },
];

/** Pilih ringkasan modul paling relevan untuk sebuah pertanyaan (skor kata kunci). */
export function pickRelevant(question: string, max = 2): GuideKnowledge[] {
  const q = question.toLowerCase();
  return GUIDE_KNOWLEDGE.map((g) => ({
    g,
    score:
      g.keywords.reduce((s, k) => s + (q.includes(k) ? 2 : 0), 0) +
      (q.includes(g.title.toLowerCase()) ? 3 : 0),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.g);
}

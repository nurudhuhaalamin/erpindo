import { useLang, type Dual } from "./index";

/**
 * Kamus istilah UI yang dipakai berulang di banyak halaman modul (Fase 16b):
 * label kolom tabel, label form, dan tombol aksi. Dibuat terpusat karena kata
 * yang sama muncul belasan kali di berkas berbeda — menerjemahkannya satu per
 * satu di tiap halaman akan cepat menjadi tidak konsisten.
 *
 * Dipakai lewat `const u = useUi(); u("nama")`.
 *
 * Istilah domain Indonesia yang merupakan nama resmi (PPN, NPWP, SKU, FEFO,
 * PPh 21, BPJS) sengaja TIDAK diterjemahkan — sama seperti keputusan i18n
 * landing (Fase 14f) dan judul halaman (Fase 16a).
 */
const UI: Record<string, Dual> = {
  // Kolom & label umum
  nama: { id: "Nama", en: "Name" },
  kode: { id: "Kode", en: "Code" },
  tanggal: { id: "Tanggal", en: "Date" },
  status: { id: "Status", en: "Status" },
  jenis: { id: "Jenis", en: "Type" },
  jumlah: { id: "Jumlah", en: "Amount" },
  total: { id: "Total", en: "Total" },
  subtotal: { id: "Subtotal", en: "Subtotal" },
  keterangan: { id: "Keterangan", en: "Notes" },
  alamat: { id: "Alamat", en: "Address" },
  telepon: { id: "Telepon", en: "Phone" },
  email: { id: "Email", en: "Email" },
  satuan: { id: "Satuan", en: "Unit" },
  dari: { id: "Dari", en: "From" },
  sampai: { id: "Sampai", en: "To" },
  opsional: { id: "opsional", en: "optional" },

  // Aksi
  simpan: { id: "Simpan", en: "Save" },
  batal: { id: "Batal", en: "Cancel" },
  hapus: { id: "Hapus", en: "Delete" },
  ubah: { id: "Ubah", en: "Edit" },
  tambah: { id: "Tambah", en: "Add" },
  cari: { id: "Cari", en: "Search" },
  arsipkan: { id: "Arsipkan", en: "Archive" },
  cetak: { id: "Cetak", en: "Print" },
  eksporCsv: { id: "Ekspor CSV", en: "Export CSV" },
  unduhTemplate: { id: "Unduh template", en: "Download template" },
  muatLebihBanyak: { id: "Muat lebih banyak", en: "Load more" },
  setujui: { id: "Setujui", en: "Approve" },
  tolak: { id: "Tolak", en: "Reject" },
  batalkan: { id: "Batalkan", en: "Void" },

  // Master data
  produk: { id: "Produk", en: "Product" },
  gudang: { id: "Gudang", en: "Warehouse" },
  pelanggan: { id: "Pelanggan", en: "Customer" },
  pemasok: { id: "Pemasok", en: "Supplier" },
  keduanya: { id: "Keduanya", en: "Both" },
  hargaJual: { id: "Harga Jual", en: "Selling price" },
  hargaBeli: { id: "Harga Beli", en: "Buying price" },
  hargaJualRp: { id: "Harga jual (Rp)", en: "Selling price (Rp)" },
  hargaBeliRp: { id: "Harga beli (Rp)", en: "Buying price (Rp)" },
  stokMinimum: { id: "Stok minimum", en: "Minimum stock" },
  satuanBesar: { id: "Satuan besar (opsional)", en: "Bulk unit (optional)" },
  barcodeLabel: { id: "Barcode / kode batang", en: "Barcode" },
  seri: { id: "Seri", en: "Serial" },

  // Pencarian & konfirmasi
  cariProduk: { id: "Cari SKU / nama produk…", en: "Search SKU / product name…" },
  cariGudang: { id: "Cari kode / nama gudang…", en: "Search warehouse code / name…" },
  cariKontak: { id: "Cari nama / email / telepon…", en: "Search name / email / phone…" },
  arsipkanProduk: { id: "Arsipkan produk ini?", en: "Archive this product?" },
  arsipkanKontak: { id: "Arsipkan kontak ini?", en: "Archive this contact?" },
  arsipkanGudang: { id: "Arsipkan gudang ini?", en: "Archive this warehouse?" },
  label: { id: "Label", en: "Label" },
  jenisUsaha: { id: "Jenis usaha", en: "Business type" },
  mulaiCepat: { id: "Mulai cepat: contoh data usaha", en: "Quick start: sample business data" },
  isiNomorSeri: { id: "Masukkan nomor seri unit", en: "Enter the unit serial number" },
  nolTanpaPeringatan: { id: "0 = tanpa peringatan", en: "0 = no alert" },
  opsionalPindaiKasir: { id: "opsional — untuk pindai di kasir", en: "optional — for scanning at the till" },
  // Transaksi (Penjualan/Pembelian) — Fase 16c
  hargaSatuan: { id: "Harga satuan", en: "Unit price" },
  disc: { id: "Disc %", en: "Disc %" },
  mataUang: { id: "Mata uang", en: "Currency" },
  proyekOpsional: { id: "Proyek (opsional)", en: "Project (optional)" },
  noLotOpsional: { id: "No. lot (opsional)", en: "Lot no. (optional)" },
  tanpaPpn: { id: "Tanpa PPN", en: "No VAT" },
  pembayaran: { id: "Pembayaran", en: "Payments" },
  pembayaranDokumen: { id: "Pembayaran dokumen ini", en: "Payments for this document" },
  belumAdaPembayaran: { id: "Belum ada pembayaran tercatat.", en: "No payments recorded yet." },
  sudahDibayar: { id: "Sudah dibayar", en: "Paid" },
  sudahDiretur: { id: "Sudah diretur", en: "Returned" },
  retur: { id: "Retur", en: "Return" },
  returIsiQty: { id: "Retur barang — isi qty yang dikembalikan:", en: "Return goods — enter the quantity returned:" },
  dibatalkan: { id: "DIBATALKAN", en: "VOIDED" },
  dihapus: { id: "DIHAPUS", en: "DELETED" },
  hapusPembayaranIni: { id: "Hapus pembayaran ini?", en: "Delete this payment?" },
  yaHapusPembayaran: { id: "Ya, hapus pembayaran", en: "Yes, delete payment" },
  yaBatalkanDokumen: { id: "Ya, batalkan dokumen", en: "Yes, void document" },
  batalkanMuatForm: { id: "Batalkan & muat ke form", en: "Void & load into form" },
  masukKeluarAkun: { id: "Masuk/keluar dari akun", en: "In/out of account" },
  cariDokumen: { id: "Cari no. dokumen / nama kontak…", en: "Search document no. / contact name…" },
  cariProdukSkuNama: { id: "Cari produk (SKU/nama)…", en: "Search product (SKU/name)…" },
  // Stok — Fase 16d
  stok: { id: "Stok", en: "Stock" },
  saldo: { id: "Saldo", en: "Balance" },
  nilai: { id: "Nilai", en: "Value" },
  waktu: { id: "Waktu", en: "Time" },
  catatan: { id: "Catatan", en: "Note" },
  minimum: { id: "Minimum", en: "Minimum" },
  kedaluwarsa: { id: "Kedaluwarsa", en: "Expiry" },
  masukKeluar: { id: "Masuk/Keluar", en: "In/Out" },
  biayaSatuan: { id: "Biaya Satuan", en: "Unit cost" },
  biayaRataRata: { id: "Biaya Rata-rata", en: "Average cost" },
  qtyFisik: { id: "Qty fisik", en: "Physical qty" },
  dariGudang: { id: "Dari gudang", en: "From warehouse" },
  keGudang: { id: "Ke gudang", en: "To warehouse" },
  kartu: { id: "Kartu", en: "Card" },
  usulanBeli: { id: "Usulan beli", en: "Suggest order" },
  hanyaStokMenipis: { id: "Hanya tampilkan stok menipis (qty ≤", en: "Show low stock only (qty ≤" },
  ambangStokMenipis: { id: "Ambang stok menipis", en: "Low-stock threshold" },
  belumAdaStok: { id: "Belum ada stok", en: "No stock yet" },
  levelStokPerGudang: { id: "Level stok per gudang", en: "Stock levels per warehouse" },
  lotKedaluwarsa: { id: "Lot & kedaluwarsa", en: "Lot & expiry" },
  penyesuaianStok: { id: "Penyesuaian stok (opname)", en: "Stock adjustment (stock take)" },
  riwayatMutasi: { id: "Riwayat mutasi dengan saldo berjalan.", en: "Movement history with a running balance." },
  transferAntarGudang: { id: "Transfer antar gudang", en: "Inter-warehouse transfer" },
  usulanPembelianOtomatis: { id: "Usulan pembelian otomatis", en: "Automatic purchase suggestions" },
};

export type UiKey = keyof typeof UI;

/** Penerjemah istilah UI bersama: `const u = useUi(); u("simpan")`. */
export function useUi(): (key: UiKey) => string {
  const lang = useLang();
  return (key: UiKey) => UI[key]?.[lang] ?? String(key);
}

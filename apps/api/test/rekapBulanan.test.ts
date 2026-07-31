import { describe, expect, it } from "vitest";
import { teksRekapBulanan } from "../src/routes/scheduledReports";

/**
 * Email rekap bulanan (Fase 21b).
 *
 * Rekapnya sudah disusun otomatis sejak Fase 7h, tetapi **tidak pernah dikirim**
 * — mengendap di `report_snapshots` sementara roadmap terlanjur mengklaim
 * "dikirim email tiap awal bulan" (koreksi Fase 21a).
 *
 * Yang diuji di sini isi emailnya, bukan pengirimannya: bagian yang paling mudah
 * salah pada email otomatis adalah angka yang salah format dan kalimat yang
 * janggal ketika datanya kosong.
 */
describe("teksRekapBulanan (Fase 21b)", () => {
  const dasar = {
    namaPemilik: "Budi",
    namaTenant: "PT Maju Jaya",
    periode: "2026-06",
  };

  it("memuat sapaan, nama perusahaan, dan periodenya", () => {
    const t = teksRekapBulanan({
      ...dasar,
      totalRevenue: 12_500_000,
      invoiceCount: 8,
      topProduct: "Kopi Arabika Gayo",
    });
    expect(t).toContain("Halo Budi");
    expect(t).toContain("PT Maju Jaya");
    expect(t).toContain("2026-06");
  });

  it("menulis rupiah berformat Indonesia, bukan angka mentah", () => {
    const t = teksRekapBulanan({
      ...dasar,
      totalRevenue: 12_500_000,
      invoiceCount: 8,
      topProduct: null,
    });
    // "Rp 12.500.000" — bukan "Rp 12500000", yang membuat pemilik salah baca
    // besaran angkanya sekilas.
    expect(t).toContain("Rp 12.500.000");
    expect(t).not.toContain("12500000");
  });

  it("menyebut produk terlaris bila ada, dan tidak memaksakannya bila tidak", () => {
    const dengan = teksRekapBulanan({
      ...dasar,
      totalRevenue: 1_000,
      invoiceCount: 1,
      topProduct: "Teh Melati",
    });
    expect(dengan).toContain("Teh Melati");

    const tanpa = teksRekapBulanan({
      ...dasar,
      totalRevenue: 1_000,
      invoiceCount: 1,
      topProduct: null,
    });
    expect(tanpa).not.toContain("Produk terlaris");
    // Tidak boleh ada sisa "null"/"undefined" yang bocor ke email pelanggan.
    expect(tanpa).not.toMatch(/null|undefined/);
  });

  // Toko yang tutup sebulan tetap layak dapat laporan yang tenang. Kalimat
  // "Omzet Rp 0" tanpa penjelasan terbaca seperti sistemnya rusak.
  it("bulan tanpa transaksi dijelaskan, bukan dilaporkan sebagai Rp 0 telanjang", () => {
    const t = teksRekapBulanan({
      ...dasar,
      totalRevenue: 0,
      invoiceCount: 0,
      topProduct: null,
    });
    expect(t).toContain("Tidak ada faktur penjualan");
    expect(t).not.toContain("Omzet Rp 0");
    // Tetap memberi jalan keluar bila pemilik merasa seharusnya ada transaksi.
    expect(t).toContain("sudah diposting");
  });

  it("selalu ditutup tanda tangan yang sama", () => {
    const t = teksRekapBulanan({ ...dasar, totalRevenue: 5, invoiceCount: 1, topProduct: null });
    expect(t.trimEnd().endsWith("— Tim ERPindo")).toBe(true);
  });
});

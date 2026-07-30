import { describe, expect, it } from "vitest";
import { ramalStok } from "../src/index";

/**
 * Peramalan stok (Fase 20h). Yang diuji bukan "apakah angkanya keluar", tapi
 * apakah angkanya menunjuk arah yang benar — dan apakah ramalan atas data tipis
 * DITANDAI tipis, bukan disajikan sepercaya ramalan atas data tebal.
 */
describe("ramalStok (Fase 20h)", () => {
  // 90 hari, terjual 180 → 2/hari. Lead time 7 + cadangan 7 = titik pesan 28.
  const padat = {
    terjual: 180,
    terjualParuhAwal: 90,
    terjualParuhAkhir: 90,
    hariAdaPenjualan: 60,
    periodeHari: 90,
    leadTimeHari: 7,
    cadanganHari: 7,
    siklusHari: 30,
  };

  it("menghitung rata-rata harian, titik pesan, dan sisa hari sampai habis", () => {
    const r = ramalStok({ ...padat, stok: 100 });
    expect(r.rataHarian).toBe(2);
    expect(r.titikPesan).toBe(28); // 2 × (7 + 7)
    expect(r.hariHabis).toBe(50); // 100 / 2
    expect(r.perluPesan).toBe(false);
    expect(r.qtyDisarankan).toBe(0);
  });

  it("menyarankan beli hanya ketika stok sudah di bawah titik pesan", () => {
    const aman = ramalStok({ ...padat, stok: 29 });
    expect(aman.perluPesan).toBe(false);
    const perlu = ramalStok({ ...padat, stok: 28 });
    expect(perlu.perluPesan).toBe(true);
    // Target = 2 × (7 + 7 + 30) = 88; usulan = 88 − 28 = 60.
    expect(perlu.qtyDisarankan).toBe(60);
  });

  it("usulan beli tidak pernah negatif atau nol saat pemesanan diperlukan", () => {
    const r = ramalStok({ ...padat, stok: 0 });
    expect(r.qtyDisarankan).toBeGreaterThan(0);
  });

  // Inilah bagian yang paling mudah salah dipakai: pembagian tetap menghasilkan
  // angka rapi walau datanya hanya dua hari.
  it("data tipis ditandai keyakinan RENDAH meski angkanya rapi", () => {
    const tipis = ramalStok({
      ...padat,
      terjual: 180,
      hariAdaPenjualan: 2,
      stok: 10,
    });
    expect(tipis.rataHarian).toBe(2); // angkanya sama persis dengan kasus padat
    expect(tipis.keyakinan).toBe("rendah"); // tapi tidak boleh dipercaya sama
    expect(ramalStok({ ...padat, stok: 10 }).keyakinan).toBe("tinggi");
  });

  it("keyakinan SEDANG untuk cakupan hari jual di antara keduanya", () => {
    expect(ramalStok({ ...padat, hariAdaPenjualan: 9, stok: 10 }).keyakinan).toBe("sedang");
  });

  it("mengenali tren naik, turun, dan stabil dari dua paruh jendela", () => {
    const t = (awal: number, akhir: number) =>
      ramalStok({ ...padat, terjualParuhAwal: awal, terjualParuhAkhir: akhir, stok: 10 }).tren;
    expect(t(50, 100)).toBe("naik");
    expect(t(100, 50)).toBe("turun");
    expect(t(100, 100)).toBe("stabil");
    // Riak kecil (±10%) BUKAN perubahan arah.
    expect(t(100, 110)).toBe("stabil");
    expect(t(100, 90)).toBe("stabil");
    // Dari nol menjadi ada penjualan = naik.
    expect(t(0, 30)).toBe("naik");
  });

  it("produk tanpa penjualan sama sekali: tidak meramal, tidak menyarankan beli", () => {
    const r = ramalStok({
      stok: 40,
      terjual: 0,
      terjualParuhAwal: 0,
      terjualParuhAkhir: 0,
      hariAdaPenjualan: 0,
      periodeHari: 90,
    });
    expect(r.rataHarian).toBe(0);
    expect(r.hariHabis).toBeNull();
    expect(r.perluPesan).toBe(false);
    expect(r.qtyDisarankan).toBe(0);
    expect(r.keyakinan).toBe("rendah");
  });

  it("lead time lebih panjang menaikkan titik pesan dan usulan qty", () => {
    const cepat = ramalStok({ ...padat, stok: 28, leadTimeHari: 7 });
    const lambat = ramalStok({ ...padat, stok: 28, leadTimeHari: 30 });
    expect(lambat.titikPesan).toBeGreaterThan(cepat.titikPesan);
    expect(lambat.qtyDisarankan).toBeGreaterThan(cepat.qtyDisarankan);
  });

  it("periode nol tidak membagi dengan nol", () => {
    const r = ramalStok({ ...padat, stok: 10, periodeHari: 0 });
    expect(Number.isFinite(r.rataHarian)).toBe(true);
    expect(r.rataHarian).toBe(0);
  });
});

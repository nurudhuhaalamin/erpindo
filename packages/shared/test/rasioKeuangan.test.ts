import { describe, expect, it } from "vitest";
import { hitungRasioKeuangan } from "../src/index";

/**
 * Rasio keuangan (Fase 21b). Menutup sisa baris 🟡 "Rasio keuangan otomatis
 * (margin kotor, lancar, perputaran persediaan)" — margin kotor & bersih sudah
 * ada sejak lama; dua sisanya baru di sini.
 */
const baris = (code: string, amount: number) => ({ accountId: `acc-${code}`, code, name: code, amount });

describe("hitungRasioKeuangan (Fase 21b)", () => {
  const assets = [
    baris("1-1000", 10_000_000), // Kas
    baris("1-1200", 5_000_000), // Piutang
    baris("1-1300", 15_000_000), // Persediaan
    baris("1-1500", 80_000_000), // Aset Tetap — TIDAK lancar
    baris("1-1510", -20_000_000), // Akumulasi Penyusutan — TIDAK lancar
  ];
  const liabilities = [baris("2-1000", 12_000_000), baris("2-1100", 3_000_000)];

  it("aset lancar tidak ikut menghitung aset tetap", () => {
    const r = hitungRasioKeuangan({ assets, liabilities, hpp: 0 });
    // 10jt + 5jt + 15jt = 30jt. Aset tetap & akumulasinya dikecualikan.
    expect(r.asetLancar).toBe(30_000_000);
  });

  it("rasio lancar = aset lancar ÷ kewajiban", () => {
    const r = hitungRasioKeuangan({ assets, liabilities, hpp: 0 });
    expect(r.rasioLancar).toBeCloseTo(30_000_000 / 15_000_000, 6);
    expect(r.rasioLancar).toBe(2);
  });

  it("perputaran persediaan = HPP ÷ persediaan akhir", () => {
    const r = hitungRasioKeuangan({ assets, liabilities, hpp: 45_000_000 });
    expect(r.persediaan).toBe(15_000_000);
    expect(r.perputaranPersediaan).toBe(3);
  });

  // Pembagi nol harus menghasilkan `null`, bukan Infinity — Infinity akan
  // ter-render sebagai "∞" di layar laporan keuangan.
  it("tanpa kewajiban: rasio lancar null, bukan Infinity", () => {
    const r = hitungRasioKeuangan({ assets, liabilities: [], hpp: 1_000 });
    expect(r.rasioLancar).toBeNull();
  });

  it("tanpa persediaan: perputaran null, bukan Infinity", () => {
    const r = hitungRasioKeuangan({
      assets: [baris("1-1000", 1_000_000)],
      liabilities,
      hpp: 5_000_000,
    });
    expect(r.perputaranPersediaan).toBeNull();
  });

  it("perusahaan jasa (tanpa aset & kewajiban) tidak meledak", () => {
    const r = hitungRasioKeuangan({ assets: [], liabilities: [], hpp: 0 });
    expect(r).toEqual({
      asetLancar: 0,
      persediaan: 0,
      rasioLancar: null,
      perputaranPersediaan: null,
    });
  });

  // Batas klasifikasi dibuat eksplisit: akun tepat di `1-1500` sudah tidak
  // lancar, akun tepat di bawahnya masih lancar.
  it("batas 1-1500 tegas: 1-1499 lancar, 1-1500 tidak", () => {
    const r = hitungRasioKeuangan({
      assets: [baris("1-1499", 1_000), baris("1-1500", 9_999)],
      liabilities: [baris("2-1000", 1_000)],
      hpp: 0,
    });
    expect(r.asetLancar).toBe(1_000);
  });
});

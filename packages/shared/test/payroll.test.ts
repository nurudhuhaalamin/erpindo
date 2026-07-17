import { describe, expect, it } from "vitest";
import {
  BPJS_PARAMS,
  calculatePayslip,
  PTKP_STATUSES,
  TER_TABLES,
  terRate,
} from "../src/index";

// Uji batas bracket TER (PMK 168/2023): upTo bersifat INKLUSIF — tepat di batas
// masih memakai tarif bracket itu; satu rupiah di atasnya naik ke bracket berikut.
describe("terRate — batas bracket (upTo inklusif)", () => {
  it("kategori A: ambang bebas pajak 5,4jt", () => {
    expect(terRate("A", 5_400_000)).toBe(0);
    expect(terRate("A", 5_400_001)).toBe(0.25);
  });

  it("kategori B: ambang bebas pajak 6,2jt", () => {
    expect(terRate("B", 6_200_000)).toBe(0);
    expect(terRate("B", 6_200_001)).toBe(0.25);
  });

  it("kategori C: ambang bebas pajak 6,6jt", () => {
    expect(terRate("C", 6_600_000)).toBe(0);
    expect(terRate("C", 6_600_001)).toBe(0.25);
  });

  it("bracket puncak: di atas batas terakhir memakai tarif 34%", () => {
    expect(terRate("A", 1_400_000_000)).toBe(33);
    expect(terRate("A", 1_400_000_001)).toBe(34);
    expect(terRate("B", 2_000_000_000)).toBe(34);
    expect(terRate("C", 2_000_000_000)).toBe(34);
  });

  it("tabel TER monoton: batas naik dan tarif tidak pernah turun", () => {
    for (const cat of ["A", "B", "C"] as const) {
      const table = TER_TABLES[cat];
      for (let i = 1; i < table.length; i++) {
        expect(table[i]!.upTo).toBeGreaterThan(table[i - 1]!.upTo);
        expect(table[i]!.rate).toBeGreaterThanOrEqual(table[i - 1]!.rate);
      }
      expect(table[table.length - 1]!.upTo).toBe(Infinity);
      expect(table[table.length - 1]!.rate).toBe(34);
    }
  });
});

describe("calculatePayslip — batas upah BPJS tepat di cap", () => {
  it("bruto tepat 12jt: Kesehatan dihitung penuh tanpa terpotong cap", () => {
    const slip = calculatePayslip({
      baseSalary: BPJS_PARAMS.healthCap,
      allowances: 0,
      ptkpStatus: "TK/0",
    });
    expect(slip.bpjsHealthEmployee).toBe(120_000); // 1% × 12.000.000
  });

  it("bruto tepat di cap JP (11.086.300): iuran JP = 1% dari cap", () => {
    const slip = calculatePayslip({
      baseSalary: BPJS_PARAMS.jpCap,
      allowances: 0,
      ptkpStatus: "TK/0",
    });
    expect(slip.bpjsJpEmployee).toBe(110_863);
    // Satu rupiah di atas cap: iuran JP tidak bertambah.
    const above = calculatePayslip({
      baseSalary: BPJS_PARAMS.jpCap + 1,
      allowances: 0,
      ptkpStatus: "TK/0",
    });
    expect(above.bpjsJpEmployee).toBe(110_863);
  });

  it("tunjangan ikut membentuk bruto (dasar TER dan BPJS)", () => {
    const slip = calculatePayslip({ baseSalary: 4_000_000, allowances: 6_000_000, ptkpStatus: "TK/0" });
    expect(slip.gross).toBe(10_000_000);
    expect(slip.terRate).toBe(2); // kategori A, bruto 10jt
    expect(slip.pph21).toBe(200_000);
  });

  it("invarian bruto = netto + total potongan untuk semua status PTKP", () => {
    for (const status of PTKP_STATUSES) {
      for (const gross of [3_000_000, 5_400_000, 11_086_300, 12_000_000, 50_000_000]) {
        const slip = calculatePayslip({ baseSalary: gross, allowances: 0, ptkpStatus: status });
        expect(slip.gross).toBe(slip.net + slip.totalDeductions);
        expect(slip.totalDeductions).toBe(
          slip.bpjsHealthEmployee + slip.bpjsJhtEmployee + slip.bpjsJpEmployee + slip.pph21,
        );
      }
    }
  });

  it("pembulatan iuran ke rupiah terdekat (Math.round)", () => {
    // 2% × 5.000.025 = 100.000,5 → 100.001
    const slip = calculatePayslip({ baseSalary: 5_000_025, allowances: 0, ptkpStatus: "TK/0" });
    expect(slip.bpjsJhtEmployee).toBe(100_001);
  });
});

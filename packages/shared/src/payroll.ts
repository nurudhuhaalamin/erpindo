/**
 * Mesin perhitungan gaji Indonesia (PPh 21 metode TER + BPJS).
 *
 * ⚠️ PENTING — VERIFIKASI TARIF PAJAK: Tabel TER mengikuti PMK 168/2023
 * (berlaku sejak 2024, masih berlaku 2026). Batas upah Jaminan Pensiun BPJS
 * diperbarui per Maret 2026 (Rp11.086.300; naik tiap Maret mengikuti
 * pertumbuhan PDB). Peraturan bisa berubah; **verifikasi angka dengan
 * konsultan pajak / peraturan terbaru sebelum dipakai untuk penggajian
 * resmi.** Semua parameter terkumpul di satu berkas ini agar mudah diperbarui.
 */

/** Status PTKP (K = kawin, TK = tidak kawin; angka = jumlah tanggungan). */
export const PTKP_STATUSES = ["TK/0", "TK/1", "TK/2", "TK/3", "K/0", "K/1", "K/2", "K/3"] as const;
export type PtkpStatus = (typeof PTKP_STATUSES)[number];

export type TerCategory = "A" | "B" | "C";

/** Pemetaan status PTKP → kategori TER (PMK 168/2023). */
export function terCategory(status: PtkpStatus): TerCategory {
  // A: PTKP 54jt & 58,5jt → TK/0, TK/1, K/0
  // B: PTKP 63jt & 67,5jt → TK/2, TK/3, K/1, K/2
  // C: PTKP 72jt → K/3
  if (status === "TK/0" || status === "TK/1" || status === "K/0") return "A";
  if (status === "K/3") return "C";
  return "B";
}

type TerBracket = { upTo: number; rate: number }; // upTo inklusif (rupiah/bulan); rate persen

/**
 * Tarif Efektif Rata-rata (TER) bulanan per kategori. Tarif dipakai ke
 * penghasilan bruto bulanan. Bracket terakhir upTo = Infinity.
 */
export const TER_TABLES: Record<TerCategory, TerBracket[]> = {
  A: [
    { upTo: 5_400_000, rate: 0 }, { upTo: 5_650_000, rate: 0.25 }, { upTo: 5_950_000, rate: 0.5 },
    { upTo: 6_300_000, rate: 0.75 }, { upTo: 6_750_000, rate: 1 }, { upTo: 7_500_000, rate: 1.25 },
    { upTo: 8_550_000, rate: 1.5 }, { upTo: 9_650_000, rate: 1.75 }, { upTo: 10_050_000, rate: 2 },
    { upTo: 10_350_000, rate: 2.25 }, { upTo: 10_700_000, rate: 2.5 }, { upTo: 11_050_000, rate: 3 },
    { upTo: 11_600_000, rate: 3.5 }, { upTo: 12_500_000, rate: 4 }, { upTo: 13_750_000, rate: 5 },
    { upTo: 15_100_000, rate: 6 }, { upTo: 16_950_000, rate: 7 }, { upTo: 19_750_000, rate: 8 },
    { upTo: 24_150_000, rate: 9 }, { upTo: 26_450_000, rate: 10 }, { upTo: 28_000_000, rate: 11 },
    { upTo: 30_050_000, rate: 12 }, { upTo: 32_400_000, rate: 13 }, { upTo: 35_400_000, rate: 14 },
    { upTo: 39_100_000, rate: 15 }, { upTo: 43_850_000, rate: 16 }, { upTo: 47_800_000, rate: 17 },
    { upTo: 51_400_000, rate: 18 }, { upTo: 56_300_000, rate: 19 }, { upTo: 62_200_000, rate: 20 },
    { upTo: 68_600_000, rate: 21 }, { upTo: 77_500_000, rate: 22 }, { upTo: 89_000_000, rate: 23 },
    { upTo: 103_000_000, rate: 24 }, { upTo: 125_000_000, rate: 25 }, { upTo: 157_000_000, rate: 26 },
    { upTo: 206_000_000, rate: 27 }, { upTo: 337_000_000, rate: 28 }, { upTo: 454_000_000, rate: 29 },
    { upTo: 550_000_000, rate: 30 }, { upTo: 695_000_000, rate: 31 }, { upTo: 910_000_000, rate: 32 },
    { upTo: 1_400_000_000, rate: 33 }, { upTo: Infinity, rate: 34 },
  ],
  B: [
    { upTo: 6_200_000, rate: 0 }, { upTo: 6_500_000, rate: 0.25 }, { upTo: 6_850_000, rate: 0.5 },
    { upTo: 7_300_000, rate: 0.75 }, { upTo: 9_200_000, rate: 1 }, { upTo: 10_750_000, rate: 1.5 },
    { upTo: 11_250_000, rate: 2 }, { upTo: 11_600_000, rate: 2.5 }, { upTo: 12_600_000, rate: 3 },
    { upTo: 13_600_000, rate: 4 }, { upTo: 14_950_000, rate: 5 }, { upTo: 16_400_000, rate: 6 },
    { upTo: 18_450_000, rate: 7 }, { upTo: 21_850_000, rate: 8 }, { upTo: 26_000_000, rate: 9 },
    { upTo: 27_700_000, rate: 10 }, { upTo: 29_350_000, rate: 11 }, { upTo: 31_450_000, rate: 12 },
    { upTo: 33_950_000, rate: 13 }, { upTo: 37_100_000, rate: 14 }, { upTo: 41_100_000, rate: 15 },
    { upTo: 45_800_000, rate: 16 }, { upTo: 49_500_000, rate: 17 }, { upTo: 53_800_000, rate: 18 },
    { upTo: 58_500_000, rate: 19 }, { upTo: 64_000_000, rate: 20 }, { upTo: 71_000_000, rate: 21 },
    { upTo: 80_000_000, rate: 22 }, { upTo: 93_000_000, rate: 23 }, { upTo: 109_000_000, rate: 24 },
    { upTo: 129_000_000, rate: 25 }, { upTo: 163_000_000, rate: 26 }, { upTo: 211_000_000, rate: 27 },
    { upTo: 374_000_000, rate: 28 }, { upTo: 459_000_000, rate: 29 }, { upTo: 555_000_000, rate: 30 },
    { upTo: 704_000_000, rate: 31 }, { upTo: 957_000_000, rate: 32 }, { upTo: 1_405_000_000, rate: 33 },
    { upTo: Infinity, rate: 34 },
  ],
  C: [
    { upTo: 6_600_000, rate: 0 }, { upTo: 6_950_000, rate: 0.25 }, { upTo: 7_350_000, rate: 0.5 },
    { upTo: 7_800_000, rate: 0.75 }, { upTo: 8_850_000, rate: 1 }, { upTo: 9_800_000, rate: 1.25 },
    { upTo: 10_950_000, rate: 1.5 }, { upTo: 11_200_000, rate: 1.75 }, { upTo: 12_050_000, rate: 2 },
    { upTo: 12_950_000, rate: 3 }, { upTo: 14_150_000, rate: 4 }, { upTo: 15_550_000, rate: 5 },
    { upTo: 17_050_000, rate: 6 }, { upTo: 19_500_000, rate: 7 }, { upTo: 22_700_000, rate: 8 },
    { upTo: 26_600_000, rate: 9 }, { upTo: 28_100_000, rate: 10 }, { upTo: 30_100_000, rate: 11 },
    { upTo: 32_600_000, rate: 12 }, { upTo: 35_400_000, rate: 13 }, { upTo: 38_900_000, rate: 14 },
    { upTo: 43_000_000, rate: 15 }, { upTo: 47_400_000, rate: 16 }, { upTo: 51_200_000, rate: 17 },
    { upTo: 55_800_000, rate: 18 }, { upTo: 60_400_000, rate: 19 }, { upTo: 66_700_000, rate: 20 },
    { upTo: 74_500_000, rate: 21 }, { upTo: 83_200_000, rate: 22 }, { upTo: 95_000_000, rate: 23 },
    { upTo: 110_000_000, rate: 24 }, { upTo: 134_000_000, rate: 25 }, { upTo: 169_000_000, rate: 26 },
    { upTo: 221_000_000, rate: 27 }, { upTo: 390_000_000, rate: 28 }, { upTo: 463_000_000, rate: 29 },
    { upTo: 561_000_000, rate: 30 }, { upTo: 709_000_000, rate: 31 }, { upTo: 965_000_000, rate: 32 },
    { upTo: 1_419_000_000, rate: 33 }, { upTo: Infinity, rate: 34 },
  ],
};

/** Tarif efektif TER (persen) untuk penghasilan bruto bulanan tertentu. */
export function terRate(category: TerCategory, monthlyGross: number): number {
  for (const b of TER_TABLES[category]) {
    if (monthlyGross <= b.upTo) return b.rate;
  }
  return 34;
}

/**
 * Parameter BPJS (sisi pekerja). Tarif employer disertakan sebagai informasi.
 * Batas atas upah = dasar maksimal perhitungan iuran.
 */
export const BPJS_PARAMS = {
  /** Kesehatan: pekerja 1%, batas upah 12.000.000. */
  healthEmployeeRate: 1,
  healthEmployerRate: 4,
  healthCap: 12_000_000,
  /** JHT (Jaminan Hari Tua): pekerja 2%, tanpa batas upah. */
  jhtEmployeeRate: 2,
  jhtEmployerRate: 3.7,
  /** JP (Jaminan Pensiun): pekerja 1%, batas upah 11.086.300 (per Maret 2026). */
  jpEmployeeRate: 1,
  jpEmployerRate: 2,
  jpCap: 11_086_300,
} as const;

export type PayslipInput = {
  baseSalary: number;
  allowances: number;
  ptkpStatus: PtkpStatus;
};

export type PayslipBreakdown = {
  gross: number;
  bpjsHealthEmployee: number;
  bpjsJhtEmployee: number;
  bpjsJpEmployee: number;
  terCategory: TerCategory;
  terRate: number;
  pph21: number;
  totalDeductions: number;
  net: number;
};

const pct = (base: number, rate: number) => Math.round((base * rate) / 100);

/**
 * Hitung rincian slip gaji satu pekerja untuk satu bulan.
 * Bruto = gaji pokok + tunjangan. PPh 21 = tarif TER × bruto. BPJS pekerja
 * dipotong dari bruto dengan batas upah masing-masing.
 */
export function calculatePayslip(input: PayslipInput): PayslipBreakdown {
  const gross = input.baseSalary + input.allowances;
  const cat = terCategory(input.ptkpStatus);
  const rate = terRate(cat, gross);

  const bpjsHealthEmployee = pct(Math.min(gross, BPJS_PARAMS.healthCap), BPJS_PARAMS.healthEmployeeRate);
  const bpjsJhtEmployee = pct(gross, BPJS_PARAMS.jhtEmployeeRate);
  const bpjsJpEmployee = pct(Math.min(gross, BPJS_PARAMS.jpCap), BPJS_PARAMS.jpEmployeeRate);
  const pph21 = pct(gross, rate);

  const totalDeductions = bpjsHealthEmployee + bpjsJhtEmployee + bpjsJpEmployee + pph21;
  return {
    gross,
    bpjsHealthEmployee,
    bpjsJhtEmployee,
    bpjsJpEmployee,
    terCategory: cat,
    terRate: rate,
    pph21,
    totalDeductions,
    net: gross - totalDeductions,
  };
}

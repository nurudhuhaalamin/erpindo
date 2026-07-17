import { describe, expect, it } from "vitest";
import {
  calculatePayslip,
  createJournalEntrySchema,
  loginSchema,
  registerSchema,
  ROLE_LEVEL,
  terCategory,
  terRate,
  toSlug,
  waLink,
} from "../src/index";

describe("waLink (WhatsApp share, Fase 11d)", () => {
  it("menormalkan nomor Indonesia ke format 62", () => {
    expect(waLink("0812-3456-7890", "hai")).toBe("https://wa.me/6281234567890?text=hai");
    expect(waLink("+62 812 3456 7890", "hai")).toBe("https://wa.me/6281234567890?text=hai");
    expect(waLink("62081234567890", "hai")).toBe("https://wa.me/6281234567890?text=hai");
    expect(waLink("81234567890", "hai")).toBe("https://wa.me/6281234567890?text=hai");
  });
  it("meng-encode teks", () => {
    expect(waLink("08123456789", "Rp 1.000 & lunas")).toContain("?text=Rp%201.000%20%26%20lunas");
  });
  it("mengembalikan null bila nomor kosong/terlalu pendek", () => {
    expect(waLink(null, "x")).toBeNull();
    expect(waLink("", "x")).toBeNull();
    expect(waLink("123", "x")).toBeNull();
  });
});

describe("createJournalEntrySchema (double-entry)", () => {
  const base = { entryDate: "2026-07-02", memo: "tes" };

  it("menerima jurnal seimbang", () => {
    const res = createJournalEntrySchema.safeParse({
      ...base,
      lines: [
        { accountId: "a", debit: 100_000, credit: 0 },
        { accountId: "b", debit: 0, credit: 100_000 },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("menolak jurnal tidak seimbang", () => {
    const res = createJournalEntrySchema.safeParse({
      ...base,
      lines: [
        { accountId: "a", debit: 100_000, credit: 0 },
        { accountId: "b", debit: 0, credit: 90_000 },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("menolak baris debit dan kredit sekaligus", () => {
    const res = createJournalEntrySchema.safeParse({
      ...base,
      lines: [
        { accountId: "a", debit: 50_000, credit: 50_000 },
        { accountId: "b", debit: 0, credit: 0 },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("menolak jurnal bernilai nol dan kurang dari 2 baris", () => {
    expect(
      createJournalEntrySchema.safeParse({
        ...base,
        lines: [
          { accountId: "a", debit: 0, credit: 0 },
          { accountId: "b", debit: 0, credit: 0 },
        ],
      }).success,
    ).toBe(false);
    expect(
      createJournalEntrySchema.safeParse({ ...base, lines: [{ accountId: "a", debit: 1, credit: 0 }] }).success,
    ).toBe(false);
  });

  it("menolak nominal desimal dan negatif", () => {
    expect(
      createJournalEntrySchema.safeParse({
        ...base,
        lines: [
          { accountId: "a", debit: 100.5, credit: 0 },
          { accountId: "b", debit: 0, credit: 100.5 },
        ],
      }).success,
    ).toBe(false);
    expect(
      createJournalEntrySchema.safeParse({
        ...base,
        lines: [
          { accountId: "a", debit: -5, credit: 0 },
          { accountId: "b", debit: 0, credit: -5 },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("registerSchema", () => {
  it("menerima input valid dan menormalkan email", () => {
    const parsed = registerSchema.parse({
      companyName: "PT Maju Jaya",
      name: "Budi",
      email: "  Budi@Example.COM ",
      password: "rahasia-123",
    });
    expect(parsed.email).toBe("budi@example.com");
  });

  it("menolak password pendek", () => {
    const res = registerSchema.safeParse({
      companyName: "PT Maju",
      name: "Budi",
      email: "budi@example.com",
      password: "1234567",
    });
    expect(res.success).toBe(false);
  });

  it("menolak email tidak valid", () => {
    expect(loginSchema.safeParse({ email: "bukan-email", password: "x" }).success).toBe(false);
  });
});

describe("toSlug", () => {
  it("mengubah nama perusahaan menjadi slug aman", () => {
    expect(toSlug("PT Maju Jaya, Tbk.")).toBe("pt-maju-jaya-tbk");
    expect(toSlug("  ---  ")).toBe("perusahaan");
  });
});

describe("ROLE_LEVEL", () => {
  it("owner lebih tinggi dari admin dan viewer", () => {
    expect(ROLE_LEVEL.owner).toBeGreaterThan(ROLE_LEVEL.admin);
    expect(ROLE_LEVEL.admin).toBeGreaterThan(ROLE_LEVEL.viewer);
  });
});

describe("payroll (PPh 21 TER + BPJS)", () => {
  it("memetakan status PTKP ke kategori TER", () => {
    expect(terCategory("TK/0")).toBe("A");
    expect(terCategory("K/0")).toBe("A");
    expect(terCategory("K/1")).toBe("B");
    expect(terCategory("K/3")).toBe("C");
  });

  it("PPh 21 = 0 untuk bruto di bawah ambang TER (kategori A ≤ 5,4jt)", () => {
    expect(terRate("A", 5_000_000)).toBe(0);
    const slip = calculatePayslip({ baseSalary: 5_000_000, allowances: 0, ptkpStatus: "TK/0" });
    expect(slip.pph21).toBe(0);
  });

  it("menghitung BPJS pekerja & netto konsisten (bruto = netto + potongan)", () => {
    const slip = calculatePayslip({ baseSalary: 10_000_000, allowances: 0, ptkpStatus: "TK/0" });
    // Kesehatan 1% = 100.000, JHT 2% = 200.000, JP 1% = 100.000.
    expect(slip.bpjsHealthEmployee).toBe(100_000);
    expect(slip.bpjsJhtEmployee).toBe(200_000);
    expect(slip.bpjsJpEmployee).toBe(100_000);
    // TER kategori A untuk 10jt = 2% → PPh21 200.000.
    expect(slip.pph21).toBe(200_000);
    expect(slip.totalDeductions).toBe(600_000);
    expect(slip.gross).toBe(slip.net + slip.totalDeductions);
  });

  it("menerapkan batas upah BPJS Kesehatan (12jt) & JP (11.086.300, per Maret 2026)", () => {
    const slip = calculatePayslip({ baseSalary: 20_000_000, allowances: 0, ptkpStatus: "TK/0" });
    expect(slip.bpjsHealthEmployee).toBe(120_000); // 1% × 12jt (cap)
    expect(slip.bpjsJpEmployee).toBe(110_863); // 1% × 11.086.300 (cap)
    expect(slip.bpjsJhtEmployee).toBe(400_000); // 2% × 20jt (tanpa cap)
  });
});

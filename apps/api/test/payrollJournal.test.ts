import { describe, expect, it } from "vitest";
import { buildPayrollJournalLines } from "../src/routes/payroll";

/**
 * Fase 14m — uji `buildPayrollJournalLines`, penyusun baris jurnal penggajian
 * yang diekstrak dari handler payroll-runs (`routes/payroll.ts`). Perhitungan
 * gaji (PPh 21 TER/BPJS) sudah teruji di paket shared; fase ini mengunci
 * **perakitan jurnalnya**: arah baris & keseimbangan (bruto = netto + potongan +
 * cicilan). Ekstrak behavior-preserving — jalur route tetap diuji smoke.
 */

const ACC = { bebanGaji: "beban", hutangGaji: "hutang", piutangKaryawan: "piutang" };
const sum = (lines: { debit: number; credit: number }[]) => ({
  debit: lines.reduce((s, l) => s + l.debit, 0),
  credit: lines.reduce((s, l) => s + l.credit, 0),
});
const byAcc = <T extends { accountId: string }>(lines: T[], id: string) => lines.filter((l) => l.accountId === id);

describe("buildPayrollJournalLines", () => {
  it("dengan potongan: Debit Beban (bruto), Kredit Kas (netto) + Hutang (potongan)", () => {
    const lines = buildPayrollJournalLines({
      period: "2026-08", cashAccountId: "kas",
      totalGross: 15_000_000, totalDeductions: 800_000, totalNet: 14_200_000, totalLoanDeduction: 0,
      accounts: ACC,
    });
    expect(sum(lines)).toEqual({ debit: 15_000_000, credit: 15_000_000 }); // seimbang
    expect(byAcc(lines, "beban")[0]).toMatchObject({ debit: 15_000_000, credit: 0 });
    expect(byAcc(lines, "kas")[0]).toMatchObject({ debit: 0, credit: 14_200_000 });
    expect(byAcc(lines, "hutang")[0]).toMatchObject({ debit: 0, credit: 800_000 });
    expect(byAcc(lines, "piutang")).toHaveLength(0); // tanpa kasbon
  });

  it("dengan cicilan kasbon: menambah Kredit Piutang Karyawan", () => {
    // bruto 10jt = netto 9jt + potongan 600rb + cicilan 400rb.
    const lines = buildPayrollJournalLines({
      period: "2026-08", cashAccountId: "kas",
      totalGross: 10_000_000, totalDeductions: 600_000, totalNet: 9_000_000, totalLoanDeduction: 400_000,
      accounts: ACC,
    });
    expect(sum(lines)).toEqual({ debit: 10_000_000, credit: 10_000_000 });
    expect(byAcc(lines, "piutang")[0]).toMatchObject({ debit: 0, credit: 400_000 });
  });

  it("tanpa potongan (agregat 0): tak ada baris Hutang Gaji", () => {
    const lines = buildPayrollJournalLines({
      period: "2026-08", cashAccountId: "kas",
      totalGross: 5_000_000, totalDeductions: 0, totalNet: 5_000_000, totalLoanDeduction: 0,
      accounts: ACC,
    });
    expect(byAcc(lines, "hutang")).toHaveLength(0);
    expect(sum(lines)).toEqual({ debit: 5_000_000, credit: 5_000_000 });
  });

  it("akun piutang null → baris cicilan tidak disertakan (mengikuti guard handler)", () => {
    const lines = buildPayrollJournalLines({
      period: "2026-08", cashAccountId: "kas",
      totalGross: 10_000_000, totalDeductions: 600_000, totalNet: 9_000_000, totalLoanDeduction: 400_000,
      accounts: { ...ACC, piutangKaryawan: null },
    });
    expect(byAcc(lines, "piutang")).toHaveLength(0);
  });

  it("deskripsi baris memuat periode", () => {
    const lines = buildPayrollJournalLines({
      period: "2026-08", cashAccountId: "kas",
      totalGross: 5_000_000, totalDeductions: 0, totalNet: 5_000_000, totalLoanDeduction: 0,
      accounts: ACC,
    });
    expect(byAcc(lines, "beban")[0]?.description).toContain("2026-08");
  });
});

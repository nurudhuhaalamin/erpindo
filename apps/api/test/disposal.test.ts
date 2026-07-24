import { describe, expect, it } from "vitest";
import { buildDisposalJournal } from "../src/routes/assets";

/**
 * Fase 14l — uji `buildDisposalJournal`, penyusun jurnal pelepasan aset yang
 * diekstrak dari handler `dispose` (`routes/assets.ts`) agar bisa diuji langsung.
 * Menjaga nilai buku, arah laba/rugi, dan **keseimbangan jurnal** di semua kasus
 * (laba, rugi, tanpa hasil, impas, akumulasi nol). Ekstrak behavior-preserving —
 * jalur route tetap diuji smoke (laba 3jt + neraca seimbang).
 */

const ACC = { asetTetap: "aset", akum: "akum", pendLain: "pend", bebanLain: "beban", cash: "kas" };

const sum = (lines: { debit: number; credit: number }[]) => ({
  debit: lines.reduce((s, l) => s + l.debit, 0),
  credit: lines.reduce((s, l) => s + l.credit, 0),
});
const lineFor = (lines: { accountId: string }[], id: string) => lines.filter((l) => l.accountId === id);

describe("buildDisposalJournal", () => {
  it("laba pelepasan: hasil > nilai buku → kredit Pendapatan Lain", () => {
    // Perolehan 100jt, akumulasi 53jt → nilai buku 47jt; hasil 50jt → laba 3jt.
    const r = buildDisposalJournal({
      assetName: "Mobil", acquisitionCost: 100_000_000, accumulatedDepreciation: 53_000_000,
      proceeds: 50_000_000, accounts: ACC,
    });
    expect(r.bookValue).toBe(47_000_000);
    expect(r.gain).toBe(3_000_000);
    expect(sum(r.lines)).toEqual({ debit: 103_000_000, credit: 103_000_000 }); // seimbang
    expect(lineFor(r.lines, "pend")[0]).toMatchObject({ debit: 0, credit: 3_000_000 });
    expect(lineFor(r.lines, "beban")).toHaveLength(0); // tak ada baris rugi
    expect(lineFor(r.lines, "kas")[0]).toMatchObject({ debit: 50_000_000, credit: 0 });
  });

  it("rugi pelepasan: hasil < nilai buku → debit Beban Lain", () => {
    const r = buildDisposalJournal({
      assetName: "Mesin", acquisitionCost: 100_000_000, accumulatedDepreciation: 53_000_000,
      proceeds: 40_000_000, accounts: ACC,
    });
    expect(r.gain).toBe(-7_000_000);
    expect(sum(r.lines)).toEqual({ debit: 100_000_000, credit: 100_000_000 });
    expect(lineFor(r.lines, "beban")[0]).toMatchObject({ debit: 7_000_000, credit: 0 });
    expect(lineFor(r.lines, "pend")).toHaveLength(0);
  });

  it("tanpa hasil (dibuang): tak ada baris kas; rugi = nilai buku", () => {
    const r = buildDisposalJournal({
      assetName: "Printer", acquisitionCost: 100_000_000, accumulatedDepreciation: 53_000_000,
      proceeds: 0, accounts: ACC,
    });
    expect(r.gain).toBe(-47_000_000);
    expect(lineFor(r.lines, "kas")).toHaveLength(0); // proceeds 0 → tak ada kas
    expect(lineFor(r.lines, "beban")[0]).toMatchObject({ debit: 47_000_000, credit: 0 });
    expect(sum(r.lines)).toEqual({ debit: 100_000_000, credit: 100_000_000 });
  });

  it("impas (hasil = nilai buku): tanpa baris laba/rugi", () => {
    const r = buildDisposalJournal({
      assetName: "Meja", acquisitionCost: 100_000_000, accumulatedDepreciation: 53_000_000,
      proceeds: 47_000_000, accounts: ACC,
    });
    expect(r.gain).toBe(0);
    expect(lineFor(r.lines, "pend")).toHaveLength(0);
    expect(lineFor(r.lines, "beban")).toHaveLength(0);
    expect(sum(r.lines)).toEqual({ debit: 100_000_000, credit: 100_000_000 });
  });

  it("akumulasi nol: baris akumulasi disaring (debit 0), tetap seimbang", () => {
    const r = buildDisposalJournal({
      assetName: "Aset baru", acquisitionCost: 100_000_000, accumulatedDepreciation: 0,
      proceeds: 0, accounts: ACC,
    });
    expect(r.bookValue).toBe(100_000_000);
    expect(lineFor(r.lines, "akum")).toHaveLength(0); // debit 0 → disaring
    expect(sum(r.lines)).toEqual({ debit: 100_000_000, credit: 100_000_000 });
  });
});

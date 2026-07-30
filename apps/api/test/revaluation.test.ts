import { describe, expect, it } from "vitest";
import { buildRevaluationJournal } from "../src/routes/assets";

/**
 * Revaluasi aset tetap (Fase 20e) — model revaluasi PSAK 16, metode eliminasi.
 *
 * Yang dijaga di sini adalah KESEIMBANGAN dan ARAH akunnya. Jurnal yang tidak
 * seimbang akan ditolak `postJournal`, jadi itu ketahuan cepat; yang TIDAK
 * ketahuan adalah jurnal yang seimbang tetapi salah arah — kenaikan nilai
 * masuk ke pendapatan alih-alih ekuitas akan menggelembungkan laba tanpa satu
 * pun galat muncul.
 */

const AKUN = { asetTetap: "aset", akum: "akum", surplus: "surplus", bebanLain: "beban" };
const total = (lines: { debit: number; credit: number }[]) => ({
  d: lines.reduce((s, l) => s + l.debit, 0),
  k: lines.reduce((s, l) => s + l.credit, 0),
});

describe("buildRevaluationJournal", () => {
  it("kenaikan nilai: seimbang, dan selisihnya masuk EKUITAS bukan pendapatan", () => {
    // Perolehan 100jt, akumulasi 40jt → nilai buku 60jt. Nilai wajar 90jt.
    const r = buildRevaluationJournal({
      assetName: "Ruko",
      acquisitionCost: 100_000_000,
      accumulatedDepreciation: 40_000_000,
      fairValue: 90_000_000,
      accounts: AKUN,
    });
    expect(r.bookValue).toBe(60_000_000);
    expect(r.difference).toBe(30_000_000);
    const { d, k } = total(r.lines);
    expect(d).toBe(k);
    const surplus = r.lines.find((l) => l.accountId === "surplus");
    expect(surplus?.credit).toBe(30_000_000);
    // Tidak boleh ada baris beban pada revaluasi naik.
    expect(r.lines.some((l) => l.accountId === "beban")).toBe(false);
  });

  it("penurunan nilai: seimbang, dan ruginya masuk BEBAN", () => {
    const r = buildRevaluationJournal({
      assetName: "Mesin",
      acquisitionCost: 100_000_000,
      accumulatedDepreciation: 40_000_000,
      fairValue: 50_000_000,
      accounts: AKUN,
    });
    expect(r.difference).toBe(-10_000_000);
    const { d, k } = total(r.lines);
    expect(d).toBe(k);
    expect(r.lines.find((l) => l.accountId === "beban")?.debit).toBe(10_000_000);
    expect(r.lines.some((l) => l.accountId === "surplus")).toBe(false);
  });

  it("nilai wajar DI BAWAH perolehan tapi DI ATAS nilai buku tetap surplus", () => {
    // Kasus yang mudah salah: F(70jt) < C(100jt) tetapi F > B(60jt).
    // Baris aset dikreditkan, selisihnya tetap surplus. Kalau arahnya
    // ditentukan dari (F vs C) alih-alih (F vs B), hasilnya akan terbalik.
    const r = buildRevaluationJournal({
      assetName: "Kendaraan",
      acquisitionCost: 100_000_000,
      accumulatedDepreciation: 40_000_000,
      fairValue: 70_000_000,
      accounts: AKUN,
    });
    expect(r.difference).toBe(10_000_000);
    const aset = r.lines.find((l) => l.accountId === "aset");
    expect(aset?.credit).toBe(30_000_000);
    expect(r.lines.find((l) => l.accountId === "surplus")?.credit).toBe(10_000_000);
    const { d, k } = total(r.lines);
    expect(d).toBe(k);
  });

  it("nilai wajar sama dengan nilai buku: tetap seimbang, tanpa surplus/rugi", () => {
    const r = buildRevaluationJournal({
      assetName: "Meja",
      acquisitionCost: 10_000_000,
      accumulatedDepreciation: 4_000_000,
      fairValue: 6_000_000,
      accounts: AKUN,
    });
    expect(r.difference).toBe(0);
    const { d, k } = total(r.lines);
    expect(d).toBe(k);
    expect(r.lines.some((l) => l.accountId === "beban")).toBe(false);
  });

  it("aset belum disusutkan sama sekali tetap seimbang", () => {
    const r = buildRevaluationJournal({
      assetName: "Tanah",
      acquisitionCost: 500_000_000,
      accumulatedDepreciation: 0,
      fairValue: 650_000_000,
      accounts: AKUN,
    });
    const { d, k } = total(r.lines);
    expect(d).toBe(k);
    expect(r.difference).toBe(150_000_000);
  });
});

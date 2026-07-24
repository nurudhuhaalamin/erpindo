import { describe, expect, it } from "vitest";
import { computePosTenders, computePosTotals } from "../src/routes/pos";

/**
 * Fase 14n — uji perhitungan uang POS (`computePosTotals` & `computePosTenders`)
 * yang diekstrak dari handler penjualan POS (`routes/pos.ts`). Menjaga
 * subtotal+diskon+PPN dan logika kembalian/pembukuan multi-tender (kembalian
 * hanya dari tunai; non-tunai masuk pembukuan persis). Ekstrak
 * behavior-preserving — jalur route tetap diuji smoke.
 */

describe("computePosTotals", () => {
  it("subtotal × qty tanpa diskon/PPN", () => {
    expect(computePosTotals([{ qty: 2, unitPrice: 5000 }], 0)).toEqual({
      subtotal: 10_000, taxAmount: 0, total: 10_000,
    });
  });

  it("diskon per baris lalu PPN", () => {
    // round(10000 × 0,9) = 9000; PPN 11% = round(990) = 990.
    expect(computePosTotals([{ qty: 1, unitPrice: 10_000, discountPct: 10 }], 11)).toEqual({
      subtotal: 9_000, taxAmount: 990, total: 9_990,
    });
  });

  it("pembulatan per baris (bukan di akhir)", () => {
    expect(computePosTotals([{ qty: 3, unitPrice: 333 }, { qty: 1, unitPrice: 1_001 }], 0)).toEqual({
      subtotal: 2_000, taxAmount: 0, total: 2_000, // 999 + 1001
    });
  });
});

describe("computePosTenders — tunai", () => {
  it("lebih bayar tunai → kembalian; pembukuan = total", () => {
    const r = computePosTenders(10_000, [{ method: "tunai", amount: 12_000 }]);
    expect(r).toEqual({
      change: 2_000, cashApplied: 10_000, nonCashApplied: 0,
      applied: [{ method: "tunai", tendered: 12_000, amount: 10_000 }],
    });
  });

  it("uang pas → tanpa kembalian", () => {
    const r = computePosTenders(10_000, [{ method: "tunai", amount: 10_000 }]);
    expect(r).toMatchObject({ change: 0, cashApplied: 10_000, nonCashApplied: 0 });
  });

  it("kurang bayar → error", () => {
    expect(computePosTenders(10_000, [{ method: "tunai", amount: 8_000 }])).toEqual({
      error: "Total pembayaran kurang dari total belanja.",
    });
  });
});

describe("computePosTenders — non-tunai & split", () => {
  it("split QRIS + tunai: kembalian hanya dari tunai; non-tunai masuk persis", () => {
    // total 100rb; QRIS 60rb + tunai 50rb = 110rb → kembalian 10rb dari tunai.
    const r = computePosTenders(100_000, [
      { method: "qris", amount: 60_000 },
      { method: "tunai", amount: 50_000 },
    ]);
    expect(r).toEqual({
      change: 10_000,
      cashApplied: 40_000, // 50rb − 10rb kembalian
      nonCashApplied: 60_000, // QRIS persis
      applied: [
        { method: "qris", tendered: 60_000, amount: 60_000 },
        { method: "tunai", tendered: 50_000, amount: 40_000 },
      ],
    });
    // Total pembukuan = total belanja.
    if (!("error" in r)) expect(r.cashApplied + r.nonCashApplied).toBe(100_000);
  });

  it("non-tunai pas → tanpa kembalian", () => {
    expect(computePosTenders(50_000, [{ method: "qris", amount: 50_000 }])).toMatchObject({
      change: 0, cashApplied: 0, nonCashApplied: 50_000,
    });
  });

  it("lebih bayar non-tunai (tak ada tunai penutup kembalian) → error", () => {
    // QRIS 102rb untuk belanja 100rb → kembalian 2rb tapi tunai 0 → ditolak.
    expect(computePosTenders(100_000, [{ method: "qris", amount: 102_000 }])).toEqual({
      error: "Kembalian melebihi uang tunai yang diterima.",
    });
  });
});

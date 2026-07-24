import { describe, expect, it } from "vitest";
import { computeForexSettlement } from "../src/lib/commercePosting";

/**
 * Fase 14k — uji `computeForexSettlement`, aritmetika selisih kurs pelunasan
 * yang diekstrak dari handler pembayaran (`routes/commerce.ts`) agar bisa diuji
 * langsung. Menjaga arah laba/rugi (terima vs bayar) dan pembulatan IDR. Ekstrak
 * bersifat behavior-preserving — jalur route tetap diuji smoke.
 */

describe("computeForexSettlement — faktur IDR (kurs 1)", () => {
  it("tanpa selisih kurs; counterCleared = cashIdr = nominal", () => {
    const recv = computeForexSettlement({ direction: "receive", foreignAmount: 5_000_000, paymentRate: 1, docRate: 1 });
    expect(recv).toEqual({ counterCleared: 5_000_000, cashIdr: 5_000_000, forexGain: 0 });
    const pay = computeForexSettlement({ direction: "pay", foreignAmount: 5_000_000, paymentRate: 1, docRate: 1 });
    expect(pay).toEqual({ counterCleared: 5_000_000, cashIdr: 5_000_000, forexGain: 0 });
  });
});

describe("computeForexSettlement — penerimaan valas (receive)", () => {
  it("kurs bayar > kurs faktur → laba (forexGain > 0)", () => {
    const r = computeForexSettlement({ direction: "receive", foreignAmount: 1000, docRate: 15_000, paymentRate: 16_000 });
    expect(r.counterCleared).toBe(15_000_000); // menutup piutang pada kurs faktur
    expect(r.cashIdr).toBe(16_000_000); // kas masuk pada kurs bayar
    expect(r.forexGain).toBe(1_000_000); // laba selisih kurs
  });

  it("kurs bayar < kurs faktur → rugi (forexGain < 0)", () => {
    const r = computeForexSettlement({ direction: "receive", foreignAmount: 1000, docRate: 15_000, paymentRate: 14_000 });
    expect(r.forexGain).toBe(-1_000_000);
  });
});

describe("computeForexSettlement — pembayaran valas (pay)", () => {
  it("kurs bayar > kurs faktur → rugi (bayar IDR lebih banyak dari hutang)", () => {
    const r = computeForexSettlement({ direction: "pay", foreignAmount: 1000, docRate: 15_000, paymentRate: 16_000 });
    expect(r.counterCleared).toBe(15_000_000); // menutup hutang pada kurs faktur
    expect(r.cashIdr).toBe(16_000_000); // kas keluar pada kurs bayar
    expect(r.forexGain).toBe(-1_000_000); // rugi
  });

  it("kurs bayar < kurs faktur → laba (bayar IDR lebih sedikit dari hutang)", () => {
    const r = computeForexSettlement({ direction: "pay", foreignAmount: 1000, docRate: 15_000, paymentRate: 14_000 });
    expect(r.forexGain).toBe(1_000_000);
  });
});

describe("computeForexSettlement — pembulatan & kurs sama", () => {
  it("membulatkan IDR ke rupiah terdekat (Math.round)", () => {
    const r = computeForexSettlement({ direction: "receive", foreignAmount: 333, docRate: 1.5, paymentRate: 1.5 });
    expect(r.counterCleared).toBe(500); // round(499.5)
    expect(r.cashIdr).toBe(500);
    expect(r.forexGain).toBe(0);
  });

  it("kurs bayar = kurs faktur → tanpa selisih di kedua arah", () => {
    for (const direction of ["receive", "pay"] as const) {
      const r = computeForexSettlement({ direction, foreignAmount: 250, docRate: 16_000, paymentRate: 16_000 });
      expect(r).toEqual({ counterCleared: 4_000_000, cashIdr: 4_000_000, forexGain: 0 });
    }
  });
});

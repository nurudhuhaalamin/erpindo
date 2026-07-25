import { describe, expect, it } from "vitest";
import { priceReturnLine } from "../src/routes/returns";

/**
 * Fase 15d — uji `priceReturnLine`, penetapan nilai retur per baris.
 *
 * Latar: nilai baris faktur dibulatkan **sekali** saat dokumen dibuat (qty 3 ×
 * 333 diskon 10% → 899). Rumus lama `qty × round(amount/qty)` menghasilkan 900
 * saat seluruh qty diretur → faktur belum dibayar pun diminta "refund" Rp 1 yang
 * semu (dikonfirmasi lewat smoke sebelum diperbaiki).
 */

describe("priceReturnLine — retur menghabiskan sisa qty (pembalikan eksak)", () => {
  it("retur seluruh qty membalik nilai baris PERSIS (kasus 899, bukan 900)", () => {
    const r = priceReturnLine({ qty: 3, docQty: 3, docAmount: 899, returnedQty: 0, returnedAmount: 0 });
    expect(r.amount).toBe(899);
    expect(r.unitPrice).toBe(300); // 899/3 dibulatkan — hanya untuk tampilan
  });

  it("retur sisa terakhir menutup selisih pembulatan retur sebelumnya", () => {
    // Sudah diretur 1 qty senilai 300 → sisa 2 qty harus bernilai 599 (total 899).
    const r = priceReturnLine({ qty: 2, docQty: 3, docAmount: 899, returnedQty: 1, returnedAmount: 300 });
    expect(r.amount).toBe(599);
  });

  it("baris tanpa pecahan tetap benar", () => {
    const r = priceReturnLine({ qty: 2, docQty: 2, docAmount: 20_000, returnedQty: 0, returnedAmount: 0 });
    expect(r).toEqual({ amount: 20_000, unitPrice: 10_000 });
  });
});

describe("priceReturnLine — retur sebagian (proporsional)", () => {
  it("menghitung proporsional lalu membulatkan", () => {
    // 899 × 1/3 = 299,67 → 300.
    expect(priceReturnLine({ qty: 1, docQty: 3, docAmount: 899, returnedQty: 0, returnedAmount: 0 }).amount).toBe(300);
  });

  it("dua retur sebagian + penutup tetap berjumlah persis nilai asli", () => {
    const a = priceReturnLine({ qty: 1, docQty: 3, docAmount: 100, returnedQty: 0, returnedAmount: 0 });
    const b = priceReturnLine({ qty: 1, docQty: 3, docAmount: 100, returnedQty: 1, returnedAmount: a.amount });
    const c = priceReturnLine({
      qty: 1, docQty: 3, docAmount: 100,
      returnedQty: 2, returnedAmount: a.amount + b.amount,
    });
    expect(a.amount + b.amount + c.amount).toBe(100); // tanpa sisa/kelebihan
  });

  it("qty 0 tidak membagi nol", () => {
    expect(priceReturnLine({ qty: 0, docQty: 3, docAmount: 899, returnedQty: 0, returnedAmount: 0 }).unitPrice).toBe(0);
  });
});

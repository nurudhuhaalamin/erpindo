import { describe, expect, it } from "vitest";
import {
  createInvoiceSchema,
  emailSchema,
  INDUSTRY_KEYS,
  INDUSTRY_TEMPLATES,
  marketplaceImportSchema,
  passwordSchema,
  posSaleSchema,
  slugSchema,
} from "../src/index";

describe("posSaleSchema (POS multi-tender, Fase 7a)", () => {
  const lines = [{ productId: "p1", qty: 2, unitPrice: 10_000 }];

  it("menerima pembayaran multi-metode (QRIS + tunai)", () => {
    const res = posSaleSchema.safeParse({
      shiftId: "s1",
      payments: [
        { method: "qris", amount: 15_000 },
        { method: "tunai", amount: 10_000 },
      ],
      lines,
    });
    expect(res.success).toBe(true);
  });

  it("menolak metode pembayaran tak dikenal dan nominal 0", () => {
    expect(
      posSaleSchema.safeParse({ shiftId: "s1", payments: [{ method: "cek", amount: 5_000 }], lines }).success,
    ).toBe(false);
    expect(
      posSaleSchema.safeParse({ shiftId: "s1", payments: [{ method: "qris", amount: 0 }], lines }).success,
    ).toBe(false);
  });

  it("jalur legacy cashReceived tetap diterima; taxRate default 0", () => {
    const res = posSaleSchema.parse({ shiftId: "s1", cashReceived: 25_000, lines });
    expect(res.taxRate).toBe(0);
  });

  it("menolak tarif pajak di luar daftar (10%) dan keranjang kosong", () => {
    expect(posSaleSchema.safeParse({ shiftId: "s1", taxRate: 10, cashReceived: 1, lines }).success).toBe(false);
    expect(posSaleSchema.safeParse({ shiftId: "s1", cashReceived: 1, lines: [] }).success).toBe(false);
  });
});

describe("createInvoiceSchema", () => {
  const base = {
    contactId: "c1",
    invoiceDate: "2026-07-17",
    warehouseId: "w1",
    lines: [{ productId: "p1", qty: 1, unitPrice: 100_000 }],
  };

  it("menerima tarif PPN 0/11/12 dan menolak lainnya", () => {
    for (const taxRate of [0, 11, 12]) {
      expect(createInvoiceSchema.safeParse({ ...base, taxRate }).success).toBe(true);
    }
    expect(createInvoiceSchema.safeParse({ ...base, taxRate: 10 }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, taxRate: 11.5 }).success).toBe(false);
  });

  it("menormalkan mata uang ke huruf besar", () => {
    const res = createInvoiceSchema.parse({ ...base, currency: "usd", exchangeRate: 16_000 });
    expect(res.currency).toBe("USD");
  });

  it("menolak diskon baris di luar 0–100% dan qty pecahan", () => {
    expect(
      createInvoiceSchema.safeParse({
        ...base,
        lines: [{ productId: "p1", qty: 1, unitPrice: 100, discountPct: 101 }],
      }).success,
    ).toBe(false);
    expect(
      createInvoiceSchema.safeParse({ ...base, lines: [{ productId: "p1", qty: 1.5, unitPrice: 100 }] }).success,
    ).toBe(false);
  });

  it("menolak tanggal bukan format YYYY-MM-DD", () => {
    expect(createInvoiceSchema.safeParse({ ...base, invoiceDate: "17/07/2026" }).success).toBe(false);
  });
});

describe("marketplaceImportSchema (Fase 11e)", () => {
  const row = { externalOrderNo: "INV-1", orderDate: "2026-07-17", sku: "RTL-001", qty: 1, unitPrice: 5_000 };
  const base = { channel: "shopee", warehouseId: "w1", contactId: "c1" };

  it("menerima impor valid", () => {
    expect(marketplaceImportSchema.safeParse({ ...base, rows: [row] }).success).toBe(true);
  });

  it("menolak channel tak dikenal, qty 0, dan lebih dari 1000 baris", () => {
    expect(marketplaceImportSchema.safeParse({ ...base, channel: "bukalapak", rows: [row] }).success).toBe(false);
    expect(marketplaceImportSchema.safeParse({ ...base, rows: [{ ...row, qty: 0 }] }).success).toBe(false);
    const tooMany = Array.from({ length: 1001 }, (_, i) => ({ ...row, externalOrderNo: `INV-${i}` }));
    expect(marketplaceImportSchema.safeParse({ ...base, rows: tooMany }).success).toBe(false);
  });
});

describe("skema dasar (email, password, slug)", () => {
  it("emailSchema memangkas spasi dan menurunkan huruf", () => {
    expect(emailSchema.parse("  Budi@Example.COM ")).toBe("budi@example.com");
  });

  it("passwordSchema: batas 8–128 karakter", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("slugSchema: huruf kecil/angka/hubung, tidak boleh diawali-diakhiri hubung", () => {
    expect(slugSchema.safeParse("pt-maju-jaya").success).toBe(true);
    expect(slugSchema.safeParse("PT-Maju").success).toBe(false);
    expect(slugSchema.safeParse("-maju").success).toBe(false);
    expect(slugSchema.safeParse("maju-").success).toBe(false);
    expect(slugSchema.safeParse("ab").success).toBe(false);
  });
});

describe("INDUSTRY_TEMPLATES (Fase 11f) — sanitas data awal", () => {
  it("tiap industri: SKU unik, harga jual & beli > 0, ada pelanggan dan pemasok", () => {
    for (const key of INDUSTRY_KEYS) {
      const tpl = INDUSTRY_TEMPLATES[key];
      const skus = tpl.products.map((p) => p.sku);
      expect(new Set(skus).size).toBe(skus.length);
      for (const p of tpl.products) {
        expect(p.sellPrice).toBeGreaterThan(0);
        // Produk jasa boleh tanpa harga beli; barang fisik wajib punya.
        if (!p.isService) expect(p.buyPrice).toBeGreaterThan(0);
        else expect(p.buyPrice).toBeGreaterThanOrEqual(0);
      }
      expect(tpl.contacts.some((c) => c.type === "customer")).toBe(true);
      expect(tpl.contacts.some((c) => c.type === "supplier")).toBe(true);
    }
  });
});

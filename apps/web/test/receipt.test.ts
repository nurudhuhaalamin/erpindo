import { describe, expect, it } from "vitest";
import { buildReceiptHtml } from "../src/pages/pos";

/**
 * Regresi Fase 16t — bug yang lolos sejak Fase 16g.
 *
 * `buildReceiptHtml` menyusun STRING HTML, bukan JSX. Menulis `{u("subtotal")}`
 * di dalam template literal karena itu tidak memanggil apa pun: teksnya keluar
 * harfiah ke struk yang tercetak. Bug ini tak terlihat di layar (struk dibuka
 * di jendela cetak terpisah) dan tak terjangkau asersi `ui-sim` berbasis
 * innerText, jadi ia hanya bisa dijaga oleh uji seperti ini.
 */
const opts = {
  companyName: "Kopi Nusantara",
  invoiceNo: "INV-001",
  items: [{ productId: "p1", name: "Kopi Susu", unitPrice: 20000, qty: 2, discountPct: 0 }],
  subtotal: 40000,
  taxRate: 0,
  taxAmount: 0,
  total: 40000,
  cashReceived: 50000,
  change: 10000,
};

describe("struk POS (Fase 16t)", () => {
  it("tidak pernah memuat penanda template mentah", () => {
    const html = buildReceiptHtml({
      ...opts,
      label: {
        subtotal: "Subtotal",
        tunai: "Tunai",
        kembalian: "Kembalian",
        terimaKasih: "Terima kasih!",
      },
    });
    expect(html).not.toContain('{u("');
    expect(html).not.toContain("u(");
  });

  it("memakai label yang dilewatkan pemanggil (Indonesia)", () => {
    const html = buildReceiptHtml({
      ...opts,
      label: {
        subtotal: "Subtotal",
        tunai: "Tunai",
        kembalian: "Kembalian",
        terimaKasih: "Terima kasih!",
      },
    });
    expect(html).toContain("<td>Subtotal</td>");
    expect(html).toContain("<td>Tunai</td>");
    expect(html).toContain("<td>Kembalian</td>");
    expect(html).toContain("Terima kasih!");
  });

  it("ikut bahasa Inggris bila pemanggil melewatkan label Inggris", () => {
    const html = buildReceiptHtml({
      ...opts,
      label: {
        subtotal: "Subtotal",
        tunai: "Cash",
        kembalian: "Change",
        terimaKasih: "Thank you!",
      },
    });
    expect(html).toContain("<td>Cash</td>");
    expect(html).toContain("<td>Change</td>");
    expect(html).toContain("Thank you!");
    expect(html).not.toContain("Kembalian");
  });

  it("menampilkan nama barang, qty, dan nominal", () => {
    const html = buildReceiptHtml({
      ...opts,
      label: { subtotal: "Subtotal", tunai: "Tunai", kembalian: "Kembalian", terimaKasih: "Hatur" },
    });
    expect(html).toContain("Kopi Susu x2");
    expect(html).toContain("40.000");
    expect(html).toContain("INV-001");
  });
});

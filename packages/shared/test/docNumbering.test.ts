import { describe, expect, it } from "vitest";
import {
  docNumberingSchema,
  docNumberScopePrefix,
  isValidDocPattern,
  renderDocNumber,
} from "../src/index";

describe("renderDocNumber (Fase 13i)", () => {
  it("mengisi token tanggal + SEQ dengan padding default 5", () => {
    expect(renderDocNumber("INV-{YYYY}{MM}-{SEQ}", "2026-07-21", 1)).toBe("INV-202607-00001");
  });

  it("menghormati padding SEQ:n", () => {
    expect(renderDocNumber("INV-{YYYY}-{SEQ:4}", "2026-07-21", 42)).toBe("INV-2026-0042");
    expect(renderDocNumber("PAY-{SEQ:3}", "2026-01-01", 7)).toBe("PAY-007");
  });

  it("mendukung {YY} dan {DD}", () => {
    expect(renderDocNumber("{YY}{MM}{DD}-{SEQ:2}", "2026-07-09", 5)).toBe("260709-05");
  });

  it("SEQ tak terpotong bila melebihi padding", () => {
    expect(renderDocNumber("A-{SEQ:2}", "2026-07-01", 12345)).toBe("A-12345");
  });
});

describe("docNumberScopePrefix (Fase 13i)", () => {
  it("mengembalikan bagian sebelum {SEQ} dengan tanggal terisi (reset per bulan)", () => {
    expect(docNumberScopePrefix("INV-{YYYY}{MM}-{SEQ:4}", "2026-07-21")).toBe("INV-202607-");
  });

  it("pola tanpa token periode → scope menerus (prefix tetap)", () => {
    expect(docNumberScopePrefix("INV-{SEQ:5}", "2026-07-21")).toBe("INV-");
  });
});

describe("isValidDocPattern (Fase 13i)", () => {
  it("menerima pola dengan {SEQ}", () => {
    expect(isValidDocPattern("INV-{YYYY}{MM}-{SEQ:4}")).toBe(true);
    expect(isValidDocPattern("PAY-{SEQ}")).toBe(true);
  });

  it("menolak pola tanpa {SEQ} / kosong / karakter aneh / terlalu panjang", () => {
    expect(isValidDocPattern("INV-{YYYY}")).toBe(false);
    expect(isValidDocPattern("")).toBe(false);
    expect(isValidDocPattern("INV {SEQ}")).toBe(false); // spasi tak diizinkan
    expect(isValidDocPattern("X".repeat(41) + "{SEQ}")).toBe(false);
  });
});

describe("docNumberingSchema (Fase 13i)", () => {
  it("menerima sebagian jenis dokumen saja", () => {
    const ok = docNumberingSchema.safeParse({ invoice: "INV-{YYYY}-{SEQ:4}" });
    expect(ok.success).toBe(true);
  });

  it("menolak pola tak valid", () => {
    expect(docNumberingSchema.safeParse({ invoice: "INV-{YYYY}" }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  createJournalEntrySchema,
  loginSchema,
  registerSchema,
  ROLE_LEVEL,
  toSlug,
} from "../src/index";

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

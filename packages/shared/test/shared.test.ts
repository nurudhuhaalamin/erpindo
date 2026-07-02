import { describe, expect, it } from "vitest";
import {
  loginSchema,
  registerSchema,
  ROLE_LEVEL,
  toSlug,
} from "../src/index";

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

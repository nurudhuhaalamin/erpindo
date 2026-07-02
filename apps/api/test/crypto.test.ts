import { describe, expect, it } from "vitest";
import { generateToken, hashPassword, sha256Hex, verifyPassword } from "../src/lib/crypto";

describe("password hashing (PBKDF2)", () => {
  it("hash lalu verifikasi berhasil untuk password benar", async () => {
    const hash = await hashPassword("rahasia-super-123");
    expect(hash.startsWith("pbkdf2$sha256$")).toBe(true);
    expect(await verifyPassword("rahasia-super-123", hash)).toBe(true);
  });

  it("verifikasi gagal untuk password salah", async () => {
    const hash = await hashPassword("rahasia-super-123");
    expect(await verifyPassword("password-lain", hash)).toBe(false);
  });

  it("salt acak → dua hash password sama tidak identik", async () => {
    const a = await hashPassword("sama");
    const b = await hashPassword("sama");
    expect(a).not.toBe(b);
  });

  it("format simpanan rusak tidak lolos verifikasi", async () => {
    expect(await verifyPassword("x", "bukan-format-valid")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2$sha256$abc$zz$zz")).toBe(false);
  });
});

describe("token & hash", () => {
  it("generateToken menghasilkan 64 hex unik", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(t1).not.toBe(t2);
  });

  it("sha256Hex deterministik", async () => {
    expect(await sha256Hex("halo")).toBe(await sha256Hex("halo"));
    expect(await sha256Hex("halo")).not.toBe(await sha256Hex("hallo"));
  });
});

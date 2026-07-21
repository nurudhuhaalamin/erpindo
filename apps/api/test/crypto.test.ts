import { describe, expect, it } from "vitest";
import { generateToken, hashPassword, hmacSha256Hex, sha256Hex, verifyPassword } from "../src/lib/crypto";

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

describe("hmacSha256Hex (tanda tangan webhook — Fase 13h)", () => {
  it("deterministik untuk secret + pesan sama", async () => {
    const a = await hmacSha256Hex("whsec_abc", '{"event":"invoice.created"}');
    const b = await hmacSha256Hex("whsec_abc", '{"event":"invoice.created"}');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("berubah bila secret atau pesan berbeda", async () => {
    const base = await hmacSha256Hex("whsec_abc", "payload");
    expect(await hmacSha256Hex("whsec_xyz", "payload")).not.toBe(base);
    expect(await hmacSha256Hex("whsec_abc", "payload-lain")).not.toBe(base);
  });

  it("cocok dengan vektor RFC 4231 (kunci & data 'Hi There')", async () => {
    // Test Case 1 RFC 4231: key=0x0b*20, data="Hi There".
    const key = "\x0b".repeat(20);
    const sig = await hmacSha256Hex(key, "Hi There");
    expect(sig).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });
});

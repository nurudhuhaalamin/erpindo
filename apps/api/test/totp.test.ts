import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, verifyTotp } from "../src/lib/totp";

// Rahasia uji resmi RFC 6238: ASCII "12345678901234567890"
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP (RFC 6238)", () => {
  it("cocok dengan vektor uji resmi (SHA-1, 6 digit terakhir)", async () => {
    // Vektor RFC 6238 (8 digit) → 6 digit terakhirnya.
    expect(await totpCode(RFC_SECRET_B32, 59_000)).toBe("287082");
    expect(await totpCode(RFC_SECRET_B32, 1_111_111_109_000)).toBe("081804");
    expect(await totpCode(RFC_SECRET_B32, 1_234_567_890_000)).toBe("005924");
  });

  it("verifikasi menerima kode langkah saat ini dan ±1 langkah", async () => {
    const now = 1_234_567_890_000;
    const code = await totpCode(RFC_SECRET_B32, now);
    expect(await verifyTotp(RFC_SECRET_B32, code, now)).toBe(true);
    expect(await verifyTotp(RFC_SECRET_B32, code, now + 30_000)).toBe(true);
    expect(await verifyTotp(RFC_SECRET_B32, code, now + 90_000)).toBe(false);
    expect(await verifyTotp(RFC_SECRET_B32, "000000", now)).toBe(false);
    expect(await verifyTotp(RFC_SECRET_B32, "abc123", now)).toBe(false);
  });

  it("base32 encode/decode bolak-balik", () => {
    const bytes = new Uint8Array([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("rahasia baru 32 karakter base32 dan unik", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
  });
});

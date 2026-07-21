import { describe, expect, it } from "vitest";
import { ipAllowed, ipInCidr, ipv4ToInt, tenantSecuritySchema } from "../src/index";

describe("ipv4ToInt (Fase 13g)", () => {
  it("mengubah IPv4 valid → integer 32-bit", () => {
    expect(ipv4ToInt("0.0.0.0")).toBe(0);
    expect(ipv4ToInt("255.255.255.255")).toBe(4294967295);
    expect(ipv4ToInt("192.168.1.1")).toBe(3232235777);
  });

  it("menolak masukan tak valid", () => {
    expect(ipv4ToInt("256.0.0.1")).toBeNull();
    expect(ipv4ToInt("1.2.3")).toBeNull();
    expect(ipv4ToInt("a.b.c.d")).toBeNull();
    expect(ipv4ToInt("")).toBeNull();
    expect(ipv4ToInt("1.2.3.4.5")).toBeNull();
  });
});

describe("ipInCidr (Fase 13g)", () => {
  it("mencocokkan IP tunggal (tanpa /bits = /32)", () => {
    expect(ipInCidr("203.0.113.5", "203.0.113.5")).toBe(true);
    expect(ipInCidr("203.0.113.6", "203.0.113.5")).toBe(false);
    expect(ipInCidr("203.0.113.5", "203.0.113.5/32")).toBe(true);
  });

  it("mencocokkan rentang CIDR", () => {
    expect(ipInCidr("192.168.1.42", "192.168.1.0/24")).toBe(true);
    expect(ipInCidr("192.168.2.42", "192.168.1.0/24")).toBe(false);
    expect(ipInCidr("10.9.8.7", "10.0.0.0/8")).toBe(true);
    expect(ipInCidr("11.9.8.7", "10.0.0.0/8")).toBe(false);
  });

  it("/0 mencocokkan semua, IP/CIDR tak valid → false", () => {
    expect(ipInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
    expect(ipInCidr("unknown", "192.168.1.0/24")).toBe(false);
    expect(ipInCidr("192.168.1.1", "bukan-cidr")).toBe(false);
    expect(ipInCidr("192.168.1.1", "192.168.1.0/33")).toBe(false);
  });
});

describe("ipAllowed (Fase 13g)", () => {
  it("daftar kosong = selalu diizinkan (tanpa pembatasan)", () => {
    expect(ipAllowed("8.8.8.8", [])).toBe(true);
    expect(ipAllowed("unknown", [])).toBe(true);
  });

  it("mengizinkan bila cocok salah satu entri", () => {
    const list = ["203.0.113.0/24", "10.0.0.1"];
    expect(ipAllowed("203.0.113.99", list)).toBe(true);
    expect(ipAllowed("10.0.0.1", list)).toBe(true);
    expect(ipAllowed("192.168.0.1", list)).toBe(false);
    // IP tak dikenal ("unknown") diblokir saat daftar aktif.
    expect(ipAllowed("unknown", list)).toBe(false);
  });
});

describe("tenantSecuritySchema (Fase 13g)", () => {
  it("menerima konfigurasi valid & default allowedIps kosong", () => {
    const parsed = tenantSecuritySchema.parse({ require2fa: true });
    expect(parsed.require2fa).toBe(true);
    expect(parsed.allowedIps).toEqual([]);
  });

  it("menolak format CIDR tak valid", () => {
    const bad = tenantSecuritySchema.safeParse({ require2fa: false, allowedIps: ["999.1.1.1"] });
    expect(bad.success).toBe(false);
  });

  it("menerima daftar CIDR/IP valid", () => {
    const ok = tenantSecuritySchema.safeParse({ require2fa: false, allowedIps: ["192.168.1.0/24", "10.0.0.5"] });
    expect(ok.success).toBe(true);
  });
});

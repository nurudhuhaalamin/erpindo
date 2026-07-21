import { z } from "zod";

/**
 * Keamanan enterprise (Fase 13g) — fitur paket Enterprise: 2FA wajib per
 * perusahaan + pembatasan akses per rentang IP (CIDR IPv4).
 */

/**
 * Validasi satu entri CIDR IPv4 (mis. "203.0.113.0/24") atau IP tunggal.
 * Bentuk dicek regex, lalu rentang oktet (0–255) & jumlah bit (0–32) divalidasi
 * numerik — regex saja meloloskan "999.1.1.1".
 */
const cidrShape = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d{1,2}))?$/;
export function isValidCidr(entry: string): boolean {
  const m = cidrShape.exec(entry.trim());
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const octet = Number(m[i]);
    if (octet < 0 || octet > 255) return false;
  }
  if (m[6] !== undefined) {
    const bits = Number(m[6]);
    if (bits < 0 || bits > 32) return false;
  }
  return true;
}

export const tenantSecuritySchema = z.object({
  require2fa: z.boolean(),
  /** Daftar CIDR/IP yang diizinkan; kosong = tanpa pembatasan IP. */
  allowedIps: z
    .array(z.string().trim().refine(isValidCidr, "Format CIDR/IP tidak valid"))
    .max(50)
    .default([]),
});
export type TenantSecurityInput = z.infer<typeof tenantSecuritySchema>;

export type ApiTenantSecurity = {
  require2fa: boolean;
  allowedIps: string[];
};

/** Ubah IPv4 "a.b.c.d" → integer 32-bit. Mengembalikan null bila tak valid. */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const b = Number(p);
    if (!Number.isInteger(b) || b < 0 || b > 255) return null;
    n = n * 256 + b;
  }
  return n >>> 0;
}

/** Apakah IP masuk dalam satu CIDR/IP tunggal. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.trim().split("/");
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range ?? "");
  if (ipInt === null || rangeInt === null) return false;
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/** Apakah IP diizinkan oleh daftar CIDR. Daftar kosong = selalu diizinkan. */
export function ipAllowed(ip: string, allowedIps: string[]): boolean {
  if (allowedIps.length === 0) return true;
  return allowedIps.some((c) => ipInCidr(ip, c));
}

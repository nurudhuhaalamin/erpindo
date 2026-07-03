/**
 * TOTP (RFC 6238) di atas WebCrypto — tanpa dependensi eksternal.
 * Kompatibel dengan semua aplikasi authenticator (Google Authenticator, Authy,
 * Microsoft Authenticator, dll).
 */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Rahasia TOTP baru: 20 byte acak dalam base32 (standar industri). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** Kode TOTP 6 digit untuk waktu tertentu (langkah 30 detik, HMAC-SHA1). */
export async function totpCode(secretB32: string, timeMs = Date.now()): Promise<string> {
  const counter = Math.floor(timeMs / 1000 / 30);
  const msg = new ArrayBuffer(8);
  new DataView(msg).setBigUint64(0, BigInt(counter));

  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secretB32) as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));

  const offset = mac[mac.length - 1]! & 0xf;
  const code =
    (((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!) % 1_000_000;
  return String(code).padStart(6, "0");
}

/** Verifikasi dengan toleransi ±1 langkah (jam perangkat bisa meleset ~30 dtk). */
export async function verifyTotp(secretB32: string, code: string, timeMs = Date.now()): Promise<boolean> {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (const drift of [-1, 0, 1]) {
    if ((await totpCode(secretB32, timeMs + drift * 30_000)) === normalized) return true;
  }
  return false;
}

export function otpauthUrl(secretB32: string, accountEmail: string): string {
  return `otpauth://totp/erpindo:${encodeURIComponent(accountEmail)}?secret=${secretB32}&issuer=erpindo&digits=6&period=30`;
}

/**
 * Kriptografi autentikasi berbasis WebCrypto (native di Workers & Node 22):
 * PBKDF2-SHA256 untuk password, token acak untuk sesi/verifikasi, SHA-256
 * untuk menyimpan token dalam bentuk hash (token mentah tidak pernah disimpan).
 */

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BITS = 256;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function deriveHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return toHex(bits);
}

/** Format simpanan: pbkdf2$sha256$<iterasi>$<salt-hex>$<hash-hex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number(parts[2]);
  const salt = fromHex(parts[3]!);
  const expected = parts[4]!;
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const actual = await deriveHash(password, salt, iterations);
  return timingSafeEqualHex(actual, expected);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Token acak 256-bit dalam hex — untuk sesi, verifikasi email, reset, undangan. */
export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

/** SHA-512 hex — dipakai memverifikasi tanda tangan webhook Midtrans (Fase 11b). */
export async function sha512Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(input));
  return toHex(digest);
}

// ---------------------------------------------------------------------------
// Enkripsi simetris AES-GCM (Fase 8b) — untuk rahasia yang harus bisa dibaca
// kembali (mis. refresh token Google Drive). Kunci diturunkan dari secret
// aplikasi via SHA-256; hasil = base64(iv 12 byte || ciphertext).
// ---------------------------------------------------------------------------

async function aesKeyFromSecret(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptText(plain: string, secret: string): Promise<string> {
  const key = await aesKeyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptText(payload: string, secret: string): Promise<string> {
  const bytes = Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0));
  const key = await aesKeyFromSecret(secret);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  );
  return new TextDecoder().decode(plain);
}

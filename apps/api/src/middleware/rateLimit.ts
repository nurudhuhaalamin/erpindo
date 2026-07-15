import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";

/**
 * Rate limiting sederhana berbasis KV: N request per jendela waktu.
 * Cukup untuk menahan brute-force pada endpoint auth; rate limiting
 * yang lebih presisi (Durable Objects / Cloudflare Rate Limiting) menyusul.
 */

async function bump(
  kv: { get(key: string): Promise<string | null>; put(key: string, value: string, opts: { expirationTtl: number }): Promise<void> },
  kvKey: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const current = Number((await kv.get(kvKey)) ?? "0");
  if (current >= limit) return false;
  // KV bersifat eventually-consistent; untuk pembatasan kasar ini cukup.
  await kv.put(kvKey, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return true;
}

/** Varian per-IP untuk endpoint publik (auth). Tanpa header IP (hanya terjadi
 *  di luar Cloudflare, mis. dev/uji lokal) pembatasan dilewati — sebelumnya
 *  semua klien tanpa IP berbagi satu bucket "unknown" dan saling menjegal. */
export function rateLimit(opts: { key: string; limit: number; windowSeconds: number }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for");
    if (ip) {
      const window = Math.floor(Date.now() / (opts.windowSeconds * 1000));
      const ok = await bump(c.env.RATE_KV, `rl:${opts.key}:${ip}:${window}`, opts.limit, opts.windowSeconds);
      if (!ok) return c.json({ error: "Terlalu banyak percobaan. Coba lagi beberapa saat lagi." }, 429);
    }
    await next();
  };
}

/** Varian per-pengguna untuk endpoint mahal (laporan/ekspor/AI). Dipasang
 *  SETELAH requireAuth sehingga kunci = user id (fallback IP bila belum ada
 *  konteks user). Limit dibuat longgar — tujuannya menahan loop tak sengaja
 *  atau scraping, bukan pemakaian normal. */
export function rateLimitUser(opts: { key: string; limit: number; windowSeconds: number }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user") as { id: string } | undefined;
    const subject = user?.id ?? c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for");
    if (subject) {
      const window = Math.floor(Date.now() / (opts.windowSeconds * 1000));
      const ok = await bump(c.env.RATE_KV, `rlu:${opts.key}:${subject}:${window}`, opts.limit, opts.windowSeconds);
      if (!ok) return c.json({ error: "Terlalu banyak permintaan. Coba lagi beberapa saat lagi." }, 429);
    }
    await next();
  };
}

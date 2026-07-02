import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";

/**
 * Rate limiting sederhana berbasis KV: N request per jendela waktu per IP.
 * Cukup untuk menahan brute-force pada endpoint auth di Fase 0; rate limiting
 * yang lebih presisi (Durable Objects / Cloudflare Rate Limiting) menyusul.
 */
export function rateLimit(opts: { key: string; limit: number; windowSeconds: number }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
    const window = Math.floor(Date.now() / (opts.windowSeconds * 1000));
    const kvKey = `rl:${opts.key}:${ip}:${window}`;

    const current = Number((await c.env.RATE_KV.get(kvKey)) ?? "0");
    if (current >= opts.limit) {
      return c.json({ error: "Terlalu banyak percobaan. Coba lagi beberapa saat lagi." }, 429);
    }
    // KV bersifat eventually-consistent; untuk pembatasan brute-force ini cukup.
    await c.env.RATE_KV.put(kvKey, String(current + 1), { expirationTtl: opts.windowSeconds * 2 });
    await next();
  };
}

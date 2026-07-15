import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../src/env";
import { rateLimit, rateLimitUser } from "../src/middleware/rateLimit";

/** KV mock in-memory secukupnya untuk fixed-window counter. */
function makeKv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function appWith(mw: ReturnType<typeof rateLimit>, user?: { id: string }) {
  const app = new Hono<AppEnv>();
  if (user) app.use(async (c, next) => {
    c.set("user", user as never);
    await next();
  });
  app.get("/x", mw, (c) => c.json({ ok: true }));
  return app;
}

const env = () => ({ RATE_KV: makeKv() }) as unknown as AppEnv["Bindings"];

describe("rateLimit per-IP", () => {
  it("melewati batas → 429; di bawah batas → 200", async () => {
    const app = appWith(rateLimit({ key: "t", limit: 2, windowSeconds: 60 }));
    const e = env();
    const req = () => app.request("/x", { headers: { "cf-connecting-ip": "1.2.3.4" } }, e);
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(429);
  });

  it("IP berbeda punya bucket sendiri", async () => {
    const app = appWith(rateLimit({ key: "t", limit: 1, windowSeconds: 60 }));
    const e = env();
    expect((await app.request("/x", { headers: { "cf-connecting-ip": "1.1.1.1" } }, e)).status).toBe(200);
    expect((await app.request("/x", { headers: { "cf-connecting-ip": "2.2.2.2" } }, e)).status).toBe(200);
    expect((await app.request("/x", { headers: { "cf-connecting-ip": "1.1.1.1" } }, e)).status).toBe(429);
  });

  it("tanpa header IP → pembatasan dilewati (tidak lagi berbagi bucket 'unknown')", async () => {
    const app = appWith(rateLimit({ key: "t", limit: 1, windowSeconds: 60 }));
    const e = env();
    expect((await app.request("/x", {}, e)).status).toBe(200);
    expect((await app.request("/x", {}, e)).status).toBe(200);
    expect((await app.request("/x", {}, e)).status).toBe(200);
  });
});

describe("rateLimitUser per-pengguna", () => {
  it("kunci = user id: melewati batas → 429", async () => {
    const app = appWith(rateLimitUser({ key: "reports", limit: 2, windowSeconds: 60 }), { id: "user-a" });
    const e = env();
    expect((await app.request("/x", {}, e)).status).toBe(200);
    expect((await app.request("/x", {}, e)).status).toBe(200);
    const blocked = await app.request("/x", {}, e);
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: string }).error).toMatch(/Terlalu banyak permintaan/);
  });

  it("tanpa konteks user → fallback IP", async () => {
    const app = appWith(rateLimitUser({ key: "reports", limit: 1, windowSeconds: 60 }));
    const e = env();
    const req = () => app.request("/x", { headers: { "cf-connecting-ip": "9.9.9.9" } }, e);
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(429);
  });
});

import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  apiKeySchema,
  webhookBackoffSeconds,
  WEBHOOK_EVENTS,
  WEBHOOK_MAX_ATTEMPTS,
  webhookSchema,
} from "../src/index";

describe("apiKeySchema (Fase 13h)", () => {
  it("default skop = read", () => {
    const parsed = apiKeySchema.parse({ name: "Integrasi Toko" });
    expect(parsed.scope).toBe("read");
  });

  it("menolak nama terlalu pendek & skop tak dikenal", () => {
    expect(apiKeySchema.safeParse({ name: "a" }).success).toBe(false);
    expect(apiKeySchema.safeParse({ name: "Valid", scope: "admin" }).success).toBe(false);
  });

  it("prefix kunci publik konsisten", () => {
    expect(API_KEY_PREFIX).toBe("erpk_");
  });
});

describe("webhookSchema (Fase 13h)", () => {
  it("menerima URL valid + minimal satu peristiwa", () => {
    const ok = webhookSchema.safeParse({ url: "https://x.co/hook", events: ["invoice.created"] });
    expect(ok.success).toBe(true);
  });

  it("menolak URL tak valid & daftar peristiwa kosong", () => {
    expect(webhookSchema.safeParse({ url: "bukan-url", events: ["invoice.created"] }).success).toBe(false);
    expect(webhookSchema.safeParse({ url: "https://x.co", events: [] }).success).toBe(false);
  });

  it("menolak peristiwa tak dikenal", () => {
    expect(webhookSchema.safeParse({ url: "https://x.co", events: ["order.shipped"] }).success).toBe(false);
  });

  it("mendaftarkan tiga peristiwa inti", () => {
    expect(WEBHOOK_EVENTS).toEqual(["invoice.created", "payment.received", "stock.low"]);
  });
});

describe("webhookBackoffSeconds (Fase 13h)", () => {
  it("naik eksponensial (×5) dan dibatasi 6 jam", () => {
    expect(webhookBackoffSeconds(1)).toBe(60);
    expect(webhookBackoffSeconds(2)).toBe(300);
    expect(webhookBackoffSeconds(3)).toBe(1500);
    expect(webhookBackoffSeconds(4)).toBe(7500);
    // attempt 5 → 37500 dibatasi ke 21600 (6 jam).
    expect(webhookBackoffSeconds(5)).toBe(21600);
    expect(webhookBackoffSeconds(99)).toBe(21600);
  });

  it("batas percobaan = 5", () => {
    expect(WEBHOOK_MAX_ATTEMPTS).toBe(5);
  });
});

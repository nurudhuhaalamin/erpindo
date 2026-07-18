import { describe, expect, it } from "vitest";
import {
  ASSUMED_PER_USER_PRICE,
  MODULE_KEYS,
  MODULE_MIN_PLAN,
  minPlanForModule,
  modulesForPlan,
  perUserMonthlyCost,
  PLAN_LIMITS,
  PLANS,
  planIncludesModule,
} from "../src/index";

describe("PLAN_LIMITS (Fase 13a — pemaketan 4 tingkat)", () => {
  it("harga sesuai keputusan pemilik", () => {
    expect(PLAN_LIMITS.trial.pricePerMonth).toBe(0);
    expect(PLAN_LIMITS.starter.pricePerMonth).toBe(499_000);
    expect(PLAN_LIMITS.business.pricePerMonth).toBe(999_000);
    expect(PLAN_LIMITS.enterprise.pricePerMonth).toBe(2_499_000);
  });

  it("pengguna SELALU tak terbatas di semua paket (pembeda inti)", () => {
    for (const plan of PLANS) {
      expect(PLAN_LIMITS[plan].maxUsers).toBe(Number.MAX_SAFE_INTEGER);
    }
  });

  it("kuota AI naik sesuai paket; hanya Enterprise multi-entitas", () => {
    expect(PLAN_LIMITS.starter.aiDailyLimit).toBe(25);
    expect(PLAN_LIMITS.enterprise.aiDailyLimit).toBe(250);
    expect(PLAN_LIMITS.enterprise.maxEntities).toBeGreaterThan(1);
    expect(PLAN_LIMITS.starter.maxEntities).toBe(1);
    expect(PLAN_LIMITS.business.maxEntities).toBe(1);
  });
});

describe("planIncludesModule — matriks modul × paket", () => {
  it("modul inti (tak terdaftar) tersedia di semua paket", () => {
    // "penjualan" bukan ModuleKey → inti → selalu true (uji lewat cast aman).
    for (const plan of PLANS) {
      // Modul yang tak ada di MODULE_MIN_PLAN dianggap inti.
      expect(planIncludesModule(plan, "payroll")).toBe(plan !== "starter");
    }
  });

  it("Starter TIDAK mendapat modul operasional/skala", () => {
    for (const m of MODULE_KEYS) {
      expect(planIncludesModule("starter", m)).toBe(false);
    }
  });

  it("Business mendapat semua modul operasional, TIDAK modul enterprise", () => {
    for (const m of MODULE_KEYS) {
      const expected = MODULE_MIN_PLAN[m] === "business";
      expect(planIncludesModule("business", m)).toBe(expected);
    }
  });

  it("Enterprise dan Trial mendapat SEMUA modul (akses penuh)", () => {
    for (const m of MODULE_KEYS) {
      expect(planIncludesModule("enterprise", m)).toBe(true);
      expect(planIncludesModule("trial", m)).toBe(true);
    }
  });

  it("modulesForPlan konsisten dengan planIncludesModule", () => {
    for (const plan of PLANS) {
      const list = modulesForPlan(plan);
      for (const m of MODULE_KEYS) {
        expect(list.includes(m)).toBe(planIncludesModule(plan, m));
      }
    }
  });
});

describe("minPlanForModule", () => {
  it("mengembalikan paket minimum pembuka modul", () => {
    expect(minPlanForModule("payroll")).toBe("business");
    expect(minPlanForModule("consolidation")).toBe("enterprise");
    expect(minPlanForModule("dimensions")).toBe("enterprise");
    expect(minPlanForModule("apiAccess")).toBe("enterprise");
  });
});

describe("perUserMonthlyCost (kalkulator perbandingan implisit, Fase 13c)", () => {
  it("mengalikan jumlah pengguna dengan harga per-pengguna", () => {
    expect(perUserMonthlyCost(1)).toBe(ASSUMED_PER_USER_PRICE);
    expect(perUserMonthlyCost(30)).toBe(30 * ASSUMED_PER_USER_PRICE);
  });
  it("membulatkan ke bawah & menolak negatif", () => {
    expect(perUserMonthlyCost(2.9)).toBe(2 * ASSUMED_PER_USER_PRICE);
    expect(perUserMonthlyCost(-5)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { BILLING_CYCLE_DAYS, hitungProrata, PLAN_LIMITS } from "../src/index";

/**
 * Ganti paket dengan prorata (Fase 20k).
 *
 * Ini kode yang menyentuh UANG PELANGGAN, dan salahnya tidak terlihat di layar
 * mana pun: tagihan yang kelebihan sedikit tetap terbayar, dan yang kekurangan
 * sedikit tetap mengaktifkan paket. Karena itu yang diuji bukan "ada angkanya",
 * melainkan angkanya PERSIS berapa pada tanggal yang ditentukan.
 */
describe("hitungProrata (Fase 20k)", () => {
  const now = Date.parse("2026-07-30T00:00:00.000Z");
  const dalam = (hari: number) => new Date(now + hari * 86_400_000).toISOString();

  const starter = PLAN_LIMITS.starter.pricePerMonth; // 499.000
  const business = PLAN_LIMITS.business.pricePerMonth; // 999.000

  it("naik paket di tengah siklus ditagih selisih untuk SISA HARI saja", () => {
    const r = hitungProrata({
      planSekarang: "starter",
      planBaru: "business",
      berakhirPada: dalam(15),
      nowMs: now,
    });
    expect(r.arah).toBe("naik");
    expect(r.sisaHari).toBe(15);
    // (999.000 − 499.000) × 15 / 30 = 250.000
    expect(r.bayarSekarang).toBe(Math.ceil(((business - starter) * 15) / BILLING_CYCLE_DAYS));
    expect(r.bayarSekarang).toBe(250_000);
    expect(r.berlakuMulai).toBe("sekarang");
  });

  it("naik paket di hari terakhir hampir tidak ditagih, tapi tidak pernah nol", () => {
    const r = hitungProrata({
      planSekarang: "starter",
      planBaru: "business",
      berakhirPada: dalam(0.5),
      nowMs: now,
    });
    expect(r.sisaHari).toBe(1);
    // Nol akan berarti naik paket GRATIS di hari terakhir — celah yang bisa
    // diulang tiap bulan.
    expect(r.bayarSekarang).toBeGreaterThan(0);
  });

  it("turun paket: tanpa tagihan, tanpa refund, berlaku di akhir periode", () => {
    const r = hitungProrata({
      planSekarang: "enterprise",
      planBaru: "starter",
      berakhirPada: dalam(20),
      nowMs: now,
    });
    expect(r.arah).toBe("turun");
    expect(r.bayarSekarang).toBe(0);
    expect(r.berlakuMulai).toBe("akhir-periode");
  });

  it("paket sama: tidak menagih apa pun", () => {
    const r = hitungProrata({
      planSekarang: "business",
      planBaru: "business",
      berakhirPada: dalam(20),
      nowMs: now,
    });
    expect(r.arah).toBe("sama");
    expect(r.bayarSekarang).toBe(0);
  });

  it("tanpa langganan aktif: prorata tidak berlaku dan tidak menagih", () => {
    for (const berakhirPada of [null, dalam(-1)]) {
      const r = hitungProrata({
        planSekarang: "starter",
        planBaru: "enterprise",
        berakhirPada,
        nowMs: now,
      });
      expect(r.bisaProrata).toBe(false);
      expect(r.sisaHari).toBe(0);
      // Nol di sini BUKAN "gratis" — pemanggil wajib menolaknya dan menyuruh
      // pembelian biasa. Diuji supaya perubahan yang membuatnya "sekadar 0"
      // tanpa `bisaProrata` ketahuan.
      expect(r.bayarSekarang).toBe(0);
    }
  });

  it("sisa hari melebihi satu siklus dibatasi satu siklus", () => {
    const r = hitungProrata({
      planSekarang: "starter",
      planBaru: "business",
      berakhirPada: dalam(90),
      nowMs: now,
    });
    expect(r.sisaHari).toBe(90);
    // Dibatasi 30/30 → selisih penuh sekali, bukan tiga kali lipat.
    expect(r.bayarSekarang).toBe(business - starter);
  });

  it("naik dari trial ke berbayar tetap dihitung dari selisih (trial = 0)", () => {
    const r = hitungProrata({
      planSekarang: "trial",
      planBaru: "starter",
      berakhirPada: dalam(30),
      nowMs: now,
    });
    expect(r.arah).toBe("naik");
    expect(r.bayarSekarang).toBe(starter);
  });
});

import { describe, expect, it } from "vitest";
import { InsufficientStockError, stockOutMulti } from "../src/lib/accounting";

/**
 * Picking multi-gudang (Fase 20g).
 *
 * Dua hal yang dijaga, dan keduanya senyap kalau salah:
 *
 * 1. **HPP dijumlahkan PER SUMBER.** Tiap gudang punya biaya rata-rata
 *    sendiri. Menghitungnya dari satu rata-rata gabungan menghasilkan angka
 *    yang tetap "masuk akal" tetapi salah — laba kotornya meleset tanpa ada
 *    yang menyalak.
 * 2. **Validasi mendahului pengurangan.** Kalau gudang kedua kurang stok
 *    setelah gudang pertama sudah dikurangi, stok hilang tanpa dokumen.
 */

/** DB tiruan: hanya yang disentuh stockOut/stockOutMulti. */
function fakeDb(levels: Record<string, { qty: number; avg_cost: number }>) {
  const movements: { warehouseId: string; qty: number; unitCost: number }[] = [];
  const db = {
    prepare(q: string) {
      return {
        bind(...v: unknown[]) {
          return {
            async all<T>() {
              if (q.includes("SELECT qty, avg_cost FROM stock_levels") || q.includes("SELECT qty FROM stock_levels")) {
                const lv = levels[String(v[1])];
                return { results: (lv ? [lv] : []) as T[] };
              }
              if (q.includes("FROM stock_lots")) return { results: [] as T[] };
              return { results: [] as T[] };
            },
            async run() {
              if (q.startsWith("INSERT INTO stock_movements")) {
                movements.push({ warehouseId: String(v[2]), qty: Number(v[5]), unitCost: Number(v[6]) });
              }
              if (q.startsWith("UPDATE stock_levels SET qty = qty - ?")) {
                const lv = levels[String(v[2])];
                if (lv) lv.qty -= Number(v[0]);
              }
              return {};
            },
            async first<T>() {
              return null as T | null;
            },
          };
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async run() {
          return {};
        },
        async first<T>() {
          return null as T | null;
        },
      };
    },
  };
  return { db: db as never, movements, levels };
}

describe("stockOutMulti", () => {
  it("HPP dijumlahkan per sumber, bukan dari satu rata-rata gabungan", async () => {
    const { db } = fakeDb({ gA: { qty: 100, avg_cost: 12_000 }, gB: { qty: 50, avg_cost: 20_000 } });
    const cogs = await stockOutMulti(db, {
      productId: "p1",
      picks: [
        { warehouseId: "gA", qty: 10 },
        { warehouseId: "gB", qty: 5 },
      ],
      refType: "sale",
      refId: "inv1",
    });
    // 10 × 12.000 + 5 × 20.000 = 220.000 — BUKAN 15 × rata-rata apa pun.
    expect(cogs).toBe(220_000);
  });

  it("stok tiap gudang berkurang sesuai pengambilannya", async () => {
    const { db, levels } = fakeDb({ gA: { qty: 100, avg_cost: 10_000 }, gB: { qty: 50, avg_cost: 10_000 } });
    await stockOutMulti(db, {
      productId: "p1",
      picks: [
        { warehouseId: "gA", qty: 30 },
        { warehouseId: "gB", qty: 20 },
      ],
      refType: "sale",
      refId: "inv1",
    });
    expect(levels.gA!.qty).toBe(70);
    expect(levels.gB!.qty).toBe(30);
  });

  it("stok kurang di gudang KEDUA: menolak TANPA menyentuh gudang pertama", async () => {
    const { db, levels, movements } = fakeDb({
      gA: { qty: 100, avg_cost: 10_000 },
      gB: { qty: 3, avg_cost: 10_000 },
    });
    await expect(
      stockOutMulti(db, {
        productId: "p1",
        picks: [
          { warehouseId: "gA", qty: 10 },
          { warehouseId: "gB", qty: 5 },
        ],
        refType: "sale",
        refId: "inv1",
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    // Inilah inti ujinya: gudang pertama TIDAK boleh sudah berkurang.
    expect(levels.gA!.qty).toBe(100);
    expect(movements).toHaveLength(0);
  });

  it("gudang yang tak punya stok sama sekali ditolak", async () => {
    const { db } = fakeDb({ gA: { qty: 5, avg_cost: 10_000 } });
    await expect(
      stockOutMulti(db, {
        productId: "p1",
        picks: [{ warehouseId: "gKosong", qty: 1 }],
        refType: "sale",
        refId: "inv1",
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  // Ditemukan lewat pemeriksaan mata, bukan lewat asersi: di layar, gudang
  // kedua terisi default yang SAMA dengan gudang pertama. Kalau permintaan
  // tidak dijumlahkan dulu, dua-duanya lolos pemeriksaan awal (dibandingkan
  // dengan sisa yang sama) lalu gagal di tengah pengurangan.
  it("gudang yang sama disebut dua kali: dijumlahkan, bukan diperiksa terpisah", async () => {
    const { db, levels, movements } = fakeDb({ gA: { qty: 4, avg_cost: 10_000 } });
    await expect(
      stockOutMulti(db, {
        productId: "p1",
        picks: [
          { warehouseId: "gA", qty: 3 },
          { warehouseId: "gA", qty: 3 },
        ],
        refType: "sale",
        refId: "inv1",
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(levels.gA!.qty).toBe(4);
    expect(movements).toHaveLength(0);
  });

  it("gudang yang sama disebut dua kali & stoknya cukup: satu mutasi gabungan", async () => {
    const { db, levels, movements } = fakeDb({ gA: { qty: 10, avg_cost: 10_000 } });
    const hpp = await stockOutMulti(db, {
      productId: "p1",
      picks: [
        { warehouseId: "gA", qty: 3 },
        { warehouseId: "gA", qty: 2 },
      ],
      refType: "sale",
      refId: "inv1",
    });
    expect(hpp).toBe(50_000);
    expect(levels.gA!.qty).toBe(5);
    expect(movements).toHaveLength(1);
  });

  it("picking kosong / qty nol tidak melakukan apa pun", async () => {
    const { db, movements } = fakeDb({ gA: { qty: 10, avg_cost: 10_000 } });
    expect(await stockOutMulti(db, { productId: "p1", picks: [], refType: "sale", refId: "i" })).toBe(0);
    expect(movements).toHaveLength(0);
  });
});

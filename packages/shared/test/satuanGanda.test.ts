import { describe, expect, it } from "vitest";
import { commerceLineSchema, konversiSatuanBaris, periksaSatuanBaris } from "../src/index";

/**
 * Satuan ganda pada transaksi (Fase 21c). Yang diuji di sini adalah bagian yang
 * paling mudah salah tanpa terlihat: konversi qty, pembagian harga, dan sisa
 * pembulatannya.
 */
describe("konversiSatuanBaris (Fase 21c)", () => {
  it("satuan dasar tidak mengubah apa pun", () => {
    const r = konversiSatuanBaris({ qty: 5, faktor: 24, hargaSatuan: 4_000, nilaiBaris: 20_000 });
    expect(r).toEqual({ qtyDasar: 5, hargaSatuanDasar: 4_000, sisaPembulatan: 0 });
  });

  // `faktor` diabaikan bila satuannya dasar — supaya produk yang PUNYA satuan
  // besar tetap bisa ditransaksikan per pcs tanpa risiko ikut terkonversi.
  it("faktor diabaikan selama satuannya dasar", () => {
    const r = konversiSatuanBaris({ qty: 3, satuan: "dasar", faktor: 20, hargaSatuan: 55_000, nilaiBaris: 165_000 });
    expect(r.qtyDasar).toBe(3);
    expect(r.hargaSatuanDasar).toBe(55_000);
  });

  it("satuan besar mengalikan qty dan membagi harga", () => {
    // 2 dus @ Rp 1.100.000, 1 dus = 20 pcs.
    const r = konversiSatuanBaris({ qty: 2, satuan: "besar", faktor: 20, hargaSatuan: 1_100_000, nilaiBaris: 2_200_000 });
    expect(r.qtyDasar).toBe(40);
    expect(r.hargaSatuanDasar).toBe(55_000);
    expect(r.sisaPembulatan).toBe(0);
  });

  // Harga per dus yang tak habis dibagi isinya SELALU menyisakan sisa. Yang
  // penting bukan sisanya nol, melainkan sisanya diketahui dan kecil.
  it("harga tak habis dibagi menyisakan sisa yang terhitung", () => {
    // 1 dus @ Rp 1.000.000, 1 dus = 24 pcs → 41.666,67 → 41.667/pcs.
    const r = konversiSatuanBaris({ qty: 1, satuan: "besar", faktor: 24, hargaSatuan: 1_000_000, nilaiBaris: 1_000_000 });
    expect(r.qtyDasar).toBe(24);
    expect(r.hargaSatuanDasar).toBe(41_667);
    expect(r.sisaPembulatan).toBe(1_000_000 - 24 * 41_667); // −8 rupiah
    expect(Math.abs(r.sisaPembulatan)).toBeLessThanOrEqual(r.qtyDasar / 2);
  });

  it("faktor pecahan/nol tidak pernah mengecilkan qty", () => {
    const r = konversiSatuanBaris({ qty: 4, satuan: "besar", faktor: 0, hargaSatuan: 1_000, nilaiBaris: 4_000 });
    expect(r.qtyDasar).toBe(4);
    expect(r.hargaSatuanDasar).toBe(1_000);
  });
});

describe("periksaSatuanBaris (Fase 21c)", () => {
  it("satuan dasar selalu sah", () => {
    expect(periksaSatuanBaris({ namaProduk: "Kopi", uomSecondary: null, faktor: 1 })).toBeNull();
  });

  it("satuan besar sah bila produknya punya satuan besar", () => {
    expect(periksaSatuanBaris({ satuan: "besar", namaProduk: "Kopi", uomSecondary: "dus", faktor: 20 })).toBeNull();
  });

  // Inilah kesalahan yang paling mahal: "2 dus" pada produk tanpa konversi
  // akan diam-diam jadi 2 pcs, dan tidak ada satu angka pun yang terlihat aneh.
  it("satuan besar ditolak bila produk tak punya satuan besar", () => {
    const pesan = periksaSatuanBaris({ satuan: "besar", namaProduk: "Kopi", uomSecondary: null, faktor: 1 });
    expect(pesan).toContain("Kopi");
    expect(pesan).toContain("satuan besar");
  });

  it("satuan besar ditolak bila faktornya 1 walau namanya terisi", () => {
    expect(periksaSatuanBaris({ satuan: "besar", namaProduk: "Teh", uomSecondary: "dus", faktor: 1 })).not.toBeNull();
  });

  it("nama satuan berisi spasi saja tetap ditolak", () => {
    expect(periksaSatuanBaris({ satuan: "besar", namaProduk: "Teh", uomSecondary: "   ", faktor: 12 })).not.toBeNull();
  });
});

describe("commerceLineSchema — satuan (Fase 21c)", () => {
  const baris = { productId: "p1", qty: 2, unitPrice: 1_000 };

  it("baris tanpa `uom` tetap sah (jalur lama tak berubah)", () => {
    const r = commerceLineSchema.safeParse(baris);
    expect(r.success).toBe(true);
    expect(r.success && r.data.uom).toBeUndefined();
  });

  it("`uom` hanya menerima nilai yang dikenal", () => {
    expect(commerceLineSchema.safeParse({ ...baris, uom: "besar" }).success).toBe(true);
    expect(commerceLineSchema.safeParse({ ...baris, uom: "dus" }).success).toBe(false);
  });
});

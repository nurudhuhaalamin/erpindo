import { describe, expect, it } from "vitest";
import { buildZip } from "../src/lib/zip";
import { pickRelevant } from "../src/lib/guideKnowledge";

/**
 * Fase 14j — uji utilitas murni yang belum tercakup: `buildZip` (arsip ekspor
 * data / anti lock-in Fase 8b) dan `pickRelevant` (grounding Asisten AI). Tanpa
 * database — fungsi murni, jadi diuji langsung.
 */

const enc = (s: string) => new TextEncoder().encode(s);
/** Baca u16/u32 little-endian dari posisi tertentu. */
const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32 = (b: Uint8Array, at: number) =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

const LOCAL_SIG = 0x04034b50;
const EOCD_SIG = 0x06054b50;

describe("buildZip", () => {
  it("arsip kosong: hanya EOCD dengan 0 entri", () => {
    const zip = buildZip([]);
    expect(zip.length).toBe(22); // EOCD saja
    expect(u32(zip, 0)).toBe(EOCD_SIG);
    expect(u16(zip, zip.length - 12)).toBe(0); // total entri
  });

  it("satu entri: local header valid, CRC32 benar, nama & data tersimpan", () => {
    // "123456789" → nilai cek CRC32 standar 0xCBF43926.
    const zip = buildZip([{ path: "a.txt", data: enc("123456789") }]);
    expect(u32(zip, 0)).toBe(LOCAL_SIG);
    expect(u16(zip, 8)).toBe(0); // metode store (tanpa kompresi)
    expect(u32(zip, 14)).toBe(0xcbf43926); // CRC32 di offset 14
    expect(u32(zip, 18)).toBe(9); // ukuran terkompresi
    expect(u32(zip, 22)).toBe(9); // ukuran asli
    expect(u16(zip, 26)).toBe(5); // panjang nama "a.txt"

    // Nama & data hadir di byte-nya.
    const text = new TextDecoder().decode(zip);
    expect(text).toContain("a.txt");
    expect(text).toContain("123456789");

    // EOCD di akhir: 1 entri.
    expect(u16(zip, zip.length - 12)).toBe(1);
  });

  it("banyak entri: EOCD mencatat jumlah benar & semua nama hadir", () => {
    const zip = buildZip([
      { path: "kontak.csv", data: enc("nama,email") },
      { path: "produk.csv", data: enc("sku,harga") },
      { path: "manifest.json", data: enc("{}") },
    ]);
    expect(u16(zip, zip.length - 12)).toBe(3);
    const text = new TextDecoder().decode(zip);
    for (const n of ["kontak.csv", "produk.csv", "manifest.json"]) expect(text).toContain(n);
  });

  it("CRC32 berbeda untuk isi berbeda (deteksi perubahan data)", () => {
    const a = buildZip([{ path: "x", data: enc("halo") }]);
    const b = buildZip([{ path: "x", data: enc("halo!") }]);
    expect(u32(a, 14)).not.toBe(u32(b, 14));
  });
});

describe("pickRelevant", () => {
  it("mengembalikan modul yang cocok dengan kata kunci pertanyaan", () => {
    const hits = pickRelevant("bagaimana cara pakai helpdesk untuk tiket?");
    expect(hits.some((g) => g.slug === "helpdesk")).toBe(true);
  });

  it("tanpa kecocokan → array kosong", () => {
    expect(pickRelevant("cuaca hari ini cerah sekali")).toEqual([]);
  });

  it("membatasi jumlah hasil ke `max` (default 2)", () => {
    // Pertanyaan menyentuh banyak kata kunci lintas modul.
    const q = "istilah debit kredit hpp neraca penyusutan aging tiket helpdesk pemula";
    expect(pickRelevant(q).length).toBeLessThanOrEqual(2);
    expect(pickRelevant(q, 1).length).toBe(1);
  });

  it("kecocokan judul memberi skor lebih tinggi daripada satu kata kunci", () => {
    // "Helpdesk" (judul, +3) harus di atas modul yang hanya kena satu kata kunci (+2).
    const hits = pickRelevant("apa itu helpdesk dan penyusutan?", 2);
    expect(hits[0]?.slug).toBe("helpdesk");
  });
});

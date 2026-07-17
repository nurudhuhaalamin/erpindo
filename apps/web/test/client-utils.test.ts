import { describe, expect, it } from "vitest";
import { formatDate, formatIDR, parseCsv } from "../src/api/client";

// Normalisasi spasi tak terputus (U+00A0/U+202F) yang dihasilkan Intl agar asersi stabil.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("parseCsv", () => {
  it("mendeteksi pemisah ; atau , dari baris header", () => {
    expect(parseCsv("sku;qty\nA;2")).toEqual([{ sku: "A", qty: "2" }]);
    expect(parseCsv("sku,qty\nA,2")).toEqual([{ sku: "A", qty: "2" }]);
  });

  it("mendukung kutipan ganda (pemisah & kutip di dalam nilai) dan CRLF", () => {
    const rows = parseCsv('nama;kota\r\n"Budi; ""Bos""";Bandung\r\n');
    expect(rows).toEqual([{ nama: 'Budi; "Bos"', kota: "Bandung" }]);
  });

  it("membuang BOM, baris kosong, dan memangkas nilai", () => {
    const rows = parseCsv("﻿sku;qty\n A ; 2 \n;\n");
    expect(rows).toEqual([{ sku: "A", qty: "2" }]);
  });

  it("header dinormalkan ke huruf kecil; kolom kurang menjadi string kosong", () => {
    expect(parseCsv("SKU;Qty\nA")).toEqual([{ sku: "A", qty: "" }]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("formatIDR", () => {
  it("memformat rupiah tanpa desimal", () => {
    expect(plain(formatIDR(1_500_000))).toBe("Rp 1.500.000");
    expect(plain(formatIDR(0))).toBe("Rp 0");
  });

  it("nilai negatif tetap terbaca (kurung/minus sesuai locale)", () => {
    expect(plain(formatIDR(-5_000))).toContain("5.000");
  });
});

describe("formatDate", () => {
  it("memformat ISO ke tampilan Indonesia", () => {
    expect(plain(formatDate("2026-07-08"))).toBe("8 Jul 2026");
    expect(plain(formatDate("2026-07-08T15:30:00Z"))).toBe("8 Jul 2026");
  });

  it("mengembalikan em-dash untuk kosong dan nilai asli bila bukan tanggal", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("bukan-tanggal")).toBe("bukan-tanggal");
  });
});

import { describe, expect, it } from "vitest";
import { cx } from "../src/components/ui";

/**
 * Regresi Fase 17b — bug yang diam sejak awal design system.
 *
 * `cx()` dulu hanya menyambung string. Itu TERLIHAT berfungsi, padahal konflik
 * antar-utilitas Tailwind diselesaikan oleh **urutan CSS**, bukan urutan
 * penulisan. Tailwind memancarkan `.h-7 → .h-8 → .h-9 → .h-10` menaik, jadi
 * nilai terbesar selalu menang.
 *
 * Diukur langsung di Chromium atas CSS hasil build sebelum perbaikan:
 *   `h-10` (bawaan) + `h-8` (pemanggil) → 40px  ← penimpaan diabaikan
 *   `h-10` (bawaan) + `h-7` (pemanggil) → 40px  ← diabaikan
 *
 * Akibatnya 96 dari 98 penimpaan tinggi `<Button>` di aplikasi tidak pernah
 * berpengaruh — salah satu sebab tampilan terasa longgar.
 *
 * Uji ini sengaja memeriksa STRING hasil merge, bukan sekadar "kelasnya ada":
 * pada versi lama kelas penimpa memang ADA di DOM, hanya kalah di CSS. Asersi
 * "mengandung h-7" saja akan lolos secara hampa.
 */
describe("cx — penyelesaian konflik kelas (Fase 17b)", () => {
  it("kelas belakangan menang untuk properti yang sama", () => {
    const hasil = cx("h-8 px-3 text-sm", "h-7");
    expect(hasil).toContain("h-7");
    expect(hasil).not.toContain("h-8");
  });

  it("penimpaan ke ukuran lebih besar juga berlaku", () => {
    const hasil = cx("h-8 px-3", "h-12");
    expect(hasil).toContain("h-12");
    expect(hasil).not.toContain("h-8");
  });

  it("properti yang tidak bertabrakan tetap dipertahankan", () => {
    const hasil = cx("h-8 px-3 text-sm font-medium", "h-7");
    for (const kelas of ["px-3", "text-sm", "font-medium"]) {
      expect(hasil).toContain(kelas);
    }
  });

  it("warna latar penimpa menang atas warna bawaan", () => {
    const hasil = cx("bg-brand-600 text-white", "bg-red-600");
    expect(hasil).toContain("bg-red-600");
    expect(hasil).not.toContain("bg-brand-600");
  });

  it("nilai false/undefined diabaikan tanpa merusak urutan", () => {
    const hasil = cx("h-8", false, undefined, "h-7");
    expect(hasil).toContain("h-7");
    expect(hasil).not.toContain("h-8");
  });

  it("varian dark: tidak bertabrakan dengan kelas terang", () => {
    const hasil = cx("bg-slate-100 dark:bg-slate-800", "bg-slate-50");
    expect(hasil).toContain("bg-slate-50");
    expect(hasil).toContain("dark:bg-slate-800");
    expect(hasil).not.toContain("bg-slate-100");
  });
});

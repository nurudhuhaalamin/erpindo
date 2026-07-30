import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_LABELS_EN,
  labelAudit,
} from "../src/pages/settings/data";

/**
 * Label audit dwibahasa (Fase 20m).
 *
 * Dua tabel berdampingan hanya aman selama keduanya bergerak bersama. Tanpa
 * penjaga ini, aksi audit baru akan ditambahkan ke tabel Indonesia saja dan
 * pengguna Inggris melihat kode mentah (`sales.so.invoiced`) tanpa ada yang
 * tahu — persis kelas utang yang membuat Fase 20m ada.
 */
describe("label audit dwibahasa (Fase 20m)", () => {
  it("kedua tabel memuat kunci yang sama persis", () => {
    const id = Object.keys(AUDIT_ACTION_LABELS).sort();
    const en = Object.keys(AUDIT_ACTION_LABELS_EN).sort();
    expect(en).toEqual(id);
  });

  it("tak ada label yang tertinggal kosong", () => {
    for (const [k, v] of Object.entries(AUDIT_ACTION_LABELS_EN)) {
      expect(v.trim().length, `label EN kosong untuk ${k}`).toBeGreaterThan(1);
    }
  });

  it("memilih tabel menurut bahasa aktif", () => {
    expect(labelAudit("auth.login", "id")).toBe("Login");
    expect(labelAudit("auth.login", "en")).toBe("Sign-in");
  });

  // Kode yang belum dikenal harus tetap tampil apa adanya, bukan jadi
  // "undefined" di layar audit — justru di layar inilah orang mencari kejadian
  // yang tidak biasa.
  it("aksi tak dikenal ditampilkan apa adanya", () => {
    expect(labelAudit("modul.baru.belum_ada", "en")).toBe("modul.baru.belum_ada");
    expect(labelAudit("modul.baru.belum_ada", "id")).toBe("modul.baru.belum_ada");
  });
});

import { GRACE_DAYS } from "@erpindo/shared";
import { describe, expect, it } from "vitest";
import { dalamTenggang, sisaTenggang } from "../src/lib/tenggang";

/**
 * Masa tenggang sisi web (Fase 20c).
 *
 * `apps/web/src/lib/tenggang.ts` adalah SALINAN tipis dari
 * `apps/api/src/lib/dunning.ts` — web tak bisa mengimpor kode Worker. Yang
 * dibagi hanya angkanya (`GRACE_DAYS` dari `@erpindo/shared`), rumusnya
 * ditulis dua kali.
 *
 * Duplikasi itulah risikonya: kalau salah satu sisi bergeser, spanduk akan
 * mengatakan "masih bisa mencatat" padahal server sudah menolak menulis —
 * atau sebaliknya. Uji ini memakai ekspektasi yang SAMA PERSIS dengan uji
 * sisi API, sehingga pergeseran salah satu sisi membuat salah satunya merah.
 */

const HARI = 86_400_000;
const NOW = Date.parse("2026-07-27T12:00:00.000Z");
const habis = new Date(NOW).toISOString();

describe("masa tenggang (sisi web)", () => {
  it("tepat pada jatuh tempo sudah masuk tenggang", () => {
    expect(dalamTenggang(habis, NOW)).toBe(true);
    expect(sisaTenggang(habis, NOW)).toBe(GRACE_DAYS);
  });

  it("hari terakhir tenggang masih dihitung boleh menulis", () => {
    expect(dalamTenggang(habis, NOW + GRACE_DAYS * HARI - 1_000)).toBe(true);
  });

  it("tepat setelah tenggang habis, spanduk berhenti mengklaim boleh menulis", () => {
    expect(dalamTenggang(habis, NOW + GRACE_DAYS * HARI)).toBe(false);
    expect(sisaTenggang(habis, NOW + GRACE_DAYS * HARI)).toBe(0);
  });

  it("sebelum jatuh tempo belum masuk tenggang", () => {
    expect(dalamTenggang(habis, NOW - HARI)).toBe(false);
  });
});

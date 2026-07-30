/**
 * Masa tenggang sisi web (Fase 20c).
 *
 * Salinan tipis dari `apps/api/src/lib/dunning.ts`. Web tidak bisa mengimpor
 * dari apps/api (paket terpisah, dan itu kode Worker), jadi yang dibagi adalah
 * ANGKA-nya lewat `@erpindo/shared` — bukan rumusnya digandakan diam-diam.
 */
import { GRACE_DAYS } from "@erpindo/shared";

const HARI_MS = 86_400_000;

const batas = (habisPada: string): number => Date.parse(habisPada) + GRACE_DAYS * HARI_MS;

/** Sedang dalam masa tenggang: jatuh tempo lewat, belum baca-saja. */
export function dalamTenggang(habisPada: string, nowMs: number = Date.now()): boolean {
  return nowMs >= Date.parse(habisPada) && nowMs < batas(habisPada);
}

/** Sisa hari tenggang (0 bila sudah lewat). */
export function sisaTenggang(habisPada: string, nowMs: number = Date.now()): number {
  return Math.max(Math.ceil((batas(habisPada) - nowMs) / HARI_MS), 0);
}

import { DASAR } from "./dasar";
import { KEUANGAN } from "./keuangan";
import { OPERASIONAL } from "./operasional";
import { TRANSAKSI } from "./transaksi";
import type { GuideModule } from "./types";

export type { GuideModule, GuideSection } from "./types";

/** Kategori tampilan di halaman indeks panduan. */
export const GUIDE_CATEGORIES: { title: string; modules: GuideModule[] }[] = [
  { title: "Dasar", modules: DASAR },
  { title: "Transaksi Harian", modules: TRANSAKSI },
  { title: "Keuangan & Pajak", modules: KEUANGAN },
  { title: "Operasional Lanjutan", modules: OPERASIONAL },
];

export const GUIDE_MODULES: GuideModule[] = GUIDE_CATEGORIES.flatMap((c) => c.modules);

export function guideBySlug(slug: string): GuideModule | undefined {
  return GUIDE_MODULES.find((m) => m.slug === slug);
}

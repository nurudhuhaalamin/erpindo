import type { FeedbackCategory, FeedbackStatus } from "@erpindo/shared";
import type { UiKey } from "./ui";

/**
 * Peta kode masukan → kunci kamus (Fase 19r).
 *
 * `FEEDBACK_CATEGORY_LABELS` dan `FEEDBACK_STATUS_LABELS` di `@erpindo/shared`
 * tetap berbahasa Indonesia karena apps/api ikut memakainya (pola 16t). Sisi
 * web memetakan kodenya sendiri.
 *
 * Diletakkan di modul tersendiri, bukan di salah satu halaman, karena dipakai
 * DUA halaman: `admin.tsx` (dashboard admin platform) dan `dukungan.tsx`
 * (halaman masukan pengguna). Mengimpornya dari `admin.tsx` akan menyeret
 * seluruh potongan bundel admin ke halaman dukungan yang dipakai pelanggan.
 */
export const KATEGORI_KEY = {
  saran: "adKatSaran",
  bug: "adKatBug",
  pertanyaan: "adKatPertanyaan",
} satisfies Record<FeedbackCategory, UiKey>;

export const STATUS_MASUKAN_KEY = {
  baru: "adFsBaru",
  dibaca: "adFsDibaca",
  selesai: "adFsSelesai",
} satisfies Record<FeedbackStatus, UiKey>;

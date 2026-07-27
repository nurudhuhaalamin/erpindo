import { useSyncExternalStore } from "react";

/**
 * i18n ringan tanpa pustaka (Fase 13d). Bahasa default Indonesia; Inggris opsional.
 * Store level-modul + useSyncExternalStore agar semua komponen ikut ter-render
 * saat bahasa diganti — tanpa perlu Provider di root (pola serupa useDarkMode,
 * tapi reaktif lintas komponen).
 *
 * Menambah bahasa baru = menambah kolom pada tiap entri kamus.
 */
export const LANGS = ["id", "en"] as const;
export type Lang = (typeof LANGS)[number];

const STORAGE_KEY = "erpindo-lang";

function detect(): Lang {
  if (typeof window === "undefined") return "id";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "id" || stored === "en") return stored;
  } catch {
    /* localStorage tak tersedia */
  }
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "id";
}

let current: Lang = detect();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* abaikan */
  }
  if (typeof document !== "undefined") document.documentElement.lang = lang;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Bahasa aktif (reaktif). */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => "id" as Lang);
}

/** Nilai dwibahasa. */
export type Dual = { id: string; en: string };
export function pick(v: Dual, lang: Lang): string {
  return v[lang];
}

// ---------------------------------------------------------------------------
// Fase 19q — `DICT`/`TKey`/`useT()` DIHAPUS.
//
// Kamus itu berisi delapan istilah navigasi landing plus sembilan kunci auth
// (`authMasukJudul`, `authPerusahaan`, …) yang ditulis pada Fase 13d — lalu
// `useT()` tidak pernah dipanggil satu berkas pun. Terjemahannya ada, tapi
// tidak tersambung ke halamannya; halaman masuk/daftar tetap satu bahasa
// sampai Fase 19q.
//
// Menyimpannya justru berbahaya: kunci auth yang tampak "sudah ada" membuat
// pembaca berikutnya menyangka halaman auth sudah dwibahasa. Kamus yang
// berlaku sekarang hanya satu: `UI` di `./ui`, dipakai lewat `useUi()`.
// Landing memakai `pick()` + `sections.ts`, keduanya masih hidup di bawah ini.
// ---------------------------------------------------------------------------

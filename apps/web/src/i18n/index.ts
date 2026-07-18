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
// Kamus UI chrome (landing + auth). Prosa panjang list ada di sections.ts
// sebagai data dwibahasa.
// ---------------------------------------------------------------------------
export const DICT = {
  navFitur: { id: "Fitur", en: "Features" },
  navHarga: { id: "Harga", en: "Pricing" },
  navPanduan: { id: "Panduan", en: "Guide" },
  navFaq: { id: "FAQ", en: "FAQ" },
  masuk: { id: "Masuk", en: "Sign in" },
  mulaiGratis: { id: "Mulai Gratis", en: "Start Free" },
  lihatDemo: { id: "Lihat Demo", en: "View Demo" },
  perBulan: { id: "/bulan", en: "/month" },
  // Auth
  authMasukJudul: { id: "Masuk ke akun Anda", en: "Sign in to your account" },
  authDaftarJudul: { id: "Buat akun perusahaan", en: "Create your company account" },
  authEmail: { id: "Email", en: "Email" },
  authPassword: { id: "Password", en: "Password" },
  authNama: { id: "Nama Anda", en: "Your name" },
  authPerusahaan: { id: "Nama perusahaan", en: "Company name" },
  authPunyaAkun: { id: "Sudah punya akun?", en: "Already have an account?" },
  authBelumAkun: { id: "Belum punya akun?", en: "Don't have an account?" },
  authLupaPassword: { id: "Lupa password?", en: "Forgot password?" },
} as const;
export type TKey = keyof typeof DICT;

/** Hook penerjemah UI chrome: `const t = useT(); t("navHarga")`. */
export function useT(): (key: TKey) => string {
  const lang = useLang();
  return (key: TKey) => DICT[key][lang];
}

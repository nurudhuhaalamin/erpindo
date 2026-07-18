import { Languages } from "lucide-react";
import { LANGS, setLang, useLang, type Lang } from "./index";

const LABELS: Record<Lang, string> = { id: "ID", en: "EN" };

/**
 * Tombol pemilih bahasa ringkas (Fase 13d). Dipakai di header landing & aplikasi.
 * Menyimpan pilihan (localStorage) dan me-render ulang seluruh konsumen useT/useLang.
 */
export function LangSwitcher({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <Languages className="size-4 text-slate-400" aria-hidden />
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700" role="group" aria-label="Bahasa">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              lang === l
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {LABELS[l]}
          </button>
        ))}
      </div>
    </div>
  );
}

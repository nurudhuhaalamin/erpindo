import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLang } from "../i18n";

export type PaletItem = {
  /** Rute tujuan, mis. `/app/penjualan`. */
  to: string;
  /** Label sudah diterjemahkan oleh pemanggil (shell yang tahu NAV_LABEL_EN). */
  label: string;
  /** Nama seksi, untuk konteks baris. */
  section?: string;
  icon: (props: { className?: string; "aria-hidden"?: boolean }) => ReactNode;
};

/**
 * Palet perintah (⌘K / Ctrl+K) — Fase 17c.
 *
 * PENTING soal tempat pasang: komponen ini WAJIB dirender di luar `<aside>`,
 * bukan di dalam `<nav>`. Simulasi UI mengunci struktur navigasi dengan
 * menghitung elemen:
 *
 *   page.locator("aside nav a:visible").count()      → F13 & F14
 *   page.locator("aside nav button:visible")         → dianggap HANYA header seksi
 *
 * Menambahkan satu saja `<a>` atau `<button>` ke dalam `<nav>` akan memecah
 * sebelas asersi sekaligus, tanpa pesan galat yang menjelaskan sebabnya.
 * Karena itu pemicunya diletakkan di topbar dan panelnya di akar shell.
 */
export function PaletPerintah({
  open,
  items,
  onClose,
  onPilih,
}: {
  open: boolean;
  items: PaletItem[];
  onClose: () => void;
  onPilih: (to: string) => void;
}) {
  const lang = useLang();
  const [q, setQ] = useState("");
  const [aktif, setAktif] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasil = useMemo(() => {
    const t = q.trim().toLowerCase();
    const cocok = t
      ? items.filter(
          (i) => i.label.toLowerCase().includes(t) || (i.section ?? "").toLowerCase().includes(t)
        )
      : items;
    return cocok.slice(0, 12);
  }, [items, q]);

  // Reset tiap kali dibuka supaya tidak membawa sisa pencarian sebelumnya.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setAktif(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setAktif(0);
  }, [q]);

  if (!open) return null;

  const pilih = (i: number) => {
    const item = hasil[i];
    if (item) onPilih(item.to);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/60 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={lang === "en" ? "Command palette" : "Palet perintah"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-card border border-slate-300 bg-surface shadow-2xl dark:border-slate-700">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setAktif((a) => (hasil.length ? (a + 1) % hasil.length : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAktif((a) => (hasil.length ? (a - 1 + hasil.length) % hasil.length : 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pilih(aktif);
            }
          }}
          placeholder={lang === "en" ? "Jump to a page…" : "Lompat ke halaman…"}
          aria-label={lang === "en" ? "Search pages" : "Cari halaman"}
          className="h-11 w-full border-b border-slate-200 bg-transparent px-4 text-sm outline-none placeholder:text-slate-400 dark:border-slate-800"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {hasil.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {lang === "en" ? "No pages match." : "Tidak ada halaman yang cocok."}
            </li>
          ) : (
            hasil.map((item, i) => (
              <li key={item.to}>
                {/* Sengaja <button>, bukan <a>: palet ada di luar <nav>, tetapi
                    memakai elemen non-tautan membuatnya mustahil terhitung oleh
                    selektor navigasi seandainya struktur berubah kelak.

                    onMouseMove, BUKAN onMouseEnter: `mouseenter` juga terpicu
                    ketika daftar muncul di BAWAH kursor yang diam, sehingga
                    membuka palet lewat ⌘K langsung memindahkan sorotan ke baris
                    mana pun yang kebetulan berada di posisi kursor terakhir —
                    lalu Enter membawa pengguna ke halaman yang tak ia pilih.
                    Terlihat pada tangkapan layar Fase 17c. `mousemove` hanya
                    terpicu oleh gerakan tetikus yang nyata. */}
                <button
                  type="button"
                  data-aktif={i === aktif ? "1" : undefined}
                  onMouseMove={() => setAktif(i)}
                  onClick={() => pilih(i)}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                    i === aktif
                      ? "bg-brand-600 text-white"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.section ? (
                    <span
                      className={`shrink-0 text-xs ${
                        i === aktif ? "text-white/70" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {item.section}
                    </span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

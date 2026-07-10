import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Komponen dasar design system erpindo (gaya shadcn/ui, tanpa dependensi
 * eksternal). Akan dipindah ke packages/ui saat jumlah komponen bertambah.
 */

function cx(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// --- Button -----------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm ring-1 ring-inset ring-white/10 hover:from-brand-600 hover:to-brand-700 focus-visible:ring-brand-500 disabled:from-brand-500/60 disabled:to-brand-600/60",
  secondary:
    "border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
  ghost: "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500",
};

const buttonSizes = {
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof buttonSizes }) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:ring-offset-slate-950",
        buttonSizes[size],
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

// --- Form fields --------------------------------------------------------------

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cx("mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300", className)} {...props} />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
        className,
      )}
      {...props}
    />
  );
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{messages[0]}</p>;
}

// --- Card & layout -------------------------------------------------------------

export function Card({
  className,
  hover = false,
  children,
}: {
  className?: string;
  /** Efek angkat halus saat kursor di atas kartu (untuk kartu yang bisa diklik). */
  hover?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-card border border-slate-200 bg-white shadow-card dark:border-slate-700/60 dark:bg-slate-900",
        hover && "transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg dark:hover:border-brand-700",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

// --- Alert ----------------------------------------------------------------------

export function Alert({ tone, children }: { tone: "info" | "success" | "error"; children: ReactNode }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  };
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function Spinner() {
  return (
    <span
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      role="status"
      aria-label="Memuat"
    />
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "brand" | "amber" | "red" | "green";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
    brand: "bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    red: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  };
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

// --- Skeleton & empty state ---------------------------------------------------------

/** Placeholder berkilau saat data dimuat — pengganti spinner untuk konten berbentuk. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800", className)} />;
}

/** Keadaan kosong yang ramah: ikon besar + judul + penjelasan (+ aksi opsional). */
export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        {icon}
      </div>
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</div>
      {description ? <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      {children}
    </div>
  );
}

// --- SearchSelect (combobox typeahead) ------------------------------------------------

export type SearchSelectOption = { value: string; label: string; hint?: string };

/**
 * Combobox ringan untuk data berskala: opsi di-fetch saat mengetik (debounce),
 * bukan dirender semua — produk ke-501+ tetap bisa dipilih. Keyboard: ↑/↓
 * memindah sorotan, Enter memilih, Escape menutup.
 */
export function SearchSelect({
  id,
  value,
  valueLabel,
  placeholder = "Ketik untuk mencari…",
  disabled,
  fetchOptions,
  onSelect,
}: {
  id?: string;
  /** Nilai terpilih saat ini ("" bila belum ada). */
  value: string;
  /** Label nilai terpilih — ditampilkan saat combobox tertutup. */
  valueLabel: string;
  placeholder?: string;
  disabled?: boolean;
  /** Dipanggil (ter-debounce) dengan teks pencarian; kembalikan daftar opsi. */
  fetchOptions: (q: string) => Promise<SearchSelectOption[]>;
  onSelect: (option: SearchSelectOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchSelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const fetchRef = useRef(fetchOptions);
  fetchRef.current = fetchOptions;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const seq = setTimeout(async () => {
      try {
        const opts = await fetchRef.current(query.trim());
        setOptions(opts);
        setHighlight(0);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(seq);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  function choose(opt: SearchSelectOption) {
    onSelect(opt);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder={value ? undefined : placeholder}
        value={open ? query : valueLabel}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          if (!open) setOpen(true);
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, options.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const opt = options[highlight];
            if (opt) choose(opt);
          }
        }}
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Mencari…</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Tidak ada hasil.</div>
          ) : (
            options.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                className={cx(
                  "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm",
                  i === highlight
                    ? "bg-brand-50 text-brand-800 dark:bg-brand-600/20 dark:text-brand-100"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
                  opt.value === value && "font-semibold",
                )}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(opt)}
              >
                <span className="truncate">{opt.label}</span>
                {opt.hint ? <span className="shrink-0 text-xs text-slate-400">{opt.hint}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// --- ConfirmDialog ------------------------------------------------------------------

/**
 * Dialog konfirmasi berbrand — pengganti window.confirm untuk aksi berisiko
 * (arsip, batalkan dokumen, tutup buku, pelepasan aset, nonaktif 2FA).
 * Render selalu; kontrol lewat prop `open`. Escape/klik backdrop = batal.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  cancelLabel = "Batal",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-card border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {description ? <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{description}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Toast ------------------------------------------------------------------------

type Toast = { id: number; tone: "success" | "error"; message: string };
const ToastContext = createContext<(tone: Toast["tone"], message: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg",
              t.tone === "success" ? "bg-emerald-600" : "bg-red-600",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// --- Dark mode ----------------------------------------------------------------------

export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("erpindo-theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem("erpindo-theme", next ? "dark" : "light");
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }, []);

  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", dark);
  }
  return { dark, toggle };
}

import { Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  Boxes,
  CheckSquare,
  Coins,
  ExternalLink,
  Factory,
  FileSpreadsheet,
  Landmark,
  LineChart,
  Lightbulb,
  PiggyBank,
  Receipt,
  ReceiptText,
  Repeat,
  Rocket,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Target,
  Ticket,
  UsersRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { BrandWordmark, Button, useDarkMode } from "../../components/ui";
import { GUIDE_CATEGORIES, GUIDE_MODULES, guideBySlug, type GuideModule } from "./content";

/**
 * Panduan pengguna — halaman publik (tanpa login) yang juga ditautkan dari
 * dalam aplikasi. Konten di ./content (satu sumber; versi Markdown repo
 * di-generate scripts/export-panduan-md.mjs).
 */

const SLUG_ICONS: Record<string, LucideIcon> = {
  mulai: Rocket,
  pengaturan: Settings,
  produk: Boxes,
  kontak: UsersRound,
  pos: Store,
  penjualan: ReceiptText,
  pembelian: ShoppingCart,
  stok: Boxes,
  persetujuan: CheckSquare,
  akuntansi: BookOpenCheck,
  laporan: LineChart,
  pajak: FileSpreadsheet,
  anggaran: PiggyBank,
  aset: Landmark,
  kurs: Coins,
  konsolidasi: Coins,
  penggajian: Wallet,
  crm: Target,
  proyek: Receipt,
  kontrak: Repeat,
  manufaktur: Factory,
  maintenance: Wrench,
  helpdesk: Ticket,
};

function iconFor(slug: string): LucideIcon {
  return SLUG_ICONS[slug] ?? BookOpen;
}

function GuideHeader() {
  const { dark, toggle } = useDarkMode();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-brand-700 dark:text-brand-400">
          <BrandWordmark className="h-8" /> <span className="font-normal text-slate-400">/ panduan</span>
        </Link>
        <nav className="flex items-center gap-2">
          <button
            onClick={toggle}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Ganti tema terang/gelap"
          >
            {dark ? "☀" : "☾"}
          </button>
          <Link to="/masuk">
            <Button variant="ghost">Masuk</Button>
          </Link>
          <Link to="/daftar">
            <Button>Coba Gratis</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PanduanIndexPage() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = (m: GuideModule) =>
    !query ||
    m.title.toLowerCase().includes(query) ||
    m.intro.toLowerCase().includes(query) ||
    m.sections.some((s) => s.heading.toLowerCase().includes(query));

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <GuideHeader />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Panduan erpindo</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
            Cara memakai setiap fitur — dengan tangkapan layar asli dari aplikasi. Semua modul, dari faktur pertama
            sampai ekspor XML Coretax.
          </p>
          <div className="relative mx-auto mt-6 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari panduan… (mis. PPN, gaji, stok)"
              className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        </div>

        {GUIDE_CATEGORIES.map((cat) => {
          const visible = cat.modules.filter(matches);
          if (visible.length === 0) return null;
          return (
            <section key={cat.title} className="mt-10">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {cat.title}
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((m) => {
                  const Icon = iconFor(m.slug);
                  return (
                    <Link
                      key={m.slug}
                      to="/panduan/$modul"
                      params={{ modul: m.slug }}
                      className="group rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
                    >
                      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <h3 className="mt-3 font-semibold group-hover:text-brand-700 dark:group-hover:text-brand-300">
                        {m.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{m.intro}</p>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

        {GUIDE_MODULES.filter(matches).length === 0 ? (
          <p className="mt-12 text-center text-sm text-slate-500">Tidak ada panduan yang cocok dengan pencarian.</p>
        ) : null}
      </main>
    </div>
  );
}

export function PanduanModulePage() {
  const { modul } = useParams({ strict: false }) as { modul: string };
  const mod = guideBySlug(modul);
  const idx = GUIDE_MODULES.findIndex((m) => m.slug === modul);
  const prev = idx > 0 ? GUIDE_MODULES[idx - 1] : undefined;
  const next = idx >= 0 && idx < GUIDE_MODULES.length - 1 ? GUIDE_MODULES[idx + 1] : undefined;

  if (!mod) {
    return (
      <div className="min-h-full bg-slate-50 dark:bg-slate-950">
        <GuideHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <p className="text-slate-600 dark:text-slate-300">Panduan tidak ditemukan.</p>
          <Link to="/panduan" className="mt-4 inline-block text-brand-600 hover:underline dark:text-brand-400">
            ← Kembali ke daftar panduan
          </Link>
        </main>
      </div>
    );
  }

  const anchor = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <GuideHeader />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
        {/* TOC kiri (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-1 text-sm">
            <Link to="/panduan" className="mb-3 flex items-center gap-1.5 text-slate-500 hover:text-brand-600 dark:text-slate-400">
              <ArrowLeft className="size-3.5" aria-hidden /> Semua panduan
            </Link>
            <div className="font-semibold">{mod.title}</div>
            {mod.sections.map((s) => (
              <a
                key={s.heading}
                href={`#${anchor(s.heading)}`}
                className="block rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              >
                {s.heading}
              </a>
            ))}
          </div>
        </aside>

        <article className="min-w-0">
          <nav className="mb-4 text-sm text-slate-500 lg:hidden dark:text-slate-400">
            <Link to="/panduan" className="hover:text-brand-600">
              Panduan
            </Link>{" "}
            / {mod.title}
          </nav>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{mod.title}</h1>
            {mod.appPath ? (
              <a href={mod.appPath} target="_blank" rel="noreferrer">
                <Button variant="secondary" className="h-9">
                  Buka di aplikasi <ExternalLink className="size-3.5" aria-hidden />
                </Button>
              </a>
            ) : null}
          </div>
          <p className="mt-3 max-w-3xl text-lg text-slate-600 dark:text-slate-300">{mod.intro}</p>

          {mod.sections.map((s) => (
            <section key={s.heading} id={anchor(s.heading)} className="mt-10 scroll-mt-24">
              <h2 className="text-xl font-semibold">{s.heading}</h2>
              {s.body?.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3 max-w-3xl leading-relaxed text-slate-600 dark:text-slate-300">
                  {p}
                </p>
              ))}
              {s.steps ? (
                <ol className="mt-3 max-w-3xl list-decimal space-y-2 pl-5 text-slate-700 marker:font-semibold marker:text-brand-600 dark:text-slate-300 dark:marker:text-brand-400">
                  {s.steps.map((st) => (
                    <li key={st.slice(0, 40)}>{st}</li>
                  ))}
                </ol>
              ) : null}
              {s.image ? (
                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 shadow-card dark:border-slate-700">
                  <img
                    src={s.image}
                    alt={s.imageAlt ?? s.heading}
                    width={1280}
                    height={800}
                    loading="lazy"
                    decoding="async"
                    className="w-full"
                  />
                </div>
              ) : null}
              {s.tips?.length ? (
                <div className="mt-4 max-w-3xl rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-900 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-200">
                  {s.tips.map((t) => (
                    <p key={t.slice(0, 40)} className="flex items-start gap-2 py-0.5">
                      <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden /> {t}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          ))}

          <nav className="mt-14 flex items-center justify-between gap-3 border-t border-slate-200 pt-6 text-sm dark:border-slate-800">
            {prev ? (
              <Link
                to="/panduan/$modul"
                params={{ modul: prev.slug }}
                className="flex items-center gap-1.5 text-slate-600 hover:text-brand-600 dark:text-slate-300"
              >
                <ArrowLeft className="size-4" aria-hidden /> {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                to="/panduan/$modul"
                params={{ modul: next.slug }}
                className="flex items-center gap-1.5 text-right text-slate-600 hover:text-brand-600 dark:text-slate-300"
              >
                {next.title} <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </article>
      </main>
    </div>
  );
}

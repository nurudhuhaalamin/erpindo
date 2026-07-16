import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ExternalLink, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui";
import { GUIDE_CATEGORIES, GUIDE_MODULES, guideBySlug, type GuideModule } from "./panduan/content";
import { GuideSections, iconFor } from "./panduan";

/**
 * Panduan DALAM aplikasi (Fase 10f) — konten & renderer yang sama dengan
 * panduan publik (./panduan), tetapi dirender di dalam app shell (tanpa
 * GuideHeader) dan menaut ke rute internal /app/panduan sehingga pengguna tak
 * perlu berpindah situs.
 */

export function PanduanAppIndexPage() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const matches = (m: GuideModule) =>
    !query ||
    m.title.toLowerCase().includes(query) ||
    m.intro.toLowerCase().includes(query) ||
    m.sections.some((s) => s.heading.toLowerCase().includes(query));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Panduan</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Cara memakai setiap fitur — dari faktur pertama sampai ekspor pajak. Semua tanpa meninggalkan aplikasi.
      </p>
      <div className="relative mt-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari panduan… (mis. PPN, gaji, stok)"
          aria-label="Cari panduan"
          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      {GUIDE_CATEGORIES.map((cat) => {
        const visible = cat.modules.filter(matches);
        if (visible.length === 0) return null;
        return (
          <section key={cat.title} className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{cat.title}</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((m) => {
                const Icon = iconFor(m.slug);
                return (
                  <Link
                    key={m.slug}
                    to="/app/panduan/$modul"
                    params={{ modul: m.slug }}
                    className="group rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-3 font-semibold group-hover:text-brand-700 dark:group-hover:text-brand-300">{m.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{m.intro}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {GUIDE_MODULES.filter(matches).length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-500">Tidak ada panduan yang cocok dengan pencarian.</p>
      ) : null}
    </div>
  );
}

export function PanduanAppModulePage() {
  const { modul } = useParams({ strict: false }) as { modul: string };
  const mod = guideBySlug(modul);
  const idx = GUIDE_MODULES.findIndex((m) => m.slug === modul);
  const prev = idx > 0 ? GUIDE_MODULES[idx - 1] : undefined;
  const next = idx >= 0 && idx < GUIDE_MODULES.length - 1 ? GUIDE_MODULES[idx + 1] : undefined;

  if (!mod) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-center">
        <p className="text-slate-600 dark:text-slate-300">Panduan tidak ditemukan.</p>
        <Link to="/app/panduan" className="mt-4 inline-block text-brand-600 hover:underline dark:text-brand-400">
          ← Kembali ke daftar panduan
        </Link>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl">
      <Link to="/app/panduan" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 dark:text-slate-400">
        <ArrowLeft className="size-3.5" aria-hidden /> Semua panduan
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{mod.title}</h1>
        {mod.appPath ? (
          <Link to={mod.appPath}>
            <Button variant="secondary" className="h-9">
              Buka halaman <ExternalLink className="size-3.5" aria-hidden />
            </Button>
          </Link>
        ) : null}
      </div>

      <GuideSections mod={mod} />

      <nav className="mt-14 flex items-center justify-between gap-3 border-t border-slate-200 pt-6 text-sm dark:border-slate-800">
        {prev ? (
          <Link to="/app/panduan/$modul" params={{ modul: prev.slug }} className="flex items-center gap-1.5 text-slate-600 hover:text-brand-600 dark:text-slate-300">
            <ArrowLeft className="size-4" aria-hidden /> {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to="/app/panduan/$modul" params={{ modul: next.slug }} className="flex items-center gap-1.5 text-right text-slate-600 hover:text-brand-600 dark:text-slate-300">
            {next.title} <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}

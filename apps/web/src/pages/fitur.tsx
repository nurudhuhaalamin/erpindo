import { TRIAL_DAYS } from "@erpindo/shared";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";
import { BrandWordmark, Button, useDarkMode } from "../components/ui";
import { pick, useLang, type Lang } from "../i18n";
import { LangSwitcher } from "../i18n/LangSwitcher";
import { MODUL_DETAIL } from "./landing/fiturDetail";

/**
 * Halaman `/fitur` (Fase 18f) — penjelasan mendalam per modul.
 *
 * Alasan halaman ini berdiri sendiri, bukan ditambahkan ke halaman depan:
 * kedalaman yang dibutuhkan calon pembeli yang sedang membandingkan produk
 * akan membuat halaman depan kepanjangan bagi pengunjung yang baru mampir.
 * Halaman terpisah juga memberi satu alamat sendiri untuk mesin pencari.
 *
 * Isinya datang dari `landing/fiturDetail.ts` — satu sumber, supaya halaman
 * depan dan halaman ini tidak pernah saling bertentangan.
 *
 * SEO: `/fitur` disisipi JSON-LD + <noscript> oleh Worker
 * (`apps/api/src/routes/landingSeo.ts`) dan masuk `sitemap.xml`, sama seperti
 * halaman depan. Karena itu ia juga terdaftar di `run_worker_first`.
 */

function L(lang: Lang, id: string, en: string): string {
  return lang === "en" ? en : id;
}

function Header() {
  const { dark, toggle } = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const lang = useLang();
  const tautan: [string, { id: string; en: string }][] = [
    ["/", { id: "Beranda", en: "Home" }],
    ["/#harga", { id: "Harga", en: "Pricing" }],
    ["/panduan", { id: "Panduan", en: "Guide" }],
    ["/#faq", { id: "FAQ", en: "FAQ" }],
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <a href="/" className="flex h-16 items-center gap-2">
          <BrandWordmark className="h-8" />
        </a>
        <nav className="flex items-center gap-1">
          {tautan.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:block dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {label[lang]}
            </a>
          ))}
          <LangSwitcher className="hidden sm:inline-flex" />
          <button
            onClick={toggle}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Ganti tema terang/gelap"
            title="Ganti tema terang/gelap"
          >
            {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          </button>
          <Link to="/daftar">
            <Button size="sm">{L(lang, "Coba Gratis", "Try Free")}</Button>
          </Link>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/60 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </nav>
      </div>
      {menuOpen ? (
        <nav className="border-t border-slate-200 bg-slate-50 px-4 py-2 md:hidden dark:border-slate-800 dark:bg-slate-950">
          {tautan.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {label[lang]}
            </a>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

export function FiturPage() {
  const lang = useLang();
  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
          <h1 className="max-w-4xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            {L(lang, "Apa saja yang", "Everything ERPindo")}{" "}
            <span className="text-brand-600 dark:text-brand-400">
              {L(lang, "dikerjakan ERPindo", "actually does for you")}
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            {L(
              lang,
              "Bukan daftar kemampuan, tapi penjelasan tiap modul: masalah apa yang dipecahkan, bagaimana cara kerjanya di dalam aplikasi, dan hasil apa yang Anda dapat.",
              "Not a list of capabilities, but an explanation of each module: what problem it solves, how it works inside the app, and what you get out of it.",
            )}
          </p>

          {/* Daftar isi — halaman ini panjang, jadi pembaca perlu bisa melompat
              langsung ke modul yang ia pedulikan. */}
          <nav className="mt-10 flex flex-wrap gap-2" aria-label={L(lang, "Daftar modul", "Module list")}>
            {MODUL_DETAIL.map((m) => (
              <a
                key={m.id}
                href={`#${m.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-brand-300"
              >
                <m.icon className="size-4" aria-hidden />
                {pick(m.nama, lang)}
              </a>
            ))}
          </nav>
        </section>

        {MODUL_DETAIL.map((m, i) => (
          <section
            key={m.id}
            id={m.id}
            className={`scroll-mt-20 ${i % 2 === 1 ? "bg-white dark:bg-slate-900" : ""}`}
          >
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
              <div className="grid items-start gap-10 lg:grid-cols-2">
                <div>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/60 dark:text-brand-300">
                    <m.icon className="size-5" aria-hidden />
                  </span>
                  <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                    {pick(m.nama, lang)}
                  </h2>

                  <p className="mt-5 border-l-2 border-slate-300 pl-4 text-base italic leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    {pick(m.masalah, lang)}
                  </p>

                  <h3 className="mt-8 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {L(lang, "Bagaimana ERPindo mengerjakannya", "How ERPindo does it")}
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {m.cara.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-start gap-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
                      >
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-hidden
                        />
                        {pick(c, lang)}
                      </li>
                    ))}
                  </ul>

                  <p className="mt-6 rounded-card border border-brand-200 bg-brand-50 p-4 text-sm font-medium leading-relaxed text-brand-900 dark:border-brand-900 dark:bg-brand-950/40 dark:text-brand-100">
                    {pick(m.hasil, lang)}
                  </p>
                </div>

                <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card lg:sticky lg:top-24 dark:border-slate-700 dark:bg-slate-900">
                  <img
                    src={m.gambar}
                    alt={`${L(lang, "Tampilan", "View of")} ${pick(m.nama, lang)} — ${pick(m.hasil, lang)}`}
                    width={1280}
                    height={800}
                    loading="lazy"
                    decoding="async"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </section>
        ))}

        <section className="px-4 pb-20 pt-4 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-card bg-brand-600 px-8 py-12 text-white shadow-lg sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {L(lang, "Lihat sendiri dengan data contoh", "See it yourself with sample data")}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-50">
                {L(
                  lang,
                  `Masuk ke perusahaan demo yang datanya sudah terisi lengkap — tanpa daftar. Atau mulai gratis ${TRIAL_DAYS} hari dengan data Anda sendiri.`,
                  `Enter a demo company already filled with data — no signup. Or start ${TRIAL_DAYS} days free with your own data.`,
                )}
              </p>
            </div>
            <Link to="/daftar" className="shrink-0">
              <Button variant="secondary" size="lg">
                {L(lang, "Mulai Gratis", "Start Free")} <ArrowRight className="size-4" aria-hidden />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:text-slate-400">
          <BrandWordmark className="h-7" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a href="/" className="hover:text-slate-900 dark:hover:text-white">
              {L(lang, "Beranda", "Home")}
            </a>
            <a href="/#harga" className="hover:text-slate-900 dark:hover:text-white">
              {L(lang, "Harga", "Pricing")}
            </a>
            <a href="/panduan" className="hover:text-slate-900 dark:hover:text-white">
              {L(lang, "Panduan", "Guide")}
            </a>
            <Link to="/masuk" className="hover:text-slate-900 dark:hover:text-white">
              {L(lang, "Masuk", "Sign in")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

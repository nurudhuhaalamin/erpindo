import { ASSUMED_PER_USER_PRICE, perUserMonthlyCost, PLAN_LIMITS, TRIAL_DAYS, demoRequestSchema } from "@erpindo/shared";
import { Link } from "@tanstack/react-router";
import { Check, Eye, Menu, Moon, ShieldCheck, Sparkles, Sun, X } from "lucide-react";
import { useState } from "react";
import { api } from "../../api/client";
import { BrandWordmark, Button, useDarkMode } from "../../components/ui";
import { pick, useLang, type Lang } from "../../i18n";
import { LangSwitcher } from "../../i18n/LangSwitcher";
import {
  CATEGORY_COMPARISON,
  CATEGORY_COMPARISON_HEADERS,
  COMPARISON,
  FAQ,
  FEATURE_GROUPS,
  formatRupiah,
  SECURITY_POINTS,
  SHOWCASE,
  SINGLE_PLAN_MODULES,
  TRUST_POINTS,
} from "./sections";

/**
 * Landing page marketing — halaman konversi utama. Konten di sections.ts;
 * gambar produk asli (WebP) dilayani statis dari /landing/*.
 */

const NAV_LINKS: [string, { id: string; en: string }][] = [
  ["#fitur", { id: "Fitur", en: "Features" }],
  ["#harga", { id: "Harga", en: "Pricing" }],
  ["/panduan", { id: "Panduan", en: "Guide" }],
  ["#faq", { id: "FAQ", en: "FAQ" }],
];

/** Helper pilih string sesuai bahasa aktif (landing). */
function L(lang: Lang, id: string, en: string): string {
  return lang === "en" ? en : id;
}

function Header() {
  const { dark, toggle } = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const lang = useLang();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <span className="flex items-center gap-2">
          <BrandWordmark className="h-9" />
        </span>
        <nav className="flex items-center gap-1 sm:gap-2">
          {NAV_LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="hidden rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 md:block dark:text-slate-300 dark:hover:text-white"
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
          <Link to="/masuk" className="hidden sm:block">
            <Button variant="ghost">{L(lang, "Masuk", "Sign in")}</Button>
          </Link>
          <Link to="/daftar">
            <Button className="px-3 sm:px-4">{L(lang, "Coba Gratis", "Try Free")}</Button>
          </Link>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </nav>
      </div>
      {menuOpen ? (
        <nav className="border-t border-slate-200 bg-slate-50 px-4 py-2 md:hidden dark:border-slate-800 dark:bg-slate-950">
          {NAV_LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {label[lang]}
            </a>
          ))}
          <Link
            to="/masuk"
            onClick={() => setMenuOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200/60 sm:hidden dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {L(lang, "Masuk", "Sign in")}
          </Link>
          <div className="px-3 py-2 sm:hidden">
            <LangSwitcher />
          </div>
        </nav>
      ) : null}
    </header>
  );
}

/**
 * Tombol "Lihat Demo" — membuat sesi baca-saja di perusahaan demo tanpa
 * mendaftar (POST /api/auth/demo), lalu pindah ke aplikasi. Navigasi keras
 * agar sesi & /me dimuat segar.
 */
function DemoButton({ size = "lg" }: { size?: "md" | "lg" }) {
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-col items-center">
      <Button
        variant="secondary"
        size={size}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          api
            .demoLogin()
            .then(() => window.location.assign("/app"))
            .catch((err: Error) => {
              setError(err.message || L(lang, "Demo sedang tidak tersedia. Coba daftar gratis saja.", "Demo is unavailable right now. Try signing up free instead."));
              setBusy(false);
            });
        }}
      >
        <Eye className="size-4" aria-hidden /> {busy ? L(lang, "Menyiapkan demo…", "Preparing demo…") : L(lang, "Lihat Demo", "View Demo")}
      </Button>
      {error ? <span className="mt-1 text-xs text-red-500">{error}</span> : null}
    </span>
  );
}

function Hero() {
  const lang = useLang();
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-96 max-w-4xl bg-brand-400/25 blur-3xl dark:bg-brand-600/20" />
      <div className="mx-auto max-w-4xl px-4 pt-14 text-center sm:px-6 sm:pt-20">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
          <Sparkles className="size-3.5" aria-hidden />{" "}
          {L(lang, "ERP lengkap untuk bisnis Indonesia", "Complete ERP for Indonesian business")}
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          {L(lang, "Pembukuan, stok, gaji, dan pajak —", "Accounting, stock, payroll, and tax —")}{" "}
          <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent dark:from-brand-400 dark:to-brand-300">
            {L(lang, "beres dalam satu aplikasi", "all in one app")}
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          {L(
            lang,
            "Catat transaksi sekali — jurnal double-entry, stok, laporan keuangan, PPN, sampai PPh 21 karyawan beres sendiri. Siap Coretax 2026.",
            "Record once — double-entry journals, inventory, financial reports, VAT, and payroll tax all handled automatically. Ready for Coretax 2026.",
          )}
        </p>
        <div className="mt-8 flex flex-wrap items-start justify-center gap-3">
          <Link to="/daftar">
            <Button size="lg">
              {L(lang, `Coba Gratis ${TRIAL_DAYS} Hari`, `Try Free for ${TRIAL_DAYS} Days`)}
            </Button>
          </Link>
          <DemoButton />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {L(
            lang,
            "Tanpa kartu kredit · siap dipakai dalam 1 menit · demo tanpa daftar",
            "No credit card · ready in 1 minute · demo without signing up",
          )}
        </p>
      </div>

      {/* Screenshot produk nyata dalam bingkai browser */}
      <div className="mx-auto mt-12 max-w-5xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-brand-900/10 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800">
            <span className="size-2.5 rounded-full bg-red-400" />
            <span className="size-2.5 rounded-full bg-amber-400" />
            <span className="size-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 hidden rounded-md bg-white px-3 py-0.5 text-xs text-slate-400 sm:block dark:bg-slate-700 dark:text-slate-300">
              erpindo — Dashboard
            </span>
          </div>
          <img
            src="/landing/hero-dashboard.webp"
            alt="Dashboard erpindo dengan grafik penjualan 30 hari dan ringkasan keuangan"
            width={1400}
            height={875}
            className="w-full"
            fetchPriority="high"
          />
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  const lang = useLang();
  return (
    <section className="mt-14 border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
        {TRUST_POINTS.map((s) => (
          <div key={s.label.id} className="text-center">
            <div className="text-xl font-bold text-brand-600 dark:text-brand-400">{pick(s.value, lang)}</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{pick(s.label, lang)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Showcase() {
  const lang = useLang();
  const [active, setActive] = useState("pos");
  const item = SHOWCASE.find((s) => s.id === active) ?? SHOWCASE[0]!;
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl font-bold tracking-tight">{L(lang, "Lihat cara kerjanya", "See how it works")}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
        {L(lang, "Lima alur yang paling sering dipakai UMKM — semuanya otomatis masuk pembukuan.", "Five flows SMEs use most — all automatically flowing into the books.")}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {SHOWCASE.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              s.id === active
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            }`}
          >
            <s.icon className="size-4" aria-hidden /> {pick(s.label, lang)}
          </button>
        ))}
      </div>
      <div className="mt-8 grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-900">
          <img
            key={item.image}
            src={item.image}
            alt={`${L(lang, "Tampilan", "View of")} ${pick(item.title, lang)} — ${pick(item.benefits[0]!, lang)}`}
            width={1100}
            height={688}
            loading="lazy"
            decoding="async"
            className="w-full"
          />
        </div>
        <div>
          <h3 className="text-xl font-semibold">{pick(item.title, lang)}</h3>
          <ul className="mt-4 space-y-3">
            {item.benefits.map((b) => (
              <li key={b.id} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700 dark:bg-accent-500/20 dark:text-accent-300">
                  <Check className="size-3.5" aria-hidden />
                </span>
                {pick(b, lang)}
              </li>
            ))}
          </ul>
          <Link to="/daftar" className="mt-6 inline-block">
            <Button variant="secondary">{L(lang, "Coba alur ini gratis →", "Try this flow free →")}</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeaturesGrid() {
  const lang = useLang();
  return (
    <section id="fitur" className="scroll-mt-16 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">{L(lang, "Satu sistem untuk seluruh operasional", "One system for all your operations")}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
          {L(lang, "Semua modul saling terhubung dan otomatis masuk pembukuan — tidak perlu banyak aplikasi.", "Every module is connected and automatically flows into the books — no juggling many apps.")}
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_GROUPS.map((f) => (
            <div
              key={f.title.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-950"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                <f.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-semibold">{pick(f.title, lang)}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{pick(f.desc, lang)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  const lang = useLang();
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl font-bold tracking-tight">{L(lang, "Masih pakai buku & Excel?", "Still using ledgers & Excel?")}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
        {L(lang, "Waktu Anda lebih berharga daripada menyalin angka. Bandingkan sendiri.", "Your time is worth more than copying numbers. See for yourself.")}
      </p>
      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-2xl border border-slate-200 text-sm dark:border-slate-800">
          <thead>
            <tr className="bg-slate-100 text-left dark:bg-slate-900">
              <th className="px-4 py-3 font-semibold">{L(lang, "Pekerjaan", "Task")}</th>
              <th className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">{L(lang, "Manual / Excel", "Manual / Excel")}</th>
              <th className="bg-brand-600 px-4 py-3 font-semibold text-white">{L(lang, "Dengan erpindo", "With erpindo")}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row, i) => (
              <tr key={row.topic.id} className={i % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50 dark:bg-slate-900/60"}>
                <td className="px-4 py-3 font-medium">{pick(row.topic, lang)}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                  <span className="flex items-start gap-2">
                    <X className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden /> {pick(row.manual, lang)}
                  </span>
                </td>
                <td className="bg-brand-50/60 px-4 py-3 text-slate-700 dark:bg-brand-950/40 dark:text-slate-200">
                  <span className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden /> {pick(row.erpindo, lang)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type TierInfo = { plan: "starter" | "business" | "enterprise"; tagline: { id: string; en: string }; features: { id: string; en: string }[]; popular?: boolean };
const TIER_INFO: TierInfo[] = [
  {
    plan: "starter",
    tagline: { id: "Untuk toko, jasa & usaha keluarga", en: "For shops, services & family businesses" },
    features: [
      { id: "Akuntansi, penjualan & pembelian", en: "Accounting, sales & purchasing" },
      { id: "Kasir (POS) + stok multi-gudang", en: "POS + multi-warehouse stock" },
      { id: "Pajak: PPN, PPh final, e-Faktur", en: "Tax: VAT, final income tax, e-Faktur" },
      { id: "Semua laporan keuangan", en: "All financial reports" },
      { id: "Pengguna tak terbatas", en: "Unlimited users" },
    ],
  },
  {
    plan: "business",
    tagline: { id: "Untuk PT dengan tim & proses", en: "For companies with teams & processes" },
    popular: true,
    features: [
      { id: "Semua di Starter, plus:", en: "Everything in Starter, plus:" },
      { id: "HR & Payroll (PPh 21 TER + BPJS)", en: "HR & Payroll (income tax + social security)" },
      { id: "Proyek, manufaktur & pengadaan", en: "Projects, manufacturing & procurement" },
      { id: "Persetujuan berjenjang + peran kustom", en: "Multi-level approvals + custom roles" },
      { id: "CRM pipeline & kontrak berulang", en: "CRM pipeline & recurring contracts" },
    ],
  },
  {
    plan: "enterprise",
    tagline: { id: "Untuk grup, multi-cabang & holding", en: "For groups, multi-branch & holdings" },
    features: [
      { id: "Semua di Business, plus:", en: "Everything in Business, plus:" },
      { id: `Multi-entitas (${PLAN_LIMITS.enterprise.maxEntities} perusahaan) + konsolidasi`, en: `Multi-entity (${PLAN_LIMITS.enterprise.maxEntities} companies) + consolidation` },
      { id: "Dimensi / cost center per cabang", en: "Dimensions / cost centers per branch" },
      { id: "API publik & webhook", en: "Public API & webhooks" },
      { id: "Keamanan lanjutan + dukungan prioritas", en: "Advanced security + priority support" },
    ],
  },
];

/** Kalkulator perbandingan implisit: biaya sistem per-pengguna vs ERPindo tetap. */
function PerUserCalculator() {
  const lang = useLang();
  const [users, setUsers] = useState(20);
  const perUser = perUserMonthlyCost(users);
  return (
    <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900/60">
      <h3 className="text-center font-semibold">{L(lang, "Bandingkan dengan sistem yang menagih per pengguna", "Compare with systems that charge per user")}</h3>
      <label className="mt-4 block text-sm text-slate-600 dark:text-slate-300">
        {L(lang, "Jumlah pengguna di tim Anda:", "Number of users on your team:")} <span className="font-semibold text-slate-900 dark:text-white">{users}</span>
        <input
          type="range"
          min={1}
          max={100}
          value={users}
          onChange={(e) => setUsers(Number(e.target.value))}
          aria-label={L(lang, "Jumlah pengguna", "Number of users")}
          className="mt-2 w-full accent-brand-600"
        />
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center dark:border-slate-800 dark:bg-slate-950">
          <div className="text-xs text-slate-400">{L(lang, `Sistem per-pengguna (± ${formatRupiah(ASSUMED_PER_USER_PRICE)}/user)`, `Per-user system (± ${formatRupiah(ASSUMED_PER_USER_PRICE)}/user)`)}</div>
          <div className="mt-1 text-2xl font-bold text-slate-500 line-through">{formatRupiah(perUser)}</div>
          <div className="text-xs text-slate-400">{L(lang, "per bulan", "per month")}</div>
        </div>
        <div className="rounded-xl border border-brand-500 bg-brand-50/60 p-3 text-center dark:bg-brand-950/40">
          <div className="text-xs text-brand-700 dark:text-brand-300">{L(lang, "Dengan ERPindo (Business)", "With ERPindo (Business)")}</div>
          <div className="mt-1 text-2xl font-bold text-brand-700 dark:text-brand-300">{formatRupiah(PLAN_LIMITS.business.pricePerMonth)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{L(lang, "satu harga, berapa pun jumlah tim", "one price, whatever your team size")}</div>
        </div>
      </div>
      <p className="mt-4 text-center text-sm">
        <span className="text-slate-600 dark:text-slate-300">{L(lang, "Hemat sekitar ", "Save about ")}</span>
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          {formatRupiah(Math.max(0, perUser - PLAN_LIMITS.business.pricePerMonth))}
        </span>
        <span className="text-slate-600 dark:text-slate-300">{L(lang, ` per bulan untuk ${users} pengguna.`, ` per month for ${users} users.`)}</span>
      </p>
    </div>
  );
}

function CategoryComparison() {
  const lang = useLang();
  return (
    <div className="mt-14">
      <h3 className="text-center text-xl font-semibold">{L(lang, "Di mana posisi ERPindo?", "Where does ERPindo fit?")}</h3>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 overflow-hidden rounded-2xl border border-slate-200 text-sm dark:border-slate-800">
          <thead>
            <tr className="bg-slate-100 text-left dark:bg-slate-900">
              <th className="px-3 py-3 font-semibold"> </th>
              {CATEGORY_COMPARISON_HEADERS.map((h) => (
                <th
                  key={h.id}
                  className={`px-3 py-3 font-semibold ${h.id === "ERPindo" ? "bg-brand-600 text-white" : "text-slate-500 dark:text-slate-400"}`}
                >
                  {pick(h, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_COMPARISON.map((row, i) => (
              <tr key={row.label.id} className={i % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50 dark:bg-slate-900/60"}>
                <td className="px-3 py-2.5 font-medium">{pick(row.label, lang)}</td>
                {row.rows.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2.5 ${j === row.rows.length - 1 ? "bg-brand-50/60 font-medium text-slate-800 dark:bg-brand-950/40 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
                  >
                    {pick(cell, lang)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">{L(lang, "Perbandingan per kategori solusi — bukan merek tertentu.", "Compared by solution category — not specific brands.")}</p>
    </div>
  );
}

function Pricing() {
  const lang = useLang();
  return (
    <section id="harga" className="scroll-mt-16 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">
          {L(lang, "Satu sistem, dari toko pertama sampai grup perusahaan", "One system, from your first shop to a group of companies")}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
          {L(lang, "Pengguna", "Users are")} <span className="font-semibold">{L(lang, "selalu tak terbatas", "always unlimited")}</span>{" "}
          {L(lang, `di semua paket. Mulai gratis ${TRIAL_DAYS} hari dengan akses penuh — tanpa kartu kredit.`, `on every plan. Start free for ${TRIAL_DAYS} days with full access — no credit card.`)}
        </p>

        <div className="mx-auto mt-10 grid max-w-5xl gap-5 lg:grid-cols-3">
          {TIER_INFO.map((tier) => {
            const info = PLAN_LIMITS[tier.plan];
            return (
              <div
                key={tier.plan}
                className={`relative flex flex-col rounded-2xl border bg-white p-6 dark:bg-slate-950 ${
                  tier.popular ? "border-brand-500 shadow-lg shadow-brand-500/10 lg:-mt-2 lg:mb-2" : "border-slate-200 dark:border-slate-800"
                }`}
              >
                {tier.popular ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-0.5 text-xs font-semibold text-white">
                    {L(lang, "Paling populer", "Most popular")}
                  </span>
                ) : null}
                <h3 className="text-lg font-semibold">{info.label}</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{tier.tagline[lang]}</p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-bold">{formatRupiah(info.pricePerMonth)}</span>
                  <span className="pb-1 text-sm font-normal text-slate-400">{L(lang, "/bulan", "/month")}</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {tier.features.map((f) => (
                    <li key={f.id} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> {f[lang]}
                    </li>
                  ))}
                </ul>
                <Link to="/daftar" className="mt-5">
                  <Button variant={tier.popular ? "primary" : "secondary"} className="w-full">
                    {L(lang, `Mulai Gratis ${TRIAL_DAYS} Hari`, `Start Free — ${TRIAL_DAYS} Days`)}
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {L(lang, "Semua paket termasuk:", "Every plan includes:")} {SINGLE_PLAN_MODULES.slice(0, 6).map((m) => pick(m, lang)).join(" · ")}
          {L(lang, ", dan banyak lagi. Harga belum termasuk PPN.", ", and much more. Prices exclude VAT.")}
        </p>

        <PerUserCalculator />
        <CategoryComparison />

        {/* Untuk grup & holding + layanan implementasi */}
        <div className="mt-14 grid gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:grid-cols-2 sm:p-8 dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <h3 className="text-xl font-semibold">{L(lang, "Untuk grup & holding", "For groups & holdings")}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {L(
                lang,
                `Kelola beberapa badan usaha dalam satu akun dengan laporan konsolidasi lintas perusahaan, dimensi per cabang, dan dukungan prioritas. Paket Enterprise sudah mencakup ${PLAN_LIMITS.enterprise.maxEntities} entitas.`,
                `Manage several entities from one account with cross-company consolidated reports, per-branch dimensions, and priority support. The Enterprise plan already covers ${PLAN_LIMITS.enterprise.maxEntities} entities.`,
              )}
            </p>
          </div>
          <div>
            <h3 className="text-xl font-semibold">{L(lang, "Layanan pendampingan", "Implementation support")}</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {L(
                lang,
                "Butuh migrasi data dari sistem lama, penyusunan bagan akun, atau pelatihan tim? Tim kami siap mendampingi implementasi Anda — hubungi kami untuk penawaran.",
                "Need data migration from an old system, chart-of-accounts setup, or team training? Our team is ready to guide your implementation — contact us for a quote.",
              )}
            </p>
            <a href="#demo" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
              {L(lang, "Jadwalkan demo & konsultasi →", "Schedule a demo & consultation →")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function DemoRequest() {
  const lang = useLang();
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", employees: "", message: "" });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = demoRequestSchema.safeParse(form);
    if (!parsed.success) {
      setError(L(lang, "Mohon lengkapi nama, perusahaan, dan email yang valid.", "Please provide a valid name, company, and email."));
      return;
    }
    setBusy(true);
    try {
      await api.submitDemoRequest(parsed.data);
      setSent(true);
    } catch (err) {
      setError((err as Error).message || L(lang, "Gagal mengirim. Coba lagi.", "Failed to send. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950";
  return (
    <section id="demo" className="scroll-mt-16 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">{L(lang, "Jadwalkan demo", "Schedule a demo")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-slate-600 dark:text-slate-300">
          {L(
            lang,
            "Ingin melihat ERPindo untuk perusahaan Anda, atau butuh pendampingan implementasi? Tinggalkan kontak — tim kami menghubungi Anda.",
            "Want to see ERPindo for your company, or need implementation support? Leave your contact — our team will reach out.",
          )}
        </p>
        {sent ? (
          <div className="mt-8 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-950/40">
            <Check className="mx-auto size-8 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <p className="mt-2 font-medium">{L(lang, "Terima kasih! Permintaan Anda sudah kami terima.", "Thank you! We've received your request.")}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{L(lang, "Tim kami akan menghubungi Anda secepatnya.", "Our team will contact you shortly.")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 grid gap-3 sm:grid-cols-2">
            <input className={field} placeholder={L(lang, "Nama Anda", "Your name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Nama" />
            <input className={field} placeholder={L(lang, "Nama perusahaan", "Company name")} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} aria-label="Perusahaan" />
            <input className={field} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label="Email" />
            <input className={field} placeholder={L(lang, "No. WhatsApp (opsional)", "WhatsApp no. (optional)")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="Telepon" />
            <input className={`${field} sm:col-span-2`} placeholder={L(lang, "Perkiraan jumlah karyawan (opsional)", "Approx. number of employees (optional)")} value={form.employees} onChange={(e) => setForm({ ...form, employees: e.target.value })} aria-label="Jumlah karyawan" />
            <textarea className={`${field} sm:col-span-2`} rows={3} placeholder={L(lang, "Pesan / kebutuhan (opsional)", "Message / needs (optional)")} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} aria-label="Pesan" />
            {error ? <p className="text-sm text-red-600 sm:col-span-2 dark:text-red-400">{error}</p> : null}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy} className="w-full sm:w-auto">
                {busy ? L(lang, "Mengirim…", "Sending…") : L(lang, "Kirim permintaan demo", "Send demo request")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function Security() {
  const lang = useLang();
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl font-bold tracking-tight">{L(lang, "Data bisnis Anda, aman di tangan Anda", "Your business data, safe in your hands")}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
        {L(lang, "Kami merancang ERPindo agar Anda tidak pernah terkunci — bukan sekadar aman, tapi juga bebas.", "We built ERPindo so you're never locked in — not just secure, but free.")}
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {SECURITY_POINTS.map((s) => (
          <div key={s.title.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="font-semibold">{pick(s.title, lang)}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{pick(s.desc, lang)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  const lang = useLang();
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl font-bold tracking-tight">{L(lang, "Pertanyaan umum", "Frequently asked questions")}</h2>
      <div className="mt-8 space-y-3">
        {FAQ.map((item) => (
          <details
            key={item.q.id}
            className="group rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
              {pick(item.q, lang)}
              <span className="ml-4 text-slate-400 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{pick(item.a, lang)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  const lang = useLang();
  return (
    <section className="px-4 pb-16 sm:px-6">
      <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-12 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">{L(lang, "Siap merapikan bisnis Anda?", "Ready to tidy up your business?")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-brand-50">
          {L(
            lang,
            `Coba semua fitur gratis ${TRIAL_DAYS} hari. Tanpa kartu kredit · batal kapan saja · data Anda bisa diekspor kapan pun.`,
            `Try all features free for ${TRIAL_DAYS} days. No credit card · cancel anytime · export your data whenever you want.`,
          )}
        </p>
        <div className="mt-6">
          <Link to="/daftar">
            <Button variant="secondary" size="lg">
              {L(lang, "Mulai Sekarang", "Get Started")}
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const lang = useLang();
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6 dark:text-slate-400">
        <div>
          <div className="flex items-center gap-2">
            <BrandWordmark className="h-8" />
          </div>
          <p className="mt-1 text-xs">{L(lang, "Integrate. Automate. Grow. — ERP untuk UMKM Indonesia.", "Integrate. Automate. Grow. — ERP for Indonesian SMEs.")}</p>
        </div>
        <div className="flex items-center gap-4">
          <a href="#fitur" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Fitur", "Features")}</a>
          <a href="#harga" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Harga", "Pricing")}</a>
          <a href="/panduan" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Panduan", "Guide")}</a>
          {/* Blog dilayani server-side (SEO) — navigasi keras, bukan rute SPA. */}
          <a href="/blog" className="hover:text-slate-900 dark:hover:text-white">Blog</a>
          <a href="#faq" className="hover:text-slate-900 dark:hover:text-white">FAQ</a>
          <Link to="/masuk" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Masuk", "Sign in")}</Link>
          <Link to="/daftar" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Daftar", "Sign up")}</Link>
        </div>
      </div>
      <div className="pb-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} erpindo</div>
    </footer>
  );
}

/**
 * Kompatibilitas & kepatuhan (Fase 14e) — bukti sosial faktual (bukan testimoni
 * karangan): alat & standar yang benar-benar didukung produk.
 */
function IntegrationBadges() {
  const lang = useLang();
  const items = [
    L(lang, "Pembayaran Midtrans (QRIS/VA/e-wallet)", "Midtrans payments (QRIS/VA/e-wallet)"),
    L(lang, "e-Faktur & Coretax DJP", "e-Faktur & Coretax (Indonesian tax)"),
    L(lang, "PPh 21 (TER) & BPJS", "Payroll tax (PPh 21 TER) & BPJS"),
    L(lang, "Backup Google Drive", "Google Drive backup"),
    L(lang, "Tagih via WhatsApp", "Billing via WhatsApp"),
    L(lang, "Impor Shopee · Tokopedia · TikTok Shop", "Import Shopee · Tokopedia · TikTok Shop"),
  ];
  return (
    <section className="px-4 py-10 sm:px-6">
      <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {L(lang, "Kompatibel dengan alat & standar yang Anda pakai", "Works with the tools & standards you already use")}
      </p>
      <div className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center justify-center gap-2.5">
        {items.map((it) => (
          <span
            key={it}
            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {it}
          </span>
        ))}
      </div>
    </section>
  );
}

/** CTA lengket di bawah layar mobile (Fase 14e) — konversi di perangkat kecil. */
function StickyMobileCta() {
  const lang = useLang();
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:hidden dark:border-slate-700 dark:bg-slate-900/95">
      <Link to="/daftar" className="flex-1">
        <Button className="w-full">{L(lang, `Coba Gratis ${TRIAL_DAYS} Hari`, `Try Free ${TRIAL_DAYS} Days`)}</Button>
      </Link>
      <a href="#demo" className="shrink-0">
        <Button variant="secondary">{L(lang, "Hubungi", "Contact")}</Button>
      </a>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header />
      {/* pb ekstra di mobile agar CTA lengket tak menutup konten akhir */}
      <main className="flex-1 pb-20 sm:pb-0">
        <Hero />
        <TrustBar />
        <IntegrationBadges />
        <Showcase />
        <FeaturesGrid />
        <Comparison />
        <Pricing />
        <Security />
        <DemoRequest />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
      <StickyMobileCta />
    </div>
  );
}

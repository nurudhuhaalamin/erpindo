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
  ["/fitur", { id: "Fitur", en: "Features" }],
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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <span className="flex h-16 items-center gap-2">
          <BrandWordmark className="h-8" />
        </span>
        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(([href, label]) => (
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
            className="rounded p-1.5 text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Ganti tema terang/gelap"
            title="Ganti tema terang/gelap"
          >
            {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          </button>
          <Link to="/masuk" className="hidden sm:block">
            <Button variant="ghost" size="sm">{L(lang, "Masuk", "Sign in")}</Button>
          </Link>
          <Link to="/daftar">
            <Button size="sm">{L(lang, "Coba Gratis", "Try Free")}</Button>
          </Link>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded p-1.5 text-slate-500 hover:bg-slate-200/60 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </nav>
      </div>
      {menuOpen ? (
        <nav className="border-t border-slate-200 bg-slate-50 px-4 py-1.5 md:hidden dark:border-slate-800 dark:bg-slate-950">
          {NAV_LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="block rounded px-2.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-200/60 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {label[lang]}
            </a>
          ))}
          <Link
            to="/masuk"
            onClick={() => setMenuOpen(false)}
            className="block rounded px-2.5 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-200/60 sm:hidden dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {L(lang, "Masuk", "Sign in")}
          </Link>
          <div className="px-2.5 py-2 sm:hidden">
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
    <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
      {/* Kisi tipis menggantikan "orb" gradien buram khas landing SaaS. Gaya
          alat: garis, bukan kabut. Digambar dengan gradien CSS (tanpa aset). */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.035] dark:opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "linear-gradient(to bottom, black, transparent 78%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 78%)",
        }}
        aria-hidden
      />
      <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
        {/* `uppercase` aman di sini: tak satu pun asersi membaca kalimat ini.
            Aturannya (lihat log 17d): JANGAN pakai `uppercase` pada teks yang
            dibaca asersi innerText — `text-transform` ikut mengubah nilainya. */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
          <Sparkles className="size-3.5" aria-hidden />{" "}
          {L(lang, "ERP lengkap untuk bisnis Indonesia", "Complete ERP for Indonesian business")}
        </div>
        {/* Rata kiri, bukan rata tengah: halaman ini menjual alat kerja, dan
            teks rata tengah membuat semuanya terbaca seperti brosur. */}
        <h1 className="max-w-4xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
          {L(lang, "Pembukuan, stok, gaji, dan pajak —", "Accounting, stock, payroll, and tax —")}{" "}
          <span className="text-brand-600 dark:text-brand-400">
            {L(lang, "beres dalam satu aplikasi", "all in one app")}
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
          {L(
            lang,
            "Berhenti menyalin angka dari nota ke Excel. Sekali catat, jurnal double-entry, stok, laporan keuangan, PPN, sampai PPh 21 karyawan ikut terisi sendiri — dan neracanya dijamin seimbang.",
            "Stop copying numbers from receipts into Excel. Record once, and journals, stock, financial reports, VAT, and payroll tax all fill themselves in — with a balance sheet guaranteed to balance.",
          )}
        </p>
        <div className="mt-9 flex flex-wrap items-start gap-3">
          <Link to="/daftar">
            <Button size="lg">
              {L(lang, `Coba Gratis ${TRIAL_DAYS} Hari`, `Try Free for ${TRIAL_DAYS} Days`)}
            </Button>
          </Link>
          <DemoButton />
        </div>
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {L(
            lang,
            "Tanpa kartu kredit · bagan akun standar Indonesia sudah terpasang · demo tanpa daftar",
            "No credit card · a standard Indonesian chart of accounts is preloaded · demo without signing up",
          )}
        </p>
      </div>

      {/* Screenshot produk nyata. Bingkainya bukan lagi jendela macOS bertitik
          tiga (klise landing SaaS) melainkan bilah alat rapat dengan jalur rute
          bergaya mono — sama seperti aplikasinya sendiri. */}
      <div className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              erpindo / dashboard
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
  // Angka memakai utilitas `num` (mono + tabular) — di sinilah font angka yang
  // ditambahkan Fase 17a terbayar: deretan statistik jadi berbaris rapi.
  return (
    <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-slate-200 px-4 sm:px-6 lg:grid-cols-4 lg:divide-x dark:divide-slate-800">
        {TRUST_POINTS.map((s) => (
          <div key={s.label.id} className="px-4 py-6 first:pl-0 lg:last:pr-0">
            <div className="num text-2xl font-bold text-brand-600 dark:text-brand-400">{pick(s.value, lang)}</div>
            <div className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{pick(s.label, lang)}</div>
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
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{L(lang, "Lihat cara kerjanya", "See how it works")}</h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
        {L(lang, "Lima pekerjaan yang paling menyita waktu tiap hari. Pilih satu untuk melihat bentuk nyatanya di dalam aplikasi.", "The five jobs that eat the most time every day. Pick one to see what it actually looks like inside the app.")}
      </p>
      {/* Tab bergaya bilah alat: sudut tegas, berdempetan dalam satu bingkai —
          bukan pil melayang berbayang. */}
      <div className="mt-8 flex flex-wrap gap-2">
        {SHOWCASE.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              s.id === active
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <s.icon className="size-4" aria-hidden /> {pick(s.label, lang)}
          </button>
        ))}
      </div>
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-900">
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
        <div className="rounded-card border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-lg font-semibold">{pick(item.title, lang)}</h3>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {item.benefits.map((b) => (
              <li key={b.id} className="flex items-start gap-2.5 py-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent-500" aria-hidden />
                {pick(b, lang)}
              </li>
            ))}
          </ul>
          <Link to="/daftar" className="mt-4 inline-block">
            <Button variant="secondary" size="sm">{L(lang, "Coba alur ini gratis →", "Try this flow free →")}</Button>
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
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{L(lang, "Satu sistem untuk seluruh operasional", "One system for all your operations")}</h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
          {L(lang, "Tidak ada modul yang berdiri sendiri. Apa pun yang Anda catat di satu tempat langsung terbaca di tempat lain — tanpa impor-ekspor antar aplikasi.", "No module stands alone. Whatever you record in one place is immediately readable in another — no importing and exporting between apps.")}
        </p>
        {/* Kisi rapat berbagi garis (gap-px di atas latar garis) — modul terlihat
            sebagai satu sistem yang menyatu, bukan kartu-kartu terpisah. */}
        <div
          data-kisi="modul"
          className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURE_GROUPS.map((f) => (
            <div key={f.title.id} className="rounded-card border border-slate-200 bg-white p-5 shadow-card transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/60 dark:text-brand-300">
                <f.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-3.5 text-base font-semibold">{pick(f.title, lang)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{pick(f.desc, lang)}</p>
            </div>
          ))}
          {/* Sel terakhir mengisi sisa kisi. FEATURE_GROUPS berisi 11 modul
              sedangkan kisinya 3 kolom (12 slot); pada tata letak lama yang
              memakai kartu terpisah lubang itu tak terlihat, tetapi kisi
              berbagi-garis membuatnya menganga. Diisi ajakan, bukan ruang mati. */}
          <div className="flex flex-col justify-center rounded-card border border-brand-200 bg-brand-50 p-5 dark:border-brand-900 dark:bg-brand-950/40">
            <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">
              {L(lang, "Semua modul termasuk di setiap paket.", "Every module is included in every plan.")}
            </p>
            <a
              href="/fitur"
              className="mt-2 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {L(lang, "Lihat penjelasan tiap modul →", "See what each module does →")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  const lang = useLang();
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{L(lang, "Masih pakai buku & Excel?", "Still using ledgers & Excel?")}</h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
        {L(lang, "Bukan soal rapi atau tidak rapi — soal berapa jam yang hilang tiap bulan, dan berapa selisih yang baru ketahuan saat tutup buku.", "It is not about being tidy — it is about the hours lost each month, and the discrepancies you only find at closing.")}
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-card border border-slate-200 text-[13px] dark:border-slate-800">
          <thead>
            <tr className="bg-slate-100 text-left dark:bg-slate-900">
              <th className="px-3 py-2 text-[11px] font-semibold tracking-wider">{L(lang, "Pekerjaan", "Task")}</th>
              <th className="px-3 py-2 text-[11px] font-semibold tracking-wider text-slate-500 dark:text-slate-400">{L(lang, "Manual / Excel", "Manual / Excel")}</th>
              <th className="bg-brand-600 px-3 py-2 text-[11px] font-semibold tracking-wider text-white">{L(lang, "Dengan erpindo", "With erpindo")}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row, i) => (
              <tr key={row.topic.id} className={i % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50 dark:bg-slate-900/60"}>
                <td className="px-3 py-2 font-medium">{pick(row.topic, lang)}</td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                  <span className="flex items-start gap-2">
                    <X className="mt-0.5 size-3.5 shrink-0 text-red-400" aria-hidden /> {pick(row.manual, lang)}
                  </span>
                </td>
                <td className="bg-brand-50/60 px-3 py-2 text-slate-700 dark:bg-brand-950/40 dark:text-slate-200">
                  <span className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" aria-hidden /> {pick(row.erpindo, lang)}
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
    <div className="mx-auto mt-10 max-w-2xl rounded-card border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <h3 className="text-sm font-semibold">{L(lang, "Bandingkan dengan sistem yang menagih per pengguna", "Compare with systems that charge per user")}</h3>
      <label className="mt-3 block text-[13px] text-slate-600 dark:text-slate-300">
        {L(lang, "Jumlah pengguna di tim Anda:", "Number of users on your team:")}{" "}
        <span className="num font-semibold text-slate-900 dark:text-white">{users}</span>
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
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="text-[11px] text-slate-400">{L(lang, `Sistem per-pengguna (± ${formatRupiah(ASSUMED_PER_USER_PRICE)}/user)`, `Per-user system (± ${formatRupiah(ASSUMED_PER_USER_PRICE)}/user)`)}</div>
          <div className="num mt-1 text-xl font-bold text-slate-500 line-through">{formatRupiah(perUser)}</div>
          <div className="text-[11px] text-slate-400">{L(lang, "per bulan", "per month")}</div>
        </div>
        <div className="rounded border border-brand-500 bg-brand-50/60 p-3 dark:bg-brand-950/40">
          <div className="text-[11px] text-brand-700 dark:text-brand-300">{L(lang, "Dengan ERPindo (Business)", "With ERPindo (Business)")}</div>
          <div className="num mt-1 text-xl font-bold text-brand-700 dark:text-brand-300">{formatRupiah(PLAN_LIMITS.business.pricePerMonth)}</div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">{L(lang, "satu harga, berapa pun jumlah tim", "one price, whatever your team size")}</div>
        </div>
      </div>
      <p className="mt-3 border-t border-slate-200 pt-3 text-[13px] dark:border-slate-800">
        <span className="text-slate-600 dark:text-slate-300">{L(lang, "Hemat sekitar ", "Save about ")}</span>
        <span className="num font-bold text-emerald-600 dark:text-emerald-400">
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
    <div className="mt-12">
      <h3 className="text-base font-semibold">{L(lang, "Di mana posisi ERPindo?", "Where does ERPindo fit?")}</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 overflow-hidden rounded-card border border-slate-200 text-[13px] dark:border-slate-800">
          <thead>
            <tr className="bg-slate-100 text-left dark:bg-slate-900">
              <th className="px-3 py-2 font-semibold"> </th>
              {CATEGORY_COMPARISON_HEADERS.map((h) => (
                <th
                  key={h.id}
                  className={`px-3 py-2 text-[11px] font-semibold tracking-wider ${h.id === "ERPindo" ? "bg-brand-600 text-white" : "text-slate-500 dark:text-slate-400"}`}
                >
                  {pick(h, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_COMPARISON.map((row, i) => (
              <tr key={row.label.id} className={i % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50 dark:bg-slate-900/60"}>
                <td className="px-3 py-2 font-medium">{pick(row.label, lang)}</td>
                {row.rows.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 ${j === row.rows.length - 1 ? "bg-brand-50/60 font-medium text-slate-800 dark:bg-brand-950/40 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
                  >
                    {pick(cell, lang)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">{L(lang, "Perbandingan per kategori solusi — bukan merek tertentu.", "Compared by solution category — not specific brands.")}</p>
    </div>
  );
}

function Pricing() {
  const lang = useLang();
  return (
    <section id="harga" className="scroll-mt-16 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {L(lang, "Satu sistem, dari toko pertama sampai grup perusahaan", "One system, from your first shop to a group of companies")}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
          {L(lang, "Pengguna", "Users are")} <span className="font-semibold">{L(lang, "selalu tak terbatas", "always unlimited")}</span>{" "}
          {L(lang, `di semua paket. Mulai gratis ${TRIAL_DAYS} hari dengan akses penuh — tanpa kartu kredit.`, `on every plan. Start free for ${TRIAL_DAYS} days with full access — no credit card.`)}
        </p>

        {/* Kartu paket berbagi satu garis, tanpa kartu "populer" yang diangkat
            dan diberi bayangan — penandanya cukup garis merek + lencana datar. */}
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {TIER_INFO.map((tier) => {
            const info = PLAN_LIMITS[tier.plan];
            return (
              <div
                key={tier.plan}
                className={`relative flex flex-col rounded-card border bg-white p-6 dark:bg-slate-900 ${
                  tier.popular
                    ? "border-brand-500 shadow-md ring-1 ring-brand-500/20"
                    : "border-slate-200 shadow-card dark:border-slate-800"
                }`}
              >
                {/* Lencana TANPA `uppercase`: asersi ui-sim membaca innerText,
                    dan `text-transform` ikut mengubah nilainya — "Most popular"
                    akan terbaca "MOST POPULAR" lalu asersinya gagal. */}
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">{info.label}</h3>
                  {tier.popular ? (
                    <span className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                      {L(lang, "Paling populer", "Most popular")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{tier.tagline[lang]}</p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="num text-2xl font-bold">{formatRupiah(info.pricePerMonth)}</span>
                  <span className="pb-0.5 text-[13px] font-normal text-slate-400">{L(lang, "/bulan", "/month")}</span>
                </div>
                <ul className="mt-4 flex-1 divide-y divide-slate-100 text-[13px] dark:divide-slate-800">
                  {tier.features.map((f) => (
                    <li key={f.id} className="flex items-start gap-2 py-1.5">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> {f[lang]}
                    </li>
                  ))}
                </ul>
                <Link to="/daftar" className="mt-4">
                  <Button variant={tier.popular ? "primary" : "secondary"} className="w-full">
                    {L(lang, `Mulai Gratis ${TRIAL_DAYS} Hari`, `Start Free — ${TRIAL_DAYS} Days`)}
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[13px] text-slate-500 dark:text-slate-400">
          {L(lang, "Semua paket termasuk:", "Every plan includes:")} {SINGLE_PLAN_MODULES.slice(0, 6).map((m) => pick(m, lang)).join(" · ")}
          {L(lang, ", dan banyak lagi. Harga belum termasuk PPN.", ", and much more. Prices exclude VAT.")}
        </p>

        <PerUserCalculator />
        <CategoryComparison />

        {/* Untuk grup & holding + layanan implementasi */}
        <div className="mt-12 grid gap-5 rounded-card border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-900/60">
          <div>
            <h3 className="text-base font-semibold">{L(lang, "Untuk grup & holding", "For groups & holdings")}</h3>
            <p className="mt-2 text-[13px] text-slate-600 dark:text-slate-300">
              {L(
                lang,
                `Kelola beberapa badan usaha dalam satu akun dengan laporan konsolidasi lintas perusahaan, dimensi per cabang, dan dukungan prioritas. Paket Enterprise sudah mencakup ${PLAN_LIMITS.enterprise.maxEntities} entitas.`,
                `Manage several entities from one account with cross-company consolidated reports, per-branch dimensions, and priority support. The Enterprise plan already covers ${PLAN_LIMITS.enterprise.maxEntities} entities.`,
              )}
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold">{L(lang, "Layanan pendampingan", "Implementation support")}</h3>
            <p className="mt-2 text-[13px] text-slate-600 dark:text-slate-300">
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

  const field = "w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-950";
  return (
    <section id="demo" className="scroll-mt-16 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{L(lang, "Jadwalkan demo", "Schedule a demo")}</h2>
        <p className="mt-2 text-[15px] text-slate-600 dark:text-slate-300">
          {L(
            lang,
            "Ingin melihat ERPindo untuk perusahaan Anda, atau butuh pendampingan implementasi? Tinggalkan kontak — tim kami menghubungi Anda.",
            "Want to see ERPindo for your company, or need implementation support? Leave your contact — our team will reach out.",
          )}
        </p>
        {sent ? (
          <div className="mt-6 rounded-card border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/40">
            <Check className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <p className="mt-2 font-medium">{L(lang, "Terima kasih! Permintaan Anda sudah kami terima.", "Thank you! We've received your request.")}</p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">{L(lang, "Tim kami akan menghubungi Anda secepatnya.", "Our team will contact you shortly.")}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-2 sm:grid-cols-2">
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
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{L(lang, "Data bisnis Anda, aman di tangan Anda", "Your business data, safe in your hands")}</h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
        {L(lang, "Aman itu perlu, tapi tidak cukup. Anda juga harus bisa pergi kapan saja dan membawa seluruh data Anda.", "Secure is necessary, but not enough. You should also be able to leave whenever you want — and take all your data with you.")}
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {SECURITY_POINTS.map((s) => (
          <div key={s.title.id} className="flex items-start gap-3.5 rounded-card border border-slate-200 bg-white p-5 shadow-card dark:border-slate-800 dark:bg-slate-900">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="text-base font-semibold">{pick(s.title, lang)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{pick(s.desc, lang)}</p>
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
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-20 sm:px-6">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{L(lang, "Pertanyaan umum", "Frequently asked questions")}</h2>
      {/* Daftar menyatu berpembatas garis, bukan tumpukan kartu terpisah. */}
      <div className="mt-10 divide-y divide-slate-200 overflow-hidden rounded-card border border-slate-200 bg-white shadow-card dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {FAQ.map((item) => (
          <details key={item.q.id} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
              {pick(item.q, lang)}
              <span className="ml-4 text-slate-400 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{pick(item.a, lang)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  const lang = useLang();
  return (
    <section className="px-4 pb-14 sm:px-6">
      {/* Gradien dua-warna diganti bidang merek datar berbingkai — pita CTA
          bergradien adalah salah satu penanda paling khas "SaaS umum". */}
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-card bg-brand-600 px-8 py-12 text-white shadow-lg sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{L(lang, "Siap merapikan bisnis Anda?", "Ready to tidy up your business?")}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-brand-50">
            {L(
              lang,
              `Coba semua fitur gratis ${TRIAL_DAYS} hari. Tanpa kartu kredit · batal kapan saja · data Anda bisa diekspor kapan pun.`,
              `Try all features free for ${TRIAL_DAYS} days. No credit card · cancel anytime · export your data whenever you want.`,
            )}
          </p>
        </div>
        <Link to="/daftar" className="shrink-0">
          <Button variant="secondary" size="lg">
            {L(lang, "Mulai Sekarang", "Get Started")}
          </Button>
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  const lang = useLang();
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-6 text-[13px] text-slate-500 sm:flex-row sm:items-center sm:px-6 dark:text-slate-400">
        <div>
          <div className="flex items-center gap-2">
            <BrandWordmark className="h-7" />
          </div>
          <p className="mt-1 text-xs">{L(lang, "Integrate. Automate. Grow. — ERP untuk UMKM Indonesia.", "Integrate. Automate. Grow. — ERP for Indonesian SMEs.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a href="/fitur" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Fitur", "Features")}</a>
          <a href="#harga" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Harga", "Pricing")}</a>
          <a href="/panduan" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Panduan", "Guide")}</a>
          {/* Blog dilayani server-side (SEO) — navigasi keras, bukan rute SPA. */}
          <a href="/blog" className="hover:text-slate-900 dark:hover:text-white">Blog</a>
          <a href="#faq" className="hover:text-slate-900 dark:hover:text-white">FAQ</a>
          <Link to="/masuk" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Masuk", "Sign in")}</Link>
          <Link to="/daftar" className="hover:text-slate-900 dark:hover:text-white">{L(lang, "Daftar", "Sign up")}</Link>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-5 text-xs text-slate-400 sm:px-6">© {new Date().getFullYear()} erpindo</div>
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
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {L(lang, "Kompatibel dengan alat & standar yang Anda pakai", "Works with the tools & standards you already use")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {items.map((it) => (
          <span
            key={it}
            className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
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
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-slate-200 bg-white/95 p-2 backdrop-blur sm:hidden dark:border-slate-700 dark:bg-slate-900/95">
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

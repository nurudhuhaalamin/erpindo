import { SINGLE_PLAN, TRIAL_DAYS } from "@erpindo/shared";
import { Link } from "@tanstack/react-router";
import { Check, Eye, Menu, Moon, ShieldCheck, Sparkles, Sun, X } from "lucide-react";
import { useState } from "react";
import { api } from "../../api/client";
import { BrandWordmark, Button, useDarkMode } from "../../components/ui";
import {
  COMPARISON,
  FAQ,
  FEATURE_GROUPS,
  formatRupiah,
  SECURITY_POINTS,
  SHOWCASE,
  SINGLE_PLAN_MODULES,
  SINGLE_PLAN_PERKS,
  TRUST_POINTS,
} from "./sections";

/**
 * Landing page marketing — halaman konversi utama. Konten di sections.ts;
 * gambar produk asli (WebP) dilayani statis dari /landing/*.
 */

const NAV_LINKS = [
  ["#fitur", "Fitur"],
  ["#harga", "Harga"],
  ["/panduan", "Panduan"],
  ["#faq", "FAQ"],
] as const;

function Header() {
  const { dark, toggle } = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);
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
              {label}
            </a>
          ))}
          <button
            onClick={toggle}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Ganti tema terang/gelap"
            title="Ganti tema terang/gelap"
          >
            {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          </button>
          <Link to="/masuk" className="hidden sm:block">
            <Button variant="ghost">Masuk</Button>
          </Link>
          <Link to="/daftar">
            <Button className="px-3 sm:px-4">Coba Gratis</Button>
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
              {label}
            </a>
          ))}
          <Link
            to="/masuk"
            onClick={() => setMenuOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200/60 sm:hidden dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Masuk
          </Link>
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
              setError(err.message || "Demo sedang tidak tersedia. Coba daftar gratis saja.");
              setBusy(false);
            });
        }}
      >
        <Eye className="size-4" aria-hidden /> {busy ? "Menyiapkan demo…" : "Lihat Demo"}
      </Button>
      {error ? <span className="mt-1 text-xs text-red-500">{error}</span> : null}
    </span>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-96 max-w-4xl bg-brand-400/25 blur-3xl dark:bg-brand-600/20" />
      <div className="mx-auto max-w-4xl px-4 pt-14 text-center sm:px-6 sm:pt-20">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
          <Sparkles className="size-3.5" aria-hidden /> ERP lengkap untuk UMKM Indonesia
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Pembukuan, stok, gaji, dan pajak —{" "}
          <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent dark:from-brand-400 dark:to-brand-300">
            beres dalam satu aplikasi
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          Catat transaksi sekali — jurnal double-entry, stok, laporan keuangan, PPN, sampai PPh 21 karyawan beres
          sendiri. Siap Coretax 2026.
        </p>
        <div className="mt-8 flex flex-wrap items-start justify-center gap-3">
          <Link to="/daftar">
            <Button size="lg">Coba Gratis {TRIAL_DAYS} Hari</Button>
          </Link>
          <DemoButton />
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Tanpa kartu kredit · siap dipakai dalam 1 menit · demo tanpa daftar
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
  return (
    <section className="mt-14 border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
        {TRUST_POINTS.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-xl font-bold text-brand-600 dark:text-brand-400">{s.value}</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Showcase() {
  const [active, setActive] = useState("pos");
  const item = SHOWCASE.find((s) => s.id === active) ?? SHOWCASE[0]!;
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl font-bold tracking-tight">Lihat cara kerjanya</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
        Lima alur yang paling sering dipakai UMKM — semuanya otomatis masuk pembukuan.
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
            <s.icon className="size-4" aria-hidden /> {s.label}
          </button>
        ))}
      </div>
      <div className="mt-8 grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-900">
          <img
            key={item.image}
            src={item.image}
            alt={item.title}
            width={1100}
            height={688}
            loading="lazy"
            decoding="async"
            className="w-full"
          />
        </div>
        <div>
          <h3 className="text-xl font-semibold">{item.title}</h3>
          <ul className="mt-4 space-y-3">
            {item.benefits.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700 dark:bg-accent-500/20 dark:text-accent-300">
                  <Check className="size-3.5" aria-hidden />
                </span>
                {b}
              </li>
            ))}
          </ul>
          <Link to="/daftar" className="mt-6 inline-block">
            <Button variant="secondary">Coba alur ini gratis →</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeaturesGrid() {
  return (
    <section id="fitur" className="scroll-mt-16 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">Satu sistem untuk seluruh operasional</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
          Semua modul saling terhubung dan otomatis masuk pembukuan — tidak perlu banyak aplikasi.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_GROUPS.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-950"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                <f.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl font-bold tracking-tight">Masih pakai buku &amp; Excel?</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
        Waktu Anda lebih berharga daripada menyalin angka. Bandingkan sendiri.
      </p>
      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 overflow-hidden rounded-2xl border border-slate-200 text-sm dark:border-slate-800">
          <thead>
            <tr className="bg-slate-100 text-left dark:bg-slate-900">
              <th className="px-4 py-3 font-semibold">Pekerjaan</th>
              <th className="px-4 py-3 font-semibold text-slate-500 dark:text-slate-400">Manual / Excel</th>
              <th className="bg-brand-600 px-4 py-3 font-semibold text-white">Dengan erpindo</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row, i) => (
              <tr key={row.topic} className={i % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50 dark:bg-slate-900/60"}>
                <td className="px-4 py-3 font-medium">{row.topic}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                  <span className="flex items-start gap-2">
                    <X className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden /> {row.manual}
                  </span>
                </td>
                <td className="bg-brand-50/60 px-4 py-3 text-slate-700 dark:bg-brand-950/40 dark:text-slate-200">
                  <span className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden /> {row.erpindo}
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

function Pricing() {
  return (
    <section id="harga" className="scroll-mt-16 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight">Satu harga. Semua fitur. Titik.</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
          Tidak ada tingkatan paket, tidak ada fitur yang dikunci, tidak ada biaya per pengguna. Mulai gratis{" "}
          {TRIAL_DAYS} hari — lalu satu harga untuk seluruh sistem.
        </p>
        <div className="mx-auto mt-10 max-w-3xl">
          <div className="relative flex flex-col rounded-2xl border border-brand-500 bg-white p-6 shadow-lg shadow-brand-500/10 sm:p-8 dark:bg-slate-950">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-0.5 text-xs font-semibold text-white">
              Semua yang Anda butuhkan
            </span>
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <h3 className="text-lg font-semibold">Paket {SINGLE_PLAN.label}</h3>
                <div className="mt-2 flex items-end gap-1">
                  <span className="text-4xl font-bold">{formatRupiah(SINGLE_PLAN.pricePerMonth)}</span>
                  <span className="pb-1.5 text-sm font-normal text-slate-400">/bulan</span>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Gratis penuh {TRIAL_DAYS} hari pertama — tanpa kartu kredit.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto">
                <Link to="/daftar">
                  <Button className="w-full sm:w-44">Mulai Gratis</Button>
                </Link>
                <DemoButton size="md" />
              </div>
            </div>
            <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-2">
              {SINGLE_PLAN_PERKS.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> {p}
                </li>
              ))}
            </ul>
            <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Semua modul termasuk — tanpa tambahan biaya
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-slate-600 sm:grid-cols-3 lg:grid-cols-4 dark:text-slate-300">
                {SINGLE_PLAN_MODULES.map((m) => (
                  <li key={m} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand-500" aria-hidden /> {m}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Harga belum termasuk PPN. Pembayaran online sedang disiapkan — untuk saat ini aktivasi via hubungi kami.
        </p>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl font-bold tracking-tight">Data bisnis Anda, aman di tangan Anda</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
        Kami merancang ERPindo agar Anda tidak pernah terkunci — bukan sekadar aman, tapi juga bebas.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {SECURITY_POINTS.map((s) => (
          <div key={s.title} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-16 px-4 py-16 sm:px-6">
      <h2 className="text-center text-3xl font-bold tracking-tight">Pertanyaan umum</h2>
      <div className="mt-8 space-y-3">
        {FAQ.map((item) => (
          <details
            key={item.q}
            className="group rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
              {item.q}
              <span className="ml-4 text-slate-400 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="px-4 pb-16 sm:px-6">
      <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-12 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight">Siap merapikan bisnis Anda?</h2>
        <p className="mx-auto mt-3 max-w-xl text-brand-50">
          Coba semua fitur gratis {TRIAL_DAYS} hari. Tanpa kartu kredit, tanpa ribet.
        </p>
        <div className="mt-6">
          <Link to="/daftar">
            <Button variant="secondary" size="lg">
              Mulai Sekarang
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6 dark:text-slate-400">
        <div>
          <div className="flex items-center gap-2">
            <BrandWordmark className="h-8" />
          </div>
          <p className="mt-1 text-xs">Integrate. Automate. Grow. — ERP untuk UMKM Indonesia.</p>
        </div>
        <div className="flex items-center gap-4">
          <a href="#fitur" className="hover:text-slate-900 dark:hover:text-white">Fitur</a>
          <a href="#harga" className="hover:text-slate-900 dark:hover:text-white">Harga</a>
          <a href="/panduan" className="hover:text-slate-900 dark:hover:text-white">Panduan</a>
          {/* Blog dilayani server-side (SEO) — navigasi keras, bukan rute SPA. */}
          <a href="/blog" className="hover:text-slate-900 dark:hover:text-white">Blog</a>
          <a href="#faq" className="hover:text-slate-900 dark:hover:text-white">FAQ</a>
          <Link to="/masuk" className="hover:text-slate-900 dark:hover:text-white">Masuk</Link>
          <Link to="/daftar" className="hover:text-slate-900 dark:hover:text-white">Daftar</Link>
        </div>
      </div>
      <div className="pb-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} erpindo</div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header />
      <main className="flex-1">
        <Hero />
        <TrustBar />
        <Showcase />
        <FeaturesGrid />
        <Comparison />
        <Pricing />
        <Security />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}

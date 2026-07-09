import { PLAN_LABELS, PLAN_LIMITS, TRIAL_DAYS, type Plan } from "@erpindo/shared";
import { Link } from "@tanstack/react-router";
import {
  BookOpenCheck,
  Boxes,
  Check,
  Coins,
  Factory,
  FileSpreadsheet,
  Landmark,
  LifeBuoy,
  Moon,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  Sun,
  Target,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Button, useDarkMode } from "../components/ui";

// Kelompok fitur — mencerminkan seluruh modul yang sudah rilis.
const FEATURE_GROUPS: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: BookOpenCheck, title: "Keuangan & Akuntansi", desc: "Jurnal double-entry otomatis, buku besar, neraca, laba rugi, arus kas, dan tutup buku." },
  { icon: ReceiptText, title: "Faktur & Pembayaran", desc: "Faktur jual/beli, PPN otomatis, cetak/PDF berkop, catat sampai lunas, retur nota kredit." },
  { icon: Boxes, title: "Stok & Gudang", desc: "Stok multi-gudang, HPP rata-rata, lot & kedaluwarsa (FEFO), transfer, dan stok opname." },
  { icon: Store, title: "Kasir (POS)", desc: "Layar kasir cepat, sesi shift kas, cetak struk, dan tetap jalan saat offline." },
  { icon: Target, title: "CRM & Helpdesk", desc: "Pipeline lead & penawaran, konversi ke pelanggan, plus tiket dukungan pelanggan." },
  { icon: UsersRound, title: "HR & Payroll", desc: "Data karyawan, gaji, hitung PPh 21 metode TER + BPJS, slip gaji & jurnal otomatis." },
  { icon: Landmark, title: "Aset & Maintenance", desc: "Register aset, penyusutan otomatis, jadwal servis berkala, dan work order berbiaya." },
  { icon: Factory, title: "Manufaktur & QC", desc: "Bill of Materials, perintah produksi biaya gabungan, dan inspeksi QC lulus/karantina." },
  { icon: Coins, title: "Multi-perusahaan & Valas", desc: "Kelola banyak perusahaan satu akun, laporan konsolidasi, dan faktur multi mata uang." },
  { icon: FileSpreadsheet, title: "Pajak & Kepatuhan", desc: "Ekspor e-Faktur, PPN, dan PPh 21 — mengikuti standar perpajakan Indonesia." },
  { icon: ShieldCheck, title: "Keamanan & Platform", desc: "Database terpisah tiap perusahaan, peran akses, 2FA, audit log, dan PWA offline." },
];

const STATS = [
  { value: "40+", label: "modul bisnis siap pakai" },
  { value: "360+", label: "uji otomatis tiap rilis" },
  { value: "1 DB", label: "terpisah tiap perusahaan" },
  { value: "PPN · PPh 21 · e-Faktur", label: "standar pajak Indonesia" },
];

const PLAN_CARDS: { plan: Exclude<Plan, "trial">; tagline: string; highlight?: boolean; perks: string[] }[] = [
  {
    plan: "starter",
    tagline: "Untuk usaha kecil yang mulai rapi",
    perks: ["Semua fitur inti & lanjutan", "Laporan lengkap + ekspor Excel", "PWA — jalan di HP & offline", "Dukungan via email"],
  },
  {
    plan: "business",
    tagline: "Untuk tim yang sedang bertumbuh",
    highlight: true,
    perks: ["Semua fitur, tanpa batasan", "Lebih banyak anggota tim", "Multi-gudang & persetujuan", "Dukungan prioritas"],
  },
  {
    plan: "enterprise",
    tagline: "Skala besar & multi-perusahaan",
    perks: ["Pengguna tak terbatas", "Konsolidasi multi-perusahaan", "Onboarding & migrasi data", "SLA + manajer akun khusus"],
  },
];

const FAQ = [
  { q: "Apakah butuh kartu kredit untuk mencoba?", a: `Tidak. Uji coba ${TRIAL_DAYS} hari gratis dengan semua fitur — tanpa kartu kredit, siap dipakai dalam 1 menit.` },
  { q: "Apakah data saya aman dan terpisah?", a: "Ya. Setiap perusahaan punya database sendiri (terisolasi), dilengkapi peran & hak akses, verifikasi dua langkah (2FA), audit log, dan tutup buku." },
  { q: "Bisakah mengelola beberapa perusahaan?", a: "Bisa — dari satu akun Anda dapat membuat beberapa badan usaha, lalu melihat laporan Laba Rugi & Neraca konsolidasi lintas perusahaan." },
  { q: "Apakah mendukung PPN dan e-Faktur?", a: "Ya. PPN dihitung otomatis di faktur, dan Anda bisa mengekspor CSV faktur ber-PPN untuk diimpor ke aplikasi e-Faktur DJP. Payroll juga menghitung PPh 21 metode TER + BPJS." },
  { q: "Bisakah dipakai saat offline?", a: "Bisa. erpindo adalah PWA yang bisa dipasang di HP/tablet/komputer dan tetap terbuka saat koneksi terputus." },
  { q: "Bagaimana cara pembayaran langganan?", a: "Saat ini aktivasi paket dilakukan dengan menghubungi kami. Pembayaran online (QRIS/transfer/e-wallet) sedang disiapkan." },
];

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function LandingPage() {
  const { dark, toggle } = useDarkMode();

  return (
    <div className="flex min-h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2 text-xl font-bold tracking-tight text-brand-700 dark:text-brand-400">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
              e
            </span>
            erpindo
          </span>
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <a href="#fitur" className="hidden rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 sm:block dark:text-slate-300 dark:hover:text-white">
              Fitur
            </a>
            <a href="#harga" className="hidden rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 sm:block dark:text-slate-300 dark:hover:text-white">
              Harga
            </a>
            <button
              onClick={toggle}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Ganti tema terang/gelap"
              title="Ganti tema terang/gelap"
            >
              {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
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

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-72 max-w-3xl bg-brand-400/20 blur-3xl dark:bg-brand-600/20" />
          <div className="mx-auto max-w-3xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-24">
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
              <Sparkles className="size-3.5" aria-hidden /> Akuntansi, kasir, stok, HR, sampai manufaktur — satu aplikasi
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              ERP lengkap untuk <span className="text-brand-600 dark:text-brand-400">UMKM Indonesia</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300">
              Dari faktur & pembukuan double-entry, kasir POS, stok, sampai payroll PPh 21 dan e-Faktur. Catat transaksi
              sekali — jurnal, stok, dan laporan beres sendiri.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/daftar">
                <Button className="h-11 px-6">Coba Gratis {TRIAL_DAYS} Hari</Button>
              </Link>
              <a href="#fitur">
                <Button variant="secondary" className="h-11 px-6">
                  Lihat Fitur
                </Button>
              </a>
            </div>
            <p className="mt-3 text-xs text-slate-400">Tanpa kartu kredit · siap dipakai dalam 1 menit</p>
          </div>
        </section>

        {/* Statistik */}
        <section className="border-y border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold text-brand-600 dark:text-brand-400">{s.value}</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Fitur per kategori */}
        <section id="fitur" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight">Satu sistem untuk seluruh operasional</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
            Semua modul saling terhubung dan otomatis masuk pembukuan — tidak perlu banyak aplikasi.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_GROUPS.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Harga */}
        <section id="harga" className="border-t border-slate-200 bg-white scroll-mt-16 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight">Harga sederhana, tanpa kejutan</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-900 dark:text-white">Semua fitur tersedia di setiap paket.</span> Anda
              hanya memilih jumlah pengguna & tingkat dukungan. Mulai gratis {TRIAL_DAYS} hari.
            </p>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {PLAN_CARDS.map((card) => {
                const limit = PLAN_LIMITS[card.plan];
                const unlimited = limit.maxUsers >= Number.MAX_SAFE_INTEGER;
                return (
                  <div
                    key={card.plan}
                    className={`relative flex flex-col rounded-2xl border bg-white p-6 dark:bg-slate-950 ${
                      card.highlight
                        ? "border-brand-500 shadow-lg shadow-brand-500/10"
                        : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    {card.highlight ? (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-0.5 text-xs font-semibold text-white">
                        Terpopuler
                      </span>
                    ) : null}
                    <h3 className="font-semibold">{PLAN_LABELS[card.plan]}</h3>
                    <div className="mt-2 flex items-end gap-1">
                      <span className="text-3xl font-bold">{formatRupiah(limit.pricePerMonth)}</span>
                      <span className="pb-1 text-sm font-normal text-slate-400">/bulan</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{card.tagline}</p>
                    <div className="mt-3 text-sm font-medium text-brand-700 dark:text-brand-300">
                      {unlimited ? "Pengguna tak terbatas" : `Hingga ${limit.maxUsers} pengguna`}
                    </div>
                    <ul className="mt-4 flex-1 space-y-2 text-sm">
                      {card.perks.map((p) => (
                        <li key={p} className="flex items-start gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> {p}
                        </li>
                      ))}
                    </ul>
                    <Link to="/daftar" className="mt-6 block">
                      <Button variant={card.highlight ? "primary" : "secondary"} className="w-full">
                        Mulai Gratis
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-center text-xs text-slate-400">
              Harga belum termasuk PPN. Pembayaran online sedang disiapkan — untuk saat ini aktivasi via hubungi kami.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
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

        {/* CTA */}
        <section className="px-4 pb-16 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-12 text-center text-white">
            <h2 className="text-3xl font-bold tracking-tight">Siap merapikan bisnis Anda?</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-50">
              Coba semua fitur gratis {TRIAL_DAYS} hari. Tanpa kartu kredit, tanpa ribet.
            </p>
            <div className="mt-6">
              <Link to="/daftar">
                <Button variant="secondary" className="h-11 px-6">
                  Mulai Sekarang
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:px-6 dark:text-slate-400">
          <div>
            <div className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-400">
              <LifeBuoy className="size-4" aria-hidden /> erpindo
            </div>
            <p className="mt-1 text-xs">ERP untuk UMKM Indonesia — akuntansi sampai manufaktur.</p>
          </div>
          <div className="flex items-center gap-4">
            <a href="#fitur" className="hover:text-slate-900 dark:hover:text-white">Fitur</a>
            <a href="#harga" className="hover:text-slate-900 dark:hover:text-white">Harga</a>
            <Link to="/masuk" className="hover:text-slate-900 dark:hover:text-white">Masuk</Link>
            <Link to="/daftar" className="hover:text-slate-900 dark:hover:text-white">Daftar</Link>
          </div>
        </div>
        <div className="pb-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} erpindo</div>
      </footer>
    </div>
  );
}

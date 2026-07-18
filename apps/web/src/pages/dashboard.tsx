// ---------------------------------------------------------------------------
// Dashboard (dipisah dari app.tsx pada Fase 9d — nama ekspor tak berubah:
// app.tsx me-re-export DashboardPage sehingga import lama tetap jalan).
// ---------------------------------------------------------------------------
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, LineChart, Receipt, Check, ShoppingCart, SlidersHorizontal, Target, TrendingUp, Users, Wallet, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { api, formatDate, formatIDR } from "../api/client";
import { Alert, Button, Card, CardBody, CardHeader, Skeleton, useToast } from "../components/ui";
import { useWorkspace } from "./app";
import { AUDIT_ACTION_LABELS } from "./settings";

// ---------------------------------------------------------------------------
// Dashboard: angka nyata + grafik tren + widget operasional + onboarding
// ---------------------------------------------------------------------------

/** Angka ringkas untuk tick sumbu: 1500000 → "1,5 jt", 250000 → "250 rb". */
function compactNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return String(n);
}

/** Batas atas sumbu yang "bulat": naikkan ke 1/2/5 × 10^n terdekat. */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 5, 10]) if (m * pow >= n) return m * pow;
  return 10 * pow;
}

/**
 * Grafik batang tren penjualan 30 hari (SVG ringan, tanpa pustaka chart).
 * Mengikuti pedoman dataviz: batang tipis ujung membulat dari baseline, grid
 * hairline recessive, tick sumbu angka bulat, satu seri = tanpa legend
 * (judul kartu yang menamai), tooltip per batang dengan hit-target penuh,
 * teks memakai token teks — bukan warna seri.
 */
const TREND_RANGES = [7, 30, 90] as const;

function SalesTrendChart({ tenantId }: { tenantId: string }) {
  // Filter rentang 7/30/90 hari (Fase 12d) — API sudah menerima ?days= sejak lama.
  const [range, setRange] = useState<(typeof TREND_RANGES)[number]>(30);
  const query = useQuery({
    queryKey: ["sales-daily", tenantId, range],
    queryFn: () => api.salesDaily(tenantId, range),
  });
  const [hover, setHover] = useState<number | null>(null);

  // Isi hari kosong dengan 0 agar sumbu waktu kontinu.
  const days = useMemo(() => {
    const byDate = new Map((query.data?.rows ?? []).map((r) => [r.date, r]));
    const out: { date: string; total: number; count: number }[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const row = byDate.get(date);
      out.push({ date, total: row?.total ?? 0, count: row?.count ?? 0 });
    }
    return out;
  }, [query.data, range]);

  const W = 600;
  const H = 190;
  const PAD_L = 44;
  const PAD_B = 20;
  const PAD_T = 8;
  const plotW = W - PAD_L - 6;
  const plotH = H - PAD_T - PAD_B;
  const yMax = niceCeil(Math.max(...days.map((d) => d.total), 1));
  const slot = plotW / days.length;
  const barW = Math.min(24, Math.max(4, slot - 2)); // ≤24px + gap 2px antar batang
  const y = (v: number) => PAD_T + plotH - (v / yMax) * plotH;
  const ticks = [0, yMax / 2, yMax];
  const hovered = hover !== null ? days[hover] : null;
  const labelStep = range === 7 ? 1 : range === 30 ? 7 : 14; // kerapatan label sumbu X

  return (
    <Card>
      <CardHeader
        title={`Penjualan ${range} hari terakhir`}
        description="Total faktur penjualan per hari (dokumen dibatalkan tidak dihitung)."
        action={
          <div className="flex gap-1" role="group" aria-label="Rentang grafik">
            {TREND_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === r
                    ? "bg-brand-600 text-white dark:bg-brand-400 dark:text-slate-900"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {r} hari
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        {query.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="relative">
            {days.every((d) => d.total === 0) ? (
              <p className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-slate-400 dark:text-slate-500">
                Belum ada penjualan {range} hari terakhir — mulai dari faktur pertama Anda di menu Penjualan.
              </p>
            ) : null}
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Grafik penjualan harian ${range} hari`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD_L}
                    x2={W - 6}
                    y1={y(t)}
                    y2={y(t)}
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD_L - 6}
                    y={y(t) + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-slate-500"
                    fontSize={10}
                  >
                    {compactNumber(t)}
                  </text>
                </g>
              ))}
              {days.map((d, i) => {
                const cx = PAD_L + i * slot + slot / 2;
                const barH = Math.max(d.total > 0 ? 2 : 0, ((d.total / yMax) * plotH));
                const top = PAD_T + plotH - barH;
                return (
                  <g key={d.date}>
                    {d.total > 0 ? (
                      // Ujung atas membulat 4px, siku di baseline (path clip sederhana).
                      <rect
                        x={cx - barW / 2}
                        y={top}
                        width={barW}
                        height={barH}
                        rx={Math.min(4, barW / 2)}
                        className={
                          hover === i
                            ? "fill-brand-500 dark:fill-brand-300"
                            : "fill-brand-600 dark:fill-brand-400"
                        }
                      />
                    ) : null}
                    {/* Hit target lebih besar dari mark (selebar slot, setinggi plot). */}
                    <rect
                      x={PAD_L + i * slot}
                      y={PAD_T}
                      width={slot}
                      height={plotH}
                      fill="transparent"
                      onPointerEnter={() => setHover(i)}
                      onPointerLeave={() => setHover(null)}
                    />
                    {i % labelStep === (labelStep > 1 ? 1 : 0) ? (
                      <text
                        x={cx}
                        y={H - 6}
                        textAnchor="middle"
                        className="fill-slate-400 dark:fill-slate-500"
                        fontSize={10}
                      >
                        {formatDate(d.date).replace(/ \d{4}$/, "")}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
            {hovered ? (
              <div
                className="pointer-events-none absolute -top-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900"
                style={{
                  left: `${Math.min(92, Math.max(2, ((PAD_L + (hover ?? 0) * slot + slot / 2) / W) * 100))}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <span className="block font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatIDR(hovered.total)}
                </span>
                <span className="block text-slate-500 dark:text-slate-400">
                  {formatDate(hovered.date)} · {hovered.count} faktur
                </span>
              </div>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Widget faktur lewat jatuh tempo — diambil dari mesin notifikasi. */
function DueInvoicesWidget({ tenantId }: { tenantId: string }) {
  const query = useQuery({
    queryKey: ["notifications", tenantId],
    queryFn: () => api.notifications(tenantId),
  });
  const overdue = (query.data?.notifications ?? []).filter((n) => n.type === "overdue_invoice").slice(0, 5);

  return (
    <Card>
      <CardHeader title="Faktur lewat jatuh tempo" description="Tagih segera agar arus kas tetap sehat." />
      <CardBody>
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : overdue.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            Tidak ada faktur yang lewat jatuh tempo. 👍
          </p>
        ) : (
          <ul className="space-y-2.5">
            {overdue.map((n, i) => (
              <li key={i}>
                <Link to="/app/penjualan" className="group block text-sm">
                  <span className="block font-medium text-slate-800 group-hover:text-brand-700 dark:text-slate-100 dark:group-hover:text-brand-300">
                    {n.title.replace("Faktur ", "").replace(" lewat jatuh tempo", "")}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{n.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Feed aktivitas terakhir (Owner) — cuplikan audit log. */
function ActivityFeed({ tenantId }: { tenantId: string }) {
  const query = useQuery({
    queryKey: ["audit-logs", tenantId],
    queryFn: () => api.auditLogs(tenantId),
  });
  const logs = (query.data?.logs ?? []).slice(0, 6);
  return (
    <Card>
      <CardHeader title="Aktivitas terakhir" description="Siapa melakukan apa — cuplikan riwayat audit." />
      <CardBody>
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">Belum ada aktivitas.</p>
        ) : (
          <ul className="space-y-2.5">
            {logs.map((l) => (
              <li key={l.id} className="flex items-baseline gap-2 text-sm">
                <span className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-brand-500" aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {AUDIT_ACTION_LABELS[l.action] ?? l.action}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {" "}
                    — {l.userName ?? "sistem"} · {new Date(l.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Checklist onboarding: dihitung dari data nyata, hilang otomatis saat lengkap. */
function OnboardingChecklist({ tenantId }: { tenantId: string }) {
  const settings = useQuery({ queryKey: ["settings", tenantId], queryFn: () => api.settings(tenantId) });
  const products = useQuery({
    queryKey: ["products", tenantId, "", 1],
    queryFn: () => api.listItems(tenantId, "products", { limit: 1 }),
  });
  const contacts = useQuery({
    queryKey: ["contacts", tenantId, "", 1],
    queryFn: () => api.listItems(tenantId, "contacts", { limit: 1 }),
  });
  const invoices = useQuery({
    queryKey: ["invoices", tenantId, "", 1],
    queryFn: () => api.invoices(tenantId, { limit: 1 }),
  });
  const members = useQuery({ queryKey: ["members", tenantId], queryFn: () => api.members(tenantId) });

  if (settings.isLoading || products.isLoading || contacts.isLoading || invoices.isLoading || members.isLoading) {
    return null;
  }
  const steps: { label: string; done: boolean; to: string }[] = [
    { label: "Lengkapi profil perusahaan (alamat & NPWP)", done: Boolean(settings.data?.settings.address), to: "/app/pengaturan" },
    { label: "Tambah produk pertama", done: (products.data?.total ?? 0) > 0, to: "/app/master/produk" },
    { label: "Tambah pelanggan / pemasok", done: (contacts.data?.total ?? 0) > 0, to: "/app/master/kontak" },
    { label: "Posting faktur pertama", done: (invoices.data?.total ?? 0) > 0, to: "/app/penjualan" },
    { label: "Undang anggota tim", done: (members.data?.members.length ?? 0) > 1, to: "/app/pengaturan" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card>
      <CardHeader
        title={`Mulai cepat — ${doneCount}/${steps.length} selesai`}
        description="Lima langkah agar pembukuan Anda langsung berjalan."
        action={
          <Link to="/app/mulai" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Buka pandu cepat →
          </Link>
        }
      />
      <CardBody>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-600 transition-all dark:bg-brand-400"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.label}>
              <Link to={s.to} className="group flex items-center gap-2.5 text-sm">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    s.done
                      ? "border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-400 dark:text-slate-900"
                      : "border-slate-300 text-transparent dark:border-slate-600"
                  }`}
                  aria-hidden
                >
                  ✓
                </span>
                <span
                  className={
                    s.done
                      ? "text-slate-400 line-through dark:text-slate-500"
                      : "text-slate-700 group-hover:text-brand-700 dark:text-slate-200 dark:group-hover:text-brand-300"
                  }
                >
                  {s.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/**
 * Grafik tren penjualan bulanan (Fase 7h): omzet per bulan, N bulan terakhir.
 * SVG ringan (tanpa pustaka), mengikuti pedoman dataviz yang sama seperti
 * grafik harian: batang membulat dari baseline, grid hairline, tick bulat.
 */
function MonthlyTrendChart({ tenantId }: { tenantId: string }) {
  const query = useQuery({
    queryKey: ["sales-monthly", tenantId],
    queryFn: () => api.salesMonthly(tenantId, 6),
  });
  const [hover, setHover] = useState<number | null>(null);

  const months = useMemo(() => {
    const byMonth = new Map((query.data?.rows ?? []).map((r) => [r.month, r]));
    const out: { month: string; total: number; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = d.toISOString().slice(0, 7);
      const row = byMonth.get(key);
      out.push({ month: key, total: row?.total ?? 0, count: row?.count ?? 0 });
    }
    return out;
  }, [query.data]);

  const W = 600;
  const H = 190;
  const PAD_L = 44;
  const PAD_B = 22;
  const PAD_T = 8;
  const plotW = W - PAD_L - 6;
  const plotH = H - PAD_T - PAD_B;
  const yMax = niceCeil(Math.max(...months.map((m) => m.total), 1));
  const slot = plotW / months.length;
  const barW = Math.min(48, slot - 12);
  const y = (v: number) => PAD_T + plotH - (v / yMax) * plotH;
  const ticks = [0, yMax / 2, yMax];
  const monthLabel = (m: string) => {
    const [yy, mm] = m.split("-").map(Number);
    return new Date(Date.UTC(yy!, mm! - 1, 1)).toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
  };
  const hovered = hover !== null ? months[hover] : null;

  return (
    <Card>
      <CardHeader title="Tren penjualan bulanan" description="Total omzet faktur per bulan, 6 bulan terakhir." />
      <CardBody>
        {query.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="relative">
            {months.every((m) => m.total === 0) ? (
              <p className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-slate-400 dark:text-slate-500">
                Belum ada omzet 6 bulan terakhir — grafik terisi otomatis begitu ada faktur penjualan.
              </p>
            ) : null}
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grafik omzet bulanan 6 bulan">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD_L} x2={W - 6} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
                  <text x={PAD_L - 6} y={y(t) + 3.5} textAnchor="end" className="fill-slate-400 dark:fill-slate-500" fontSize={10}>
                    {compactNumber(t)}
                  </text>
                </g>
              ))}
              {months.map((m, i) => {
                const cx = PAD_L + i * slot + slot / 2;
                const barH = Math.max(m.total > 0 ? 2 : 0, (m.total / yMax) * plotH);
                const top = PAD_T + plotH - barH;
                return (
                  <g key={m.month}>
                    {m.total > 0 ? (
                      <rect
                        x={cx - barW / 2}
                        y={top}
                        width={barW}
                        height={barH}
                        rx={4}
                        className={hover === i ? "fill-brand-500 dark:fill-brand-300" : "fill-brand-600 dark:fill-brand-400"}
                      />
                    ) : null}
                    <rect
                      x={PAD_L + i * slot}
                      y={PAD_T}
                      width={slot}
                      height={plotH}
                      fill="transparent"
                      onPointerEnter={() => setHover(i)}
                      onPointerLeave={() => setHover(null)}
                    />
                    <text x={cx} y={H - 6} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500" fontSize={10}>
                      {monthLabel(m.month)}
                    </text>
                  </g>
                );
              })}
            </svg>
            {hovered ? (
              <div
                className="pointer-events-none absolute -top-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900"
                style={{ left: `${Math.min(92, Math.max(2, ((PAD_L + (hover ?? 0) * slot + slot / 2) / W) * 100))}%`, transform: "translateX(-50%)" }}
              >
                <span className="block font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatIDR(hovered.total)}</span>
                <span className="block text-slate-500 dark:text-slate-400">{monthLabel(hovered.month)} · {hovered.count} faktur</span>
              </div>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Widget laporan terjadwal (Fase 7h): snapshot rekap bulanan yang disusun Cron. */
function ScheduledReportsWidget({ tenantId, canRun }: { tenantId: string; canRun: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["report-snapshots", tenantId],
    queryFn: () => api.reportSnapshots(tenantId),
  });
  const snapshots = query.data?.snapshots ?? [];

  const run = useMutation({
    mutationFn: () => {
      const now = new Date();
      const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      return api.runReportSnapshot(tenantId, prev.toISOString().slice(0, 7));
    },
    onSuccess: (res) => {
      toast("success", `Rekap ${res.period} disusun.`);
      queryClient.invalidateQueries({ queryKey: ["report-snapshots", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const monthName = (p: string) => {
    const [yy, mm] = p.split("-").map(Number);
    return new Date(Date.UTC(yy!, mm! - 1, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  };

  return (
    <Card>
      <CardHeader
        title="Laporan terjadwal"
        description="Rekap penjualan bulanan yang disusun otomatis tiap awal bulan."
        action={
          canRun ? (
            <Button variant="secondary" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending ? "Menyusun…" : "Susun bulan lalu"}
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : snapshots.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            Belum ada rekap. Cron menyusun rekap bulan lalu tiap awal bulan{canRun ? ", atau susun manual di atas." : "."}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {snapshots.slice(0, 5).map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{monthName(s.period)}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {s.summary.invoiceCount} faktur{s.summary.topProduct ? ` · terlaris: ${s.summary.topProduct}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatIDR(s.summary.totalRevenue)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Widget dashboard yang bisa disembunyikan/ditampilkan (Fase 7h). */
const DASHBOARD_WIDGETS = [
  { key: "kpi", label: "Ringkasan angka (KPI)" },
  { key: "trenHarian", label: "Grafik penjualan 30 hari" },
  { key: "trenBulanan", label: "Grafik tren bulanan" },
  { key: "jatuhTempo", label: "Faktur jatuh tempo" },
  { key: "aktivitas", label: "Aktivitas / mulai dari sini" },
  { key: "laporanTerjadwal", label: "Laporan terjadwal" },
] as const;
type WidgetKey = (typeof DASHBOARD_WIDGETS)[number]["key"];

/** Preferensi widget dashboard per tenant, disimpan di localStorage. */
function useDashboardWidgets(tenantId: string) {
  const storageKey = `erpindo:dashboard-widgets:${tenantId}`;
  const [hidden, setHidden] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const toggle = (key: WidgetKey) =>
    setHidden((h) => {
      const next = { ...h, [key]: !h[key] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* localStorage tak tersedia — abaikan */
      }
      return next;
    });
  const isVisible = (key: WidgetKey) => !hidden[key];
  return { isVisible, toggle };
}

/** Sapaan sesuai jam perangkat pengguna. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

export function DashboardPage() {
  const { me, tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const widgets = useDashboardWidgets(tenant.tenantId);
  const [customizing, setCustomizing] = useState(false);
  const dash = useQuery({
    queryKey: ["dashboard", tenant.tenantId],
    queryFn: () => api.dashboard(tenant.tenantId),
  });
  // Sapaan kontekstual (Fase 12d): jumlah faktur lewat jatuh tempo dari mesin
  // notifikasi — query di-share dengan DueInvoicesWidget (queryKey sama).
  const notifQuery = useQuery({
    queryKey: ["notifications", tenant.tenantId],
    queryFn: () => api.notifications(tenant.tenantId),
  });
  const overdueCount = (notifQuery.data?.notifications ?? []).filter((n) => n.type === "overdue_invoice").length;

  const fmt = formatIDR;

  // Delta % vs bulan lalu; untuk laba, basis pembagi memakai nilai absolut agar
  // perbandingan tetap bermakna saat bulan lalu rugi.
  const pctDelta = (cur: number | undefined, prev: number | undefined) =>
    cur !== undefined && prev !== undefined && prev !== 0 ? Math.round(((cur - prev) / Math.abs(prev)) * 100) : null;
  const salesDelta = pctDelta(dash.data?.salesThisMonth, dash.data?.salesLastMonth);
  const profitDelta = pctDelta(dash.data?.profitThisMonth, dash.data?.profitLastMonth);

  // Tiap kartu KPI kini tautan ke laporan sumbernya (Fase 12d).
  const stats: { label: string; value?: number; hint?: string; delta?: number | null; icon: LucideIcon; chip: string; currency?: boolean; to: string }[] = [
    {
      label: "Kas & Bank",
      value: dash.data?.cashAndBank,
      icon: Wallet,
      chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
      to: "/app/keuangan/kas-bank",
    },
    {
      label: "Penjualan Bulan Ini",
      value: dash.data?.salesThisMonth,
      hint: dash.data ? `${dash.data.salesCountThisMonth} faktur` : undefined,
      delta: salesDelta,
      icon: LineChart,
      chip: "bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300",
      to: "/app/laporan/penjualan",
    },
    {
      label: "Laba Bulan Ini",
      value: dash.data?.profitThisMonth,
      delta: profitDelta,
      icon: TrendingUp,
      chip: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
      to: "/app/keuangan/laba-rugi",
    },
    {
      label: "Piutang Belum Lunas",
      value: dash.data?.receivableOutstanding,
      icon: ArrowDownToLine,
      chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      to: "/app/keuangan/umur-tagihan",
    },
    {
      label: "Hutang Belum Lunas",
      value: dash.data?.payableOutstanding,
      icon: ArrowUpFromLine,
      chip: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
      to: "/app/keuangan/umur-tagihan",
    },
    {
      label: "Nilai Persediaan",
      value: dash.data?.inventoryValue,
      icon: Boxes,
      chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
      to: "/app/stok",
    },
    {
      label: "Lead Terbuka",
      value: dash.data?.openLeadsCount,
      currency: false,
      icon: Target,
      chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
      to: "/app/crm/leads",
    },
  ];

  const quickLinks: { to: string; icon: LucideIcon; text: string; label: string }[] = [
    { to: "/app/pembelian", icon: ShoppingCart, label: "Pembelian", text: "Catat pembelian untuk mengisi stok" },
    { to: "/app/penjualan", icon: Receipt, label: "Penjualan", text: "Buat faktur — jurnal & stok otomatis" },
    { to: "/app/keuangan/laba-rugi", icon: LineChart, label: "Laba Rugi", text: "Lihat laba rugi & neraca kapan saja" },
    { to: "/app/pengaturan", icon: Users, label: "Pengaturan", text: "Undang tim dengan peran berbeda" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{greeting()}, {me.user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ringkasan <span className="font-medium">{tenant.tenantName}</span> hari ini.
            {overdueCount > 0 ? (
              <>
                {" "}
                Ada <span className="font-medium text-amber-600 dark:text-amber-400">{overdueCount} faktur lewat jatuh tempo</span> yang perlu ditagih.
              </>
            ) : null}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setCustomizing((v) => !v)}>
          <SlidersHorizontal className="size-4" aria-hidden /> Sesuaikan
        </Button>
      </div>

      {customizing ? (
        <Card>
          <CardHeader title="Sesuaikan dashboard" description="Pilih widget yang ingin Anda tampilkan. Tersimpan di perangkat ini." />
          <CardBody>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {DASHBOARD_WIDGETS.map((w) => {
                const on = widgets.isVisible(w.key);
                return (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => widgets.toggle(w.key)}
                    className={`flex items-center gap-2.5 rounded-xl border p-3 text-left text-sm transition-colors ${
                      on
                        ? "border-brand-300 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/30"
                        : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
                        on
                          ? "border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-400 dark:text-slate-900"
                          : "border-slate-300 text-transparent dark:border-slate-600"
                      }`}
                      aria-hidden
                    >
                      <Check className="size-3.5" />
                    </span>
                    <span className={on ? "text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>
                      {w.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {isAdmin ? <OnboardingChecklist tenantId={tenant.tenantId} /> : null}

      {dash.isError ? (
        <Alert tone="error">
          Gagal memuat ringkasan dashboard.{" "}
          <button type="button" className="font-medium underline" onClick={() => void dash.refetch()}>
            Coba lagi
          </button>
        </Alert>
      ) : null}

      {widgets.isVisible("kpi") ? (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            to={stat.to}
            aria-label={`${stat.label} — buka laporan sumber`}
            className="group block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
          <Card hover className="h-full">
            <CardBody>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-slate-500 group-hover:text-brand-700 dark:text-slate-400 dark:group-hover:text-brand-300">{stat.label}</div>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${stat.chip}`}>
                  <stat.icon className="size-4" aria-hidden />
                </span>
              </div>
              {dash.isLoading ? (
                <Skeleton className="mt-2 h-6 w-28" />
              ) : (
                // Tenant baru melihat "Rp 0" nyata, bukan shimmer abu-abu (Fase 10a).
                <div className="mt-1 text-xl font-semibold">
                  {stat.currency === false ? (stat.value ?? 0).toLocaleString("id-ID") : fmt(stat.value ?? 0)}
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                {stat.hint ? <span className="text-slate-400 dark:text-slate-500">{stat.hint}</span> : null}
                {stat.delta !== undefined && stat.delta !== null ? (
                  <span className={stat.delta >= 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-red-600 dark:text-red-400"}>
                    {stat.delta >= 0 ? "▲" : "▼"} {Math.abs(stat.delta)}% vs bulan lalu
                  </span>
                ) : null}
              </div>
            </CardBody>
          </Card>
          </Link>
        ))}
      </div>
      ) : null}

      {widgets.isVisible("trenHarian") ? <SalesTrendChart tenantId={tenant.tenantId} /> : null}
      {widgets.isVisible("trenBulanan") ? <MonthlyTrendChart tenantId={tenant.tenantId} /> : null}
      {widgets.isVisible("laporanTerjadwal") ? (
        <ScheduledReportsWidget tenantId={tenant.tenantId} canRun={isAdmin} />
      ) : null}

      {widgets.isVisible("jatuhTempo") || widgets.isVisible("aktivitas") ? (
      <div className="grid gap-6 lg:grid-cols-2">
        {widgets.isVisible("jatuhTempo") ? <DueInvoicesWidget tenantId={tenant.tenantId} /> : null}
        {widgets.isVisible("aktivitas") ? (
          tenant.role === "owner" ? (
            <ActivityFeed tenantId={tenant.tenantId} />
          ) : (
            <Card>
              <CardHeader title="Mulai dari sini" description="Alur kerja harian yang umum." />
              <CardBody>
                <div className="grid gap-3">
                  {quickLinks.map((q) => (
                    <Link
                      key={q.to}
                      to={q.to}
                      className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-800 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-brand-900/60 dark:group-hover:text-brand-300">
                        <q.icon className="size-4" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{q.label}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{q.text}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </CardBody>
            </Card>
          )
        ) : null}
      </div>
      ) : null}

      {tenant.role === "owner" ? (
        <Card>
          <CardHeader title="Mulai dari sini" description="Alur kerja harian yang umum." />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quickLinks.map((q) => (
                <Link
                  key={q.to}
                  to={q.to}
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-800 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-brand-900/60 dark:group-hover:text-brand-300">
                    <q.icon className="size-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{q.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{q.text}</span>
                  </span>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

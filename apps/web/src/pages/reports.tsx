import {
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  type AgingBucket,
  type ApiReportLine,
} from "@erpindo/shared";
import { useUi, type UiKey } from "../i18n/ui";
import { useHeading } from "../i18n/pageHeadings";
import { useQuery } from "@tanstack/react-query";
import { Download, Inbox } from "lucide-react";
import { useState } from "react";
import { api, downloadCsv, downloadXlsx, downloadXml, formatDate, formatIDR } from "../api/client";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Label,
  PageHeading,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

// Peta label AGING_BUCKET_LABELS tinggal di packages/shared dan tetap
// berbahasa Indonesia (apps/api ikut memakai paket itu, jadi shared tidak
// boleh bergantung pada kamus web). Pemetaan ke kunci kamus dilakukan di
// sisi web — Fase 16t.
const AGING_BUCKET_KEY: Record<AgingBucket, UiKey> = {
  current: "umurBelumJatuhTempo",
  d1_30: "umur1_30",
  d31_60: "umur31_60",
  d61_90: "umur61_90",
  d90_plus: "umur90plus",
};

export function ExportButton({
  onClick,
  label = "Ekspor CSV",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button variant="secondary" className="h-9" onClick={onClick}>
      <Download className="size-4" aria-hidden /> {label}
    </Button>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStart(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function ReportSection({
  title,
  lines,
  total,
}: {
  title: string;
  lines: ApiReportLine[];
  total: number;
}) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {lines.map((l) => (
              <tr key={l.accountId}>
                <td className="py-1 pr-4 font-mono text-xs">{l.code}</td>
                <td className="py-1 pr-4">{l.name}</td>
                <td className="py-1 text-right tabular-nums">{formatIDR(l.amount)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 font-semibold dark:border-slate-800">
              <td className="py-1.5 pr-4" colSpan={2}>
                Total {title}
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatIDR(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Laba Rugi
// ---------------------------------------------------------------------------

/** Periode sebelumnya dengan panjang yang sama (untuk perbandingan Laba Rugi). */
function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = new Date(`${from}T00:00:00Z`);
  const t = new Date(`${to}T00:00:00Z`);
  const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1);
  const prevTo = new Date(f.getTime() - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

function deltaPct(now: number, prev: number): string {
  if (prev === 0) return now === 0 ? "0%" : "—";
  return `${(((now - prev) / Math.abs(prev)) * 100).toFixed(1).replace(".", ",")}%`;
}

export function IncomeStatementPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [compare, setCompare] = useState(false);

  const query = useQuery({
    queryKey: ["income-statement", tenant.tenantId, from, to],
    queryFn: () => api.incomeStatement(tenant.tenantId, from, to),
    enabled: Boolean(from && to),
  });
  const prev = previousPeriod(from, to);
  const prevQuery = useQuery({
    queryKey: ["income-statement", tenant.tenantId, prev.from, prev.to],
    queryFn: () => api.incomeStatement(tenant.tenantId, prev.from, prev.to),
    enabled: compare && Boolean(from && to),
  });

  // Rasio ringkas dari data yang sudah ada: margin kotor (pendapatan − HPP)
  // dan margin bersih. Ditampilkan bila ada pendapatan.
  const hpp = (query.data?.expense ?? [])
    .filter((l) => l.code.startsWith("5-1"))
    .reduce((s, l) => s + l.amount, 0);
  const income = query.data?.totalIncome ?? 0;
  const grossMargin =
    income > 0 ? (((income - hpp) / income) * 100).toFixed(1).replace(".", ",") : null;
  const netMargin =
    income > 0 ? ((query.data!.netProfit / income) * 100).toFixed(1).replace(".", ",") : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <PageHeading k="labaRugi" />
        </div>
        {query.data ? (
          <ExportButton
            onClick={() =>
              downloadCsv(
                `laba-rugi-${from}-${to}.csv`,
                ["Kode", "Akun", "Jenis", "Jumlah"],
                [
                  ...query.data!.income.map(
                    (l) => [l.code, l.name, "Pendapatan", l.amount] as (string | number)[]
                  ),
                  ...query.data!.expense.map(
                    (l) => [l.code, l.name, "Beban", l.amount] as (string | number)[]
                  ),
                  ["", "Laba Bersih", "", query.data!.netProfit],
                ]
              )
            }
          />
        ) : null}
      </div>
      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="pl-from">{u("dari")}</Label>
              <Input
                id="pl-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pl-to">{u("sampai")}</Label>
              <Input id="pl-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={compare}
                onChange={(e) => setCompare(e.target.checked)}
                className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {u("bandingkanPeriode")}
            </label>
          </div>

          {query.isLoading ? (
            <Spinner />
          ) : query.data ? (
            <>
              {grossMargin !== null ? (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {u("marginKotor")} <strong>{grossMargin}%</strong>
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {u("marginBersih")} <strong>{netMargin}%</strong>
                  </span>
                </div>
              ) : null}
              <ReportSection
                title={u("pendapatan")}
                lines={query.data.income}
                total={query.data.totalIncome}
              />
              <ReportSection
                title={u("beban")}
                lines={query.data.expense}
                total={query.data.totalExpense}
              />
              <div
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold ${
                  query.data.netProfit >= 0
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                }`}
              >
                <span>{query.data.netProfit >= 0 ? u("labaBersih") : u("rugiBersih")}</span>
                <span className="tabular-nums">{formatIDR(Math.abs(query.data.netProfit))}</span>
              </div>
              {compare && prevQuery.data ? (
                <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="mb-2 font-medium">
                    {u("periodeSebelumnya")} ({formatDate(prev.from)} – {formatDate(prev.to)})
                  </div>
                  {[
                    [u("pendapatan"), query.data.totalIncome, prevQuery.data.totalIncome],
                    [u("beban"), query.data.totalExpense, prevQuery.data.totalExpense],
                    [u("labaBersihKecil"), query.data.netProfit, prevQuery.data.netProfit],
                  ].map(([label, now, was]) => (
                    <div
                      key={label as string}
                      className="flex flex-wrap items-center justify-between gap-x-4 py-1"
                    >
                      <span>{label}</span>
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        {formatIDR(was as number)} →{" "}
                        <strong className="text-slate-900 dark:text-white">
                          {formatIDR(now as number)}
                        </strong>{" "}
                        <span
                          className={
                            (now as number) >= (was as number)
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-600 dark:text-red-400"
                          }
                        >
                          ({deltaPct(now as number, was as number)})
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arus Kas
// ---------------------------------------------------------------------------

export function CashFlowPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const query = useQuery({
    queryKey: ["cash-flow", tenant.tenantId, from, to],
    queryFn: () => api.cashFlow(tenant.tenantId, from, to),
    enabled: Boolean(from && to),
  });

  const row = (label: string, amount: number, bold = false) => (
    <div className={`flex justify-between py-1 text-sm ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{formatIDR(amount)}</span>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <PageHeading k="arusKas" />
        </div>
        {query.data ? (
          <ExportButton
            onClick={() =>
              downloadCsv(
                `arus-kas-${from}-${to}.csv`,
                ["Keterangan", "Arah", "Jumlah"],
                [
                  ...query.data!.inflows.map(
                    (r) => [r.label, "Masuk", r.amount] as (string | number)[]
                  ),
                  ...query.data!.outflows.map(
                    (r) => [r.label, "Keluar", r.amount] as (string | number)[]
                  ),
                ]
              )
            }
          />
        ) : null}
      </div>
      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="cf-from">{u("dari")}</Label>
              <Input
                id="cf-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cf-to">{u("sampai")}</Label>
              <Input id="cf-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {query.isLoading ? (
            <Spinner />
          ) : query.data ? (
            <>
              {row(u("saldoKasAwal"), query.data.openingBalance, true)}
              <div>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  {u("kasMasuk")}
                </h3>
                {query.data.inflows.length === 0 ? (
                  <p className="text-sm text-slate-400">{u("tidakAda")}</p>
                ) : (
                  query.data.inflows.map((r, i) => <div key={i}>{row(r.label, r.amount)}</div>)
                )}
                {row(u("totalKasMasuk"), query.data.totalIn, true)}
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                  {u("kasKeluar")}
                </h3>
                {query.data.outflows.length === 0 ? (
                  <p className="text-sm text-slate-400">{u("tidakAda")}</p>
                ) : (
                  query.data.outflows.map((r, i) => <div key={i}>{row(r.label, r.amount)}</div>)
                )}
                {row(u("totalKasKeluar"), query.data.totalOut, true)}
              </div>
              <div className="rounded-lg bg-slate-100 px-4 py-3 dark:bg-slate-800">
                {row(u("perubahanKasBersih"), query.data.netChange, true)}
                {row(u("saldoKasAkhir"), query.data.closingBalance, true)}
              </div>
            </>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Umur Piutang / Hutang (aging)
// ---------------------------------------------------------------------------

export function AgingPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const [kind, setKind] = useState<"receivable" | "payable">("receivable");
  const hAging = useHeading(kind === "receivable" ? "umurPiutang" : "umurHutang");
  const query = useQuery({
    queryKey: ["aging", tenant.tenantId, kind],
    queryFn: () => api.aging(tenant.tenantId, kind),
  });

  const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";
  const td = "border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{hAging.title}</h1>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Jenis"
            className="w-40"
            value={kind}
            onChange={(e) => setKind(e.target.value as "receivable" | "payable")}
          >
            <option value="receivable">{u("piutang")}</option>
            <option value="payable">{u("hutang")}</option>
          </Select>
          {query.data ? (
            <ExportButton
              onClick={() =>
                downloadCsv(
                  `aging-${kind}.csv`,
                  ["Kontak", ...AGING_BUCKETS.map((b) => AGING_BUCKET_LABELS[b]), "Total"],
                  query.data!.rows.map((r) => [
                    r.contactName,
                    ...AGING_BUCKETS.map((b) => r.buckets[b]),
                    r.total,
                  ])
                )
              }
            />
          ) : null}
        </div>
      </div>

      <Card>
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (query.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {kind === "receivable"
                ? u("tidakAdaPiutangBelumLunas")
                : u("tidakAdaHutangBelumLunas")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>{u("kontakKolom")}</th>
                    {AGING_BUCKETS.map((b) => (
                      <th key={b} className={`${th} text-right`}>
                        {u(AGING_BUCKET_KEY[b]!)}
                      </th>
                    ))}
                    <th className={`${th} text-right`}>{u("total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data!.rows.map((r) => (
                    <tr key={r.contactId}>
                      <td className={td}>{r.contactName}</td>
                      {AGING_BUCKETS.map((b) => (
                        <td key={b} className={`${td} text-right tabular-nums`}>
                          {r.buckets[b] === 0 ? "—" : formatIDR(r.buckets[b])}
                        </td>
                      ))}
                      <td className={`${td} text-right font-medium tabular-nums`}>
                        {formatIDR(r.total)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2.5 pr-4" colSpan={AGING_BUCKETS.length + 1}>
                      {u("totalKeseluruhan")}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatIDR(query.data!.grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ekspor e-Faktur (faktur keluaran ber-PPN)
// ---------------------------------------------------------------------------

export function EfakturPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [xmlBusy, setXmlBusy] = useState(false);

  const query = useQuery({
    queryKey: ["efaktur", tenant.tenantId, from, to],
    queryFn: () => api.efaktur(tenant.tenantId, from, to),
    enabled: Boolean(from && to),
  });

  async function downloadCoretaxXml() {
    setXmlBusy(true);
    try {
      const xml = await api.efakturXml(tenant.tenantId, from, to);
      downloadXml(`efaktur-coretax-${from}-sd-${to}.xml`, xml);
      toast("success", "XML Coretax terunduh — impor lewat menu e-Faktur → Impor Faktur Keluaran.");
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setXmlBusy(false);
    }
  }

  const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";
  const td = "border-b border-slate-100 py-2 pr-4 dark:border-slate-800/60";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageHeading k="eFaktur" />
        </div>
        {query.data && query.data.rows.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-9" onClick={downloadCoretaxXml} disabled={xmlBusy}>
              <Download className="size-4" aria-hidden />{" "}
              {xmlBusy ? "Menyiapkan…" : "Unduh XML Coretax"}
            </Button>
            <ExportButton
              onClick={() =>
                downloadCsv(
                  `e-faktur-${from}-${to}.csv`,
                  [
                    "Nomor Faktur",
                    "Tanggal",
                    "NPWP Pembeli",
                    "Nama Pembeli",
                    "DPP",
                    "PPN",
                    "Total",
                  ],
                  query.data!.rows.map((r) => [
                    r.invoiceNo,
                    r.invoiceDate,
                    r.buyerNpwp ?? "000000000000000",
                    r.buyerName,
                    r.dpp,
                    r.ppn,
                    r.total,
                  ])
                )
              }
            />
          </div>
        ) : null}
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {u("descCoretax")} <strong>XML</strong> {u("descCoretax2")}{" "}
        <span className="font-mono">0000000000000000</span>.
      </p>

      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="ef-from">{u("dari")}</Label>
              <Input
                id="ef-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ef-to">{u("sampai")}</Label>
              <Input id="ef-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {query.isLoading ? (
            <Spinner />
          ) : (query.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{u("tidakAdaFakturPpn")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>{u("nomor")}</th>
                    <th className={th}>{u("tanggal")}</th>
                    <th className={th}>NPWP</th>
                    <th className={th}>{u("pembeli")}</th>
                    <th className={`${th} text-right`}>DPP</th>
                    <th className={`${th} text-right`}>PPN</th>
                    <th className={`${th} text-right`}>{u("total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data!.rows.map((r) => (
                    <tr key={r.invoiceNo}>
                      <td className={`${td} font-mono text-xs`}>{r.invoiceNo}</td>
                      <td className={`${td} tabular-nums`}>{formatDate(r.invoiceDate)}</td>
                      <td className={`${td} font-mono text-xs`}>
                        {r.buyerNpwp ?? "000000000000000"}
                      </td>
                      <td className={td}>{r.buyerName}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.dpp)}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.ppn)}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4" colSpan={4}>
                      {u("total")} ({query.data!.rows.length} {u("faktur").toLowerCase()})
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatIDR(query.data!.totalDpp)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatIDR(query.data!.totalPpn)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatIDR(query.data!.totalDpp + query.data!.totalPpn)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Neraca
// ---------------------------------------------------------------------------

export function BalanceSheetPage() {
  const u = useUi();
  const hNeraca = useHeading("neraca");
  const { tenant } = useWorkspace();
  const [asOf, setAsOf] = useState(today);

  const query = useQuery({
    queryKey: ["balance-sheet", tenant.tenantId, asOf],
    queryFn: () => api.balanceSheet(tenant.tenantId, asOf),
    enabled: Boolean(asOf),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{hNeraca.title}</h1>
          {query.data ? (
            query.data.balanced ? (
              <Badge tone="brand">{u("seimbang")}</Badge>
            ) : (
              <Badge tone="amber">{u("tidakSeimbang")}</Badge>
            )
          ) : null}
        </div>
        {query.data ? (
          <ExportButton
            onClick={() =>
              downloadCsv(
                `neraca-${asOf}.csv`,
                ["Kode", "Akun", "Kelompok", "Jumlah"],
                [
                  ...query.data!.assets.map(
                    (l) => [l.code, l.name, "Aset", l.amount] as (string | number)[]
                  ),
                  ...query.data!.liabilities.map(
                    (l) => [l.code, l.name, "Kewajiban", l.amount] as (string | number)[]
                  ),
                  ...query.data!.equity.map(
                    (l) => [l.code, l.name, "Ekuitas", l.amount] as (string | number)[]
                  ),
                ]
              )
            }
          />
        ) : null}
      </div>
      <Card>
        <CardBody className="space-y-5">
          <div>
            <Label htmlFor="bs-asof">{u("perTanggal")}</Label>
            <Input
              id="bs-asof"
              type="date"
              className="sm:w-48"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </div>

          {query.isLoading ? (
            <Spinner />
          ) : query.data ? (
            <>
              <ReportSection
                title={u("aset")}
                lines={query.data.assets}
                total={query.data.totalAssets}
              />
              <ReportSection
                title={u("kewajiban")}
                lines={query.data.liabilities}
                total={query.data.totalLiabilities}
              />
              <ReportSection
                title={u("ekuitas")}
                lines={query.data.equity}
                total={query.data.totalEquity}
              />
              <div className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold dark:bg-slate-800">
                <span>{u("kewajibanEkuitas")}</span>
                <span className="tabular-nums">
                  {formatIDR(query.data.totalLiabilities + query.data.totalEquity)}
                </span>
              </div>
            </>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Laporan Penjualan analitik (Fase 5h): agregat per produk & per pelanggan
// ---------------------------------------------------------------------------

export function SalesReportPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const query = useQuery({
    queryKey: ["sales-analytics", tenant.tenantId, from, to],
    queryFn: () => api.salesAnalytics(tenant.tenantId, from, to),
  });
  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageHeading k="laporanPenjualan" />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="sr-from">{u("dari")}</Label>
            <Input
              id="sr-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sr-to">{u("sampai")}</Label>
            <Input id="sr-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {data && (data.byProduct.length > 0 || data.byCustomer.length > 0) ? (
            <ExportButton
              label="Ekspor Excel"
              onClick={() =>
                downloadXlsx(`penjualan-${from}_${to}.xlsx`, [
                  {
                    name: "Per produk",
                    headers: ["SKU", "Produk", "Qty", "Omzet"],
                    rows: data.byProduct.map((r) => [r.sku, r.name, r.qty, r.revenue]),
                  },
                  {
                    name: "Per pelanggan",
                    headers: ["Pelanggan", "Jumlah faktur", "Omzet"],
                    rows: data.byCustomer.map((r) => [r.name, r.invoiceCount, r.revenue]),
                  },
                ])
              }
            />
          ) : null}
        </div>
      </div>

      {query.isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardBody>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {u("totalPenjualan")}
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {formatIDR(data.totalRevenue)}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {u("jumlahFaktur")}
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {data.invoiceCount.toLocaleString("id-ID")}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {u("rataRataPerFaktur")}
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {formatIDR(
                    data.invoiceCount > 0 ? Math.round(data.totalRevenue / data.invoiceCount) : 0
                  )}
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title={u("perProduk")}
              action={
                data.byProduct.length > 0 ? (
                  <ExportButton
                    onClick={() =>
                      downloadCsv(
                        `penjualan-per-produk-${from}_${to}.csv`,
                        ["SKU", "Produk", "Qty", "Omzet"],
                        data.byProduct.map((r) => [r.sku, r.name, r.qty, r.revenue])
                      )
                    }
                  />
                ) : undefined
              }
            />
            <CardBody>
              {data.byProduct.length === 0 ? (
                <EmptyState
                  icon={<Inbox className="size-6" aria-hidden />}
                  title={u("belumAdaPenjualan")}
                  description={u("tidakAdaFakturRentang")}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="pb-2 pr-4 font-medium">SKU</th>
                        <th className="pb-2 pr-4 font-medium">{u("produk")}</th>
                        <th className="pb-2 pr-4 text-right font-medium">Qty</th>
                        <th className="pb-2 text-right font-medium">{u("omzet")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byProduct.map((r) => (
                        <tr
                          key={r.productId}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                        >
                          <td className="py-2 pr-4 font-mono text-xs">{r.sku}</td>
                          <td className="py-2 pr-4">{r.name}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {r.qty.toLocaleString("id-ID")}
                          </td>
                          <td className="py-2 text-right tabular-nums">{formatIDR(r.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={u("perPelanggan")}
              action={
                data.byCustomer.length > 0 ? (
                  <ExportButton
                    onClick={() =>
                      downloadCsv(
                        `penjualan-per-pelanggan-${from}_${to}.csv`,
                        ["Pelanggan", "Jumlah faktur", "Omzet"],
                        data.byCustomer.map((r) => [r.name, r.invoiceCount, r.revenue])
                      )
                    }
                  />
                ) : undefined
              }
            />
            <CardBody>
              {data.byCustomer.length === 0 ? (
                <EmptyState
                  icon={<Inbox className="size-6" aria-hidden />}
                  title={u("belumAdaPenjualan")}
                  description={u("tidakAdaFakturRentang")}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="pb-2 pr-4 font-medium">{u("pelanggan")}</th>
                        <th className="pb-2 pr-4 text-right font-medium">{u("faktur")}</th>
                        <th className="pb-2 text-right font-medium">{u("omzet")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCustomer.map((r) => (
                        <tr
                          key={r.contactId}
                          className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                        >
                          <td className="py-2 pr-4">{r.name}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {r.invoiceCount.toLocaleString("id-ID")}
                          </td>
                          <td className="py-2 text-right tabular-nums">{formatIDR(r.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

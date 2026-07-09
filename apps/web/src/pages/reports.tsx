import { AGING_BUCKETS, AGING_BUCKET_LABELS, type ApiReportLine } from "@erpindo/shared";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { api, downloadCsv, formatDate, formatIDR } from "../api/client";
import { Badge, Button, Card, CardBody, CardHeader, Input, Label, Select, Spinner } from "../components/ui";
import { useWorkspace } from "./app";

export function ExportButton({ onClick, label = "Ekspor CSV" }: { onClick: () => void; label?: string }) {
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

function ReportSection({ title, lines, total }: { title: string; lines: ApiReportLine[]; total: number }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
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

export function IncomeStatementPage() {
  const { tenant } = useWorkspace();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const query = useQuery({
    queryKey: ["income-statement", tenant.tenantId, from, to],
    queryFn: () => api.incomeStatement(tenant.tenantId, from, to),
    enabled: Boolean(from && to),
  });

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Laba Rugi</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pendapatan dikurangi beban untuk periode pilihan Anda — dihitung langsung dari jurnal.</p>
        {query.data ? (
          <ExportButton
            onClick={() =>
              downloadCsv(
                `laba-rugi-${from}-${to}.csv`,
                ["Kode", "Akun", "Jenis", "Jumlah"],
                [
                  ...query.data!.income.map((l) => [l.code, l.name, "Pendapatan", l.amount] as (string | number)[]),
                  ...query.data!.expense.map((l) => [l.code, l.name, "Beban", l.amount] as (string | number)[]),
                  ["", "Laba Bersih", "", query.data!.netProfit],
                ],
              )
            }
          />
        ) : null}
      </div>
      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="pl-from">Dari</Label>
              <Input id="pl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pl-to">Sampai</Label>
              <Input id="pl-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {query.isLoading ? (
            <Spinner />
          ) : query.data ? (
            <>
              <ReportSection title="Pendapatan" lines={query.data.income} total={query.data.totalIncome} />
              <ReportSection title="Beban" lines={query.data.expense} total={query.data.totalExpense} />
              <div
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold ${
                  query.data.netProfit >= 0
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                }`}
              >
                <span>{query.data.netProfit >= 0 ? "Laba Bersih" : "Rugi Bersih"}</span>
                <span className="tabular-nums">{formatIDR(Math.abs(query.data.netProfit))}</span>
              </div>
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Arus Kas</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Uang masuk dan keluar dari akun kas & bank untuk periode pilihan, dengan saldo awal dan akhir.</p>
        {query.data ? (
          <ExportButton
            onClick={() =>
              downloadCsv(
                `arus-kas-${from}-${to}.csv`,
                ["Keterangan", "Arah", "Jumlah"],
                [
                  ...query.data!.inflows.map((r) => [r.label, "Masuk", r.amount] as (string | number)[]),
                  ...query.data!.outflows.map((r) => [r.label, "Keluar", r.amount] as (string | number)[]),
                ],
              )
            }
          />
        ) : null}
      </div>
      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="cf-from">Dari</Label>
              <Input id="cf-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cf-to">Sampai</Label>
              <Input id="cf-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {query.isLoading ? (
            <Spinner />
          ) : query.data ? (
            <>
              {row("Saldo kas awal periode", query.data.openingBalance, true)}
              <div>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Kas Masuk
                </h3>
                {query.data.inflows.length === 0 ? (
                  <p className="text-sm text-slate-400">Tidak ada.</p>
                ) : (
                  query.data.inflows.map((r, i) => <div key={i}>{row(r.label, r.amount)}</div>)
                )}
                {row("Total kas masuk", query.data.totalIn, true)}
              </div>
              <div>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                  Kas Keluar
                </h3>
                {query.data.outflows.length === 0 ? (
                  <p className="text-sm text-slate-400">Tidak ada.</p>
                ) : (
                  query.data.outflows.map((r, i) => <div key={i}>{row(r.label, r.amount)}</div>)
                )}
                {row("Total kas keluar", query.data.totalOut, true)}
              </div>
              <div className="rounded-lg bg-slate-100 px-4 py-3 dark:bg-slate-800">
                {row("Perubahan kas bersih", query.data.netChange, true)}
                {row("Saldo kas akhir periode", query.data.closingBalance, true)}
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
  const { tenant } = useWorkspace();
  const [kind, setKind] = useState<"receivable" | "payable">("receivable");
  const query = useQuery({
    queryKey: ["aging", tenant.tenantId, kind],
    queryFn: () => api.aging(tenant.tenantId, kind),
  });

  const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";
  const td = "border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Umur {kind === "receivable" ? "Piutang" : "Hutang"}</h1>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Jenis"
            className="w-40"
            value={kind}
            onChange={(e) => setKind(e.target.value as "receivable" | "payable")}
          >
            <option value="receivable">Piutang</option>
            <option value="payable">Hutang</option>
          </Select>
          {query.data ? (
            <ExportButton
              onClick={() =>
                downloadCsv(
                  `aging-${kind}.csv`,
                  ["Kontak", ...AGING_BUCKETS.map((b) => AGING_BUCKET_LABELS[b]), "Total"],
                  query.data!.rows.map((r) => [r.contactName, ...AGING_BUCKETS.map((b) => r.buckets[b]), r.total]),
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
              Tidak ada {kind === "receivable" ? "piutang" : "hutang"} yang belum lunas. 🎉
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>Kontak</th>
                    {AGING_BUCKETS.map((b) => (
                      <th key={b} className={`${th} text-right`}>
                        {AGING_BUCKET_LABELS[b]}
                      </th>
                    ))}
                    <th className={`${th} text-right`}>Total</th>
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
                      <td className={`${td} text-right font-medium tabular-nums`}>{formatIDR(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2.5 pr-4" colSpan={AGING_BUCKETS.length + 1}>
                      Total keseluruhan
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatIDR(query.data!.grandTotal)}</td>
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
  const { tenant } = useWorkspace();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);

  const query = useQuery({
    queryKey: ["efaktur", tenant.tenantId, from, to],
    queryFn: () => api.efaktur(tenant.tenantId, from, to),
    enabled: Boolean(from && to),
  });

  const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";
  const td = "border-b border-slate-100 py-2 pr-4 dark:border-slate-800/60";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Ekspor e-Faktur</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Rekap faktur keluaran ber-PPN per periode — siap diunduh untuk pelaporan pajak.</p>
        {query.data && query.data.rows.length > 0 ? (
          <ExportButton
            onClick={() =>
              downloadCsv(
                `e-faktur-${from}-${to}.csv`,
                ["Nomor Faktur", "Tanggal", "NPWP Pembeli", "Nama Pembeli", "DPP", "PPN", "Total"],
                query.data!.rows.map((r) => [
                  r.invoiceNo,
                  r.invoiceDate,
                  r.buyerNpwp ?? "000000000000000",
                  r.buyerName,
                  r.dpp,
                  r.ppn,
                  r.total,
                ]),
              )
            }
          />
        ) : null}
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Daftar faktur penjualan ber-PPN pada periode terpilih, siap diekspor CSV untuk diimpor ke aplikasi e-Faktur.
        Pembeli tanpa NPWP diekspor sebagai <span className="font-mono">000000000000000</span>.
      </p>

      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="ef-from">Dari</Label>
              <Input id="ef-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ef-to">Sampai</Label>
              <Input id="ef-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          {query.isLoading ? (
            <Spinner />
          ) : (query.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada faktur ber-PPN pada periode ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>Nomor</th>
                    <th className={th}>Tanggal</th>
                    <th className={th}>NPWP</th>
                    <th className={th}>Pembeli</th>
                    <th className={`${th} text-right`}>DPP</th>
                    <th className={`${th} text-right`}>PPN</th>
                    <th className={`${th} text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data!.rows.map((r) => (
                    <tr key={r.invoiceNo}>
                      <td className={`${td} font-mono text-xs`}>{r.invoiceNo}</td>
                      <td className={`${td} tabular-nums`}>{formatDate(r.invoiceDate)}</td>
                      <td className={`${td} font-mono text-xs`}>{r.buyerNpwp ?? "000000000000000"}</td>
                      <td className={td}>{r.buyerName}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.dpp)}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.ppn)}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4" colSpan={4}>
                      Total ({query.data!.rows.length} faktur)
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatIDR(query.data!.totalDpp)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatIDR(query.data!.totalPpn)}</td>
                    <td className="py-2 text-right tabular-nums">{formatIDR(query.data!.totalDpp + query.data!.totalPpn)}</td>
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
          <h1 className="text-2xl font-semibold">Neraca</h1>
          {query.data ? (
            query.data.balanced ? (
              <Badge tone="brand">seimbang ✓</Badge>
            ) : (
              <Badge tone="amber">TIDAK seimbang</Badge>
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
                  ...query.data!.assets.map((l) => [l.code, l.name, "Aset", l.amount] as (string | number)[]),
                  ...query.data!.liabilities.map((l) => [l.code, l.name, "Kewajiban", l.amount] as (string | number)[]),
                  ...query.data!.equity.map((l) => [l.code, l.name, "Ekuitas", l.amount] as (string | number)[]),
                ],
              )
            }
          />
        ) : null}
      </div>
      <Card>
        <CardBody className="space-y-5">
          <div>
            <Label htmlFor="bs-asof">Per tanggal</Label>
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
              <ReportSection title="Aset" lines={query.data.assets} total={query.data.totalAssets} />
              <ReportSection title="Kewajiban" lines={query.data.liabilities} total={query.data.totalLiabilities} />
              <ReportSection title="Ekuitas" lines={query.data.equity} total={query.data.totalEquity} />
              <div className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold dark:bg-slate-800">
                <span>Kewajiban + Ekuitas</span>
                <span className="tabular-nums">{formatIDR(query.data.totalLiabilities + query.data.totalEquity)}</span>
              </div>
            </>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

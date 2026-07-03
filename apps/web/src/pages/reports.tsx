import type { ApiReportLine } from "@erpindo/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, formatIDR } from "../api/client";
import { Badge, Card, CardBody, CardHeader, Input, Label, Spinner } from "../components/ui";
import { useWorkspace } from "./app";

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
      <h1 className="text-2xl font-semibold">Laba Rugi</h1>
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

import type { ApiConsolidatedRow, ApiConsolidationCompany } from "@erpindo/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, downloadCsv, formatIDR } from "../api/client";
import { Badge, Card, CardBody, Label, Input, Spinner } from "../components/ui";
import { ExportButton } from "./reports";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthStart(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

type Mode = "income" | "balance";

/**
 * Tabel konsolidasi: satu baris per akun, satu kolom per perusahaan + kolom
 * Total. `perCompanyTotals` menampilkan baris total di kaki tabel.
 */
function ConsolidatedTable({
  title,
  companies,
  rows,
  perCompanyTotals,
  totalLabel,
}: {
  title: string;
  companies: ApiConsolidationCompany[];
  rows: ApiConsolidatedRow[];
  perCompanyTotals: Record<string, number>;
  totalLabel: string;
}) {
  const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";
  const td = "border-b border-slate-100 py-2 pr-4 dark:border-slate-800/60";
  const grand = companies.reduce((s, c) => s + (perCompanyTotals[c.tenantId] ?? 0), 0);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className={th}>Akun</th>
              {companies.map((c) => (
                <th key={c.tenantId} className={`${th} text-right`}>
                  {c.name}
                </th>
              ))}
              <th className={`${th} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-slate-400" colSpan={companies.length + 2}>
                  Tidak ada data.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.code}>
                  <td className={td}>
                    <span className="font-mono text-xs text-slate-400">{r.code}</span> {r.name}
                  </td>
                  {companies.map((c) => {
                    const v = r.amounts[c.tenantId] ?? 0;
                    return (
                      <td key={c.tenantId} className={`${td} text-right tabular-nums`}>
                        {v ? formatIDR(v) : "—"}
                      </td>
                    );
                  })}
                  <td className={`${td} text-right font-medium tabular-nums`}>{formatIDR(r.total)}</td>
                </tr>
              ))
            )}
            <tr className="font-semibold">
              <td className="py-2 pr-4">{totalLabel}</td>
              {companies.map((c) => (
                <td key={c.tenantId} className="py-2 pr-4 text-right tabular-nums">
                  {formatIDR(perCompanyTotals[c.tenantId] ?? 0)}
                </td>
              ))}
              <td className="py-2 text-right tabular-nums">{formatIDR(grand)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ConsolidationPage() {
  const [mode, setMode] = useState<Mode>("income");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [selected, setSelected] = useState<string[] | null>(null); // null = semua

  const companiesQuery = useQuery({
    queryKey: ["consolidation-companies"],
    queryFn: api.consolidationCompanies,
  });

  const allIds = useMemo(
    () => (companiesQuery.data?.companies ?? []).map((c) => c.tenantId),
    [companiesQuery.data],
  );
  const activeIds = selected ?? allIds;

  const incomeQuery = useQuery({
    queryKey: ["consolidated-income", from, to, activeIds],
    queryFn: () => api.consolidatedIncomeStatement(from, to, activeIds),
    enabled: mode === "income" && activeIds.length > 0 && Boolean(from && to),
  });
  const balanceQuery = useQuery({
    queryKey: ["consolidated-balance", asOf, activeIds],
    queryFn: () => api.consolidatedBalanceSheet(asOf, activeIds),
    enabled: mode === "balance" && activeIds.length > 0 && Boolean(asOf),
  });

  function toggleCompany(id: string) {
    const cur = selected ?? allIds;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setSelected(next);
  }

  const companies = companiesQuery.data?.companies ?? [];
  const soloCompany = companies.length < 2;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Konsolidasi</h1>
          {mode === "balance" && balanceQuery.data ? (
            balanceQuery.data.balanced ? (
              <Badge tone="brand">seimbang ✓</Badge>
            ) : (
              <Badge tone="amber">TIDAK seimbang</Badge>
            )
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
            <button
              className={`px-3 py-1.5 text-sm ${
                mode === "income" ? "bg-brand-600 text-white" : "text-slate-600 dark:text-slate-300"
              }`}
              onClick={() => setMode("income")}
            >
              Laba Rugi
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${
                mode === "balance" ? "bg-brand-600 text-white" : "text-slate-600 dark:text-slate-300"
              }`}
              onClick={() => setMode("balance")}
            >
              Neraca
            </button>
          </div>
          {mode === "income" && incomeQuery.data ? (
            <ExportButton
              onClick={() =>
                downloadCsv(
                  `konsolidasi-laba-rugi-${from}-${to}.csv`,
                  ["Kode", "Akun", "Kelompok", ...companies.map((c) => c.name), "Total"],
                  [
                    ...incomeQuery.data!.income.map(
                      (r) => [r.code, r.name, "Pendapatan", ...companies.map((c) => r.amounts[c.tenantId] ?? 0), r.total] as (string | number)[],
                    ),
                    ...incomeQuery.data!.expense.map(
                      (r) => [r.code, r.name, "Beban", ...companies.map((c) => r.amounts[c.tenantId] ?? 0), r.total] as (string | number)[],
                    ),
                  ],
                )
              }
            />
          ) : mode === "balance" && balanceQuery.data ? (
            <ExportButton
              onClick={() =>
                downloadCsv(
                  `konsolidasi-neraca-${asOf}.csv`,
                  ["Kode", "Akun", "Kelompok", ...companies.map((c) => c.name), "Total"],
                  [
                    ...balanceQuery.data!.assets.map(
                      (r) => [r.code, r.name, "Aset", ...companies.map((c) => r.amounts[c.tenantId] ?? 0), r.total] as (string | number)[],
                    ),
                    ...balanceQuery.data!.liabilities.map(
                      (r) => [r.code, r.name, "Kewajiban", ...companies.map((c) => r.amounts[c.tenantId] ?? 0), r.total] as (string | number)[],
                    ),
                    ...balanceQuery.data!.equity.map(
                      (r) => [r.code, r.name, "Ekuitas", ...companies.map((c) => r.amounts[c.tenantId] ?? 0), r.total] as (string | number)[],
                    ),
                  ],
                )
              }
            />
          ) : null}
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Laporan gabungan seluruh perusahaan yang Anda miliki — nilai per akun dijumlahkan lintas perusahaan, dengan
        rincian per perusahaan di setiap kolom.
      </p>

      <Card>
        <CardBody className="space-y-5">
          {companiesQuery.isLoading ? (
            <Spinner />
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-4">
                {mode === "income" ? (
                  <>
                    <div>
                      <Label htmlFor="cons-from">Dari</Label>
                      <Input id="cons-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="cons-to">Sampai</Label>
                      <Input id="cons-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <div>
                    <Label htmlFor="cons-asof">Per tanggal</Label>
                    <Input id="cons-asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                  </div>
                )}
              </div>

              <div>
                <Label>Perusahaan disertakan</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {companies.map((c) => {
                    const on = activeIds.includes(c.tenantId);
                    return (
                      <button
                        key={c.tenantId}
                        onClick={() => toggleCompany(c.tenantId)}
                        className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                          on
                            ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                            : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                        }`}
                      >
                        {on ? "✓ " : ""}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                {soloCompany ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Anda baru memiliki satu perusahaan. Tambahkan perusahaan lain di Pengaturan untuk melihat laporan
                    gabungan.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {activeIds.length === 0 ? null : mode === "income" ? (
        incomeQuery.isLoading ? (
          <Spinner />
        ) : incomeQuery.data ? (
          <Card>
            <CardBody className="space-y-6">
              <ConsolidatedTable
                title="Pendapatan"
                companies={incomeQuery.data.companies}
                rows={incomeQuery.data.income}
                perCompanyTotals={incomeQuery.data.totalIncomeByCompany}
                totalLabel="Total Pendapatan"
              />
              <ConsolidatedTable
                title="Beban"
                companies={incomeQuery.data.companies}
                rows={incomeQuery.data.expense}
                perCompanyTotals={incomeQuery.data.totalExpenseByCompany}
                totalLabel="Total Beban"
              />
              <div
                className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm font-semibold ${
                  incomeQuery.data.netProfit >= 0
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                }`}
              >
                <span>{incomeQuery.data.netProfit >= 0 ? "Laba Bersih Konsolidasi" : "Rugi Bersih Konsolidasi"}</span>
                <span className="tabular-nums">{formatIDR(Math.abs(incomeQuery.data.netProfit))}</span>
              </div>
            </CardBody>
          </Card>
        ) : null
      ) : balanceQuery.isLoading ? (
        <Spinner />
      ) : balanceQuery.data ? (
        <Card>
          <CardBody className="space-y-6">
            <ConsolidatedTable
              title="Aset"
              companies={balanceQuery.data.companies}
              rows={balanceQuery.data.assets}
              perCompanyTotals={balanceQuery.data.totalAssetsByCompany}
              totalLabel="Total Aset"
            />
            <ConsolidatedTable
              title="Kewajiban"
              companies={balanceQuery.data.companies}
              rows={balanceQuery.data.liabilities}
              perCompanyTotals={balanceQuery.data.totalLiabilitiesByCompany}
              totalLabel="Total Kewajiban"
            />
            <ConsolidatedTable
              title="Ekuitas"
              companies={balanceQuery.data.companies}
              rows={balanceQuery.data.equity}
              perCompanyTotals={balanceQuery.data.totalEquityByCompany}
              totalLabel="Total Ekuitas"
            />
            <div className="flex items-center justify-between rounded-lg bg-slate-100 px-4 py-3 text-sm font-semibold dark:bg-slate-800">
              <span>Kewajiban + Ekuitas Konsolidasi</span>
              <span className="tabular-nums">
                {formatIDR(balanceQuery.data.totalLiabilities + balanceQuery.data.totalEquity)}
              </span>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

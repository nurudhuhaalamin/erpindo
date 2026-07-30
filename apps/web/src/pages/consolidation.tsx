import type { ApiConsolidatedRow, ApiConsolidationCompany } from "@erpindo/shared";
import { useHeading } from "../i18n/pageHeadings";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, downloadCsv, formatIDR } from "../api/client";
import {
  Badge,
  Card,
  CardBody,
  Label,
  Input,
  Spinner,
  Table,
  Td,
  Th,
  Thead,
  Tr,
} from "../components/ui";
import { useUi } from "../i18n/ui";
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
  const u = useUi();
  const grand = companies.reduce((s, c) => s + (perCompanyTotals[c.tenantId] ?? 0), 0);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      {/* Kolom tabel ini DINAMIS — satu kolom per perusahaan. Karena itu
          `label` kartu tidak bisa ditulis tetap seperti tabel lain: ia harus
          ikut `c.name`, kalau tidak pembaca di HP melihat deretan angka tanpa
          tahu angka siapa. Inilah satu-satunya bentuk tabel di aplikasi ini
          yang jumlah kolomnya ditentukan data, bukan kode. */}
      <Table>
        <Thead>
          <tr>
            <Th>{u("akun")}</Th>
            {companies.map((c) => (
              <Th key={c.tenantId} numeric>
                {c.name}
              </Th>
            ))}
            <Th numeric>{u("total")}</Th>
          </tr>
        </Thead>
        <tbody>
          {rows.length === 0 ? (
            <Tr>
              <Td className="text-slate-400" colSpan={companies.length + 2}>
                {u("tidakAdaData")}
              </Td>
            </Tr>
          ) : (
            rows.map((r) => (
              <Tr key={r.code} className={r.eliminated ? "text-slate-400 dark:text-slate-500" : undefined}>
                {/* Bukan `numeric`: selnya memuat kode DAN nama akun. */}
                <Td label={u("akun")}>
                  <span className="font-mono text-xs text-slate-400">{r.code}</span> {r.name}
                  {/* Baris antar-perusahaan tetap DITAMPILKAN, hanya ditandai:
                      eliminasi yang menghilangkan angka diam-diam membuat
                      laporan mustahil ditelusuri saat totalnya tidak cocok
                      dengan pembukuan masing-masing perusahaan. */}
                  {r.eliminated ? (
                    <span className="ml-2">
                      <Badge tone="amber">{u("dieliminasi")}</Badge>
                    </span>
                  ) : null}
                </Td>
                {companies.map((c) => {
                  const v = r.amounts[c.tenantId] ?? 0;
                  return (
                    <Td key={c.tenantId} numeric label={c.name}>
                      {v ? formatIDR(v) : "—"}
                    </Td>
                  );
                })}
                <Td numeric label={u("total")} className="font-medium">
                  {formatIDR(r.total)}
                </Td>
              </Tr>
            ))
          )}
          <Tr className="font-semibold">
            <Td>{totalLabel}</Td>
            {companies.map((c) => (
              <Td key={c.tenantId} numeric label={c.name}>
                {formatIDR(perCompanyTotals[c.tenantId] ?? 0)}
              </Td>
            ))}
            <Td numeric label={u("total")}>
              {formatIDR(grand)}
            </Td>
          </Tr>
        </tbody>
      </Table>
    </div>
  );
}

export function ConsolidationPage() {
  const u = useUi();
  const h = useHeading("konsolidasi");
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
    [companiesQuery.data]
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
          <h1 className="text-2xl font-semibold">{h.title}</h1>
          {mode === "balance" && balanceQuery.data ? (
            balanceQuery.data.balanced ? (
              <Badge tone="brand">{u("seimbangCentang")}</Badge>
            ) : (
              <Badge tone="amber">{u("tidakSeimbang")}</Badge>
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
              {u("labaRugiTab")}
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${
                mode === "balance"
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
              onClick={() => setMode("balance")}
            >
              {u("neracaTab")}
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
                      (r) =>
                        [
                          r.code,
                          r.name,
                          "Pendapatan",
                          ...companies.map((c) => r.amounts[c.tenantId] ?? 0),
                          r.total,
                        ] as (string | number)[]
                    ),
                    ...incomeQuery.data!.expense.map(
                      (r) =>
                        [
                          r.code,
                          r.name,
                          "Beban",
                          ...companies.map((c) => r.amounts[c.tenantId] ?? 0),
                          r.total,
                        ] as (string | number)[]
                    ),
                  ]
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
                      (r) =>
                        [
                          r.code,
                          r.name,
                          "Aset",
                          ...companies.map((c) => r.amounts[c.tenantId] ?? 0),
                          r.total,
                        ] as (string | number)[]
                    ),
                    ...balanceQuery.data!.liabilities.map(
                      (r) =>
                        [
                          r.code,
                          r.name,
                          "Kewajiban",
                          ...companies.map((c) => r.amounts[c.tenantId] ?? 0),
                          r.total,
                        ] as (string | number)[]
                    ),
                    ...balanceQuery.data!.equity.map(
                      (r) =>
                        [
                          r.code,
                          r.name,
                          "Ekuitas",
                          ...companies.map((c) => r.amounts[c.tenantId] ?? 0),
                          r.total,
                        ] as (string | number)[]
                    ),
                  ]
                )
              }
            />
          ) : null}
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        {u("descKonsolidasi")}
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
                      <Label htmlFor="cons-from">{u("dari")}</Label>
                      <Input
                        id="cons-from"
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="cons-to">{u("sampai")}</Label>
                      <Input
                        id="cons-to"
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <Label htmlFor="cons-asof">{u("perTanggal")}</Label>
                    <Input
                      id="cons-asof"
                      type="date"
                      value={asOf}
                      onChange={(e) => setAsOf(e.target.value)}
                    />
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
                    {u("satuPerusahaanSaja")}
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
                title={u("pendapatan")}
                companies={incomeQuery.data.companies}
                rows={incomeQuery.data.income}
                perCompanyTotals={incomeQuery.data.totalIncomeByCompany}
                totalLabel="Total Pendapatan"
              />
              <ConsolidatedTable
                title={u("beban")}
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
                <span>
                  {incomeQuery.data.netProfit >= 0
                    ? u("labaBersihKonsolidasi")
                    : u("rugiBersihKonsolidasi")}
                </span>
                <span className="tabular-nums">
                  {formatIDR(Math.abs(incomeQuery.data.netProfit))}
                </span>
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
              title={u("aset")}
              companies={balanceQuery.data.companies}
              rows={balanceQuery.data.assets}
              perCompanyTotals={balanceQuery.data.totalAssetsByCompany}
              totalLabel={u("totalAset")}
            />
            <ConsolidatedTable
              title={u("kewajiban")}
              companies={balanceQuery.data.companies}
              rows={balanceQuery.data.liabilities}
              perCompanyTotals={balanceQuery.data.totalLiabilitiesByCompany}
              totalLabel="Total Kewajiban"
            />
            <ConsolidatedTable
              title={u("ekuitas")}
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

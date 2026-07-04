import type { ApiBudgetRow } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, downloadCsv, formatIDR } from "../api/client";
import { Button, Card, CardBody, CardHeader, Input, Label, Spinner, useToast } from "../components/ui";
import { useWorkspace } from "./app";
import { ExportButton } from "./reports";

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Baris anggaran dengan input tersimpan saat blur (hanya untuk admin). */
function BudgetRow({ row, period, editable }: { row: ApiBudgetRow; period: string; editable: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(row.budget || ""));

  // Sinkronkan input bila data server berubah (mis. ganti periode).
  useEffect(() => setValue(String(row.budget || "")), [row.budget, row.accountId, period]);

  const save = useMutation({
    mutationFn: (amount: number) => api.setBudget(tenant.tenantId, { accountId: row.accountId, period, amount }),
    onSuccess: () => {
      toast("success", `Anggaran ${row.name} disimpan.`);
      queryClient.invalidateQueries({ queryKey: ["budgets", tenant.tenantId, period] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const commit = () => {
    const amount = Number(value) || 0;
    if (amount !== row.budget) save.mutate(amount);
  };

  const favorable = row.variance >= 0;
  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
      <td className="py-1.5 pr-3 font-mono text-xs text-slate-400">{row.code}</td>
      <td className="py-1.5 pr-3">{row.name}</td>
      <td className="py-1.5 pr-3 text-right">
        {editable ? (
          <Input
            aria-label={`Anggaran ${row.name}`}
            type="number"
            min={0}
            className="h-8 w-32 text-right"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
          />
        ) : (
          <span className="tabular-nums">{formatIDR(row.budget)}</span>
        )}
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{formatIDR(row.actual)}</td>
      <td
        className={`py-1.5 text-right tabular-nums ${
          favorable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        }`}
      >
        {favorable ? "+" : ""}
        {formatIDR(row.variance)}
      </td>
    </tr>
  );
}

function BudgetTable({
  title,
  rows,
  period,
  editable,
}: {
  title: string;
  rows: ApiBudgetRow[];
  period: string;
  editable: boolean;
}) {
  const totBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totActual = rows.reduce((s, r) => s + r.actual, 0);
  const totVar = rows.reduce((s, r) => s + r.variance, 0);
  const favorable = totVar >= 0;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="pb-1 pr-3 font-medium">Kode</th>
              <th className="pb-1 pr-3 font-medium">Akun</th>
              <th className="pb-1 pr-3 text-right font-medium">Anggaran</th>
              <th className="pb-1 pr-3 text-right font-medium">Realisasi</th>
              <th className="pb-1 text-right font-medium">Selisih</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-center text-slate-400">
                  Belum ada akun {title.toLowerCase()}.
                </td>
              </tr>
            ) : (
              rows.map((r) => <BudgetRow key={r.accountId} row={r} period={period} editable={editable} />)
            )}
            <tr className="border-t border-slate-200 font-semibold dark:border-slate-800">
              <td className="py-1.5 pr-3" colSpan={2}>
                Total {title}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatIDR(totBudget)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatIDR(totActual)}</td>
              <td
                className={`py-1.5 text-right tabular-nums ${
                  favorable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {favorable ? "+" : ""}
                {formatIDR(totVar)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BudgetPage() {
  const { tenant } = useWorkspace();
  const editable = tenant.role !== "viewer";
  const [period, setPeriod] = useState(thisMonth);

  const query = useQuery({
    queryKey: ["budgets", tenant.tenantId, period],
    queryFn: () => api.budgets(tenant.tenantId, period),
    enabled: /^\d{4}-\d{2}$/.test(period),
  });

  const income = (query.data?.rows ?? []).filter((r) => r.type === "income");
  const expense = (query.data?.rows ?? []).filter((r) => r.type === "expense");
  const budgetProfit = (query.data?.totalBudgetIncome ?? 0) - (query.data?.totalBudgetExpense ?? 0);
  const actualProfit = (query.data?.totalActualIncome ?? 0) - (query.data?.totalActualExpense ?? 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Anggaran</h1>
        {query.data ? (
          <ExportButton
            onClick={() =>
              downloadCsv(
                `anggaran-${period}.csv`,
                ["Kode", "Akun", "Jenis", "Anggaran", "Realisasi", "Selisih"],
                query.data!.rows.map(
                  (r) =>
                    [r.code, r.name, r.type === "income" ? "Pendapatan" : "Beban", r.budget, r.actual, r.variance] as (
                      | string
                      | number
                    )[],
                ),
              )
            }
          />
        ) : null}
      </div>

      <Card>
        <CardHeader
          title="Anggaran vs realisasi"
          description="Tetapkan target pendapatan & beban per bulan; realisasi dihitung otomatis dari jurnal. Selisih hijau = menguntungkan (pendapatan di atas target atau beban di bawah target)."
        />
        <CardBody className="space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="budget-period">Periode (bulan)</Label>
              <Input id="budget-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
            {!editable ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Hanya Owner/Admin yang dapat mengubah anggaran.
              </p>
            ) : null}
          </div>

          {query.isLoading ? (
            <Spinner />
          ) : (
            <>
              <BudgetTable title="Pendapatan" rows={income} period={period} editable={editable} />
              <BudgetTable title="Beban" rows={expense} period={period} editable={editable} />

              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="font-medium">Laba/rugi</div>
                  <div className="text-right text-slate-500 dark:text-slate-400">
                    Anggaran: <span className="tabular-nums">{formatIDR(budgetProfit)}</span>
                  </div>
                  <div className="text-right font-semibold tabular-nums">Realisasi: {formatIDR(actualProfit)}</div>
                </div>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

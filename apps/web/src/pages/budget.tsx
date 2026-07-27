import type { ApiBudgetRow } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, downloadCsv, formatIDR } from "../api/client";
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  PageHeading,
  Spinner,
  Table,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "../components/ui";
import { useUi } from "../i18n/ui";
import { useWorkspace } from "./app";
import { ExportButton } from "./reports";

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Baris anggaran dengan input tersimpan saat blur (hanya untuk admin). */
function BudgetRow({
  row,
  period,
  editable,
}: {
  row: ApiBudgetRow;
  period: string;
  editable: boolean;
}) {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(row.budget || ""));

  // Sinkronkan input bila data server berubah (mis. ganti periode).
  useEffect(() => setValue(String(row.budget || "")), [row.budget, row.accountId, period]);

  const save = useMutation({
    mutationFn: (amount: number) =>
      api.setBudget(tenant.tenantId, { accountId: row.accountId, period, amount }),
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
    // `align-top` supaya baris lain tidak ikut merenggang mengikuti tinggi
    // input anggaran (pola yang sama dengan work order 18o & routing 18p).
    <Tr className="align-top">
      <Td label={u("kodeKolom")} className="font-mono text-xs text-slate-400">
        {row.code}
      </Td>
      <Td label={u("akun")}>{row.name}</Td>
      {/* Kolom Anggaran TIDAK memakai `numeric`: bagi admin selnya memuat
          kontrol form, bukan nilai — sama seperti sel berisi lencana (17g).
          Perataan kanan tetap dipasang manual agar kolomnya berbaris. */}
      <Td label={u("anggaranKolom")} className="text-right">
        {editable ? (
          <Input
            aria-label={`Anggaran ${row.name}`}
            type="number"
            min={0}
            className="w-32 text-right"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
          />
        ) : (
          <span className="num">{formatIDR(row.budget)}</span>
        )}
      </Td>
      <Td numeric label={u("realisasi")}>
        {formatIDR(row.actual)}
      </Td>
      <Td
        numeric
        label={u("selisihKolom")}
        className={
          favorable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        }
      >
        {favorable ? "+" : ""}
        {formatIDR(row.variance)}
      </Td>
    </Tr>
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
  const u = useUi();
  const totBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totActual = rows.reduce((s, r) => s + r.actual, 0);
  const totVar = rows.reduce((s, r) => s + r.variance, 0);
  const favorable = totVar >= 0;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <Table>
        <Thead>
          <tr>
            <Th>{u("kodeKolom")}</Th>
            <Th>{u("akun")}</Th>
            <Th numeric>{u("anggaranKolom")}</Th>
            <Th numeric>{u("realisasi")}</Th>
            <Th numeric>{u("selisihKolom")}</Th>
          </tr>
        </Thead>
        <tbody>
          {rows.length === 0 ? (
            <Tr>
              {/* Baris kosong: `text-center` sengaja dilepas di layar kecil —
                  di mode kartu selnya membentang penuh, jadi rata tengah
                  membuatnya terbaca seperti judul, bukan keterangan. */}
              <Td colSpan={5} className="text-slate-400 md:text-center">
                {u("belumAdaAkunSuffix")} {title.toLowerCase()}.
              </Td>
            </Tr>
          ) : (
            rows.map((r) => (
              <BudgetRow key={r.accountId} row={r} period={period} editable={editable} />
            ))
          )}
          <Tr className="border-t border-slate-200 font-semibold dark:border-slate-800">
            <Td colSpan={2}>
              {u("totalPrefix")} {title}
            </Td>
            <Td numeric label={u("anggaranKolom")}>
              {formatIDR(totBudget)}
            </Td>
            <Td numeric label={u("realisasi")}>
              {formatIDR(totActual)}
            </Td>
            <Td
              numeric
              label={u("selisihKolom")}
              className={
                favorable
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {favorable ? "+" : ""}
              {formatIDR(totVar)}
            </Td>
          </Tr>
        </tbody>
      </Table>
    </div>
  );
}

export function BudgetPage() {
  const u = useUi();
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
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <PageHeading k="anggaran" />
        </div>
        {query.data ? (
          <ExportButton
            onClick={() =>
              downloadCsv(
                `anggaran-${period}.csv`,
                ["Kode", "Akun", "Jenis", "Anggaran", "Realisasi", "Selisih"],
                query.data!.rows.map(
                  (r) =>
                    [
                      r.code,
                      r.name,
                      r.type === "income" ? "Pendapatan" : "Beban",
                      r.budget,
                      r.actual,
                      r.variance,
                    ] as (string | number)[]
                )
              )
            }
          />
        ) : null}
      </div>

      <Card>
        <CardHeader
          title={u("anggaranVsRealisasi")}
          description={u("descAnggaranRealisasi")}
        />
        <CardBody className="space-y-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="budget-period">{u("periodeBulan")}</Label>
              <Input
                id="budget-period"
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
            {!editable ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {u("hanyaOwnerUbahAnggaran")}
              </p>
            ) : null}
          </div>

          {query.isLoading ? (
            <Spinner />
          ) : (
            <>
              <BudgetTable title={u("pendapatan")} rows={income} period={period} editable={editable} />
              <BudgetTable title={u("beban")} rows={expense} period={period} editable={editable} />

              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  <div className="font-medium">{u("labaRugiKecil")}</div>
                  <div className="text-slate-500 dark:text-slate-400 sm:text-right">
                    Anggaran: <span className="tabular-nums">{formatIDR(budgetProfit)}</span>
                  </div>
                  <div className="font-semibold tabular-nums sm:text-right">
                    Realisasi: {formatIDR(actualProfit)}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

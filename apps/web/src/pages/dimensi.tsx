import { BANK_CSV_PRESETS } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { api, downloadCsv, formatIDR } from "../api/client";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Input,
  Label,
  PageHeading,
  Select,
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

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 7) + "-01";

export function DimensiPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  return (
    <div className="space-y-6">
      <div>
        <PageHeading k="dimensiRekonsiliasi" />
      </div>
      {isAdmin ? <CostCenterCard /> : null}
      <DimensionReportCard />
      {isAdmin ? <BankRuleCard /> : null}
    </div>
  );
}

function CostCenterCard() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["cost-centers", tenant.tenantId],
    queryFn: () => api.costCenters(tenant.tenantId),
  });
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [toArchive, setToArchive] = useState<{ id: string; name: string } | null>(null);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["cost-centers", tenant.tenantId] });

  const create = useMutation({
    mutationFn: () =>
      api.createCostCenter(tenant.tenantId, { code: code.trim(), name: name.trim() }),
    onSuccess: () => {
      setCode("");
      setName("");
      invalidate();
      toast("success", "Cost center ditambahkan.");
    },
    onError: (e: Error) => toast("error", e.message),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.archiveCostCenter(tenant.tenantId, id),
    onSuccess: () => {
      setToArchive(null);
      invalidate();
      toast("success", "Cost center diarsipkan.");
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const items = query.data?.items ?? [];
  return (
    <Card>
      <CardHeader
        title={u("dmCostCenter")}
        description={u("descCostCenter")}
      />
      <CardBody className="space-y-4">
        <form
          className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim() && name.trim()) create.mutate();
          }}
        >
          <div>
            <Label htmlFor="cc-code">Kode</Label>
            <Input
              id="cc-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CAB-BDG"
            />
          </div>
          <div>
            <Label htmlFor="cc-name">{u("nama")}</Label>
            <Input
              id="cc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={u("dmPhNamaDimensi")}
            />
          </div>
          <Button type="submit" disabled={create.isPending || !code.trim() || !name.trim()}>
            {create.isPending ? <Spinner /> : null} {u("tambah")}
          </Button>
        </form>
        {query.isLoading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{u("belumAdaCostCenter")}</p>
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Kode</Th>
                <Th>{u("nama")}</Th>
                <Th></Th>
              </tr>
            </Thead>
            <tbody>
              {items.map((cc) => (
                <Tr key={cc.id}>
                  <Td label={u("kode")} className="font-mono text-xs">
                    {cc.code}
                  </Td>
                  <Td label={u("nama")}>{cc.name}</Td>
                  <Td className="text-right">
                    <button
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                      onClick={() => setToArchive({ id: cc.id, name: cc.name })}
                    >
                      Arsipkan
                    </button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <ConfirmDialog
          open={toArchive !== null}
          title={u("arsipkanCostCenter")}
          description={
            toArchive
              ? `${toArchive.name} ${u("takLagiBisaDipilih")}`
              : undefined
          }
          confirmLabel={u("arsipkan")}
          danger
          busy={archive.isPending}
          onConfirm={() => toArchive && archive.mutate(toArchive.id)}
          onCancel={() => setToArchive(null)}
        />
      </CardBody>
    </Card>
  );
}

function DimensionReportCard() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const query = useQuery({
    queryKey: ["dimension-report", tenant.tenantId, from, to],
    queryFn: () => api.dimensionReport(tenant.tenantId, from, to),
    enabled: Boolean(from && to),
  });
  const rows = query.data?.rows ?? [];
  return (
    <Card>
      <CardHeader
        title={u("labaRugiPerDimensi")}
        description={u("descLabaRugiDimensi")}
        action={
          rows.length > 0 ? (
            <Button
              variant="secondary"
              className="h-9"
              onClick={() =>
                downloadCsv(
                  `dimensi-${from}-${to}.csv`,
                  ["Kode", "Nama", "Pendapatan", "Beban", "Laba/Rugi"],
                  rows.map((r) => [r.code, r.name, r.income, r.expense, r.net])
                )
              }
            >
              <Download className="size-4" aria-hidden /> Ekspor CSV
            </Button>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="dim-from">{u("dari")}</Label>
            <Input
              id="dim-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dim-to">Sampai</Label>
            <Input id="dim-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {query.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {u("belumAdaTransaksiPeriode")}
          </p>
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Dimensi</Th>
                <Th numeric>Pendapatan</Th>
                <Th numeric>Beban</Th>
                <Th numeric>{u("labaRugiKolom")}</Th>
              </tr>
            </Thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.costCenterId ?? "none"}>
                  <Td label={u("dmDimensi")}>
                    {r.costCenterId ? (
                      <span className="font-mono text-xs text-slate-400">{r.code}</span>
                    ) : null}{" "}
                    {r.name}
                  </Td>
                  <Td numeric label={u("pendapatan")}>
                    {formatIDR(r.income)}
                  </Td>
                  <Td numeric label={u("beban")}>
                    {formatIDR(r.expense)}
                  </Td>
                  <Td
                    numeric
                    label={u("labaRugiKolom")}
                    className={`font-medium ${r.net < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                  >
                    {formatIDR(r.net)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function BankRuleCard() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const rulesQuery = useQuery({
    queryKey: ["bank-rules", tenant.tenantId],
    queryFn: () => api.bankMatchRules(tenant.tenantId),
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });
  const bankAccounts = (accountsQuery.data?.accounts ?? []).filter(
    (a) =>
      a.type === "asset" &&
      !a.isArchived &&
      (a.code.startsWith("1-10") || a.code.startsWith("1-11"))
  );
  const [accountId, setAccountId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [tolerance, setTolerance] = useState("3");
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["bank-rules", tenant.tenantId] });

  const create = useMutation({
    mutationFn: () =>
      api.createBankMatchRule(tenant.tenantId, {
        accountId,
        keyword: keyword.trim(),
        dateTolerance: Number(tolerance) || 3,
      }),
    onSuccess: () => {
      setKeyword("");
      invalidate();
      toast("success", "Aturan auto-match disimpan.");
    },
    onError: (e: Error) => toast("error", e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteBankMatchRule(tenant.tenantId, id),
    onSuccess: () => {
      invalidate();
      toast("success", "Aturan dihapus.");
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const rules = rulesQuery.data?.rules ?? [];
  const accName = (id: string) =>
    bankAccounts.find((a) => a.id === id)?.name ??
    accountsQuery.data?.accounts.find((a) => a.id === id)?.name ??
    id;
  return (
    <Card>
      <CardHeader
        title={u("rekonsiliasiV2")}
        description={u("descRekonsiliasiV2")}
      />
      <CardBody className="space-y-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_7rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (accountId && keyword.trim()) create.mutate();
          }}
        >
          <div>
            <Label htmlFor="br-acc">{u("akunBank")}</Label>
            <Select id="br-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{u("pilihAkunOpsi")}</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="br-kw">{u("kataKunciDeskripsi")}</Label>
            <Input
              id="br-kw"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={u("contohKataKunciBank")}
            />
          </div>
          <div>
            <Label htmlFor="br-tol">Toleransi (hari)</Label>
            <Input
              id="br-tol"
              type="number"
              min={0}
              max={14}
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={create.isPending || !accountId || !keyword.trim()}>
            {create.isPending ? <Spinner /> : null} {u("simpanAturan")}
          </Button>
        </form>
        {rules.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <span>
                  <Badge tone="neutral">{accName(r.accountId)}</Badge>
                  {u("kataKunciPrefix")} "<strong>{r.keyword}</strong>" · ±{r.dateTolerance}{" "}
                  {u("hariSuffixTol")}
                </span>
                <button
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                  onClick={() => del.mutate(r.id)}
                >
                  {u("hapus")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{u("belumAdaAturanTersimpan")}</p>
        )}
        <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/40">
          <p className="font-medium">{u("formatImporKoran")}</p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            {u("descFormatImpor")}{" "}
            {BANK_CSV_PRESETS.map((p) => p.label.split(" (")[0]).join(", ")}.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

import {
  ACCOUNT_TYPES,
  createAccountSchema,
  type AccountType,
  type ApiAccount,
  type ApiJournalTemplate,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUi, type UiKey } from "../i18n/ui";
import { Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, downloadXlsx, formatDate, formatIDR } from "../api/client";
import { useDebounced } from "./commerce";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  FieldError,
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
import { useWorkspace } from "./app";

// Peta label ACCOUNT_TYPE_LABELS tinggal di packages/shared dan tetap
// berbahasa Indonesia (apps/api ikut memakai paket itu, jadi shared tidak
// boleh bergantung pada kamus web). Pemetaan ke kunci kamus dilakukan di
// sisi web — Fase 16t.
const ACCOUNT_TYPE_KEY: Record<AccountType, UiKey> = {
  asset: "aset",
  liability: "kewajiban",
  equity: "ekuitas",
  income: "pendapatan",
  expense: "beban",
};

function Amount({ value }: { value: number }) {
  return <span className="tabular-nums">{value === 0 ? "—" : formatIDR(value)}</span>;
}


// ---------------------------------------------------------------------------
// Bagan Akun (COA)
// ---------------------------------------------------------------------------

export function AccountsPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const query = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });

  const create = useMutation({
    mutationFn: (input: Parameters<typeof api.createAccount>[1]) =>
      api.createAccount(tenant.tenantId, input),
    onSuccess: () => {
      toast("success", "Akun ditambahkan.");
      queryClient.invalidateQueries({ queryKey: ["accounts", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const toggleIntercompany = useMutation({
    mutationFn: (vars: { id: string; on: boolean }) =>
      api.setAccountIntercompany(tenant.tenantId, vars.id, { isIntercompany: vars.on }),
    onSuccess: (_r, vars) => {
      toast("success", vars.on ? u("toastDitandaiAntarPerusahaan") : u("toastTandaAntarPerusahaanDilepas"));
      queryClient.invalidateQueries({ queryKey: ["accounts", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const rename = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      api.renameAccount(tenant.tenantId, vars.id, vars.name),
    onSuccess: () => {
      toast("success", "Nama akun diperbarui.");
      setRenamingId(null);
      queryClient.invalidateQueries({ queryKey: ["accounts", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  function saveRename(id: string) {
    const name = renameValue.trim();
    if (name.length < 2) {
      toast("error", "Nama akun minimal 2 karakter.");
      return;
    }
    rename.mutate({ id, name });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIssues({});
    const form = e.currentTarget;
    const parsed = createAccountSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setIssues(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    create.mutate(parsed.data, { onSuccess: () => form.reset() });
  }

  return (
    <div className="space-y-6">
      <PageHeading k="baganAkun" />

      {isAdmin ? (
        <Card>
          <CardHeader title={u("tambahAkun")} description={u("akunTemplateOtomatis")} />
          <CardBody>
            <form
              onSubmit={onSubmit}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              noValidate
            >
              <div className="sm:w-36">
                <Label htmlFor="acc-code">{u("kode")}</Label>
                <Input id="acc-code" name="code" placeholder="1-1600" required />
                <FieldError messages={issues.code} />
              </div>
              <div className="flex-1">
                <Label htmlFor="acc-name">{u("namaAkun")}</Label>
                <Input id="acc-name" name="name" placeholder={u("fnPhNamaAkun")} required />
                <FieldError messages={issues.name} />
              </div>
              <div className="sm:w-44">
                <Label htmlFor="acc-type">{u("tipe")}</Label>
                <Select id="acc-type" name="type" defaultValue="asset">
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {u(ACCOUNT_TYPE_KEY[t]!)}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner /> : null} {u("tambah")}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>{u("kode")}</Th>
                  <Th>{u("nama")}</Th>
                  <Th>{u("tipe")}</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <tbody>
                {(query.data?.accounts ?? [])
                  .filter((a) => !a.isArchived)
                  .map((a) => (
                    <Tr key={a.id}>
                      {/* Kode akun: mono, tapi BUKAN `numeric` — ini pengenal,
                          bukan nilai, jadi tidak boleh dirata-kanankan. */}
                      <Td label={u("kode")} className="font-mono text-xs">{a.code}</Td>
                      <Td label={u("nama")}>
                        {renamingId === a.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              aria-label={`${u("namaBaruAkun")} ${a.code}`}
                              className="max-w-xs"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRename(a.id);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              autoFocus
                            />
                            <Button
                              size="xs"
                              onClick={() => saveRename(a.id)}
                              disabled={rename.isPending}
                            >
                              {rename.isPending ? <Spinner /> : null} {u("simpan")}
                            </Button>
                            <Button variant="ghost" size="xs" onClick={() => setRenamingId(null)}>
                              {u("batal")}
                            </Button>
                          </div>
                        ) : (
                          a.name
                        )}
                      </Td>
                      <Td label={u("tipe")}>
                        <Badge>{u(ACCOUNT_TYPE_KEY[a.type]!)}</Badge>
                      </Td>
                      <Td className="text-right">
                        <span className="inline-flex items-center gap-2">
                          {a.isSystem ? <Badge tone="brand">{u("akunSistem")}</Badge> : null}
                          {a.isIntercompany ? (
                            <Badge tone="amber">{u("antarPerusahaan")}</Badge>
                          ) : null}
                          {isAdmin && renamingId !== a.id ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              title={u("descAntarPerusahaan")}
                              onClick={() => toggleIntercompany.mutate({ id: a.id, on: !a.isIntercompany })}
                            >
                              {a.isIntercompany ? u("lepasTandaAntarPerusahaan") : u("tandaiAntarPerusahaan")}
                            </Button>
                          ) : null}
                          {isAdmin && renamingId !== a.id ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                setRenamingId(a.id);
                                setRenameValue(a.name);
                              }}
                            >
                              {u("ubahNama")}
                            </Button>
                          ) : null}
                        </span>
                      </Td>
                    </Tr>
                  ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jurnal Umum — form multi-baris + daftar jurnal terposting
// ---------------------------------------------------------------------------

type DraftLine = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  costCenterId: string;
};
const emptyLine = (): DraftLine => ({
  accountId: "",
  description: "",
  debit: "",
  credit: "",
  costCenterId: "",
});

export function JournalPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });
  const [entrySearch, setEntrySearch] = useState("");
  const entryQ = useDebounced(entrySearch);
  const [entryLimit, setEntryLimit] = useState(100);
  const entriesQuery = useQuery({
    queryKey: ["journal", tenant.tenantId, entryQ, entryLimit],
    queryFn: () => api.journalEntries(tenant.tenantId, { q: entryQ, limit: entryLimit }),
    placeholderData: (prev) => prev,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", tenant.tenantId],
    queryFn: () => api.projects(tenant.tenantId),
  });
  const activeProjects = (projectsQuery.data?.projects ?? []).filter(
    (p) => p.status !== "completed"
  );
  const costCentersQuery = useQuery({
    queryKey: ["cost-centers", tenant.tenantId],
    queryFn: () => api.costCenters(tenant.tenantId),
  });
  const costCenters = costCentersQuery.data?.items ?? [];

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  // Fase 10c — balik jurnal manual: pembalik bertaut dua arah; bila periode
  // asal terkunci, tawarkan pembalikan bertanggal hari ini.
  const [reverseTarget, setReverseTarget] = useState<{ id: string; entryNo: string } | null>(null);
  const [reverseToday, setReverseToday] = useState(false);
  const doReverse = useMutation({
    mutationFn: (input: { id: string; date?: string }) =>
      api.reverseJournalEntry(tenant.tenantId, input.id, input.date),
    onSuccess: (res) => {
      toast(
        "success",
        `Jurnal ${res.entryNo} dibalik — pembalik ${res.reversalEntryNo} diposting.`
      );
      setReverseTarget(null);
      setReverseToday(false);
      queryClient.invalidateQueries({ queryKey: ["journal", tenant.tenantId] });
    },
    onError: (err) => {
      const msg = (err as Error).message;
      if (/sudah ditutup/.test(msg) && reverseTarget && !reverseToday) {
        // Periode asal terkunci — tawarkan sekali lagi dengan tanggal hari ini.
        setReverseToday(true);
        return;
      }
      toast("error", msg);
      setReverseTarget(null);
      setReverseToday(false);
    },
  });
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateMonthly, setTemplateMonthly] = useState(false);
  const [templateFirstDate, setTemplateFirstDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  const saveTemplate = useMutation({
    mutationFn: () =>
      api.createJournalTemplate(tenant.tenantId, {
        name: templateName.trim(),
        memo: memo || undefined,
        lines: lines
          .filter((l) => l.accountId)
          .map((l) => ({
            accountId: l.accountId,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
          })),
        schedule: templateMonthly ? "monthly" : null,
        ...(templateMonthly ? { nextRunDate: templateFirstDate } : {}),
      }),
    onSuccess: () => {
      toast("success", `Template "${templateName.trim()}" tersimpan.`);
      setTemplateOpen(false);
      setTemplateName("");
      queryClient.invalidateQueries({ queryKey: ["journal-templates", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  // Prefill dari draf Asisten AI (sessionStorage) — sekali pakai; tetap
  // ditinjau & diposting manual oleh pengguna.
  useEffect(() => {
    const raw = sessionStorage.getItem("erpindo-ai-draft");
    if (!raw) return;
    sessionStorage.removeItem("erpindo-ai-draft");
    try {
      const draft = JSON.parse(raw) as {
        entryDate: string;
        memo: string;
        lines: { accountId: string; debit: number; credit: number }[];
      };
      setEntryDate(draft.entryDate);
      setMemo(draft.memo);
      setLines(
        draft.lines.map((l) => ({
          accountId: l.accountId,
          description: "",
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
          costCenterId: "",
        }))
      );
      toast("success", "Draf dari Asisten AI dimuat — periksa lalu posting.");
    } catch {
      /* draf rusak — abaikan */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = useMutation({
    mutationFn: (input: Parameters<typeof api.createJournalEntry>[1]) =>
      api.createJournalEntry(tenant.tenantId, input),
    onSuccess: (res) => {
      toast("success", `Jurnal ${res.entryNo} diposting.`);
      setLines([emptyLine(), emptyLine()]);
      setMemo("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["journal", tenant.tenantId] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function submit() {
    setError(null);
    create.mutate({
      entryDate,
      memo: memo || undefined,
      ...(projectId ? { projectId } : {}),
      lines: lines
        .filter((l) => l.accountId)
        .map((l) => ({
          accountId: l.accountId,
          description: l.description || undefined,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          ...(l.costCenterId ? { costCenterId: l.costCenterId } : {}),
        })),
    });
  }

  const activeAccounts = (accountsQuery.data?.accounts ?? []).filter((a) => !a.isArchived);

  return (
    <div className="space-y-6">
      <PageHeading k="jurnalUmum" />

      {isAdmin ? (
        <Card>
          <CardHeader title={u("jurnalManualBaru")} description={u("descJurnalManual")} />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="sm:w-44">
                <Label htmlFor="jr-date">{u("tanggal")}</Label>
                <Input
                  id="jr-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="jr-memo">{u("keterangan")}</Label>
                <Input
                  id="jr-memo"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder={u("contohMemoJurnal")}
                />
              </div>
              {activeProjects.length > 0 ? (
                <div className="sm:w-52">
                  <Label htmlFor="jr-project">{u("proyekOpsional")}</Label>
                  <Select
                    id="jr-project"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">{u("tanpaProyek")}</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-2 gap-2 ${costCenters.length > 0 ? "sm:grid-cols-[1fr_1fr_9rem_7rem_7rem_2.5rem]" : "sm:grid-cols-[1fr_1fr_8rem_8rem_2.5rem]"}`}
                >
                  <Select
                    aria-label={`${u("akunBaris")} ${i + 1}`}
                    value={line.accountId}
                    onChange={(e) => setLine(i, { accountId: e.target.value })}
                  >
                    <option value="">{u("pilihAkunOpsi")}</option>
                    {activeAccounts.map((a: ApiAccount) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Deskripsi baris ${i + 1}`}
                    placeholder={u("deskripsiOpsional")}
                    value={line.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                  />
                  {costCenters.length > 0 ? (
                    <Select
                      aria-label={`Dimensi baris ${i + 1}`}
                      value={line.costCenterId}
                      onChange={(e) => setLine(i, { costCenterId: e.target.value })}
                    >
                      <option value="">— dimensi —</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} · {cc.name}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <Input
                    aria-label={`${u("debitBaris")} ${i + 1}`}
                    type="number"
                    min={0}
                    placeholder={u("debit")}
                    value={line.debit}
                    onChange={(e) =>
                      setLine(i, {
                        debit: e.target.value,
                        credit: e.target.value ? "" : line.credit,
                      })
                    }
                  />
                  <Input
                    aria-label={`${u("kreditBaris")} ${i + 1}`}
                    type="number"
                    min={0}
                    placeholder={u("kredit")}
                    value={line.credit}
                    onChange={(e) =>
                      setLine(i, {
                        credit: e.target.value,
                        debit: e.target.value ? "" : line.debit,
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`${u("hapusBaris")} ${i + 1}`}
                    onClick={() =>
                      setLines((ls) => (ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls))
                    }
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((ls) => [...ls, emptyLine()])}
              >
                + {u("tambahBaris")}
              </Button>
              <div className="text-sm">
                {u("debit")} <strong className="tabular-nums">{formatIDR(totalDebit)}</strong> ·{" "}
                {u("kredit")} <strong className="tabular-nums">{formatIDR(totalCredit)}</strong>{" "}
                {balanced ? (
                  <Badge tone="brand">{u("seimbangSingkat")}</Badge>
                ) : (
                  <Badge tone="amber">{u("belumSeimbang")}</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!balanced}
                  onClick={() => setTemplateOpen((o) => !o)}
                >
                  {u("simpanSebagaiTemplate")}
                </Button>
                <Button onClick={submit} disabled={!balanced || create.isPending}>
                  {create.isPending ? <Spinner /> : null} {u("postingJurnal")}
                </Button>
              </div>
            </div>

            {templateOpen && balanced ? (
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="min-w-48 flex-1">
                  <Label htmlFor="tpl-name">{u("namaTemplate")}</Label>
                  <Input
                    id="tpl-name"
                    placeholder={u("contohNamaTemplate")}
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={templateMonthly}
                    onChange={(e) => setTemplateMonthly(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  {u("terbitOtomatisBulanan")}
                </label>
                {templateMonthly ? (
                  <div>
                    <Label htmlFor="tpl-first">{u("terbitPertama")}</Label>
                    <Input
                      id="tpl-first"
                      type="date"
                      value={templateFirstDate}
                      onChange={(e) => setTemplateFirstDate(e.target.value)}
                    />
                  </div>
                ) : null}
                <Button
                  type="button"
                  disabled={templateName.trim().length < 2 || saveTemplate.isPending}
                  onClick={() => saveTemplate.mutate()}
                >
                  {u("simpan")}
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {isAdmin ? (
        <TemplatesCard
          tenantId={tenant.tenantId}
          onLoad={(t) => {
            setMemo(t.memo ?? t.name);
            setLines(
              t.lines.map((l) => ({
                accountId: l.accountId,
                description: "",
                debit: l.debit ? String(l.debit) : "",
                credit: l.credit ? String(l.credit) : "",
                costCenterId: "",
              }))
            );
            toast("success", `Template "${t.name}" dimuat ke form — periksa lalu posting.`);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : null}

      <Card>
        <CardHeader title={u("jurnalTerposting")} />
        <CardBody className="space-y-3">
          <div className="relative sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              aria-label={u("cariJurnal")}
              className="pl-9"
              placeholder={u("cariNoJurnal")}
              value={entrySearch}
              onChange={(e) => {
                setEntrySearch(e.target.value);
                setEntryLimit(100);
              }}
            />
          </div>
          {entriesQuery.isLoading ? (
            <Spinner />
          ) : (entriesQuery.data?.entries.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {entryQ ? u("tidakAdaJurnalCocok") : u("belumAdaJurnal")}
            </p>
          ) : (
            <div className="space-y-4">
              {entriesQuery.data!.entries.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs font-semibold">{e.entryNo}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatDate(e.entryDate)}
                    </span>
                    {e.memo ? (
                      <span className="text-slate-600 dark:text-slate-300">— {e.memo}</span>
                    ) : null}
                    {e.reversedByEntryNo ? (
                      <Badge tone="red">
                        {u("dibalikLabel")} · {e.reversedByEntryNo}
                      </Badge>
                    ) : null}
                    {e.reversesEntryNo ? (
                      <Badge tone="amber">
                        {u("pembalikLabel")} · {e.reversesEntryNo}
                      </Badge>
                    ) : null}
                    {isAdmin &&
                    !e.reversedByEntryNo &&
                    !e.reversesEntryNo &&
                    e.status === "posted" ? (
                      <button
                        className="ml-auto text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                        onClick={() => setReverseTarget({ id: e.id, entryNo: e.entryNo })}
                      >
                        {u("balik")}
                      </button>
                    ) : null}
                  </div>
                  {/* Baris jurnal: tanpa `Thead` (judul kolomnya ada di kartu
                      induk) dan tanpa garis antarbaris — ini blok debit/kredit
                      satu jurnal, bukan daftar yang perlu dipisah-pisah. */}
                  <Table>
                    <tbody>
                      {e.lines.map((l) => (
                        <tr key={l.id}>
                          <Td label={u("kode")} className="py-1 font-mono text-xs">{l.accountCode}</Td>
                          <Td label={u("akun")} className="py-1">{l.accountName}</Td>
                          <Td numeric label={u("debit")} className="py-1">
                            <Amount value={l.debit} />
                          </Td>
                          <Td numeric label={u("kredit")} className="py-1">
                            <Amount value={l.credit} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ))}
              {(entriesQuery.data?.total ?? 0) > (entriesQuery.data?.entries.length ?? 0) ? (
                <div className="flex items-center justify-center gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {u("menampilkan")} {entriesQuery.data!.entries.length} {u("dariTotal")}{" "}
                    {entriesQuery.data!.total}
                  </span>
                  <Button
                    variant="secondary"
                    className="h-8"
                    onClick={() => setEntryLimit((l) => Math.min(l + 100, 500))}
                  >
                    {u("muatLebihBanyak")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={reverseTarget !== null}
        title={
          reverseToday
            ? u("periodeTerkunciBalik")
            : `${u("balikJurnalTanya")} ${reverseTarget?.entryNo}?`
        }
        description={
          reverseToday ? (
            <>
              {u("descBalikTerkunci1")} <strong>{u("tanggalHariIni")}</strong>{" "}
              {u("descBalikTerkunci2")}
            </>
          ) : (
            <>{u("descBalikBiasa")}</>
          )
        }
        confirmLabel={reverseToday ? u("balikPerHariIni") : u("yaBalikJurnal")}
        danger
        busy={doReverse.isPending}
        onConfirm={() =>
          reverseTarget &&
          doReverse.mutate({
            id: reverseTarget.id,
            ...(reverseToday ? { date: new Date().toISOString().slice(0, 10) } : {}),
          })
        }
        onCancel={() => {
          setReverseTarget(null);
          setReverseToday(false);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buku Besar
// ---------------------------------------------------------------------------

type LedgerEntryRow = {
  entryNo: string;
  entryDate: string;
  description: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export function LedgerPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const [accountId, setAccountId] = useState("");
  // Halaman lebih lama yang sudah dimuat via kursor (Fase 9a) — di-reset saat
  // ganti akun agar saldo berjalan tidak tercampur antar akun.
  const [older, setOlder] = useState<{
    entries: LedgerEntryRow[];
    nextCursor: string | null;
  } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });
  const ledgerQuery = useQuery({
    queryKey: ["ledger", tenant.tenantId, accountId],
    queryFn: () => api.ledger(tenant.tenantId, accountId),
    enabled: Boolean(accountId),
  });

  const pickAccount = (id: string) => {
    setOlder(null);
    setAccountId(id);
  };
  const olderCursor = older ? older.nextCursor : (ledgerQuery.data?.nextCursor ?? null);
  const loadOlder = async () => {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await api.ledger(tenant.tenantId, accountId, { before: olderCursor });
      setOlder((prev) => ({
        entries: [...res.entries, ...(prev?.entries ?? [])],
        nextCursor: res.nextCursor,
      }));
    } finally {
      setLoadingOlder(false);
    }
  };
  const allEntries = [...(older?.entries ?? []), ...(ledgerQuery.data?.entries ?? [])];

  return (
    <div className="space-y-6">
      <PageHeading k="bukuBesar" />
      <Card>
        <CardBody className="space-y-4">
          <div className="sm:w-96">
            <Label htmlFor="lg-acc">{u("pilihAkun")}</Label>
            <Select id="lg-acc" value={accountId} onChange={(e) => pickAccount(e.target.value)}>
              <option value="">{u("pilihAkunOpsi")}</option>
              {(accountsQuery.data?.accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </div>

          {ledgerQuery.isLoading && accountId ? <Spinner /> : null}
          {ledgerQuery.data ? (
            <>
              {olderCursor ? (
                <Button
                  variant="secondary"
                  className="h-8"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                >
                  {loadingOlder ? u("memuat") : u("muatLebihLama")}
                </Button>
              ) : null}
              <Table>
                <Thead>
                  <tr>
                    <Th>{u("noJurnal")}</Th>
                    <Th>{u("tanggal")}</Th>
                    <Th>{u("keterangan")}</Th>
                    <Th numeric>{u("debit")}</Th>
                    <Th numeric>{u("kredit")}</Th>
                    <Th numeric>{u("saldo")}</Th>
                  </tr>
                </Thead>
                <tbody>
                  {allEntries.map((r, i) => (
                    <Tr key={i}>
                      <Td label={u("noJurnal")} className="font-mono text-xs">{r.entryNo}</Td>
                      <Td label={u("tanggal")}>{r.entryDate}</Td>
                      <Td label={u("keterangan")}>{r.description ?? "—"}</Td>
                      <Td numeric label={u("debit")}>
                        <Amount value={r.debit} />
                      </Td>
                      <Td numeric label={u("kredit")}>
                        <Amount value={r.credit} />
                      </Td>
                      <Td numeric label={u("saldo")} className="font-medium">
                        {formatIDR(r.balance)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <p className="text-sm">
                {u("saldoAkhir")}{" "}
                <strong className="tabular-nums">{formatIDR(ledgerQuery.data.balance)}</strong>
              </p>
            </>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Neraca Saldo (Trial Balance)
// ---------------------------------------------------------------------------

export function TrialBalancePage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const query = useQuery({
    queryKey: ["trial-balance", tenant.tenantId],
    queryFn: () => api.trialBalance(tenant.tenantId),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <PageHeading k="neracaSaldo" />
        {query.data ? (
          query.data.balanced ? (
            <Badge tone="brand">{u("seimbang")}</Badge>
          ) : (
            <Badge tone="amber">{u("tidakSeimbang")}</Badge>
          )
        ) : null}
        {(query.data?.rows.length ?? 0) > 0 ? (
          <Button
            variant="secondary"
            className="ml-auto"
            onClick={() =>
              downloadXlsx("neraca-saldo.xlsx", [
                {
                  name: "Neraca Saldo",
                  headers: ["Kode", "Akun", "Debit", "Kredit"],
                  rows: [
                    ...query.data!.rows.map(
                      (r) => [r.code, r.name, r.debit, r.credit] as (string | number)[]
                    ),
                    ["", "Total", query.data!.totalDebit, query.data!.totalCredit],
                  ],
                },
              ])
            }
          >
            {u("eksporExcel")}
          </Button>
        ) : null}
      </div>
      <Card>
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (query.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{u("belumAdaTransaksi")}</p>
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>{u("kode")}</Th>
                  <Th>{u("akun")}</Th>
                  <Th numeric>{u("debit")}</Th>
                  <Th numeric>{u("kredit")}</Th>
                </tr>
              </Thead>
              <tbody>
                {query.data!.rows.map((r) => (
                  <Tr key={r.accountId}>
                    <Td label={u("kode")} className="font-mono text-xs">{r.code}</Td>
                    <Td label={u("akun")}>{r.name}</Td>
                    <Td numeric label={u("debit")}>
                      <Amount value={r.debit} />
                    </Td>
                    <Td numeric label={u("kredit")}>
                      <Amount value={r.credit} />
                    </Td>
                  </Tr>
                ))}
                <Tr className="font-semibold">
                  <Td colSpan={2}>{u("total")}</Td>
                  <Td numeric label={u("debit")}>{formatIDR(query.data!.totalDebit)}</Td>
                  <Td numeric label={u("kredit")}>{formatIDR(query.data!.totalCredit)}</Td>
                </Tr>
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** Daftar template jurnal berulang (Fase 5d): terbitkan sekali klik, muat ke form, atau hapus. */
function TemplatesCard({
  tenantId,
  onLoad,
}: {
  tenantId: string;
  onLoad: (t: ApiJournalTemplate) => void;
}) {
  const u = useUi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["journal-templates", tenantId],
    queryFn: () => api.journalTemplates(tenantId),
  });

  const postNow = useMutation({
    mutationFn: (id: string) => api.postJournalTemplate(tenantId, id),
    onSuccess: (res) => {
      toast("success", `Jurnal ${res.entryNo} diposting dari template.`);
      queryClient.invalidateQueries({ queryKey: ["journal", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteJournalTemplate(tenantId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["journal-templates", tenantId] }),
  });

  const templates = query.data?.templates ?? [];
  if (query.isLoading || templates.length === 0) return null;

  return (
    <Card>
      <CardHeader title={u("templateJurnal")} description={u("descTemplateJurnal")} />
      <CardBody className="space-y-3">
        {templates.map((t) => (
          <div key={t.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{t.name}</span>
                {t.schedule === "monthly" ? (
                  <Badge tone="brand">
                    {u("bulananBerikutnya")} {t.nextRunDate ? formatDate(t.nextRunDate) : "—"}
                  </Badge>
                ) : (
                  <Badge>{u("manualLabel")}</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm sm:justify-end">
                <Button
                  variant="secondary"
                  className="h-8"
                  onClick={() => postNow.mutate(t.id)}
                  disabled={postNow.isPending}
                >
                  {u("terbitkanSekarang")}
                </Button>
                <Button variant="ghost" className="h-8" onClick={() => onLoad(t)}>
                  {u("muatKeForm")}
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  onClick={() => remove.mutate(t.id)}
                >
                  {u("hapus")}
                </Button>
              </div>
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t.lines.map((l, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    {l.accountCode} · {l.accountName}
                  </span>
                  <span className="tabular-nums">
                    {l.debit
                      ? `${u("debitSingkat")} ${formatIDR(l.debit)}`
                      : `${u("kreditSingkat")} ${formatIDR(l.credit)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  createAccountSchema,
  type ApiAccount,
  type ApiJournalTemplate,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, formatDate, formatIDR } from "../api/client";
import { useDebounced } from "./commerce";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  FieldError,
  Input,
  Label,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

function Amount({ value }: { value: number }) {
  return <span className="tabular-nums">{value === 0 ? "—" : formatIDR(value)}</span>;
}

const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";
const td = "border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60";

// ---------------------------------------------------------------------------
// Bagan Akun (COA)
// ---------------------------------------------------------------------------

export function AccountsPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const query = useQuery({ queryKey: ["accounts", tenant.tenantId], queryFn: () => api.accounts(tenant.tenantId) });

  const create = useMutation({
    mutationFn: (input: Parameters<typeof api.createAccount>[1]) => api.createAccount(tenant.tenantId, input),
    onSuccess: () => {
      toast("success", "Akun ditambahkan.");
      queryClient.invalidateQueries({ queryKey: ["accounts", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const rename = useMutation({
    mutationFn: (vars: { id: string; name: string }) => api.renameAccount(tenant.tenantId, vars.id, vars.name),
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
      <h1 className="text-2xl font-semibold">Bagan Akun</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Daftar akun pembukuan (COA) standar Indonesia — fondasi semua jurnal dan laporan.</p>

      {isAdmin ? (
        <Card>
          <CardHeader title="Tambah akun" description="Akun template standar Indonesia sudah tersedia otomatis." />
          <CardBody>
            <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
              <div className="sm:w-36">
                <Label htmlFor="acc-code">Kode</Label>
                <Input id="acc-code" name="code" placeholder="1-1600" required />
                <FieldError messages={issues.code} />
              </div>
              <div className="flex-1">
                <Label htmlFor="acc-name">Nama akun</Label>
                <Input id="acc-name" name="name" placeholder="Piutang Karyawan" required />
                <FieldError messages={issues.name} />
              </div>
              <div className="sm:w-44">
                <Label htmlFor="acc-type">Tipe</Label>
                <Select id="acc-type" name="type" defaultValue="asset">
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner /> : null} Tambah
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>Kode</th>
                    <th className={th}>Nama</th>
                    <th className={th}>Tipe</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {(query.data?.accounts ?? [])
                    .filter((a) => !a.isArchived)
                    .map((a) => (
                      <tr key={a.id}>
                        <td className={`${td} font-mono text-xs`}>{a.code}</td>
                        <td className={td}>
                          {renamingId === a.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                aria-label={`Nama baru untuk akun ${a.code}`}
                                className="h-8 max-w-xs"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveRename(a.id);
                                  if (e.key === "Escape") setRenamingId(null);
                                }}
                                autoFocus
                              />
                              <Button className="h-8" onClick={() => saveRename(a.id)} disabled={rename.isPending}>
                                {rename.isPending ? <Spinner /> : null} Simpan
                              </Button>
                              <Button variant="ghost" className="h-8" onClick={() => setRenamingId(null)}>
                                Batal
                              </Button>
                            </div>
                          ) : (
                            a.name
                          )}
                        </td>
                        <td className={td}>
                          <Badge>{ACCOUNT_TYPE_LABELS[a.type]}</Badge>
                        </td>
                        <td className={`${td} text-right`}>
                          <span className="inline-flex items-center gap-2">
                            {a.isSystem ? <Badge tone="brand">sistem</Badge> : null}
                            {isAdmin && renamingId !== a.id ? (
                              <Button
                                variant="ghost"
                                className="h-8"
                                onClick={() => {
                                  setRenamingId(a.id);
                                  setRenameValue(a.name);
                                }}
                              >
                                Ubah nama
                              </Button>
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    ))}
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
// Jurnal Umum — form multi-baris + daftar jurnal terposting
// ---------------------------------------------------------------------------

type DraftLine = { accountId: string; description: string; debit: string; credit: string };
const emptyLine = (): DraftLine => ({ accountId: "", description: "", debit: "", credit: "" });

export function JournalPage() {
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
  const activeProjects = (projectsQuery.data?.projects ?? []).filter((p) => p.status !== "completed");

  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [projectId, setProjectId] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateMonthly, setTemplateMonthly] = useState(false);
  const [templateFirstDate, setTemplateFirstDate] = useState(() => new Date().toISOString().slice(0, 10));

  const saveTemplate = useMutation({
    mutationFn: () =>
      api.createJournalTemplate(tenant.tenantId, {
        name: templateName.trim(),
        memo: memo || undefined,
        lines: lines
          .filter((l) => l.accountId)
          .map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })),
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
        })),
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
        })),
    });
  }

  const activeAccounts = (accountsQuery.data?.accounts ?? []).filter((a) => !a.isArchived);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Jurnal Umum</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Catat transaksi manual dengan debit = kredit. Jurnal terposting tidak bisa diubah — koreksi lewat jurnal pembalik.</p>

      {isAdmin ? (
        <Card>
          <CardHeader
            title="Jurnal manual baru"
            description="Total debit harus sama dengan total kredit. Jurnal terposting tidak dapat diubah — koreksi lewat jurnal pembalik."
          />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="sm:w-44">
                <Label htmlFor="jr-date">Tanggal</Label>
                <Input id="jr-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label htmlFor="jr-memo">Keterangan</Label>
                <Input
                  id="jr-memo"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Setoran modal awal"
                />
              </div>
              {activeProjects.length > 0 ? (
                <div className="sm:w-52">
                  <Label htmlFor="jr-project">Proyek (opsional)</Label>
                  <Select id="jr-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">— tanpa proyek —</option>
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
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_8rem_8rem_2.5rem]">
                  <Select
                    aria-label={`Akun baris ${i + 1}`}
                    value={line.accountId}
                    onChange={(e) => setLine(i, { accountId: e.target.value })}
                  >
                    <option value="">— pilih akun —</option>
                    {activeAccounts.map((a: ApiAccount) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Deskripsi baris ${i + 1}`}
                    placeholder="Deskripsi (opsional)"
                    value={line.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                  />
                  <Input
                    aria-label={`Debit baris ${i + 1}`}
                    type="number"
                    min={0}
                    placeholder="Debit"
                    value={line.debit}
                    onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : line.credit })}
                  />
                  <Input
                    aria-label={`Kredit baris ${i + 1}`}
                    type="number"
                    min={0}
                    placeholder="Kredit"
                    value={line.credit}
                    onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : line.debit })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Hapus baris ${i + 1}`}
                    onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                + Tambah baris
              </Button>
              <div className="text-sm">
                Debit <strong className="tabular-nums">{formatIDR(totalDebit)}</strong> · Kredit{" "}
                <strong className="tabular-nums">{formatIDR(totalCredit)}</strong>{" "}
                {balanced ? <Badge tone="brand">seimbang</Badge> : <Badge tone="amber">belum seimbang</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" disabled={!balanced} onClick={() => setTemplateOpen((o) => !o)}>
                  Simpan sebagai template
                </Button>
                <Button onClick={submit} disabled={!balanced || create.isPending}>
                  {create.isPending ? <Spinner /> : null} Posting Jurnal
                </Button>
              </div>
            </div>

            {templateOpen && balanced ? (
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="min-w-48 flex-1">
                  <Label htmlFor="tpl-name">Nama template</Label>
                  <Input id="tpl-name" placeholder="mis. Sewa ruko bulanan" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={templateMonthly}
                    onChange={(e) => setTemplateMonthly(e.target.checked)}
                    className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Terbit otomatis tiap bulan
                </label>
                {templateMonthly ? (
                  <div>
                    <Label htmlFor="tpl-first">Terbit pertama</Label>
                    <Input id="tpl-first" type="date" value={templateFirstDate} onChange={(e) => setTemplateFirstDate(e.target.value)} />
                  </div>
                ) : null}
                <Button
                  type="button"
                  disabled={templateName.trim().length < 2 || saveTemplate.isPending}
                  onClick={() => saveTemplate.mutate()}
                >
                  Simpan
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
              })),
            );
            toast("success", `Template "${t.name}" dimuat ke form — periksa lalu posting.`);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : null}

      <Card>
        <CardHeader title="Jurnal terposting" />
        <CardBody className="space-y-3">
          <div className="relative sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              aria-label="Cari jurnal"
              className="pl-9"
              placeholder="Cari no. jurnal / keterangan…"
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
              {entryQ ? "Tidak ada jurnal yang cocok dengan pencarian." : "Belum ada jurnal."}
            </p>
          ) : (
            <div className="space-y-4">
              {entriesQuery.data!.entries.map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs font-semibold">{e.entryNo}</span>
                    <span className="text-slate-500 dark:text-slate-400">{formatDate(e.entryDate)}</span>
                    {e.memo ? <span className="text-slate-600 dark:text-slate-300">— {e.memo}</span> : null}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {e.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="py-1 pr-4 font-mono text-xs">{l.accountCode}</td>
                            <td className="py-1 pr-4">{l.accountName}</td>
                            <td className="py-1 pr-4 text-right">
                              <Amount value={l.debit} />
                            </td>
                            <td className="py-1 text-right">
                              <Amount value={l.credit} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {(entriesQuery.data?.total ?? 0) > (entriesQuery.data?.entries.length ?? 0) ? (
                <div className="flex items-center justify-center gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Menampilkan {entriesQuery.data!.entries.length} dari {entriesQuery.data!.total}
                  </span>
                  <Button variant="secondary" className="h-8" onClick={() => setEntryLimit((l) => Math.min(l + 100, 500))}>
                    Muat lebih banyak
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buku Besar
// ---------------------------------------------------------------------------

export function LedgerPage() {
  const { tenant } = useWorkspace();
  const [accountId, setAccountId] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });
  const ledgerQuery = useQuery({
    queryKey: ["ledger", tenant.tenantId, accountId],
    queryFn: () => api.ledger(tenant.tenantId, accountId),
    enabled: Boolean(accountId),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Buku Besar</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Riwayat lengkap satu akun: setiap jurnal yang menyentuhnya beserta saldo berjalan.</p>
      <Card>
        <CardBody className="space-y-4">
          <div className="sm:w-96">
            <Label htmlFor="lg-acc">Pilih akun</Label>
            <Select id="lg-acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— pilih akun —</option>
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className={th}>No. Jurnal</th>
                      <th className={th}>Tanggal</th>
                      <th className={th}>Keterangan</th>
                      <th className={`${th} text-right`}>Debit</th>
                      <th className={`${th} text-right`}>Kredit</th>
                      <th className={`${th} text-right`}>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerQuery.data.entries.map((r, i) => (
                      <tr key={i}>
                        <td className={`${td} font-mono text-xs`}>{r.entryNo}</td>
                        <td className={td}>{r.entryDate}</td>
                        <td className={td}>{r.description ?? "—"}</td>
                        <td className={`${td} text-right`}>
                          <Amount value={r.debit} />
                        </td>
                        <td className={`${td} text-right`}>
                          <Amount value={r.credit} />
                        </td>
                        <td className={`${td} text-right font-medium tabular-nums`}>{formatIDR(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm">
                Saldo akhir <strong className="tabular-nums">{formatIDR(ledgerQuery.data.balance)}</strong>
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
  const { tenant } = useWorkspace();
  const query = useQuery({
    queryKey: ["trial-balance", tenant.tenantId],
    queryFn: () => api.trialBalance(tenant.tenantId),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Neraca Saldo</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ringkasan saldo semua akun — total debit dan kredit harus selalu sama.</p>
        {query.data ? (
          query.data.balanced ? (
            <Badge tone="brand">seimbang ✓</Badge>
          ) : (
            <Badge tone="amber">TIDAK seimbang</Badge>
          )
        ) : null}
      </div>
      <Card>
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (query.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada transaksi.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>Kode</th>
                    <th className={th}>Akun</th>
                    <th className={`${th} text-right`}>Debit</th>
                    <th className={`${th} text-right`}>Kredit</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data!.rows.map((r) => (
                    <tr key={r.accountId}>
                      <td className={`${td} font-mono text-xs`}>{r.code}</td>
                      <td className={td}>{r.name}</td>
                      <td className={`${td} text-right`}>
                        <Amount value={r.debit} />
                      </td>
                      <td className={`${td} text-right`}>
                        <Amount value={r.credit} />
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2.5 pr-4" colSpan={2}>
                      Total
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{formatIDR(query.data!.totalDebit)}</td>
                    <td className="py-2.5 text-right tabular-nums">{formatIDR(query.data!.totalCredit)}</td>
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

/** Daftar template jurnal berulang (Fase 5d): terbitkan sekali klik, muat ke form, atau hapus. */
function TemplatesCard({ tenantId, onLoad }: { tenantId: string; onLoad: (t: ApiJournalTemplate) => void }) {
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
      <CardHeader
        title="Template jurnal"
        description="Jurnal rutin siap pakai — terbitkan sekali klik, atau otomatis tiap bulan bila berjadwal."
      />
      <CardBody className="space-y-3">
        {templates.map((t) => (
          <div key={t.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{t.name}</span>
                {t.schedule === "monthly" ? (
                  <Badge tone="brand">bulanan · berikutnya {t.nextRunDate ? formatDate(t.nextRunDate) : "—"}</Badge>
                ) : (
                  <Badge>manual</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm sm:justify-end">
                <Button variant="secondary" className="h-8" onClick={() => postNow.mutate(t.id)} disabled={postNow.isPending}>
                  Terbitkan sekarang
                </Button>
                <Button variant="ghost" className="h-8" onClick={() => onLoad(t)}>
                  Muat ke form
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  onClick={() => remove.mutate(t.id)}
                >
                  Hapus
                </Button>
              </div>
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t.lines.map((l, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    {l.accountCode} · {l.accountName}
                  </span>
                  <span className="tabular-nums">{l.debit ? `D ${formatIDR(l.debit)}` : `K ${formatIDR(l.credit)}`}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

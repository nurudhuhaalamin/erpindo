import {
  APPROVAL_DOC_TYPE_LABELS,
  APPROVAL_DOC_TYPES,
  APPROVAL_ROLE_LABELS,
  APPROVAL_ROLES,
  APPROVAL_STATUS_LABELS,
  type ApiApprovalFlow,
  type ApprovalDocType,
  type ApprovalRole,
  type ApprovalStatus,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Plus, Send, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, formatIDR } from "../api/client";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Label, Select, Spinner, useToast } from "../components/ui";
import { useWorkspace } from "./app";

const STATUS_TONE: Record<ApprovalStatus, "amber" | "green" | "red"> = { pending: "amber", approved: "green", rejected: "red" };
const LEGACY_STATUS_LABEL = { pending: "menunggu", approved: "disetujui", rejected: "ditolak" } as const;

type Tab = "queue" | "submit" | "rules" | "history" | "purchase";

export function ApprovalsPage() {
  const { tenant } = useWorkspace();
  const isOwner = tenant.role === "owner";
  const [tab, setTab] = useState<Tab>("queue");

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "queue", label: "Antrean saya", show: true },
    { key: "submit", label: "Ajukan", show: tenant.role !== "viewer" },
    { key: "history", label: "Riwayat", show: true },
    { key: "rules", label: "Aturan", show: isOwner },
    { key: "purchase", label: "Pembelian (ambang)", show: isOwner },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Persetujuan</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Alur persetujuan berjenjang — atur aturan per jenis dokumen & nominal, lalu setujui berurutan sesuai peran.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-brand-500 text-brand-600 dark:text-brand-300" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "queue" ? <QueueTab /> : null}
      {tab === "submit" ? <SubmitTab /> : null}
      {tab === "history" ? <HistoryTab /> : null}
      {tab === "rules" && isOwner ? <RulesTab /> : null}
      {tab === "purchase" && isOwner ? <PurchaseApprovalTab /> : null}
    </div>
  );
}

// --- Jejak langkah (dipakai antrean & riwayat) --------------------------------
function StepTrail({ flow }: { flow: ApiApprovalFlow }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {flow.steps.map((s) => (
        <span
          key={s.id}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
            s.status === "approved"
              ? "border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
              : s.status === "rejected"
                ? "border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-300"
                : s.stepOrder === flow.currentStep && flow.status === "pending"
                  ? "border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
                  : "border-slate-200 text-slate-400 dark:border-slate-700"
          }`}
        >
          {s.stepOrder}. {APPROVAL_ROLE_LABELS[s.approverRole]}
          {s.status !== "pending" ? ` · ${APPROVAL_STATUS_LABELS[s.status]}${s.decidedByName ? ` (${s.decidedByName})` : ""}` : ""}
        </span>
      ))}
    </div>
  );
}

function QueueTab() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["approval-flows", tenant.tenantId, "queue"],
    queryFn: () => api.approvalFlows(tenant.tenantId, true),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject" }) => api.decideApprovalStep(tenant.tenantId, v.id, { decision: v.decision }),
    onSuccess: (res) => {
      toast("success", res.status === "approved" ? "Disetujui — alur selesai." : res.status === "rejected" ? "Ditolak." : "Langkah disetujui, lanjut ke approver berikutnya.");
      queryClient.invalidateQueries({ queryKey: ["approval-flows", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const flows = query.data?.flows ?? [];
  const canDecide = tenant.role !== "viewer";

  return (
    <Card>
      <CardHeader title="Menunggu persetujuan saya" description="Alur yang langkah aktifnya menunggu peran Anda." />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : flows.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="size-6" aria-hidden />} title="Antrean kosong" description="Tak ada alur yang menunggu persetujuan Anda saat ini." />
        ) : (
          <div className="space-y-2">
            {flows.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs">{f.flowNo}</span>
                  <Badge tone="neutral">{APPROVAL_DOC_TYPE_LABELS[f.docType]}</Badge>
                  <span className="font-medium">{f.title}</span>
                  {f.requestedByName ? <span className="text-xs text-slate-400">oleh {f.requestedByName}</span> : null}
                  <span className="ml-auto font-semibold tabular-nums">{formatIDR(f.amount)}</span>
                </div>
                <StepTrail flow={f} />
                {canDecide ? (
                  <div className="mt-2 flex gap-2 border-t pt-2 dark:border-slate-700">
                    <Button className="h-8" onClick={() => decide.mutate({ id: f.id, decision: "approve" })} disabled={decide.isPending}>
                      <CheckCircle2 className="size-4" aria-hidden /> Setujui
                    </Button>
                    <Button variant="danger" className="h-8" onClick={() => decide.mutate({ id: f.id, decision: "reject" })} disabled={decide.isPending}>
                      Tolak
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function SubmitTab() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ docType: "pembelian" as ApprovalDocType, title: "", amount: "" });

  const rulesQuery = useQuery({
    queryKey: ["approval-rules", tenant.tenantId],
    queryFn: () => api.approvalRules(tenant.tenantId),
  });
  const rules = rulesQuery.data?.rules ?? [];

  const amountNum = Number(form.amount) || 0;
  const matchedRule = rules
    .filter((r) => r.active && r.docType === form.docType && r.minAmount <= amountNum)
    .sort((a, b) => b.minAmount - a.minAmount)[0];

  const submit = useMutation({
    mutationFn: () => api.submitApproval(tenant.tenantId, { docType: form.docType, title: form.title.trim(), amount: amountNum }),
    onSuccess: (res) => {
      toast("success", res.autoApproved ? `Diajukan (${res.flowNo}) — tak perlu persetujuan, langsung disetujui.` : `Diajukan (${res.flowNo}) — menunggu persetujuan.`);
      setForm({ ...form, title: "", amount: "" });
      queryClient.invalidateQueries({ queryKey: ["approval-flows", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <Card>
      <CardHeader title="Ajukan persetujuan" description="Ajukan dokumen untuk disetujui sesuai aturan berlaku." />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="ap-type">Jenis dokumen</Label>
            <Select id="ap-type" value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value as ApprovalDocType })}>
              {APPROVAL_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {APPROVAL_DOC_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ap-title">Judul / keterangan</Label>
            <Input id="ap-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="mis. Pembelian laptop tim" />
          </div>
          <div>
            <Label htmlFor="ap-amount">Nominal (Rp)</Label>
            <Input id="ap-amount" type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/40">
          {amountNum <= 0 ? (
            <span className="text-slate-400">Isi nominal untuk melihat aturan yang berlaku.</span>
          ) : matchedRule ? (
            <span>
              Aturan berlaku: <strong>{matchedRule.name}</strong> — persetujuan berurutan:{" "}
              {matchedRule.approverRoles.map((r) => APPROVAL_ROLE_LABELS[r]).join(" → ")}
            </span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400">Tak ada aturan cocok — akan langsung disetujui (tanpa persetujuan).</span>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !form.title.trim() || amountNum <= 0}>
            {submit.isPending ? <Spinner /> : <Send className="size-4" aria-hidden />} Ajukan
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function HistoryTab() {
  const { tenant } = useWorkspace();
  const query = useQuery({
    queryKey: ["approval-flows", tenant.tenantId, "all"],
    queryFn: () => api.approvalFlows(tenant.tenantId, false),
  });
  const flows = query.data?.flows ?? [];
  return (
    <Card>
      <CardHeader title="Riwayat alur persetujuan" description="Semua pengajuan + jejak langkah per approver." />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : flows.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada pengajuan.</p>
        ) : (
          <div className="space-y-2">
            {flows.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs">{f.flowNo}</span>
                  <Badge tone="neutral">{APPROVAL_DOC_TYPE_LABELS[f.docType]}</Badge>
                  <span className="font-medium">{f.title}</span>
                  {f.requestedByName ? <span className="text-xs text-slate-400">oleh {f.requestedByName}</span> : null}
                  <Badge tone={STATUS_TONE[f.status]}>{APPROVAL_STATUS_LABELS[f.status]}</Badge>
                  <span className="ml-auto font-semibold tabular-nums">{formatIDR(f.amount)}</span>
                </div>
                {f.steps.length > 0 ? <StepTrail flow={f} /> : <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Otomatis disetujui (tanpa aturan).</div>}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RulesTab() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ name: string; docType: ApprovalDocType; minAmount: string; approverRoles: ApprovalRole[] }>({
    name: "",
    docType: "pembelian",
    minAmount: "",
    approverRoles: ["owner"],
  });

  const query = useQuery({
    queryKey: ["approval-rules", tenant.tenantId],
    queryFn: () => api.approvalRules(tenant.tenantId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["approval-rules", tenant.tenantId] });

  const create = useMutation({
    mutationFn: () => api.createApprovalRule(tenant.tenantId, { name: form.name.trim(), docType: form.docType, minAmount: Number(form.minAmount) || 0, approverRoles: form.approverRoles }),
    onSuccess: () => {
      toast("success", "Aturan dibuat.");
      setForm({ name: "", docType: "pembelian", minAmount: "", approverRoles: ["owner"] });
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const toggleActive = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => api.updateApprovalRule(tenant.tenantId, v.id, { active: v.active }),
    onSuccess: invalidate,
    onError: (err) => toast("error", (err as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteApprovalRule(tenant.tenantId, id),
    onSuccess: () => {
      toast("success", "Aturan dihapus.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const rules = query.data?.rules ?? [];
  const toggleRole = (role: ApprovalRole) =>
    setForm((f) => ({ ...f, approverRoles: f.approverRoles.includes(role) ? f.approverRoles.filter((r) => r !== role) : [...f.approverRoles, role] }));

  return (
    <Card>
      <CardHeader title="Aturan persetujuan" description="Tetapkan alur untuk jenis dokumen di atas ambang tertentu — disetujui berurutan sesuai peran." />
      <CardBody className="space-y-4">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <Label htmlFor="rule-name">Nama aturan</Label>
            <Input id="rule-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Pembelian besar" />
          </div>
          <div>
            <Label htmlFor="rule-type">Jenis dokumen</Label>
            <Select id="rule-type" value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value as ApprovalDocType })}>
              {APPROVAL_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {APPROVAL_DOC_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="rule-min">Ambang (Rp)</Label>
            <Input id="rule-min" type="number" min={0} value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} />
          </div>
          <div>
            <Label>Approver berurutan</Label>
            <div className="flex gap-1.5">
              {APPROVAL_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRole(r)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                    form.approverRoles.includes(r) ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-200" : "border-slate-200 text-slate-500 dark:border-slate-700"
                  }`}
                >
                  {APPROVAL_ROLE_LABELS[r]}
                  {form.approverRoles.includes(r) ? ` (${form.approverRoles.indexOf(r) + 1})` : ""}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.name.trim() || form.approverRoles.length === 0}>
            {create.isPending ? <Spinner /> : <Plus className="size-4" aria-hidden />} Tambah
          </Button>
        </div>

        {query.isLoading ? (
          <Spinner />
        ) : rules.length === 0 ? (
          <EmptyState icon={<Settings2 className="size-6" aria-hidden />} title="Belum ada aturan" description="Tanpa aturan, semua pengajuan langsung disetujui." />
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <span className="font-medium">{r.name}</span>
                <Badge tone="neutral">{APPROVAL_DOC_TYPE_LABELS[r.docType]}</Badge>
                <span className="text-xs text-slate-500 dark:text-slate-400">≥ {formatIDR(r.minAmount)}</span>
                <span className="text-xs text-slate-400">{r.approverRoles.map((x) => APPROVAL_ROLE_LABELS[x]).join(" → ")}</span>
                {!r.active ? <Badge tone="red">nonaktif</Badge> : null}
                <span className="ml-auto flex items-center gap-2">
                  <Button variant="ghost" className="h-8" onClick={() => toggleActive.mutate({ id: r.id, active: !r.active })} disabled={toggleActive.isPending}>
                    {r.active ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  <button type="button" aria-label="Hapus aturan" className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:text-red-600" onClick={() => remove.mutate(r.id)}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Persetujuan pembelian ambang-tunggal lama (Owner) — tak berubah. */
function PurchaseApprovalTab() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["approvals", tenant.tenantId],
    queryFn: () => api.approvals(tenant.tenantId),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["approvals", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["purchases", tenant.tenantId] });
  };
  const approve = useMutation({
    mutationFn: (id: string) => api.approveRequest(tenant.tenantId, id),
    onSuccess: (res) => {
      toast("success", `Disetujui — faktur ${res.docNo} diposting (${formatIDR(res.total)}).`);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.rejectRequest(tenant.tenantId, id),
    onSuccess: () => {
      toast("success", "Permintaan ditolak.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const requests = query.data?.requests ?? [];

  return (
    <Card>
      <CardHeader title="Permintaan pembelian (ambang tunggal)" description="Pembelian di atas ambang oleh non-Owner — jurnal & stok baru diproses saat disetujui." />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : requests.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada permintaan.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">{r.request_no}</span>
                  <span>{r.summary}</span>
                  <Badge tone={r.status === "pending" ? "amber" : r.status === "approved" ? "brand" : "neutral"}>{LEGACY_STATUS_LABEL[r.status]}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{formatIDR(r.total)}</span>
                  {r.status === "pending" ? (
                    <>
                      <Button className="h-8" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
                        Setujui
                      </Button>
                      <Button variant="danger" className="h-8" onClick={() => reject.mutate(r.id)} disabled={reject.isPending}>
                        Tolak
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

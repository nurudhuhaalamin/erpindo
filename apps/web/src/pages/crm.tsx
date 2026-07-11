import {
  LEAD_ACTIVITY_LABELS,
  LEAD_ACTIVITY_TYPES,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  type ApiLead,
  type ApiQuotation,
  type LeadActivityType,
  type LeadStage,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, FileText, Send, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { api, formatIDR } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Label,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

const STAGE_TONE: Record<LeadStage, "neutral" | "brand" | "amber" | "green" | "red"> = {
  new: "neutral",
  contacted: "brand",
  qualified: "brand",
  proposal: "amber",
  won: "green",
  lost: "red",
};

const today = () => new Date().toISOString().slice(0, 10);

// ===========================================================================
// Leads & funnel
// ===========================================================================

export function LeadsPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const leadsQuery = useQuery({
    queryKey: ["leads", tenant.tenantId],
    queryFn: () => api.leads(tenant.tenantId),
  });

  const [form, setForm] = useState({ name: "", contactPerson: "", phone: "", email: "", source: "", estValue: "" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createLead(tenant.tenantId, {
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        source: form.source.trim() || undefined,
        estValue: Number(form.estValue) || 0,
      }),
    onSuccess: () => {
      toast("success", "Lead ditambahkan.");
      setForm({ name: "", contactPerson: "", phone: "", email: "", source: "", estValue: "" });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["leads", tenant.tenantId] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const leads = leadsQuery.data?.leads ?? [];
  const openLeads = leads.filter((l) => l.status === "open");
  const funnel = LEAD_STAGES.filter((s) => s !== "lost").map((stage) => {
    const inStage = leads.filter((l) => l.stage === stage);
    return { stage, count: inStage.length, value: inStage.reduce((s, l) => s + l.estValue, 0) };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Catat calon pelanggan, gerakkan lewat tahap funnel, lalu konversi jadi pelanggan.
        </p>
      </div>

      {/* Papan kanban funnel — seret kartu antar kolom untuk memindah tahap. */}
      <KanbanBoard leads={leads} isAdmin={isAdmin} />

      {/* Ringkasan funnel */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {funnel.map((f) => (
          <Card key={f.stage}>
            <CardBody className="py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {LEAD_STAGE_LABELS[f.stage]}
                </span>
                <Badge tone={STAGE_TONE[f.stage]}>{f.count}</Badge>
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums">{formatIDR(f.value)}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader title="Lead baru" description="Perusahaan/orang yang berpotensi jadi pelanggan." />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="lead-name">Nama perusahaan/prospek</Label>
                <Input id="lead-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="lead-cp">Narahubung</Label>
                <Input
                  id="lead-cp"
                  value={form.contactPerson}
                  onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lead-phone">Telepon</Label>
                <Input id="lead-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="lead-email">Email</Label>
                <Input
                  id="lead-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lead-source">Sumber</Label>
                <Input
                  id="lead-source"
                  placeholder="mis. Instagram, referensi"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lead-value">Perkiraan nilai (Rp)</Label>
                <Input
                  id="lead-value"
                  type="number"
                  min={0}
                  value={form.estValue}
                  onChange={(e) => setForm({ ...form, estValue: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => create.mutate()} disabled={create.isPending || form.name.trim().length < 2}>
                {create.isPending ? <Spinner /> : <UserPlus className="size-4" aria-hidden />} Tambah Lead
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Lead aktif" description={`${openLeads.length} lead terbuka`} />
        <CardBody>
          {leadsQuery.isLoading ? (
            <Spinner />
          ) : leads.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" aria-hidden />}
              title="Belum ada lead"
              description="Tambahkan calon pelanggan untuk mulai membangun pipeline penjualan Anda."
            />
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <SourceReportCard tenantId={tenant.tenantId} />
    </div>
  );
}

/**
 * Papan kanban funnel (Fase 5e): drag-and-drop HTML5 tanpa pustaka tambahan.
 * Melepas kartu di kolom lain memindah tahap lead — dropdown di Detail tetap
 * tersedia sebagai jalur alternatif (termasuk untuk layar sentuh).
 */
function KanbanBoard({ leads, isAdmin }: { leads: ApiLead[]; isAdmin: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);

  const move = useMutation({
    mutationFn: (vars: { id: string; stage: LeadStage }) => api.updateLead(tenant.tenantId, vars.id, { stage: vars.stage }),
    onSuccess: () => {
      toast("success", "Tahap diperbarui.");
      queryClient.invalidateQueries({ queryKey: ["leads", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  if (leads.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-[900px] gap-3">
        {LEAD_STAGES.map((stage) => {
          const inStage = leads.filter((l) => l.stage === stage && l.status === "open");
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                if (!isAdmin) return;
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                if (!isAdmin) return;
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/lead-id");
                const lead = leads.find((l) => l.id === id);
                if (id && lead && lead.stage !== stage) move.mutate({ id, stage });
              }}
              className={`w-52 shrink-0 rounded-xl border p-2 transition-colors ${
                dragOver === stage
                  ? "border-brand-400 bg-brand-50 dark:border-brand-500/50 dark:bg-brand-500/10"
                  : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60"
              }`}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {LEAD_STAGE_LABELS[stage]}
                </span>
                <Badge tone={STAGE_TONE[stage]}>{inStage.length}</Badge>
              </div>
              <div className="space-y-2">
                {inStage.map((lead) => (
                  <div
                    key={lead.id}
                    draggable={isAdmin}
                    onDragStart={(e) => e.dataTransfer.setData("text/lead-id", lead.id)}
                    className={`rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800 ${
                      isAdmin ? "cursor-grab active:cursor-grabbing" : ""
                    }`}
                  >
                    <div className="font-medium leading-snug">{lead.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                      {lead.estValue > 0 ? <span className="tabular-nums">{formatIDR(lead.estValue)}</span> : null}
                      {lead.source ? <span>· {lead.source}</span> : null}
                    </div>
                  </div>
                ))}
                {inStage.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-2 text-center text-xs text-slate-400 dark:border-slate-700">
                    kosong
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Laporan konversi per sumber lead (dari mana pelanggan terbaik datang). */
function SourceReportCard({ tenantId }: { tenantId: string }) {
  const query = useQuery({ queryKey: ["crm-report", tenantId], queryFn: () => api.crmReport(tenantId) });
  const rows = query.data?.rows ?? [];
  if (query.isLoading || rows.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Konversi per sumber"
        description="Sumber lead mana yang paling banyak menghasilkan pelanggan — arahkan promosi ke sana."
      />
      <CardBody>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 pr-3 font-medium">Sumber</th>
                <th className="py-2 pr-3 text-right font-medium">Lead</th>
                <th className="py-2 pr-3 text-right font-medium">Menang</th>
                <th className="py-2 pr-3 text-right font-medium">Kalah</th>
                <th className="py-2 text-right font-medium">Konversi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.source} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3">{r.source}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.total}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.won}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.lost}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{r.conversionPct.toLocaleString("id-ID")}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

function LeadRow({ lead, isAdmin }: { lead: ApiLead; isAdmin: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState<{ type: LeadActivityType; note: string; dueAt: string }>({
    type: "call",
    note: "",
    dueAt: "",
  });

  const activitiesQuery = useQuery({
    queryKey: ["lead-activities", tenant.tenantId, lead.id],
    queryFn: () => api.leadActivities(tenant.tenantId, lead.id),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["leads", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["lead-activities", tenant.tenantId, lead.id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", tenant.tenantId] });
  };

  const moveStage = useMutation({
    mutationFn: (stage: LeadStage) => api.updateLead(tenant.tenantId, lead.id, { stage }),
    onSuccess: () => {
      toast("success", "Tahap diperbarui.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const addActivity = useMutation({
    mutationFn: () =>
      api.addLeadActivity(tenant.tenantId, lead.id, {
        type: act.type,
        note: act.note.trim(),
        activityDate: today(),
        ...(act.dueAt ? { dueAt: act.dueAt } : {}),
      }),
    onSuccess: () => {
      toast("success", "Aktivitas dicatat.");
      setAct({ type: "call", note: "", dueAt: "" });
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const convert = useMutation({
    mutationFn: () => api.convertLead(tenant.tenantId, lead.id),
    onSuccess: () => {
      toast("success", "Lead menjadi pelanggan. Sekarang bisa dibuatkan penawaran/faktur.");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["contacts", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{lead.name}</span>
        <Badge tone={STAGE_TONE[lead.stage]}>{LEAD_STAGE_LABELS[lead.stage]}</Badge>
        {lead.convertedContactId ? <Badge tone="green">jadi pelanggan</Badge> : null}
        {lead.estValue > 0 ? (
          <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">{formatIDR(lead.estValue)}</span>
        ) : null}
        <span className="text-xs text-slate-400">
          {lead.contactPerson ?? ""} {lead.phone ? `· ${lead.phone}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">{lead.activityCount} aktivitas</span>
          <Button variant="ghost" className="h-8" onClick={() => setOpen((o) => !o)}>
            {open ? "Tutup" : "Detail"}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="mt-3 space-y-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
          {/* Aksi tahap & konversi */}
          {isAdmin && lead.status === "open" ? (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor={`stage-${lead.id}`}>Pindah tahap</Label>
                <Select
                  id={`stage-${lead.id}`}
                  value={lead.stage}
                  onChange={(e) => moveStage.mutate(e.target.value as LeadStage)}
                  disabled={moveStage.isPending}
                >
                  {LEAD_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STAGE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
              {!lead.convertedContactId ? (
                <Button variant="secondary" onClick={() => convert.mutate()} disabled={convert.isPending}>
                  {convert.isPending ? <Spinner /> : <ArrowRight className="size-4" aria-hidden />} Konversi ke Pelanggan
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Log aktivitas */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Aktivitas follow-up</div>
            {isAdmin ? (
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <div className="w-32">
                  <Select
                    aria-label="Jenis aktivitas"
                    value={act.type}
                    onChange={(e) => setAct({ ...act, type: e.target.value as LeadActivityType })}
                  >
                    {LEAD_ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {LEAD_ACTIVITY_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="min-w-48 flex-1">
                  <Input
                    aria-label="Catatan aktivitas"
                    placeholder="Catatan singkat…"
                    value={act.note}
                    onChange={(e) => setAct({ ...act, note: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`due-${lead.id}`}>Tenggat (opsional)</Label>
                  <Input
                    id={`due-${lead.id}`}
                    type="date"
                    value={act.dueAt}
                    onChange={(e) => setAct({ ...act, dueAt: e.target.value })}
                  />
                </div>
                <Button onClick={() => addActivity.mutate()} disabled={addActivity.isPending || !act.note.trim()}>
                  {addActivity.isPending ? <Spinner /> : null} Catat
                </Button>
              </div>
            ) : null}
            {activitiesQuery.isLoading ? (
              <Spinner />
            ) : (activitiesQuery.data?.activities.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada aktivitas.</p>
            ) : (
              <ul className="space-y-1.5">
                {activitiesQuery.data!.activities.map((a) => (
                  <li key={a.id} className="flex flex-wrap gap-2 text-sm">
                    <Badge tone="neutral">{LEAD_ACTIVITY_LABELS[a.type]}</Badge>
                    <span className="text-slate-400">{a.activityDate}</span>
                    <span>{a.note}</span>
                    {a.dueAt ? (
                      <Badge tone={a.dueAt <= today() ? "red" : "amber"}>tenggat {a.dueAt}</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ===========================================================================
// Quotations (penawaran)
// ===========================================================================

type DraftLine = { productId: string; qty: string; unitPrice: string };
const emptyLine = (): DraftLine => ({ productId: "", qty: "1", unitPrice: "" });
type ProductRow = { id: string; sku: string; name: string; sell_price: number };
type ContactRow = { id: string; name: string; type: string };
type WarehouseRow = { id: string; name: string };

const QUOTE_TONE: Record<ApiQuotation["status"], "neutral" | "brand" | "green" | "red"> = {
  draft: "neutral",
  sent: "brand",
  accepted: "green",
  rejected: "red",
  converted: "green",
};
const QUOTE_LABEL: Record<ApiQuotation["status"], string> = {
  draft: "draf",
  sent: "terkirim",
  accepted: "diterima",
  rejected: "ditolak",
  converted: "jadi faktur",
};

export function QuotationsPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const quotesQuery = useQuery({
    queryKey: ["quotations", tenant.tenantId],
    queryFn: () => api.quotations(tenant.tenantId),
  });
  const productsQuery = useQuery({
    queryKey: ["products", tenant.tenantId],
    queryFn: () => api.listItems<ProductRow>(tenant.tenantId, "products"),
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts", tenant.tenantId],
    queryFn: () => api.listItems<ContactRow>(tenant.tenantId, "contacts"),
  });

  const [contactId, setContactId] = useState("");
  const [date, setDate] = useState(today);
  const [validUntil, setValidUntil] = useState("");
  const [taxRate, setTaxRate] = useState<0 | 11 | 12>(11);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const products = (productsQuery.data?.items ?? []) as ProductRow[];
  const contacts = ((contactsQuery.data?.items ?? []) as ContactRow[]).filter((k) =>
    ["customer", "both"].includes(k.type),
  );

  const create = useMutation({
    mutationFn: () =>
      api.createQuotation(tenant.tenantId, {
        contactId,
        quoteDate: date,
        validUntil: validUntil || undefined,
        taxRate,
        lines: lines
          .filter((l) => l.productId)
          .map((l) => ({ productId: l.productId, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0 })),
      }),
    onSuccess: (res) => {
      toast("success", `Penawaran ${res.quoteNo} dibuat (${formatIDR(res.total)}).`);
      setLines([emptyLine()]);
      setContactId("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["quotations", tenant.tenantId] });
    },
    onError: (err) => setError((err as Error).message),
  });

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function pickProduct(i: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    setLine(i, { productId, unitPrice: p ? String(p.sell_price || "") : "" });
  }

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const taxAmount = Math.round((subtotal * taxRate) / 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Penawaran</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Buat penawaran harga untuk pelanggan. Saat diterima, konversi sekali klik menjadi faktur penjualan.
        </p>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader title="Penawaran baru" description="Belum memengaruhi stok/jurnal — baru mengikat saat dikonversi ke faktur." />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="q-contact">Pelanggan</Label>
                <Select id="q-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">— pilih —</option>
                  {contacts.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="q-date">Tanggal</Label>
                <Input id="q-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="q-valid">Berlaku sampai</Label>
                <Input id="q-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="q-tax">PPN</Label>
                <Select id="q-tax" value={String(taxRate)} onChange={(e) => setTaxRate(Number(e.target.value) as 0 | 11 | 12)}>
                  <option value="0">Tanpa PPN</option>
                  <option value="11">PPN 11%</option>
                  <option value="12">PPN 12%</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_10rem_10rem_2.5rem] sm:items-center">
                  <Select aria-label={`Produk baris ${i + 1}`} value={line.productId} onChange={(e) => pickProduct(i, e.target.value)}>
                    <option value="">— pilih produk —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Qty baris ${i + 1}`}
                    type="number"
                    min={1}
                    value={line.qty}
                    onChange={(e) => setLine(i, { qty: e.target.value })}
                  />
                  <Input
                    aria-label={`Harga baris ${i + 1}`}
                    type="number"
                    min={0}
                    placeholder="Harga satuan"
                    value={line.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                  />
                  <div className="text-right text-sm tabular-nums">
                    {formatIDR((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Hapus baris ${i + 1}`}
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                + Tambah barang
              </Button>
              <div className="text-sm">
                Subtotal <strong className="tabular-nums">{formatIDR(subtotal)}</strong>
                {taxRate > 0 ? (
                  <>
                    {" "}· PPN <strong className="tabular-nums">{formatIDR(taxAmount)}</strong>
                  </>
                ) : null}{" "}
                · Total <strong className="tabular-nums">{formatIDR(subtotal + taxAmount)}</strong>
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !contactId || subtotal === 0}>
                {create.isPending ? <Spinner /> : null} Buat Penawaran
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Daftar penawaran" />
        <CardBody>
          {quotesQuery.isLoading ? (
            <Spinner />
          ) : (quotesQuery.data?.quotations.length ?? 0) === 0 ? (
            <EmptyState
              icon={<FileText className="size-6" aria-hidden />}
              title="Belum ada penawaran"
              description="Penawaran yang Anda buat akan muncul di sini beserta statusnya."
            />
          ) : (
            <div className="space-y-3">
              {quotesQuery.data!.quotations.map((q) => (
                <QuoteRow key={q.id} quote={q} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function QuoteRow({ quote, isAdmin }: { quote: ApiQuotation; isAdmin: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [convertOpen, setConvertOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);

  const warehousesQuery = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses"),
    enabled: convertOpen,
  });
  const warehouses = (warehousesQuery.data?.items ?? []) as WarehouseRow[];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["quotations", tenant.tenantId] });
  };

  const setStatus = useMutation({
    mutationFn: (status: "sent" | "accepted" | "rejected") =>
      api.setQuotationStatus(tenant.tenantId, quote.id, { status }),
    onSuccess: () => {
      toast("success", "Status penawaran diperbarui.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const convert = useMutation({
    mutationFn: () =>
      api.convertQuotation(tenant.tenantId, quote.id, {
        warehouseId: warehouseId || warehouses[0]?.id || "",
        invoiceDate,
      }),
    onSuccess: (res) => {
      toast("success", `Faktur ${res.docNo} dibuat dari penawaran (${formatIDR(res.total)}).`);
      setConvertOpen(false);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["invoices", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm">{quote.quoteNo}</span>
        <span className="font-medium">{quote.contactName}</span>
        <span className="text-sm text-slate-400">{quote.quoteDate}</span>
        <Badge tone={QUOTE_TONE[quote.status]}>{QUOTE_LABEL[quote.status]}</Badge>
        {quote.validUntil && quote.validUntil < today() && (quote.status === "draft" || quote.status === "sent") ? (
          <Badge tone="red">kedaluwarsa</Badge>
        ) : quote.validUntil ? (
          <span className="text-xs text-slate-400">berlaku s.d. {quote.validUntil}</span>
        ) : null}
        <a
          href={`/cetak/penawaran?tenant=${tenant.tenantId}&id=${quote.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Cetak
        </a>
        <span className="ml-auto text-sm font-semibold tabular-nums">{formatIDR(quote.total)}</span>
      </div>

      <div className="mt-2 space-y-1">
        {quote.lines.map((l) => (
          <div key={l.id} className="flex items-baseline justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="min-w-0 flex-1 truncate">{l.productName}</span>
            <span className="shrink-0 text-xs tabular-nums text-slate-400">
              {l.qty} × {formatIDR(l.unitPrice)}
            </span>
            <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatIDR(l.amount)}</span>
          </div>
        ))}
      </div>

      {isAdmin && quote.status !== "converted" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {quote.status === "draft" ? (
            <Button variant="secondary" className="h-8" onClick={() => setStatus.mutate("sent")} disabled={setStatus.isPending}>
              <Send className="size-4" aria-hidden /> Tandai Terkirim
            </Button>
          ) : null}
          {quote.status !== "accepted" && quote.status !== "rejected" ? (
            <Button variant="secondary" className="h-8" onClick={() => setStatus.mutate("accepted")} disabled={setStatus.isPending}>
              <Check className="size-4" aria-hidden /> Diterima
            </Button>
          ) : null}
          {quote.status !== "rejected" ? (
            <Button variant="ghost" className="h-8" onClick={() => setStatus.mutate("rejected")} disabled={setStatus.isPending}>
              <X className="size-4" aria-hidden /> Ditolak
            </Button>
          ) : null}
          {quote.status === "accepted" ? (
            <Button className="h-8" onClick={() => setConvertOpen((o) => !o)}>
              <ArrowRight className="size-4" aria-hidden /> Konversi ke Faktur
            </Button>
          ) : null}
        </div>
      ) : null}

      {quote.status === "converted" ? (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          Penawaran ini sudah menjadi faktur penjualan.
        </p>
      ) : null}

      {convertOpen && quote.status === "accepted" ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
          <div>
            <Label htmlFor={`cv-wh-${quote.id}`}>Gudang (stok keluar)</Label>
            <Select id={`cv-wh-${quote.id}`} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`cv-date-${quote.id}`}>Tanggal faktur</Label>
            <Input id={`cv-date-${quote.id}`} type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending || warehouses.length === 0}>
            {convert.isPending ? <Spinner /> : null} Buat Faktur
          </Button>
        </div>
      ) : null}
    </div>
  );
}

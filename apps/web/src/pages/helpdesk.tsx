import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
  type ApiTicket,
  type TicketPriority,
  type TicketStatus,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Plus } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";
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

type ContactRow = { id: string; name: string; type: string };

const PRIORITY_TONE: Record<TicketPriority, "neutral" | "amber" | "red"> = {
  low: "neutral",
  medium: "neutral",
  high: "amber",
  urgent: "red",
};
const STATUS_TONE: Record<TicketStatus, "amber" | "brand" | "green" | "neutral"> = {
  open: "amber",
  in_progress: "brand",
  resolved: "green",
  closed: "neutral",
};

/**
 * Umur tiket yang masih terbuka: hijau <24 jam, kuning 24–72 jam, merah >72 jam.
 * Tiket yang sudah selesai/ditutup tidak diberi label umur.
 */
function ticketAge(t: ApiTicket): { label: string; tone: "green" | "amber" | "red" } | null {
  if (t.status === "resolved" || t.status === "closed") return null;
  const hours = (Date.now() - Date.parse(t.createdAt)) / 3_600_000;
  const label = hours < 24 ? `${Math.max(1, Math.round(hours))} jam` : `${Math.round(hours / 24)} hari`;
  const tone = hours > 72 ? "red" : hours > 24 ? "amber" : "green";
  return { label, tone };
}

export function HelpdeskPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const ticketsQuery = useQuery({ queryKey: ["tickets", tenant.tenantId], queryFn: () => api.tickets(tenant.tenantId) });
  const contactsQuery = useQuery({
    queryKey: ["contacts", tenant.tenantId],
    queryFn: () => api.listItems<ContactRow>(tenant.tenantId, "contacts"),
  });
  const membersQuery = useQuery({
    queryKey: ["members", tenant.tenantId],
    queryFn: () => api.members(tenant.tenantId),
    enabled: isAdmin,
  });

  const contacts = ((contactsQuery.data?.items ?? []) as ContactRow[]).filter((k) =>
    ["customer", "both"].includes(k.type),
  );
  const members = membersQuery.data?.members ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailQuery = useQuery({
    queryKey: ["ticket", tenant.tenantId, selectedId],
    queryFn: () => api.ticket(tenant.tenantId, selectedId!),
    enabled: Boolean(selectedId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tickets", tenant.tenantId] });
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["ticket", tenant.tenantId, selectedId] });
  };

  // --- Form tiket ------------------------------------------------------------
  const [form, setForm] = useState({ contactId: "", subject: "", description: "", priority: "medium" as TicketPriority });
  const [formError, setFormError] = useState<string | null>(null);

  const createTicket = useMutation({
    mutationFn: () =>
      api.createTicket(tenant.tenantId, {
        contactId: form.contactId,
        subject: form.subject.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
      }),
    onSuccess: () => {
      toast("success", "Tiket dibuat.");
      setForm({ contactId: "", subject: "", description: "", priority: "medium" });
      setFormError(null);
      invalidate();
    },
    onError: (err) => setFormError((err as Error).message),
  });

  const [reply, setReply] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const sendReply = useMutation({
    mutationFn: () => api.replyTicket(tenant.tenantId, selectedId!, { body: reply.trim(), internal: replyInternal }),
    onSuccess: () => {
      setReply("");
      setReplyInternal(false);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const update = useMutation({
    mutationFn: (input: { status?: string; assignedTo?: string | null }) =>
      api.updateTicket(tenant.tenantId, selectedId!, input),
    onSuccess: () => invalidate(),
    onError: (err) => toast("error", (err as Error).message),
  });

  const tickets = ticketsQuery.data?.tickets ?? [];
  const detail = detailQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <LifeBuoy className="size-6 text-brand-600" aria-hidden />
        <h1 className="text-2xl font-semibold">Helpdesk</h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Kelola tiket dukungan pelanggan — prioritas, status, penugasan ke tim, dan riwayat balasan (termasuk catatan
        internal).
      </p>

      {isAdmin ? (
        <Card>
          <CardHeader title="Tiket baru" />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="tk-contact">Pelanggan</Label>
                <Select id="tk-contact" value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
                  <option value="">— pilih —</option>
                  {contacts.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="tk-subject">Subjek</Label>
                <Input id="tk-subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="tk-desc">Deskripsi</Label>
              <textarea
                id="tk-desc"
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="sm:w-44">
                <Label htmlFor="tk-priority">Prioritas</Label>
                <Select id="tk-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}>
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {TICKET_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                onClick={() => createTicket.mutate()}
                disabled={createTicket.isPending || !form.contactId || form.subject.trim().length < 3}
              >
                {createTicket.isPending ? <Spinner /> : <Plus className="size-4" aria-hidden />} Buat Tiket
              </Button>
            </div>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Daftar tiket" />
          <CardBody>
            {ticketsQuery.isLoading ? (
              <Spinner />
            ) : tickets.length === 0 ? (
              <EmptyState icon={<LifeBuoy className="size-6" aria-hidden />} title="Belum ada tiket" description="Tiket dukungan akan muncul di sini." />
            ) : (
              <div className="space-y-2">
                {tickets.map((t: ApiTicket) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selectedId === t.id
                        ? "border-brand-400 bg-brand-50/60 dark:border-brand-700 dark:bg-brand-950/40"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-400">{t.ticketNo}</span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {(() => {
                          const age = ticketAge(t);
                          return age ? <Badge tone={age.tone}>umur {age.label}</Badge> : null;
                        })()}
                        <Badge tone={PRIORITY_TONE[t.priority]}>{TICKET_PRIORITY_LABELS[t.priority]}</Badge>
                        <Badge tone={STATUS_TONE[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
                      </div>
                    </div>
                    <div className="mt-1 font-medium">{t.subject}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {t.contactName}
                      {t.assignedName ? ` · ditugaskan ke ${t.assignedName}` : ""}
                      {t.replyCount > 0 ? ` · ${t.replyCount} balasan` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={detail ? `${detail.ticketNo} — ${detail.subject}` : "Detail tiket"} />
          <CardBody>
            {!selectedId ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Pilih tiket untuk melihat detail.</p>
            ) : detailQuery.isLoading || !detail ? (
              <Spinner />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone={PRIORITY_TONE[detail.priority]}>{TICKET_PRIORITY_LABELS[detail.priority]}</Badge>
                  <Badge tone={STATUS_TONE[detail.status]}>{TICKET_STATUS_LABELS[detail.status]}</Badge>
                  <Badge>{detail.contactName}</Badge>
                </div>
                {detail.description ? (
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">{detail.description}</p>
                ) : null}

                {isAdmin ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-40">
                      <Label htmlFor="tk-status">Status</Label>
                      <Select id="tk-status" value={detail.status} onChange={(e) => update.mutate({ status: e.target.value })}>
                        {TICKET_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {TICKET_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-48">
                      <Label htmlFor="tk-assign">Ditugaskan ke</Label>
                      <Select
                        id="tk-assign"
                        value={detail.assignedTo ?? ""}
                        onChange={(e) => update.mutate({ assignedTo: e.target.value || null })}
                      >
                        <option value="">— belum ditugaskan —</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Balasan</h3>
                  {detail.replies.length === 0 ? (
                    <p className="text-sm text-slate-400">Belum ada balasan.</p>
                  ) : (
                    detail.replies.map((r) => (
                      <div
                        key={r.id}
                        className={`rounded-lg p-3 text-sm ${
                          r.internal
                            ? "border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
                            : "bg-slate-50 dark:bg-slate-800/50"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium">{r.authorName}</span>
                          {r.internal ? <Badge tone="amber">catatan internal</Badge> : null}
                          <span>{r.createdAt.slice(0, 16).replace("T", " ")}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{r.body}</p>
                      </div>
                    ))
                  )}
                </div>

                {isAdmin ? (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      placeholder="Tulis balasan…"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <input type="checkbox" checked={replyInternal} onChange={(e) => setReplyInternal(e.target.checked)} />
                        Catatan internal (tak terlihat pelanggan)
                      </label>
                      <Button onClick={() => sendReply.mutate()} disabled={sendReply.isPending || reply.trim().length === 0}>
                        {sendReply.isPending ? <Spinner /> : null} Kirim
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

import type { ApiProject, ApiProjectTask } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
import { api, formatDate, formatIDR } from "../api/client";
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

const STATUS_TONE = { active: "green", on_hold: "amber", completed: "neutral" } as const;
const STATUS_LABEL = { active: "berjalan", on_hold: "ditunda", completed: "selesai" } as const;
const TASK_TONE = { todo: "neutral", in_progress: "brand", done: "green" } as const;
const TASK_LABEL = { todo: "belum", in_progress: "proses", done: "selesai" } as const;
type ContactRow = { id: string; name: string; type: string };

export function ProjectsPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ["projects", tenant.tenantId],
    queryFn: () => api.projects(tenant.tenantId),
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts", tenant.tenantId],
    queryFn: () => api.listItems<ContactRow>(tenant.tenantId, "contacts"),
  });
  const customers = ((contactsQuery.data?.items ?? []) as ContactRow[]).filter((k) => ["customer", "both"].includes(k.type));

  const [form, setForm] = useState({ code: "", name: "", contactId: "", budget: "" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createProject(tenant.tenantId, {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        contactId: form.contactId || undefined,
        budget: Number(form.budget) || 0,
      }),
    onSuccess: () => {
      toast("success", "Proyek dibuat.");
      setForm({ code: "", name: "", contactId: "", budget: "" });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["projects", tenant.tenantId] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const projects = projectsQuery.data?.projects ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proyek</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Kelompokkan pendapatan & biaya per proyek (tag faktur/jurnal ke proyek) dan lihat profitabilitasnya.
        </p>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader title="Proyek baru" description="Setelah dibuat, pilih proyek ini saat membuat faktur, pembelian, atau jurnal untuk menandai biayanya." />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="pr-code">Kode</Label>
                <Input id="pr-code" placeholder="PRJ-01" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="pr-name">Nama proyek</Label>
                <Input id="pr-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pr-budget">Anggaran (opsional)</Label>
                <Input id="pr-budget" type="number" min={0} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="pr-contact">Pelanggan (opsional)</Label>
                <Select id="pr-contact" value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })}>
                  <option value="">—</option>
                  {customers.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => create.mutate()} disabled={create.isPending || form.code.trim().length < 1 || form.name.trim().length < 2}>
                {create.isPending ? <Spinner /> : <Plus className="size-4" aria-hidden />} Buat Proyek
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Daftar proyek" />
        <CardBody>
          {projectsQuery.isLoading ? (
            <Spinner />
          ) : projects.length === 0 ? (
            <EmptyState icon={<FolderKanban className="size-6" aria-hidden />} title="Belum ada proyek" description="Buat proyek untuk mulai melacak profitabilitas per pekerjaan/klien." />
          ) : (
            <div className="space-y-3">
              {projects.map((p) => (
                <ProjectRow key={p.id} project={p} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function ProjectRow({ project, isAdmin }: { project: ApiProject; isAdmin: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [taskName, setTaskName] = useState("");

  const detailQuery = useQuery({
    queryKey: ["project", tenant.tenantId, project.id],
    queryFn: () => api.project(tenant.tenantId, project.id),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["projects", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["project", tenant.tenantId, project.id] });
  };

  const addTask = useMutation({
    mutationFn: () => api.addProjectTask(tenant.tenantId, project.id, { name: taskName.trim() }),
    onSuccess: () => {
      setTaskName("");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const setTask = useMutation({
    mutationFn: (t: ApiProjectTask) =>
      api.setTaskStatus(tenant.tenantId, project.id, t.id, t.status === "done" ? "todo" : t.status === "todo" ? "in_progress" : "done"),
    onSuccess: invalidate,
    onError: (err) => toast("error", (err as Error).message),
  });
  const setStatus = useMutation({
    mutationFn: (status: string) => api.setProjectStatus(tenant.tenantId, project.id, status),
    onSuccess: () => {
      toast("success", "Status proyek diperbarui.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const margin = project.revenue > 0 ? Math.round((project.profit / project.revenue) * 100) : null;

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm">{project.code}</span>
        <span className="font-medium">{project.name}</span>
        <Badge tone={STATUS_TONE[project.status]}>{STATUS_LABEL[project.status]}</Badge>
        {project.contactName ? <span className="text-xs text-slate-400">{project.contactName}</span> : null}
        <span className="ml-auto text-sm">
          Pendapatan <span className="tabular-nums">{formatIDR(project.revenue)}</span> · Biaya{" "}
          <span className="tabular-nums">{formatIDR(project.cost)}</span> · Laba{" "}
          <strong className={`tabular-nums ${project.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {formatIDR(project.profit)}
          </strong>
          {margin !== null ? <span className="text-xs text-slate-400"> ({margin}%)</span> : null}
        </span>
        <Button variant="ghost" className="h-8" onClick={() => setOpen((o) => !o)}>
          {open ? "Tutup" : "Detail"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 space-y-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
          {isAdmin ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor={`st-${project.id}`}>Status proyek</Label>
                <Select id={`st-${project.id}`} value={project.status} onChange={(e) => setStatus.mutate(e.target.value)} disabled={setStatus.isPending}>
                  <option value="active">Berjalan</option>
                  <option value="on_hold">Ditunda</option>
                  <option value="completed">Selesai</option>
                </Select>
              </div>
            </div>
          ) : null}

          {/* Tugas */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Tugas</div>
            {isAdmin ? (
              <div className="mb-2 flex gap-2">
                <Input aria-label="Nama tugas" placeholder="Tambah tugas…" value={taskName} onChange={(e) => setTaskName(e.target.value)} />
                <Button onClick={() => addTask.mutate()} disabled={addTask.isPending || !taskName.trim()}>
                  Tambah
                </Button>
              </div>
            ) : null}
            {detailQuery.isLoading ? (
              <Spinner />
            ) : (detailQuery.data?.tasks.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada tugas.</p>
            ) : (
              <ul className="space-y-1">
                {detailQuery.data!.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <button onClick={() => (isAdmin ? setTask.mutate(t) : undefined)} disabled={!isAdmin} className="disabled:cursor-default">
                      <Badge tone={TASK_TONE[t.status]}>{TASK_LABEL[t.status]}</Badge>
                    </button>
                    <span className={t.status === "done" ? "text-slate-400 line-through" : ""}>{t.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Transaksi ber-tag */}
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pendapatan & biaya (dari jurnal ber-tag)</div>
            {detailQuery.isLoading ? (
              <Spinner />
            ) : (detailQuery.data?.entries.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada transaksi ditandai ke proyek ini.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="pb-1 pr-3 font-medium">Jurnal</th>
                      <th className="pb-1 pr-3 font-medium">Tanggal</th>
                      <th className="pb-1 pr-3 font-medium">Keterangan</th>
                      <th className="pb-1 pr-3 text-right font-medium">Pendapatan</th>
                      <th className="pb-1 text-right font-medium">Biaya</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailQuery.data!.entries.map((e, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                        <td className="py-1 pr-3 font-mono text-xs">{e.entryNo}</td>
                        <td className="py-1 pr-3 text-slate-400">{formatDate(e.entryDate)}</td>
                        <td className="py-1 pr-3">{e.memo ?? "—"}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{e.revenue ? formatIDR(e.revenue) : "—"}</td>
                        <td className="py-1 text-right tabular-nums">{e.cost ? formatIDR(e.cost) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

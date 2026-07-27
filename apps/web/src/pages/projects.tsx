import {
  PROJECT_TASK_PRIORITIES,
  type ApiEmployee,
  type ApiProject,
  type ApiProjectDetail,
  type ApiProjectTask,
  type ProjectTaskPriority,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUi, type UiKey } from "../i18n/ui";
import {
  CalendarClock,
  FileText,
  FolderKanban,
  Plus,
  Receipt,
  Timer,
  UserRound,
} from "lucide-react";
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
  PageHeading,
  Select,
  Spinner,
  Table,
  Tabs,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

// Peta label PROJECT_TASK_PRIORITY_LABELS tinggal di packages/shared dan tetap
// berbahasa Indonesia (apps/api ikut memakai paket itu, jadi shared tidak
// boleh bergantung pada kamus web). Pemetaan ke kunci kamus dilakukan di
// sisi web — Fase 16t.
const TASK_PRIORITY_KEY: Record<ProjectTaskPriority, UiKey> = {
  low: "prioritasRendah",
  medium: "prioritasSedang",
  high: "prioritasTinggi",
};

type ProjectDetailTab = "ikhtisar" | "tugas" | "timesheet" | "anggaran";

const STATUS_TONE = { active: "green", on_hold: "amber", completed: "neutral" } as const;
// Konstanta tingkat modul tidak boleh memanggil hook, jadi yang disimpan
// adalah KUNCI kamus — diterjemahkan saat render (pola sama dengan 16j/16m).
const STATUS_LABEL: Record<"active" | "on_hold" | "completed", UiKey> = {
  active: "berjalan",
  on_hold: "ditunda",
  completed: "selesaiStatus",
} as const;
const TASK_TONE = { todo: "neutral", in_progress: "brand", done: "green" } as const;
const PRIORITY_TONE: Record<ProjectTaskPriority, "red" | "amber" | "neutral"> = {
  high: "red",
  medium: "amber",
  low: "neutral",
};
// Label kolom disimpan sebagai KUNCI kamus (bukan teks jadi) karena konstanta
// level-modul tidak boleh memanggil hook; diterjemahkan saat render.
const TASK_COLUMNS: { key: ApiProjectTask["status"]; labelKey: UiKey }[] = [
  { key: "todo", labelKey: "kolomBelumDikerjakan" },
  { key: "in_progress", labelKey: "kolomSedangProses" },
  { key: "done", labelKey: "kolomSelesai" },
];
const today = () => new Date().toISOString().slice(0, 10);
type ContactRow = { id: string; name: string; type: string };
type WarehouseRow = { id: string; name: string };

export function ProjectsPage() {
  const u = useUi();
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
  const customers = ((contactsQuery.data?.items ?? []) as ContactRow[]).filter((k) =>
    ["customer", "both"].includes(k.type)
  );

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
        <PageHeading k="proyek" />
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader title={u("proyekBaru")} description={u("descProyekBaru")} />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="pr-code">{u("kode")}</Label>
                <Input
                  id="pr-code"
                  placeholder="PRJ-01"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="pr-name">{u("namaProyek")}</Label>
                <Input
                  id="pr-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="pr-budget">{u("anggaranOpsional")}</Label>
                <Input
                  id="pr-budget"
                  type="number"
                  min={0}
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="pr-contact">{u("pelangganOpsional")}</Label>
                <Select
                  id="pr-contact"
                  value={form.contactId}
                  onChange={(e) => setForm({ ...form, contactId: e.target.value })}
                >
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
              <Button
                onClick={() => create.mutate()}
                disabled={
                  create.isPending || form.code.trim().length < 1 || form.name.trim().length < 2
                }
              >
                {create.isPending ? <Spinner /> : <Plus className="size-4" aria-hidden />}{" "}
                {u("buatProyek")}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={u("daftarProyek")} />
        <CardBody>
          {projectsQuery.isLoading ? (
            <Spinner />
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="size-6" aria-hidden />}
              title={u("belumAdaProyek")}
              description={u("descBelumAdaProyek")}
            />
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
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<ProjectDetailTab>("ikhtisar");

  const detailQuery = useQuery({
    queryKey: ["project", tenant.tenantId, project.id],
    queryFn: () => api.project(tenant.tenantId, project.id),
    enabled: open,
  });
  const employeesQuery = useQuery({
    queryKey: ["employees", tenant.tenantId],
    queryFn: () => api.employees(tenant.tenantId),
    enabled: open,
  });
  const employees = (employeesQuery.data?.employees ?? []).filter((e) => e.isActive);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["projects", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["project", tenant.tenantId, project.id] });
  };

  const setStatus = useMutation({
    mutationFn: (status: string) => api.setProjectStatus(tenant.tenantId, project.id, status),
    onSuccess: () => {
      toast("success", "Status proyek diperbarui.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const margin = project.revenue > 0 ? Math.round((project.profit / project.revenue) * 100) : null;
  const progress =
    project.taskCount > 0 ? Math.round((project.doneCount / project.taskCount) * 100) : 0;
  const detail = detailQuery.data;

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm">{project.code}</span>
        <span className="font-medium">{project.name}</span>
        <Badge tone={STATUS_TONE[project.status]}>{u(STATUS_LABEL[project.status])}</Badge>
        {project.contactName ? (
          <span className="text-xs text-slate-400">{project.contactName}</span>
        ) : null}
        {project.taskCount > 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <span
                className="block h-full rounded-full bg-brand-500"
                style={{ width: `${progress}%` }}
              />
            </span>
            {progress}%
          </span>
        ) : null}
        <span className="ml-auto text-sm">
          {u("pendapatan")} <span className="tabular-nums">{formatIDR(project.revenue)}</span> ·{" "}
          {u("biaya")} <span className="tabular-nums">{formatIDR(project.cost)}</span> · {u("laba")}{" "}
          <strong
            className={`tabular-nums ${project.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
          >
            {formatIDR(project.profit)}
          </strong>
          {margin !== null ? <span className="text-xs text-slate-400"> ({margin}%)</span> : null}
        </span>
        <Button variant="ghost" className="h-8" onClick={() => setOpen((o) => !o)}>
          {open ? "Tutup" : "Detail"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 space-y-5 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
          {isAdmin ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor={`st-${project.id}`}>{u("statusProyek")}</Label>
                <Select
                  id={`st-${project.id}`}
                  value={project.status}
                  onChange={(e) => setStatus.mutate(e.target.value)}
                  disabled={setStatus.isPending}
                >
                  <option value="active">{u("berjalan")}</option>
                  <option value="on_hold">{u("ditunda")}</option>
                  <option value="completed">{u("selesai")}</option>
                </Select>
              </div>
            </div>
          ) : null}

          {detailQuery.isLoading || !detail ? (
            <Spinner />
          ) : (
            <>
              <Tabs
                tabs={[
                  { key: "ikhtisar", label: u("tabIkhtisar") },
                  { key: "tugas", label: u("tabTugas") },
                  { key: "timesheet", label: u("tabTimesheet") },
                  { key: "anggaran", label: u("tabTerminRab") },
                ]}
                active={detailTab}
                onChange={setDetailTab}
              />

              {detailTab === "tugas" ? (
                <>
                  <GanttChart
                    projectId={project.id}
                    tasks={detail.tasks}
                    isAdmin={isAdmin}
                    onChange={invalidate}
                  />
                  <TaskBoard
                    projectId={project.id}
                    tasks={detail.tasks}
                    employees={employees}
                    isAdmin={isAdmin}
                    onChange={invalidate}
                  />
                </>
              ) : null}

              {detailTab === "timesheet" ? (
                <TimesheetSection
                  projectId={project.id}
                  detail={detail}
                  isAdmin={isAdmin}
                  onChange={invalidate}
                />
              ) : null}

              {detailTab === "anggaran" ? (
                <>
                  <MilestonesSection
                    projectId={project.id}
                    detail={detail}
                    isAdmin={isAdmin}
                    hasContact={Boolean(project.contactId)}
                    onChange={invalidate}
                  />
                  <BudgetSection
                    projectId={project.id}
                    detail={detail}
                    isAdmin={isAdmin}
                    onChange={invalidate}
                  />
                </>
              ) : null}

              {detailTab === "ikhtisar" ? (
                <>
                  <ProjectTimeline detail={detail} />
                  <WorkloadPanel detail={detail} />

                  {/* Transaksi ber-tag */}
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {u("pendapatanBiayaTag")}
                    </div>
                    {detail.entries.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {u("belumAdaTransaksiProyek")}
                      </p>
                    ) : (
                      // Judul kolom datang dari `u()`, jadi `label` kartu wajib
                      // ikut `u()` juga — bukan string Indonesia keras
                      // (pelajaran 18r).
                      <Table>
                        <Thead>
                          <tr>
                            <Th>{u("jurnal")}</Th>
                            <Th>{u("tanggal")}</Th>
                            <Th>{u("keterangan")}</Th>
                            <Th numeric>{u("pendapatan")}</Th>
                            <Th numeric>{u("biaya")}</Th>
                          </tr>
                        </Thead>
                        <tbody>
                          {detail.entries.map((e, i) => (
                            <Tr key={i}>
                              <Td label={u("jurnal")} className="font-mono text-xs">
                                {e.entryNo}
                              </Td>
                              <Td label={u("tanggal")} className="text-slate-400">
                                {formatDate(e.entryDate)}
                              </Td>
                              <Td label={u("keterangan")}>{e.memo ?? "—"}</Td>
                              <Td numeric label={u("pendapatan")}>
                                {e.revenue ? formatIDR(e.revenue) : "—"}
                              </Td>
                              <Td numeric label={u("biaya")}>
                                {e.cost ? formatIDR(e.cost) : "—"}
                              </Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    )}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Garis waktu proyek: batang mulai→selesai dengan penanda hari ini. */
function ProjectTimeline({ detail }: { detail: ApiProjectDetail }) {
  const u = useUi();
  if (!detail.startDate || !detail.endDate) return null;
  const start = new Date(detail.startDate).getTime();
  const end = new Date(detail.endDate).getTime();
  if (!(end > start)) return null;
  const now = Date.now();
  const pct = Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
  const past = now > end;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <CalendarClock className="size-3.5" aria-hidden /> {u("garisWaktu")}
      </div>
      <div className="relative h-2 rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`absolute left-0 top-0 h-full rounded-full ${past ? "bg-red-500" : "bg-brand-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{formatDate(detail.startDate)}</span>
        <span>{past ? u("lewatTenggat") : `${pct}% ${u("waktuBerjalan")}`}</span>
        <span>{formatDate(detail.endDate)}</span>
      </div>
    </div>
  );
}

/** Gantt sederhana (Fase 7g): batang tugas per tanggal + baseline + dependensi. */
function GanttChart({
  projectId,
  tasks,
  isAdmin,
  onChange,
}: {
  projectId: string;
  tasks: ApiProjectTask[];
  isAdmin: boolean;
  onChange: () => void;
}) {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const [edit, setEdit] = useState<{
    id: string;
    start: string;
    end: string;
    predecessorId: string;
  } | null>(null);

  const save = useMutation({
    mutationFn: (v: {
      id: string;
      startDate: string | null;
      endDate: string | null;
      predecessorId: string | null;
      setBaseline?: boolean;
    }) => api.updateProjectTask(tenant.tenantId, projectId, v.id, v),
    onSuccess: () => {
      setEdit(null);
      onChange();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const scheduled = tasks.filter((t) => t.startDate && t.endDate);
  const allDates = scheduled.flatMap(
    (t) => [t.startDate!, t.endDate!, t.baselineStart, t.baselineEnd].filter(Boolean) as string[]
  );
  const min = allDates.length ? Math.min(...allDates.map((d) => new Date(d).getTime())) : 0;
  const max = allDates.length ? Math.max(...allDates.map((d) => new Date(d).getTime())) : 0;
  const span = max > min ? max - min : 1;
  const pos = (d: string) => ((new Date(d).getTime() - min) / span) * 100;
  const taskName = (id: string | null) => tasks.find((t) => t.id === id)?.name;

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {u("ganttJadwal")}
      </div>
      {scheduled.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {u("belumAdaTugasBerjadwal")} {isAdmin ? u("petunjukJadwalTugas") : ""}
        </p>
      ) : (
        <div className="space-y-1.5">
          {scheduled.map((t) => {
            const left = pos(t.startDate!);
            const width = Math.max(pos(t.endDate!) - left, 2);
            const late =
              t.baselineEnd && new Date(t.endDate!).getTime() > new Date(t.baselineEnd).getTime();
            return (
              <div key={t.id} className="grid grid-cols-[10rem_1fr] items-center gap-2 text-xs">
                <div className="truncate">
                  {t.name}
                  {t.predecessorId ? (
                    <span
                      className="ml-1 text-slate-400"
                      title={`Setelah: ${taskName(t.predecessorId) ?? ""}`}
                    >
                      ↦
                    </span>
                  ) : null}
                </div>
                <div className="relative h-5 rounded bg-slate-100 dark:bg-slate-800/60">
                  {t.baselineStart && t.baselineEnd ? (
                    <div
                      className="absolute top-3.5 h-1 rounded bg-slate-300 dark:bg-slate-600"
                      style={{
                        left: `${pos(t.baselineStart)}%`,
                        width: `${Math.max(pos(t.baselineEnd) - pos(t.baselineStart), 1)}%`,
                      }}
                      title={u("baselineRencana")}
                    />
                  ) : null}
                  <div
                    className={`absolute top-0.5 flex h-3 items-center rounded px-1 text-[10px] text-white ${t.status === "done" ? "bg-emerald-500" : late ? "bg-red-500" : "bg-brand-500"}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${formatDate(t.startDate!)} → ${formatDate(t.endDate!)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {isAdmin ? (
        <div className="mt-3 space-y-1.5">
          {tasks.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-40 truncate text-slate-500 dark:text-slate-400">{t.name}</span>
              {edit?.id === t.id ? (
                <>
                  <input
                    type="date"
                    className="rounded border border-slate-300 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                    value={edit.start}
                    onChange={(e) => setEdit({ ...edit, start: e.target.value })}
                  />
                  <input
                    type="date"
                    className="rounded border border-slate-300 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                    value={edit.end}
                    onChange={(e) => setEdit({ ...edit, end: e.target.value })}
                  />
                  <select
                    className="rounded border border-slate-300 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                    value={edit.predecessorId}
                    onChange={(e) => setEdit({ ...edit, predecessorId: e.target.value })}
                  >
                    <option value="">— tanpa dependensi —</option>
                    {tasks
                      .filter((o) => o.id !== t.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          setelah: {o.name}
                        </option>
                      ))}
                  </select>
                  <Button
                    className="h-7"
                    onClick={() =>
                      save.mutate({
                        id: t.id,
                        startDate: edit.start || null,
                        endDate: edit.end || null,
                        predecessorId: edit.predecessorId || null,
                      })
                    }
                    disabled={save.isPending}
                  >
                    {u("simpan")}
                  </Button>
                  <Button
                    className="h-7"
                    variant="secondary"
                    onClick={() =>
                      save.mutate({
                        id: t.id,
                        startDate: edit.start || null,
                        endDate: edit.end || null,
                        predecessorId: edit.predecessorId || null,
                        setBaseline: true,
                      })
                    }
                    disabled={save.isPending}
                  >
                    {u("simpanBaseline")}
                  </Button>
                  <Button className="h-7" variant="ghost" onClick={() => setEdit(null)}>
                    {u("batal")}
                  </Button>
                </>
              ) : (
                <button
                  className="text-brand-600 hover:underline dark:text-brand-300"
                  onClick={() =>
                    setEdit({
                      id: t.id,
                      start: t.startDate ?? "",
                      end: t.endDate ?? "",
                      predecessorId: t.predecessorId ?? "",
                    })
                  }
                >
                  {t.startDate
                    ? `${formatDate(t.startDate)} → ${formatDate(t.endDate ?? t.startDate)}`
                    : "Jadwal"}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Papan tugas todo/proses/selesai dengan drag-and-drop + penanggung jawab & prioritas. */
function TaskBoard({
  projectId,
  tasks,
  employees,
  isAdmin,
  onChange,
}: {
  projectId: string;
  tasks: ApiProjectTask[];
  employees: ApiEmployee[];
  isAdmin: boolean;
  onChange: () => void;
}) {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    assigneeId: "",
    priority: "medium" as ProjectTaskPriority,
    dueDate: "",
  });
  const [dragOver, setDragOver] = useState<string | null>(null);
  const todayStr = today();

  const addTask = useMutation({
    mutationFn: () =>
      api.addProjectTask(tenant.tenantId, projectId, {
        name: form.name.trim(),
        priority: form.priority,
        ...(form.assigneeId ? { assigneeId: form.assigneeId } : {}),
        ...(form.dueDate ? { dueDate: form.dueDate } : {}),
      }),
    onSuccess: () => {
      setForm({ name: "", assigneeId: "", priority: "medium", dueDate: "" });
      onChange();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const move = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      api.setTaskStatus(tenant.tenantId, projectId, v.id, v.status),
    onSuccess: onChange,
    onError: (err) => toast("error", (err as Error).message),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; assigneeId?: string | null; priority?: ProjectTaskPriority }) =>
      api.updateProjectTask(tenant.tenantId, projectId, v.id, v),
    onSuccess: onChange,
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {u("papanTugas")}
      </div>
      {isAdmin ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              aria-label={u("namaTugas")}
              placeholder={u("tambahTugas")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <Select
            aria-label={u("penanggungJawab")}
            value={form.assigneeId}
            onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
          >
            <option value="">{u("tanpaPj")}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label={u("prioritas")}
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as ProjectTaskPriority })}
          >
            {PROJECT_TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {u(TASK_PRIORITY_KEY[p])}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Input
              aria-label={u("tenggat")}
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
            <Button
              onClick={() => addTask.mutate()}
              disabled={addTask.isPending || !form.name.trim()}
            >
              {u("tambah")}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <div className="flex min-w-[640px] gap-3">
          {TASK_COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                onDragOver={
                  isAdmin
                    ? (e) => {
                        e.preventDefault();
                        setDragOver(col.key);
                      }
                    : undefined
                }
                onDragLeave={() => setDragOver((c) => (c === col.key ? null : c))}
                onDrop={
                  isAdmin
                    ? (e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const id = e.dataTransfer.getData("text/task-id");
                        if (id) move.mutate({ id, status: col.key });
                      }
                    : undefined
                }
                className={`flex-1 rounded-lg border p-2 ${dragOver === col.key ? "border-brand-400 bg-brand-50 dark:bg-brand-950/30" : "border-slate-200 dark:border-slate-700"}`}
              >
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>{u(col.labelKey)}</span>
                  <Badge tone={TASK_TONE[col.key]}>{items.length}</Badge>
                </div>
                <div className="space-y-1.5">
                  {items.map((t) => {
                    const overdue = t.dueDate && t.status !== "done" && t.dueDate < todayStr;
                    return (
                      <div
                        key={t.id}
                        draggable={isAdmin}
                        onDragStart={
                          isAdmin ? (e) => e.dataTransfer.setData("text/task-id", t.id) : undefined
                        }
                        className={`rounded-md border bg-white p-2 text-sm dark:bg-slate-900 ${overdue ? "border-red-300 dark:border-red-500/40" : "border-slate-200 dark:border-slate-700"} ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0">{t.name}</span>
                          <Badge tone={PRIORITY_TONE[t.priority]}>
                            {u(TASK_PRIORITY_KEY[t.priority])}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <UserRound className="size-3" aria-hidden />{" "}
                            {t.assigneeName ?? u("belumDitugaskan")}
                          </span>
                          {t.dueDate ? (
                            <span className={overdue ? "font-medium text-red-500" : ""}>
                              tenggat {t.dueDate}
                            </span>
                          ) : null}
                        </div>
                        {isAdmin ? (
                          <div className="mt-1.5 flex gap-1.5">
                            <select
                              aria-label={u("ubahPenanggungJawab")}
                              className="min-w-0 flex-1 rounded border border-slate-200 bg-transparent px-1 py-0.5 text-xs dark:border-slate-700"
                              value={t.assigneeId ?? ""}
                              onChange={(e) =>
                                update.mutate({ id: t.id, assigneeId: e.target.value || null })
                              }
                            >
                              <option value="">{u("tanpaPj")}</option>
                              {employees.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label={u("ubahPrioritas")}
                              className="rounded border border-slate-200 bg-transparent px-1 py-0.5 text-xs dark:border-slate-700"
                              value={t.priority}
                              onChange={(e) =>
                                update.mutate({
                                  id: t.id,
                                  priority: e.target.value as ProjectTaskPriority,
                                })
                              }
                            >
                              {PROJECT_TASK_PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                  {u(TASK_PRIORITY_KEY[p])}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {items.length === 0 ? (
                    <div className="rounded-md border border-dashed border-slate-200 p-2 text-center text-xs text-slate-400 dark:border-slate-700">
                      {u("kolomKosong")}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {isAdmin ? <p className="mt-1.5 text-xs text-slate-400">{u("petunjukSeretKartu")}</p> : null}
    </div>
  );
}

/** Beban kerja per penanggung jawab + daftar tugas jatuh tempo/terlambat. */
function WorkloadPanel({ detail }: { detail: ApiProjectDetail }) {
  const u = useUi();
  const todayStr = today();
  const dueTasks = detail.tasks
    .filter((t) => t.status !== "done" && t.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  if (detail.workload.length === 0) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {u("bebanKerja")}
        </div>
        <div className="space-y-1.5">
          {detail.workload.map((w) => (
            <div
              key={w.assigneeId ?? "none"}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700"
            >
              <span className="inline-flex items-center gap-1 font-medium">
                <UserRound className="size-3.5 text-slate-400" aria-hidden /> {w.assigneeName}
              </span>
              <span className="ml-auto flex items-center gap-1.5 text-xs">
                <Badge tone="brand">
                  {w.openTasks} {u("terbuka")}
                </Badge>
                <span className="text-slate-400">
                  {u("belumKecil")} {w.todo} · {u("prosesKecil")} {w.inProgress} ·{" "}
                  {u("selesaiKecil")} {w.done}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {u("tugasTenggat")}
        </div>
        {dueTasks.length === 0 ? (
          <p className="text-sm text-slate-400">{u("belumAdaTugasTenggat")}</p>
        ) : (
          <div className="space-y-1.5">
            {dueTasks.map((t) => {
              const overdue = (t.dueDate ?? "") < todayStr;
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700"
                >
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="text-xs text-slate-400">{t.assigneeName ?? "—"}</span>
                  <span
                    className={`text-xs ${overdue ? "font-semibold text-red-500" : "text-slate-500 dark:text-slate-400"}`}
                  >
                    {overdue ? "terlambat " : ""}
                    {t.dueDate}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Termin penagihan: daftar termin + buat faktur jasa tertaut proyek. */
function MilestonesSection({
  projectId,
  detail,
  isAdmin,
  hasContact,
  onChange,
}: {
  projectId: string;
  detail: ApiProjectDetail;
  isAdmin: boolean;
  hasContact: boolean;
  onChange: () => void;
}) {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", amount: "" });
  const [invoicing, setInvoicing] = useState<string | null>(null);
  const [invDate, setInvDate] = useState(today());
  const [taxRate, setTaxRate] = useState<0 | 11>(0);
  const [warehouseId, setWarehouseId] = useState("");

  const warehousesQuery = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses"),
    enabled: invoicing !== null,
  });
  const warehouses = (warehousesQuery.data?.items ?? []) as WarehouseRow[];

  const add = useMutation({
    mutationFn: () =>
      api.addMilestone(tenant.tenantId, projectId, {
        name: form.name.trim(),
        amount: Math.round(Number(form.amount) || 0),
      }),
    onSuccess: () => {
      setForm({ name: "", amount: "" });
      onChange();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const del = useMutation({
    mutationFn: (mid: string) => api.deleteMilestone(tenant.tenantId, projectId, mid),
    onSuccess: onChange,
    onError: (err) => toast("error", (err as Error).message),
  });
  const invoice = useMutation({
    mutationFn: (mid: string) =>
      api.invoiceMilestone(tenant.tenantId, projectId, mid, {
        invoiceDate: invDate,
        taxRate,
        warehouseId: warehouseId || warehouses[0]?.id || "",
      }),
    onSuccess: (res) => {
      toast("success", `Faktur ${res.docNo} dibuat dari termin (${formatIDR(res.total)}).`);
      setInvoicing(null);
      onChange();
      queryClient.invalidateQueries({ queryKey: ["invoices", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const billed = detail.milestones
    .filter((m) => m.status === "invoiced")
    .reduce((s, m) => s + m.amount, 0);
  const totalTermin = detail.milestones.reduce((s, m) => s + m.amount, 0);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Receipt className="size-3.5" aria-hidden /> {u("terminPenagihan")}
      </div>
      {isAdmin ? (
        <div className="mb-2 flex flex-wrap gap-2">
          <Input
            aria-label={u("namaTermin")}
            placeholder={u("contohTermin")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="min-w-40 flex-1"
          />
          <Input
            aria-label={u("nominalTermin")}
            type="number"
            min={0}
            placeholder={u("nominal")}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-40"
          />
          <Button
            onClick={() => add.mutate()}
            disabled={add.isPending || form.name.trim().length < 2 || !(Number(form.amount) > 0)}
          >
            <Plus className="size-4" aria-hidden /> {u("termin")}
          </Button>
        </div>
      ) : null}
      {detail.milestones.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{u("belumAdaTermin")}</p>
      ) : (
        <div className="space-y-1.5">
          {detail.milestones.map((m) => (
            <div
              key={m.id}
              className="rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{m.name}</span>
                <span className="tabular-nums">{formatIDR(m.amount)}</span>
                {m.status === "invoiced" ? (
                  <Badge tone="green">difakturkan{m.invoiceNo ? ` · ${m.invoiceNo}` : ""}</Badge>
                ) : (
                  <Badge tone="amber">rencana</Badge>
                )}
                {isAdmin && m.status === "planned" ? (
                  <span className="ml-auto flex gap-2">
                    <Button
                      variant="secondary"
                      className="h-8"
                      onClick={() => setInvoicing(invoicing === m.id ? null : m.id)}
                      disabled={!hasContact}
                    >
                      <FileText className="size-4" aria-hidden /> {u("buatFakturKecil")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8"
                      onClick={() => del.mutate(m.id)}
                      disabled={del.isPending}
                    >
                      {u("hapus")}
                    </Button>
                  </span>
                ) : null}
              </div>
              {!hasContact && isAdmin && m.status === "planned" ? (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {u("tetapkanPelangganTermin")}
                </p>
              ) : null}
              {invoicing === m.id ? (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md bg-white p-2 dark:bg-slate-900">
                  <div>
                    <Label htmlFor={`inv-date-${m.id}`}>{u("tanggalFaktur")}</Label>
                    <Input
                      id={`inv-date-${m.id}`}
                      type="date"
                      value={invDate}
                      onChange={(e) => setInvDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`inv-tax-${m.id}`}>PPN</Label>
                    <Select
                      id={`inv-tax-${m.id}`}
                      value={String(taxRate)}
                      onChange={(e) => setTaxRate(Number(e.target.value) as 0 | 11)}
                    >
                      <option value="0">{u("tanpaPpn")}</option>
                      <option value="11">PPN 11%</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`inv-wh-${m.id}`}>{u("gudang")}</Label>
                    <Select
                      id={`inv-wh-${m.id}`}
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    onClick={() => invoice.mutate(m.id)}
                    disabled={invoice.isPending || warehouses.length === 0}
                  >
                    {invoice.isPending ? <Spinner /> : null} {u("terbitkanFaktur")}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          <p className="pt-1 text-xs text-slate-500 dark:text-slate-400">
            {u("totalTermin")}{" "}
            <span className="font-medium tabular-nums">{formatIDR(totalTermin)}</span> ·{" "}
            {u("sudahDitagih")}{" "}
            <span className="font-medium tabular-nums">{formatIDR(billed)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/** RAB: anggaran biaya per kategori vs realisasi (biaya jurnal ber-tag proyek). */
function BudgetSection({
  projectId,
  detail,
  isAdmin,
  onChange,
}: {
  projectId: string;
  detail: ApiProjectDetail;
  isAdmin: boolean;
  onChange: () => void;
}) {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState({ category: "", amount: "" });

  const add = useMutation({
    mutationFn: () =>
      api.addProjectBudget(tenant.tenantId, projectId, {
        category: form.category.trim(),
        plannedAmount: Math.round(Number(form.amount) || 0),
      }),
    onSuccess: () => {
      setForm({ category: "", amount: "" });
      onChange();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const del = useMutation({
    mutationFn: (bid: string) => api.deleteProjectBudget(tenant.tenantId, projectId, bid),
    onSuccess: onChange,
    onError: (err) => toast("error", (err as Error).message),
  });

  const realisasiPct =
    detail.plannedCost > 0 ? Math.round((detail.cost / detail.plannedCost) * 100) : null;

  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {u("rabAnggaranVsRealisasi")}
      </div>
      {isAdmin ? (
        <div className="mb-2 flex flex-wrap gap-2">
          <Input
            aria-label={u("kategoriRab")}
            placeholder={u("contohKategoriRab")}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="min-w-40 flex-1"
          />
          <Input
            aria-label={u("anggaran")}
            type="number"
            min={0}
            placeholder={u("anggaran")}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-40"
          />
          <Button
            onClick={() => add.mutate()}
            disabled={
              add.isPending || form.category.trim().length < 2 || !(Number(form.amount) > 0)
            }
          >
            <Plus className="size-4" aria-hidden /> {u("barisRab")}
          </Button>
        </div>
      ) : null}
      {detail.budgets.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{u("belumAdaRab")}</p>
      ) : (
        <div className="space-y-1.5">
          {detail.budgets.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{b.category}</span>
              <span className="tabular-nums">{formatIDR(b.plannedAmount)}</span>
              {isAdmin ? (
                <button
                  onClick={() => del.mutate(b.id)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  hapus
                </button>
              ) : null}
            </div>
          ))}
          <div className="mt-2 rounded-md bg-white p-2 dark:bg-slate-900">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{u("totalAnggaran")}</span>
              <span className="tabular-nums">{formatIDR(detail.plannedCost)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="font-medium">{u("realisasiBiaya")}</span>
              <span className="tabular-nums">{formatIDR(detail.cost)}</span>
            </div>
            {realisasiPct !== null ? (
              <div className="mt-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <span
                    className={`block h-full rounded-full ${realisasiPct > 100 ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(realisasiPct, 100)}%` }}
                  />
                </div>
                <p
                  className={`mt-1 text-xs ${realisasiPct > 100 ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}
                >
                  {u("realisasi")} {realisasiPct}% {u("dariAnggaran")}
                  {realisasiPct > 100 ? ` ${u("melebihiRab")}` : ""}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/** Timesheet: jam kerja per karyawan → estimasi biaya tenaga kerja (informatif). */
function TimesheetSection({
  projectId,
  detail,
  isAdmin,
  onChange,
}: {
  projectId: string;
  detail: ApiProjectDetail;
  isAdmin: boolean;
  onChange: () => void;
}) {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState({
    employeeId: "",
    date: today(),
    hours: "",
    rate: "",
    note: "",
  });

  const employeesQuery = useQuery({
    queryKey: ["employees", tenant.tenantId],
    queryFn: () => api.employees(tenant.tenantId),
    enabled: isAdmin,
  });
  const employees = (employeesQuery.data?.employees ?? []).filter((e: ApiEmployee) => e.isActive);

  const add = useMutation({
    mutationFn: () =>
      api.addTimeEntry(tenant.tenantId, projectId, {
        ...(form.employeeId ? { employeeId: form.employeeId } : {}),
        entryDate: form.date,
        hours: Number(form.hours) || 0,
        hourlyRate: Math.round(Number(form.rate) || 0),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      }),
    onSuccess: () => {
      setForm({ employeeId: form.employeeId, date: today(), hours: "", rate: form.rate, note: "" });
      onChange();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const del = useMutation({
    mutationFn: (eid: string) => api.deleteTimeEntry(tenant.tenantId, projectId, eid),
    onSuccess: onChange,
    onError: (err) => toast("error", (err as Error).message),
  });

  const profitAfterLabor = detail.profit - detail.laborCost;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Timer className="size-3.5" aria-hidden /> {u("timesheetJamKerja")}
      </div>
      {isAdmin ? (
        <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            aria-label={u("karyawan")}
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
          >
            <option value="">— karyawan —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Input
            aria-label={u("tanggal")}
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <Input
            aria-label={u("jam")}
            type="number"
            min={0}
            step="0.5"
            placeholder={u("jam")}
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
          />
          <Input
            aria-label={u("tarifJam")}
            type="number"
            min={0}
            placeholder={u("tarifJam")}
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
          />
          <Button
            onClick={() => add.mutate()}
            disabled={add.isPending || !(Number(form.hours) > 0)}
          >
            <Plus className="size-4" aria-hidden /> {u("catatJam")}
          </Button>
        </div>
      ) : null}
      {detail.timeEntries.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{u("belumAdaJam")}</p>
      ) : (
        <div className="space-y-1">
          {detail.timeEntries.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
              <span className="text-slate-400">{t.entryDate}</span>
              <span>{t.employeeName ?? "—"}</span>
              <span className="tabular-nums">
                {t.hours} jam × {formatIDR(t.hourlyRate)}
              </span>
              <span className="font-medium tabular-nums">{formatIDR(t.amount)}</span>
              {t.note ? <span className="text-xs text-slate-400">{t.note}</span> : null}
              {isAdmin ? (
                <button
                  onClick={() => del.mutate(t.id)}
                  className="ml-auto text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  hapus
                </button>
              ) : null}
            </div>
          ))}
          <div className="mt-2 rounded-md bg-white p-2 text-sm dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span>{u("estimasiBiayaTk")}</span>
              <span className="font-medium tabular-nums">{formatIDR(detail.laborCost)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>{u("labaSetelahTk")}</span>
              <strong
                className={`tabular-nums ${profitAfterLabor >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              >
                {formatIDR(profitAfterLabor)}
              </strong>
            </div>
            <p className="mt-1 text-xs text-slate-400">{u("descTimesheetEstimasi")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

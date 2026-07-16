import { PTKP_STATUSES, type ApiEmployee, type ApiLeaveRequest, type ApiPayrollRun, type LeaveType } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, HandCoins, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { api, formatIDR } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
type AccountRow = { id: string; code: string; name: string; type: string };

export function PayrollPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const employeesQuery = useQuery({
    queryKey: ["employees", tenant.tenantId],
    queryFn: () => api.employees(tenant.tenantId),
  });
  const runsQuery = useQuery({
    queryKey: ["payroll-runs", tenant.tenantId],
    queryFn: () => api.payrollRuns(tenant.tenantId),
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });

  const cashAccounts = (accountsQuery.data?.accounts ?? []).filter((a: AccountRow) => a.type === "asset");

  const departmentsQuery = useQuery({
    queryKey: ["departments", tenant.tenantId],
    queryFn: () => api.departments(tenant.tenantId),
  });
  const departments = departmentsQuery.data?.departments ?? [];

  const [emp, setEmp] = useState({ name: "", position: "", ptkpStatus: "TK/0", baseSalary: "", allowances: "", departmentId: "", managerId: "" });
  const [empError, setEmpError] = useState<string | null>(null);
  const [period, setPeriod] = useState(thisMonth);
  const [cashAccountId, setCashAccountId] = useState("");
  const [payDate, setPayDate] = useState(today);
  const [runError, setRunError] = useState<string | null>(null);

  const createEmp = useMutation({
    mutationFn: () =>
      api.createEmployee(tenant.tenantId, {
        name: emp.name.trim(),
        position: emp.position.trim() || undefined,
        ptkpStatus: emp.ptkpStatus,
        baseSalary: Number(emp.baseSalary) || 0,
        allowances: Number(emp.allowances) || 0,
        departmentId: emp.departmentId || undefined,
        managerId: emp.managerId || undefined,
      }),
    onSuccess: () => {
      toast("success", "Karyawan ditambahkan.");
      setEmp({ name: "", position: "", ptkpStatus: "TK/0", baseSalary: "", allowances: "", departmentId: "", managerId: "" });
      setEmpError(null);
      queryClient.invalidateQueries({ queryKey: ["employees", tenant.tenantId] });
    },
    onError: (err) => setEmpError((err as Error).message),
  });

  const toggleActive = useMutation({
    mutationFn: (e: ApiEmployee) => api.updateEmployee(tenant.tenantId, e.id, { isActive: !e.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees", tenant.tenantId] }),
    onError: (err) => toast("error", (err as Error).message),
  });

  const run = useMutation({
    mutationFn: () => api.runPayroll(tenant.tenantId, { period, cashAccountId: cashAccountId || cashAccounts[0]?.id || "", paymentDate: payDate }),
    onSuccess: (res) => {
      toast("success", `Penggajian ${res.runNo}: ${res.employees} karyawan, netto ${formatIDR(res.totalNet)}.`);
      setRunError(null);
      queryClient.invalidateQueries({ queryKey: ["payroll-runs", tenant.tenantId] });
    },
    onError: (err) => setRunError((err as Error).message),
  });

  const employees = employeesQuery.data?.employees ?? [];
  const activeCount = employees.filter((e) => e.isActive).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Penggajian</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Kelola karyawan dan jalankan penggajian bulanan — PPh 21 (TER) & BPJS dihitung otomatis, jurnal beban gaji
          dibuat sendiri.
        </p>
      </div>

      <Alert tone="info">
        <strong>Catatan pajak:</strong> tarif TER (PPh 21) & BPJS mengikuti ketentuan 2024. Peraturan dapat berubah —
        verifikasi angka dengan konsultan/peraturan terbaru sebelum penggajian resmi.
      </Alert>

      {/* Karyawan */}
      <Card>
        <CardHeader title="Karyawan" description={`${activeCount} aktif dari ${employees.length} karyawan`} />
        <CardBody className="space-y-4">
          {isAdmin ? (
            <>
              {empError ? <Alert tone="error">{empError}</Alert> : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="lg:col-span-1">
                  <Label htmlFor="emp-name">Nama</Label>
                  <Input id="emp-name" value={emp.name} onChange={(e) => setEmp({ ...emp, name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="emp-pos">Jabatan</Label>
                  <Input id="emp-pos" value={emp.position} onChange={(e) => setEmp({ ...emp, position: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="emp-ptkp">Status PTKP</Label>
                  <Select id="emp-ptkp" value={emp.ptkpStatus} onChange={(e) => setEmp({ ...emp, ptkpStatus: e.target.value })}>
                    {PTKP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="emp-salary">Gaji pokok</Label>
                  <Input id="emp-salary" type="number" min={0} value={emp.baseSalary} onChange={(e) => setEmp({ ...emp, baseSalary: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="emp-allow">Tunjangan</Label>
                  <Input id="emp-allow" type="number" min={0} value={emp.allowances} onChange={(e) => setEmp({ ...emp, allowances: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="emp-dept">Departemen</Label>
                  <Select id="emp-dept" value={emp.departmentId} onChange={(e) => setEmp({ ...emp, departmentId: e.target.value })}>
                    <option value="">— tanpa departemen —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="emp-manager">Atasan langsung</Label>
                  <Select id="emp-manager" value={emp.managerId} onChange={(e) => setEmp({ ...emp, managerId: e.target.value })}>
                    <option value="">— tanpa atasan —</option>
                    {employees.filter((x) => x.isActive).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => createEmp.mutate()} disabled={createEmp.isPending || emp.name.trim().length < 2}>
                  {createEmp.isPending ? <Spinner /> : <UserPlus className="size-4" aria-hidden />} Tambah Karyawan
                </Button>
              </div>
            </>
          ) : null}

          {employeesQuery.isLoading ? (
            <Spinner />
          ) : employees.length === 0 ? (
            <EmptyState icon={<Users className="size-6" aria-hidden />} title="Belum ada karyawan" description="Tambahkan karyawan untuk mulai menjalankan penggajian." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="pb-2 pr-3 font-medium">Nama</th>
                    <th className="pb-2 pr-3 font-medium">Jabatan</th>
                    <th className="pb-2 pr-3 font-medium">Departemen · Atasan</th>
                    <th className="pb-2 pr-3 font-medium">PTKP</th>
                    <th className="pb-2 pr-3 text-right font-medium">Gaji pokok</th>
                    <th className="pb-2 pr-3 text-right font-medium">Tunjangan</th>
                    <th className="pb-2 pr-3 text-right font-medium">Sisa cuti</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium">1721-A1</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="py-2 pr-3">{e.name}</td>
                      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{e.position ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
                        {e.departmentName ?? "—"}
                        {e.managerName ? <span className="block text-xs">↳ {e.managerName}</span> : null}
                      </td>
                      <td className="py-2 pr-3">{e.ptkpStatus}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatIDR(e.baseSalary)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatIDR(e.allowances)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{e.leaveBalance} hari</td>
                      <td className="py-2 pr-3">
                        {e.isActive ? <Badge tone="green">aktif</Badge> : <Badge tone="neutral">nonaktif</Badge>}
                        {isAdmin ? (
                          <button
                            onClick={() => toggleActive.mutate(e)}
                            className="ml-2 text-xs text-brand-700 hover:underline dark:text-brand-400"
                          >
                            {e.isActive ? "nonaktifkan" : "aktifkan"}
                          </button>
                        ) : null}
                      </td>
                      <td className="py-2">
                        <a
                          href={`/cetak/1721a1?tenant=${tenant.tenantId}&employee=${e.id}&year=${new Date().getFullYear()}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-700 hover:underline dark:text-brand-400"
                        >
                          Cetak
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Jalankan penggajian */}
      {isAdmin ? (
        <Card>
          <CardHeader title="Jalankan penggajian bulanan" description="Menghitung semua karyawan aktif & memposting jurnal beban gaji. Satu kali per periode." />
          <CardBody className="space-y-4">
            {runError ? <Alert tone="error">{runError}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="run-period">Periode (bulan)</Label>
                <Input id="run-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="run-cash">Bayar dari akun</Label>
                <Select id="run-cash" value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
                  {cashAccounts.map((a: AccountRow) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="run-date">Tanggal bayar</Label>
                <Input id="run-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => run.mutate()} disabled={run.isPending || activeCount === 0 || cashAccounts.length === 0}>
                {run.isPending ? <Spinner /> : null} Jalankan Penggajian
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {isAdmin ? <AdjustmentsCard tenantId={tenant.tenantId} employees={employees} period={period} /> : null}

      {/* Riwayat penggajian */}
      <Card>
        <CardHeader title="Riwayat penggajian" />
        <CardBody>
          {runsQuery.isLoading ? (
            <Spinner />
          ) : (runsQuery.data?.runs.length ?? 0) === 0 ? (
            <EmptyState icon={<Users className="size-6" aria-hidden />} title="Belum ada penggajian" description="Penggajian yang Anda jalankan akan muncul di sini beserta slip gaji tiap karyawan." />
          ) : (
            <div className="space-y-3">
              {runsQuery.data!.runs.map((r) => (
                <RunRow
                  key={r.id}
                  run={r}
                  tenantId={tenant.tenantId}
                  // Hanya run aktif TERBARU yang boleh dibatalkan (guard server sama).
                  canVoid={isAdmin && r.id === runsQuery.data!.runs.find((x) => !x.voidedAt)?.id}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <LoansCard tenantId={tenant.tenantId} employees={employees} isAdmin={isAdmin} cashAccounts={cashAccounts} />
      <LeaveCard tenantId={tenant.tenantId} employees={employees} isAdmin={isAdmin} />
      <DepartmentsCard tenantId={tenant.tenantId} isAdmin={isAdmin} />
      <OrgChartCard tenantId={tenant.tenantId} />
    </div>
  );
}

/** Departemen (Fase 8c): master hierarki departemen perusahaan. */
function DepartmentsCard({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["departments", tenantId], queryFn: () => api.departments(tenantId) });
  const departments = query.data?.departments ?? [];
  const [form, setForm] = useState({ code: "", name: "", parentId: "" });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["departments", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["org-chart", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["employees", tenantId] });
  };
  const create = useMutation({
    mutationFn: () =>
      api.createDepartment(tenantId, {
        code: form.code.trim(),
        name: form.name.trim(),
        parentId: form.parentId || undefined,
      }),
    onSuccess: () => {
      toast("success", "Departemen ditambahkan.");
      setForm({ code: "", name: "", parentId: "" });
      refresh();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.archiveDepartment(tenantId, id),
    onSuccess: () => {
      toast("success", "Departemen diarsipkan.");
      refresh();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <Card>
      <CardHeader
        title="Departemen"
        description="Struktur unit kerja perusahaan — bisa bertingkat (sub-departemen di bawah induk)."
      />
      <CardBody className="space-y-4">
        {isAdmin ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="dept-code">Kode</Label>
              <Input id="dept-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="mis. OPS" />
            </div>
            <div>
              <Label htmlFor="dept-name">Nama</Label>
              <Input id="dept-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Operasional" />
            </div>
            <div>
              <Label htmlFor="dept-parent">Induk</Label>
              <Select id="dept-parent" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">— tingkat teratas —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => create.mutate()} disabled={create.isPending || !form.code.trim() || form.name.trim().length < 2}>
                Tambah
              </Button>
            </div>
          </div>
        ) : null}

        {query.isLoading ? (
          <Spinner />
        ) : departments.length === 0 ? (
          <p className="py-2 text-sm text-slate-500 dark:text-slate-400">Belum ada departemen.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {departments.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{d.code}</span>{" "}
                  <span className="font-medium">{d.name}</span>
                  {d.parentName ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400"> · di bawah {d.parentName}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <Badge tone="neutral">{d.employeeCount} karyawan</Badge>
                  {isAdmin ? (
                    <button onClick={() => archive.mutate(d.id)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                      Arsipkan
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Bagan organisasi sederhana: pohon departemen (indentasi) + karyawan & atasannya. */
function OrgChartCard({ tenantId }: { tenantId: string }) {
  const query = useQuery({ queryKey: ["org-chart", tenantId], queryFn: () => api.orgChart(tenantId) });
  const tree = query.data?.tree ?? [];
  const unassigned = query.data?.unassigned ?? [];

  function renderNode(node: (typeof tree)[number], depth: number) {
    return (
      <li key={node.id} style={{ marginLeft: depth * 16 }} className="py-1">
        <div className="text-sm font-semibold">
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{node.code}</span> {node.name}
        </div>
        {node.employees.length > 0 ? (
          <ul className="ml-4 border-l border-slate-200 pl-3 dark:border-slate-700">
            {node.employees.map((e) => (
              <li key={e.id} className="py-0.5 text-sm">
                {e.name}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {e.position ? ` · ${e.position}` : ""}
                  {e.managerName ? ` · atasan: ${e.managerName}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {node.children.length > 0 ? <ul>{node.children.map((ch) => renderNode(ch, depth + 1))}</ul> : null}
      </li>
    );
  }

  return (
    <Card>
      <CardHeader title="Struktur organisasi" description="Peta departemen & karyawan — siapa berada di mana, di bawah siapa." />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : tree.length === 0 && unassigned.length === 0 ? (
          <p className="py-2 text-sm text-slate-500 dark:text-slate-400">
            Belum ada struktur — tambahkan departemen lalu tempatkan karyawan.
          </p>
        ) : (
          <div className="space-y-3">
            <ul>{tree.map((n) => renderNode(n, 0))}</ul>
            {unassigned.length > 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tanpa departemen: {unassigned.map((e) => e.name).join(", ")}
              </p>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Komponen gaji ad-hoc (bonus/lembur/potongan) untuk satu periode — ikut PPh 21 & jurnal. */
function AdjustmentsCard({ tenantId, employees, period }: { tenantId: string; employees: ApiEmployee[]; period: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ employeeId: "", name: "", amount: "", kind: "plus" as "plus" | "minus" });

  const listQuery = useQuery({
    queryKey: ["payroll-adjustments", tenantId, period],
    queryFn: () => api.payrollAdjustments(tenantId, period),
    enabled: /^\d{4}-\d{2}$/.test(period),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["payroll-adjustments", tenantId] });

  const create = useMutation({
    mutationFn: () =>
      api.createPayrollAdjustment(tenantId, {
        period,
        employeeId: form.employeeId || employees.find((e) => e.isActive)?.id || "",
        name: form.name.trim(),
        amount: (form.kind === "minus" ? -1 : 1) * Math.abs(Math.round(Number(form.amount) || 0)),
      }),
    onSuccess: () => {
      toast("success", "Komponen ditambahkan — akan ikut dihitung saat periode ini digaji.");
      setForm({ employeeId: form.employeeId, name: "", amount: "", kind: "plus" });
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deletePayrollAdjustment(tenantId, id),
    onSuccess: () => {
      toast("success", "Komponen dihapus.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const adjustments = listQuery.data?.adjustments ?? [];
  const activeEmployees = employees.filter((e) => e.isActive);

  return (
    <Card>
      <CardHeader
        title={`Bonus, lembur & potongan — periode ${period}`}
        description="Komponen sekali jalan untuk periode di atas. Ikut menambah/mengurangi bruto sehingga PPh 21 & BPJS ikut menyesuaikan."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="adj-emp">Karyawan</Label>
            <Select id="adj-emp" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              {activeEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="adj-name">Nama komponen</Label>
            <Input id="adj-name" placeholder="mis. Bonus kinerja / Lembur / Potongan absen" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="adj-kind">Jenis</Label>
            <Select id="adj-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "plus" | "minus" })}>
              <option value="plus">Tambahan (bonus/lembur)</option>
              <option value="minus">Potongan</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="adj-amount">Nominal (Rp)</Label>
            <Input id="adj-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || form.name.trim().length < 2 || !(Number(form.amount) > 0) || activeEmployees.length === 0}
          >
            {create.isPending ? <Spinner /> : null} Tambah Komponen
          </Button>
        </div>

        {adjustments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-2 pr-3 font-medium">Karyawan</th>
                  <th className="pb-2 pr-3 font-medium">Komponen</th>
                  <th className="pb-2 pr-3 text-right font-medium">Nominal</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-2 pr-3">{a.employeeName}</td>
                    <td className="py-2 pr-3">{a.name}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${a.amount < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                      {formatIDR(a.amount)}
                    </td>
                    <td className="py-2">
                      {a.runId ? (
                        <Badge tone="green">terpakai</Badge>
                      ) : (
                        <>
                          <Badge tone="amber">menunggu run</Badge>
                          <button
                            onClick={() => remove.mutate(a.id)}
                            className="ml-2 text-xs text-red-600 hover:underline dark:text-red-400"
                          >
                            hapus
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Belum ada komponen untuk periode ini.</p>
        )}
      </CardBody>
    </Card>
  );
}

/** Kasbon/pinjaman karyawan: dicairkan dari kas (berjurnal), cicilan otomatis memotong gaji tiap run. */
function LoansCard({
  tenantId,
  employees,
  isAdmin,
  cashAccounts,
}: {
  tenantId: string;
  employees: ApiEmployee[];
  isAdmin: boolean;
  cashAccounts: AccountRow[];
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ employeeId: "", name: "", principal: "", monthly: "", cashAccountId: "", date: today() });

  const loansQuery = useQuery({
    queryKey: ["employee-loans", tenantId],
    queryFn: () => api.employeeLoans(tenantId),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createEmployeeLoan(tenantId, {
        employeeId: form.employeeId || employees.find((e) => e.isActive)?.id || "",
        name: form.name.trim(),
        principal: Math.round(Number(form.principal) || 0),
        monthlyDeduction: Math.round(Number(form.monthly) || 0),
        cashAccountId: form.cashAccountId || cashAccounts[0]?.id || "",
        loanDate: form.date,
      }),
    onSuccess: (res) => {
      toast("success", `Kasbon dicairkan (jurnal ${res.journalNo}). Cicilan otomatis memotong gaji tiap run.`);
      setForm({ employeeId: form.employeeId, name: "", principal: "", monthly: "", cashAccountId: form.cashAccountId, date: today() });
      queryClient.invalidateQueries({ queryKey: ["employee-loans", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const loans = loansQuery.data?.loans ?? [];
  const activeEmployees = employees.filter((e) => e.isActive);

  return (
    <Card>
      <CardHeader
        title="Kasbon / pinjaman karyawan"
        description="Pencairan tercatat sebagai Piutang Karyawan (berjurnal). Cicilan dipotong otomatis dari gaji netto tiap penggajian sampai lunas."
      />
      <CardBody className="space-y-4">
        {isAdmin ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label htmlFor="loan-emp">Karyawan</Label>
                <Select id="loan-emp" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="loan-name">Keterangan</Label>
                <Input id="loan-name" placeholder="mis. Kasbon renovasi rumah" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="loan-principal">Pokok (Rp)</Label>
                <Input id="loan-principal" type="number" min={0} value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="loan-monthly">Cicilan/bulan (Rp)</Label>
                <Input id="loan-monthly" type="number" min={0} value={form.monthly} onChange={(e) => setForm({ ...form, monthly: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="loan-cash">Cairkan dari</Label>
                <Select id="loan-cash" value={form.cashAccountId} onChange={(e) => setForm({ ...form, cashAccountId: e.target.value })}>
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => create.mutate()}
                disabled={
                  create.isPending ||
                  form.name.trim().length < 2 ||
                  !(Number(form.principal) > 0) ||
                  !(Number(form.monthly) > 0) ||
                  Number(form.monthly) > Number(form.principal) ||
                  activeEmployees.length === 0 ||
                  cashAccounts.length === 0
                }
              >
                {create.isPending ? <Spinner /> : <HandCoins className="size-4" aria-hidden />} Cairkan Kasbon
              </Button>
            </div>
          </>
        ) : null}

        {loansQuery.isLoading ? (
          <Spinner />
        ) : loans.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada kasbon.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-2 pr-3 font-medium">Karyawan</th>
                  <th className="pb-2 pr-3 font-medium">Keterangan</th>
                  <th className="pb-2 pr-3 text-right font-medium">Pokok</th>
                  <th className="pb-2 pr-3 text-right font-medium">Cicilan/bulan</th>
                  <th className="pb-2 pr-3 text-right font-medium">Sisa</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-2 pr-3">{l.employeeName}</td>
                    <td className="py-2 pr-3">
                      {l.name}
                      {l.journalNo ? <span className="ml-1 text-xs text-slate-400">· jurnal {l.journalNo}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatIDR(l.principal)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatIDR(l.monthlyDeduction)}</td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatIDR(l.balance)}</td>
                    <td className="py-2">{l.status === "paid" ? <Badge tone="green">lunas</Badge> : <Badge tone="amber">berjalan</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const LEAVE_LABEL: Record<LeaveType, string> = { annual: "Cuti tahunan", sick: "Sakit", permit: "Izin" };
const LEAVE_STATUS_TONE = { pending: "amber", approved: "green", rejected: "red" } as const;
const LEAVE_STATUS_LABEL = { pending: "menunggu", approved: "disetujui", rejected: "ditolak" } as const;

/** Cuti & izin: pengajuan + persetujuan; cuti tahunan yang disetujui memotong saldo cuti. */
function LeaveCard({ tenantId, employees, isAdmin }: { tenantId: string; employees: ApiEmployee[]; isAdmin: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ employeeId: "", type: "annual" as LeaveType, start: today(), end: today(), note: "" });

  const listQuery = useQuery({
    queryKey: ["leave-requests", tenantId],
    queryFn: () => api.leaveRequests(tenantId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["leave-requests", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["employees", tenantId] });
  };

  const create = useMutation({
    mutationFn: () =>
      api.createLeaveRequest(tenantId, {
        employeeId: form.employeeId || employees.find((e) => e.isActive)?.id || "",
        type: form.type,
        startDate: form.start,
        endDate: form.end,
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      }),
    onSuccess: (res) => {
      toast("success", `Pengajuan ${LEAVE_LABEL[form.type].toLowerCase()} ${res.days} hari dicatat — menunggu persetujuan.`);
      setForm({ ...form, note: "" });
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "rejected" }) =>
      api.decideLeaveRequest(tenantId, v.id, { status: v.status }),
    onSuccess: (_res, v) => {
      toast("success", v.status === "approved" ? "Pengajuan disetujui." : "Pengajuan ditolak.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const requests: ApiLeaveRequest[] = listQuery.data?.requests ?? [];
  const activeEmployees = employees.filter((e) => e.isActive);

  return (
    <Card>
      <CardHeader
        title="Cuti & izin"
        description="Catat pengajuan cuti tahunan/sakit/izin lalu setujui atau tolak. Cuti tahunan yang disetujui otomatis memotong saldo cuti (12 hari/tahun)."
      />
      <CardBody className="space-y-4">
        {isAdmin ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label htmlFor="leave-emp">Karyawan</Label>
                <Select id="leave-emp" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} (sisa {e.leaveBalance})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="leave-type">Jenis</Label>
                <Select id="leave-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}>
                  <option value="annual">Cuti tahunan</option>
                  <option value="sick">Sakit</option>
                  <option value="permit">Izin</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="leave-start">Mulai</Label>
                <Input id="leave-start" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="leave-end">Selesai</Label>
                <Input id="leave-end" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="leave-note">Catatan (opsional)</Label>
                <Input id="leave-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => create.mutate()} disabled={create.isPending || activeEmployees.length === 0 || form.end < form.start}>
                {create.isPending ? <Spinner /> : <CalendarDays className="size-4" aria-hidden />} Ajukan
              </Button>
            </div>
          </>
        ) : null}

        {listQuery.isLoading ? (
          <Spinner />
        ) : requests.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada pengajuan cuti/izin.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <span className="font-medium">{r.employeeName}</span>
                <span>{LEAVE_LABEL[r.type]}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {r.startDate} s.d. {r.endDate} ({r.days} hari)
                </span>
                {r.note ? <span className="text-xs text-slate-400">“{r.note}”</span> : null}
                <Badge tone={LEAVE_STATUS_TONE[r.status]}>{LEAVE_STATUS_LABEL[r.status]}</Badge>
                {isAdmin && r.status === "pending" ? (
                  <span className="ml-auto flex gap-2">
                    <Button variant="secondary" className="h-8" onClick={() => decide.mutate({ id: r.id, status: "approved" })} disabled={decide.isPending}>
                      Setujui
                    </Button>
                    <Button variant="ghost" className="h-8" onClick={() => decide.mutate({ id: r.id, status: "rejected" })} disabled={decide.isPending}>
                      Tolak
                    </Button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RunRow({ run, tenantId, canVoid = false }: { run: ApiPayrollRun; tenantId: string; canVoid?: boolean }) {
  const [open, setOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();
  const isVoided = Boolean(run.voidedAt);
  const doVoid = useMutation({
    mutationFn: () => api.voidPayrollRun(tenantId, run.id),
    onSuccess: (res) => {
      toast("success", `Penggajian ${res.runNo} dibatalkan — jurnal pembalik ${res.reversalEntryNo}, saldo kasbon pulih.`);
      setVoidOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payroll-runs", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["employee-loans", tenantId] });
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setVoidOpen(false);
    },
  });
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm">{run.runNo}</span>
        <span className="font-medium">Periode {run.period}</span>
        {isVoided ? (
          <Badge tone="red">DIBATALKAN{run.voidJournalNo ? ` · ${run.voidJournalNo}` : ""}</Badge>
        ) : run.journalNo ? (
          <Badge tone="brand">jurnal {run.journalNo}</Badge>
        ) : null}
        <span className="text-xs text-slate-400">{run.payslips.length} karyawan</span>
        <span className="ml-auto text-sm">
          Bruto <strong className="tabular-nums">{formatIDR(run.totalGross)}</strong> · Netto{" "}
          <strong className="tabular-nums">{formatIDR(run.totalNet)}</strong>
        </span>
        {canVoid && !isVoided ? (
          <Button
            variant="ghost"
            className="h-8 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            onClick={() => setVoidOpen(true)}
          >
            Batalkan
          </Button>
        ) : null}
        <Button variant="ghost" className="h-8" onClick={() => setOpen((o) => !o)}>
          {open ? "Tutup" : "Slip gaji"}
        </Button>
      </div>

      <ConfirmDialog
        open={voidOpen}
        title={`Batalkan penggajian ${run.runNo}?`}
        description={
          <>
            Jurnal beban gaji akan dibalik, saldo kasbon karyawan dipulihkan, dan komponen ad-hoc dilepas agar bisa
            dipakai lagi. Periode {run.period} bisa digaji ulang. Slip lama tetap tersimpan dengan tanda{" "}
            <strong>DIBATALKAN</strong>.
          </>
        }
        confirmLabel="Ya, batalkan penggajian"
        danger
        busy={doVoid.isPending}
        onConfirm={() => doVoid.mutate()}
        onCancel={() => setVoidOpen(false)}
      />

      {open ? (
        <div className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="pb-1.5 pr-3 font-medium">Karyawan</th>
                <th className="pb-1.5 pr-3 text-right font-medium">Bruto</th>
                <th className="pb-1.5 pr-3 text-right font-medium">BPJS</th>
                <th className="pb-1.5 pr-3 text-right font-medium">PPh 21 (TER)</th>
                <th className="pb-1.5 pr-3 text-right font-medium">Netto</th>
                <th className="pb-1.5 text-right font-medium">Slip</th>
              </tr>
            </thead>
            <tbody>
              {run.payslips.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="py-1.5 pr-3">
                    {p.employeeName}
                    {p.position ? <span className="text-xs text-slate-400"> · {p.position}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatIDR(p.gross)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {formatIDR(p.bpjsHealthEmployee + p.bpjsJhtEmployee + p.bpjsJpEmployee)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {formatIDR(p.pph21)} <span className="text-xs text-slate-400">({p.terCategory}/{p.terRate}%)</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{formatIDR(p.net)}</td>
                  <td className="py-1.5 text-right">
                    <a
                      href={`/cetak/slip-gaji?tenant=${tenantId}&run=${run.id}&employee=${p.employeeId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-brand-700 hover:underline dark:text-brand-400"
                    >
                      Cetak
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

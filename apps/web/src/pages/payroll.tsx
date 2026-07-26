import {
  PTKP_STATUSES,
  type ApiEmployee,
  type ApiLeaveRequest,
  type ApiPayrollRun,
  type LeaveType,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUi, type UiKey } from "../i18n/ui";
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
  PageHeading,
  Select,
  Table,
  Td,
  Th,
  Thead,
  Tr,
  Spinner,
  Tabs,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
type AccountRow = { id: string; code: string; name: string; type: string };
type PayrollTab = "karyawan" | "gaji" | "komponen" | "kasbon" | "cuti" | "departemen";

export function PayrollPage() {
  const u = useUi();
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

  const cashAccounts = (accountsQuery.data?.accounts ?? []).filter(
    (a: AccountRow) => a.type === "asset"
  );

  const departmentsQuery = useQuery({
    queryKey: ["departments", tenant.tenantId],
    queryFn: () => api.departments(tenant.tenantId),
  });
  const departments = departmentsQuery.data?.departments ?? [];

  const [emp, setEmp] = useState({
    name: "",
    position: "",
    ptkpStatus: "TK/0",
    baseSalary: "",
    allowances: "",
    departmentId: "",
    managerId: "",
  });
  const [empError, setEmpError] = useState<string | null>(null);
  const [period, setPeriod] = useState(thisMonth);
  const [cashAccountId, setCashAccountId] = useState("");
  const [payDate, setPayDate] = useState(today);
  const [runError, setRunError] = useState<string | null>(null);
  const [tab, setTab] = useState<PayrollTab>("karyawan");

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
      setEmp({
        name: "",
        position: "",
        ptkpStatus: "TK/0",
        baseSalary: "",
        allowances: "",
        departmentId: "",
        managerId: "",
      });
      setEmpError(null);
      queryClient.invalidateQueries({ queryKey: ["employees", tenant.tenantId] });
    },
    onError: (err) => setEmpError((err as Error).message),
  });

  const toggleActive = useMutation({
    mutationFn: (e: ApiEmployee) =>
      api.updateEmployee(tenant.tenantId, e.id, { isActive: !e.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees", tenant.tenantId] }),
    onError: (err) => toast("error", (err as Error).message),
  });

  const run = useMutation({
    mutationFn: () =>
      api.runPayroll(tenant.tenantId, {
        period,
        cashAccountId: cashAccountId || cashAccounts[0]?.id || "",
        paymentDate: payDate,
      }),
    onSuccess: (res) => {
      toast(
        "success",
        `Penggajian ${res.runNo}: ${res.employees} karyawan, netto ${formatIDR(res.totalNet)}.`
      );
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
        <PageHeading k="penggajian" />
      </div>

      <Alert tone="info">
        <strong>{u("catatanPajak")}</strong> {u("descCatatanPajakPayroll")}
      </Alert>

      <Tabs
        tabs={[
          { key: "karyawan", label: u("karyawan") },
          { key: "gaji", label: u("tabGaji") },
          { key: "komponen", label: u("komponen") },
          { key: "kasbon", label: u("tabKasbon") },
          { key: "cuti", label: u("tabCuti") },
          { key: "departemen", label: u("departemen") },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* Karyawan */}
      {tab === "karyawan" ? (
        <Card>
          <CardHeader
            title={u("karyawan")}
            description={`${activeCount} ${u("aktifDari")} ${employees.length} ${u("karyawanSatuan")}`}
          />
          <CardBody className="space-y-4">
            {isAdmin ? (
              <>
                {empError ? <Alert tone="error">{empError}</Alert> : null}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="lg:col-span-1">
                    <Label htmlFor="emp-name">{u("nama")}</Label>
                    <Input
                      id="emp-name"
                      value={emp.name}
                      onChange={(e) => setEmp({ ...emp, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="emp-pos">{u("jabatan")}</Label>
                    <Input
                      id="emp-pos"
                      value={emp.position}
                      onChange={(e) => setEmp({ ...emp, position: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="emp-ptkp">{u("statusPtkp")}</Label>
                    <Select
                      id="emp-ptkp"
                      value={emp.ptkpStatus}
                      onChange={(e) => setEmp({ ...emp, ptkpStatus: e.target.value })}
                    >
                      {PTKP_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="emp-salary">{u("gajiPokok")}</Label>
                    <Input
                      id="emp-salary"
                      type="number"
                      min={0}
                      value={emp.baseSalary}
                      onChange={(e) => setEmp({ ...emp, baseSalary: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="emp-allow">{u("tunjangan")}</Label>
                    <Input
                      id="emp-allow"
                      type="number"
                      min={0}
                      value={emp.allowances}
                      onChange={(e) => setEmp({ ...emp, allowances: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="emp-dept">{u("departemen")}</Label>
                    <Select
                      id="emp-dept"
                      value={emp.departmentId}
                      onChange={(e) => setEmp({ ...emp, departmentId: e.target.value })}
                    >
                      <option value="">— tanpa departemen —</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} · {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="emp-manager">{u("atasanLangsung")}</Label>
                    <Select
                      id="emp-manager"
                      value={emp.managerId}
                      onChange={(e) => setEmp({ ...emp, managerId: e.target.value })}
                    >
                      <option value="">— tanpa atasan —</option>
                      {employees
                        .filter((x) => x.isActive)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => createEmp.mutate()}
                    disabled={createEmp.isPending || emp.name.trim().length < 2}
                  >
                    {createEmp.isPending ? (
                      <Spinner />
                    ) : (
                      <UserPlus className="size-4" aria-hidden />
                    )}{" "}
                    {u("tambahKaryawan")}
                  </Button>
                </div>
              </>
            ) : null}

            {employeesQuery.isLoading ? (
              <Spinner />
            ) : employees.length === 0 ? (
              <EmptyState
                icon={<Users className="size-6" aria-hidden />}
                title={u("belumAdaKaryawan")}
                description={u("descBelumAdaKaryawan")}
              />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th>{u("nama")}</Th>
                    <Th>{u("jabatan")}</Th>
                    <Th>{u("departemenAtasan")}</Th>
                    <Th>PTKP</Th>
                    <Th numeric>{u("gajiPokok")}</Th>
                    <Th numeric>{u("tunjangan")}</Th>
                    <Th numeric>{u("sisaCuti")}</Th>
                    <Th>{u("status")}</Th>
                    <Th>1721-A1</Th>
                  </tr>
                </Thead>
                <tbody>
                  {employees.map((e) => (
                    <Tr key={e.id}>
                      <Td label={u("nama")}>{e.name}</Td>
                      <Td label={u("jabatan")} className="text-slate-500 dark:text-slate-400">
                        {e.position ?? "—"}
                      </Td>
                      <Td
                        label={u("departemenAtasan")}
                        className="text-slate-500 dark:text-slate-400"
                      >
                        {e.departmentName ?? "—"}
                        {e.managerName ? (
                          <span className="block text-xs">↳ {e.managerName}</span>
                        ) : null}
                      </Td>
                      <Td label="PTKP">{e.ptkpStatus}</Td>
                      <Td numeric label={u("gajiPokok")}>
                        {formatIDR(e.baseSalary)}
                      </Td>
                      <Td numeric label={u("tunjangan")}>
                        {formatIDR(e.allowances)}
                      </Td>
                      <Td numeric label={u("sisaCuti")}>
                        {e.leaveBalance} {u("hariSatuan")}
                      </Td>
                      <Td label={u("status")}>
                        {e.isActive ? (
                          <Badge tone="green">{u("aktifKecil")}</Badge>
                        ) : (
                          <Badge tone="neutral">{u("nonaktif")}</Badge>
                        )}
                        {isAdmin ? (
                          <button
                            onClick={() => toggleActive.mutate(e)}
                            className="ml-2 text-xs text-brand-700 hover:underline dark:text-brand-400"
                          >
                            {e.isActive ? "nonaktifkan" : "aktifkan"}
                          </button>
                        ) : null}
                      </Td>
                      <Td label="1721-A1">
                        <a
                          href={`/cetak/1721a1?tenant=${tenant.tenantId}&employee=${e.id}&year=${new Date().getFullYear()}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-brand-700 hover:underline dark:text-brand-400"
                        >
                          {u("cetak")}
                        </a>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      ) : null}

      {/* Gaji: jalankan penggajian */}
      {tab === "gaji" && isAdmin ? (
        <Card>
          <CardHeader
            title={u("jalankanPenggajianBulanan")}
            description={u("descJalankanPenggajian")}
          />
          <CardBody className="space-y-4">
            {runError ? <Alert tone="error">{runError}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="run-period">{u("periodeBulan")}</Label>
                <Input
                  id="run-period"
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="run-cash">{u("bayarDariAkun")}</Label>
                <Select
                  id="run-cash"
                  value={cashAccountId}
                  onChange={(e) => setCashAccountId(e.target.value)}
                >
                  {cashAccounts.map((a: AccountRow) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="run-date">{u("tanggalBayar")}</Label>
                <Input
                  id="run-date"
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => run.mutate()}
                disabled={run.isPending || activeCount === 0 || cashAccounts.length === 0}
              >
                {run.isPending ? <Spinner /> : null} {u("jalankanPenggajian")}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === "komponen" && isAdmin ? (
        <AdjustmentsCard tenantId={tenant.tenantId} employees={employees} period={period} />
      ) : null}

      {/* Gaji: riwayat penggajian */}
      {tab === "gaji" ? (
        <Card>
          <CardHeader title={u("riwayatPenggajian")} />
          <CardBody>
            {runsQuery.isLoading ? (
              <Spinner />
            ) : (runsQuery.data?.runs.length ?? 0) === 0 ? (
              <EmptyState
                icon={<Users className="size-6" aria-hidden />}
                title={u("belumAdaPenggajian")}
                description={u("descRiwayatPenggajian")}
              />
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
      ) : null}

      {tab === "kasbon" ? (
        <LoansCard
          tenantId={tenant.tenantId}
          employees={employees}
          isAdmin={isAdmin}
          cashAccounts={cashAccounts}
        />
      ) : null}
      {tab === "cuti" ? (
        <LeaveCard tenantId={tenant.tenantId} employees={employees} isAdmin={isAdmin} />
      ) : null}
      {tab === "departemen" ? (
        <>
          <DepartmentsCard tenantId={tenant.tenantId} isAdmin={isAdmin} />
          <OrgChartCard tenantId={tenant.tenantId} />
        </>
      ) : null}
    </div>
  );
}

/** Departemen (Fase 8c): master hierarki departemen perusahaan. */
function DepartmentsCard({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const u = useUi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["departments", tenantId],
    queryFn: () => api.departments(tenantId),
  });
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
      <CardHeader title={u("departemen")} description={u("descDepartemen")} />
      <CardBody className="space-y-4">
        {isAdmin ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="dept-code">{u("kode")}</Label>
              <Input
                id="dept-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder={u("contohKodeDept")}
              />
            </div>
            <div>
              <Label htmlFor="dept-name">{u("nama")}</Label>
              <Input
                id="dept-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={u("contohNamaDept")}
              />
            </div>
            <div>
              <Label htmlFor="dept-parent">{u("induk")}</Label>
              <Select
                id="dept-parent"
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              >
                <option value="">— tingkat teratas —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => create.mutate()}
                disabled={create.isPending || !form.code.trim() || form.name.trim().length < 2}
              >
                {u("tambah")}
              </Button>
            </div>
          </div>
        ) : null}

        {query.isLoading ? (
          <Spinner />
        ) : departments.length === 0 ? (
          <p className="py-2 text-sm text-slate-500 dark:text-slate-400">
            {u("belumAdaDepartemen")}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {departments.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {d.code}
                  </span>{" "}
                  <span className="font-medium">{d.name}</span>
                  {d.parentName ? (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {" "}
                      · {u("diBawah")} {d.parentName}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <Badge tone="neutral">{d.employeeCount} karyawan</Badge>
                  {isAdmin ? (
                    <button
                      onClick={() => archive.mutate(d.id)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      {u("arsipkan")}
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
  const u = useUi();
  const query = useQuery({
    queryKey: ["org-chart", tenantId],
    queryFn: () => api.orgChart(tenantId),
  });
  const tree = query.data?.tree ?? [];
  const unassigned = query.data?.unassigned ?? [];

  function renderNode(node: (typeof tree)[number], depth: number) {
    return (
      <li key={node.id} style={{ marginLeft: depth * 16 }} className="py-1">
        <div className="text-sm font-semibold">
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{node.code}</span>{" "}
          {node.name}
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
        {node.children.length > 0 ? (
          <ul>{node.children.map((ch) => renderNode(ch, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  return (
    <Card>
      <CardHeader title={u("strukturOrganisasi")} description={u("descStrukturOrganisasi")} />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : tree.length === 0 && unassigned.length === 0 ? (
          <p className="py-2 text-sm text-slate-500 dark:text-slate-400">{u("belumAdaStruktur")}</p>
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
function AdjustmentsCard({
  tenantId,
  employees,
  period,
}: {
  tenantId: string;
  employees: ApiEmployee[];
  period: string;
}) {
  const u = useUi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    employeeId: "",
    name: "",
    amount: "",
    kind: "plus" as "plus" | "minus",
  });

  const listQuery = useQuery({
    queryKey: ["payroll-adjustments", tenantId, period],
    queryFn: () => api.payrollAdjustments(tenantId, period),
    enabled: /^\d{4}-\d{2}$/.test(period),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["payroll-adjustments", tenantId] });

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
      <CardHeader title={`${u("bonusLemburPotongan")} ${period}`} description={u("descKomponen")} />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="adj-emp">{u("karyawan")}</Label>
            <Select
              id="adj-emp"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            >
              {activeEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="adj-name">{u("namaKomponen")}</Label>
            <Input
              id="adj-name"
              placeholder={u("contohBonus")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="adj-kind">{u("jenis")}</Label>
            <Select
              id="adj-kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as "plus" | "minus" })}
            >
              <option value="plus">{u("tambahanBonusLembur")}</option>
              <option value="minus">{u("potongan")}</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="adj-amount">{u("nominalRp")}</Label>
            <Input
              id="adj-amount"
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => create.mutate()}
            disabled={
              create.isPending ||
              form.name.trim().length < 2 ||
              !(Number(form.amount) > 0) ||
              activeEmployees.length === 0
            }
          >
            {create.isPending ? <Spinner /> : null} {u("tambahKomponen")}
          </Button>
        </div>

        {adjustments.length > 0 ? (
          <Table>
            <Thead>
              <tr>
                <Th>{u("karyawan")}</Th>
                <Th>{u("komponen")}</Th>
                <Th numeric>{u("nominal")}</Th>
                <Th>{u("status")}</Th>
              </tr>
            </Thead>
            <tbody>
              {adjustments.map((a) => (
                <Tr key={a.id}>
                  <Td label={u("karyawan")}>{a.employeeName}</Td>
                  <Td label={u("komponen")}>{a.name}</Td>
                  <Td
                    numeric
                    label={u("nominal")}
                    className={a.amount < 0 ? "text-red-600 dark:text-red-400" : ""}
                  >
                    {formatIDR(a.amount)}
                  </Td>
                  <Td label={u("status")}>
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
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-slate-400">{u("belumAdaKomponen")}</p>
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
  const u = useUi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    employeeId: "",
    name: "",
    principal: "",
    monthly: "",
    cashAccountId: "",
    date: today(),
  });

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
      toast(
        "success",
        `Kasbon dicairkan (jurnal ${res.journalNo}). Cicilan otomatis memotong gaji tiap run.`
      );
      setForm({
        employeeId: form.employeeId,
        name: "",
        principal: "",
        monthly: "",
        cashAccountId: form.cashAccountId,
        date: today(),
      });
      queryClient.invalidateQueries({ queryKey: ["employee-loans", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const loans = loansQuery.data?.loans ?? [];
  const activeEmployees = employees.filter((e) => e.isActive);

  return (
    <Card>
      <CardHeader title={u("kasbonPinjaman")} description={u("descKasbon")} />
      <CardBody className="space-y-4">
        {isAdmin ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label htmlFor="loan-emp">{u("karyawan")}</Label>
                <Select
                  id="loan-emp"
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                >
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="loan-name">{u("keterangan")}</Label>
                <Input
                  id="loan-name"
                  placeholder={u("contohKasbon")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="loan-principal">{u("pokokRp")}</Label>
                <Input
                  id="loan-principal"
                  type="number"
                  min={0}
                  value={form.principal}
                  onChange={(e) => setForm({ ...form, principal: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="loan-monthly">{u("cicilanBulanRp")}</Label>
                <Input
                  id="loan-monthly"
                  type="number"
                  min={0}
                  value={form.monthly}
                  onChange={(e) => setForm({ ...form, monthly: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="loan-cash">{u("cairkanDari")}</Label>
                <Select
                  id="loan-cash"
                  value={form.cashAccountId}
                  onChange={(e) => setForm({ ...form, cashAccountId: e.target.value })}
                >
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
                {create.isPending ? <Spinner /> : <HandCoins className="size-4" aria-hidden />}{" "}
                {u("cairkanKasbon")}
              </Button>
            </div>
          </>
        ) : null}

        {loansQuery.isLoading ? (
          <Spinner />
        ) : loans.length === 0 ? (
          <p className="text-sm text-slate-400">{u("belumAdaKasbon")}</p>
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>{u("karyawan")}</Th>
                <Th>{u("keterangan")}</Th>
                <Th numeric>{u("pokok")}</Th>
                <Th numeric>{u("cicilanBulan")}</Th>
                <Th numeric>{u("sisa")}</Th>
                <Th>{u("status")}</Th>
              </tr>
            </Thead>
            <tbody>
              {loans.map((l) => (
                <Tr key={l.id}>
                  <Td label={u("karyawan")}>{l.employeeName}</Td>
                  <Td label={u("keterangan")}>
                    {l.name}
                    {l.journalNo ? (
                      <span className="ml-1 text-xs text-slate-400">
                        · {u("jurnalKecil")} {l.journalNo}
                      </span>
                    ) : null}
                  </Td>
                  <Td numeric label={u("pokok")}>
                    {formatIDR(l.principal)}
                  </Td>
                  <Td numeric label={u("cicilanBulan")}>
                    {formatIDR(l.monthlyDeduction)}
                  </Td>
                  <Td numeric label={u("sisa")} className="font-medium">
                    {formatIDR(l.balance)}
                  </Td>
                  <Td label={u("status")}>
                    {l.status === "paid" ? (
                      <Badge tone="green">lunas</Badge>
                    ) : (
                      <Badge tone="amber">berjalan</Badge>
                    )}
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

// Konstanta tingkat modul tidak boleh memanggil hook, jadi yang disimpan
// adalah KUNCI kamus — diterjemahkan saat render (aturan tetap sejak 16j).
// Ketiga kuncinya sudah dibuat pada Fase 16i, hanya belum tersambung.
const LEAVE_LABEL: Record<LeaveType, UiKey> = {
  annual: "cutiTahunan",
  sick: "sakit",
  permit: "izin",
};
const LEAVE_STATUS_TONE = { pending: "amber", approved: "green", rejected: "red" } as const;
const LEAVE_STATUS_LABEL: Record<"pending" | "approved" | "rejected", UiKey> = {
  pending: "menungguKecil",
  approved: "disetujuiKecil",
  rejected: "ditolakKecil",
};

/** Cuti & izin: pengajuan + persetujuan; cuti tahunan yang disetujui memotong saldo cuti. */
function LeaveCard({
  tenantId,
  employees,
  isAdmin,
}: {
  tenantId: string;
  employees: ApiEmployee[];
  isAdmin: boolean;
}) {
  const u = useUi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    employeeId: "",
    type: "annual" as LeaveType,
    start: today(),
    end: today(),
    note: "",
  });

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
      toast(
        "success",
        `Pengajuan ${u(LEAVE_LABEL[form.type]).toLowerCase()} ${res.days} hari dicatat — menunggu persetujuan.`
      );
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
      <CardHeader title={u("cutiIzin")} description={u("descCutiIzin")} />
      <CardBody className="space-y-4">
        {isAdmin ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label htmlFor="leave-emp">{u("karyawan")}</Label>
                <Select
                  id="leave-emp"
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                >
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({u("sisaKecil")} {e.leaveBalance})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="leave-type">{u("jenis")}</Label>
                <Select
                  id="leave-type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}
                >
                  <option value="annual">{u("cutiTahunan")}</option>
                  <option value="sick">{u("sakit")}</option>
                  <option value="permit">{u("izin")}</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="leave-start">{u("mulai")}</Label>
                <Input
                  id="leave-start"
                  type="date"
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="leave-end">{u("selesai")}</Label>
                <Input
                  id="leave-end"
                  type="date"
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="leave-note">{u("catatanOpsional")}</Label>
                <Input
                  id="leave-note"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => create.mutate()}
                disabled={create.isPending || activeEmployees.length === 0 || form.end < form.start}
              >
                {create.isPending ? <Spinner /> : <CalendarDays className="size-4" aria-hidden />}{" "}
                {u("ajukan")}
              </Button>
            </div>
          </>
        ) : null}

        {listQuery.isLoading ? (
          <Spinner />
        ) : requests.length === 0 ? (
          <p className="text-sm text-slate-400">{u("belumAdaCuti")}</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
              >
                <span className="font-medium">{r.employeeName}</span>
                <span>{u(LEAVE_LABEL[r.type])}</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {r.startDate} s.d. {r.endDate} ({r.days} hari)
                </span>
                {r.note ? <span className="text-xs text-slate-400">“{r.note}”</span> : null}
                <Badge tone={LEAVE_STATUS_TONE[r.status]}>{u(LEAVE_STATUS_LABEL[r.status])}</Badge>
                {isAdmin && r.status === "pending" ? (
                  <span className="ml-auto flex gap-2">
                    <Button
                      variant="secondary"
                      className="h-8"
                      onClick={() => decide.mutate({ id: r.id, status: "approved" })}
                      disabled={decide.isPending}
                    >
                      {u("setujui")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8"
                      onClick={() => decide.mutate({ id: r.id, status: "rejected" })}
                      disabled={decide.isPending}
                    >
                      {u("tolak")}
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

function RunRow({
  run,
  tenantId,
  canVoid = false,
}: {
  run: ApiPayrollRun;
  tenantId: string;
  canVoid?: boolean;
}) {
  const u = useUi();
  const [open, setOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();
  const isVoided = Boolean(run.voidedAt);
  const doVoid = useMutation({
    mutationFn: () => api.voidPayrollRun(tenantId, run.id),
    onSuccess: (res) => {
      toast(
        "success",
        `Penggajian ${res.runNo} dibatalkan — jurnal pembalik ${res.reversalEntryNo}, saldo kasbon pulih.`
      );
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
        <span className="font-medium">
          {u("periodeLabel")} {run.period}
        </span>
        {isVoided ? (
          <Badge tone="red">DIBATALKAN{run.voidJournalNo ? ` · ${run.voidJournalNo}` : ""}</Badge>
        ) : run.journalNo ? (
          <Badge tone="brand">
            {u("jurnalKecil")} {run.journalNo}
          </Badge>
        ) : null}
        <span className="text-xs text-slate-400">{run.payslips.length} karyawan</span>
        <span className="ml-auto text-sm">
          {u("bruto")} <strong className="tabular-nums">{formatIDR(run.totalGross)}</strong> · Netto{" "}
          <strong className="tabular-nums">{formatIDR(run.totalNet)}</strong>
        </span>
        {canVoid && !isVoided ? (
          <Button
            variant="ghost"
            className="h-8 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            onClick={() => setVoidOpen(true)}
          >
            {u("batalkan")}
          </Button>
        ) : null}
        <Button variant="ghost" className="h-8" onClick={() => setOpen((o) => !o)}>
          {open ? "Tutup" : "Slip gaji"}
        </Button>
      </div>

      <ConfirmDialog
        open={voidOpen}
        title={`${u("batalkanPenggajianTanya")} ${run.runNo}?`}
        description={
          <>
            {u("descBatalkanPenggajian1")} {run.period} {u("descBatalkanPenggajian2")}{" "}
            <strong>{u("dibatalkan")}</strong>.
          </>
        }
        confirmLabel={u("yaBatalkanPenggajian")}
        danger
        busy={doVoid.isPending}
        onConfirm={() => doVoid.mutate()}
        onCancel={() => setVoidOpen(false)}
      />

      {open ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
          <Table>
            <Thead>
              <tr>
                <Th>{u("karyawan")}</Th>
                <Th numeric>{u("bruto")}</Th>
                <Th numeric>BPJS</Th>
                <Th numeric>PPh 21 (TER)</Th>
                <Th numeric>{u("netto")}</Th>
                <Th numeric>{u("slip")}</Th>
              </tr>
            </Thead>
            <tbody>
              {run.payslips.map((p) => (
                <Tr key={p.id}>
                  <Td label={u("karyawan")}>
                    {p.employeeName}
                    {p.position ? (
                      <span className="text-xs text-slate-400"> · {p.position}</span>
                    ) : null}
                  </Td>
                  <Td numeric label={u("bruto")}>
                    {formatIDR(p.gross)}
                  </Td>
                  <Td numeric label="BPJS">
                    {formatIDR(p.bpjsHealthEmployee + p.bpjsJhtEmployee + p.bpjsJpEmployee)}
                  </Td>
                  {/* Bukan `numeric`: selain nominal, sel ini memuat keterangan
                      kategori/tarif TER — memaksanya mono membuat keterangan itu
                      ikut jadi mono dan sulit dibaca. */}
                  <Td label="PPh 21 (TER)" className="text-right">
                    <span className="num">{formatIDR(p.pph21)}</span>{" "}
                    <span className="text-xs text-slate-400">
                      ({p.terCategory}/{p.terRate}%)
                    </span>
                  </Td>
                  <Td numeric label={u("netto")} className="font-medium">
                    {formatIDR(p.net)}
                  </Td>
                  <Td label={u("slip")} className="text-right">
                    <a
                      href={`/cetak/slip-gaji?tenant=${tenantId}&run=${run.id}&employee=${p.employeeId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-brand-700 hover:underline dark:text-brand-400"
                    >
                      {u("cetak")}
                    </a>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

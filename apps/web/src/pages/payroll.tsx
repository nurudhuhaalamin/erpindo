import { PTKP_STATUSES, type ApiEmployee, type ApiPayrollRun } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
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

  const [emp, setEmp] = useState({ name: "", position: "", ptkpStatus: "TK/0", baseSalary: "", allowances: "" });
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
      }),
    onSuccess: () => {
      toast("success", "Karyawan ditambahkan.");
      setEmp({ name: "", position: "", ptkpStatus: "TK/0", baseSalary: "", allowances: "" });
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
                    <th className="pb-2 pr-3 font-medium">PTKP</th>
                    <th className="pb-2 pr-3 text-right font-medium">Gaji pokok</th>
                    <th className="pb-2 pr-3 text-right font-medium">Tunjangan</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="py-2 pr-3">{e.name}</td>
                      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">{e.position ?? "—"}</td>
                      <td className="py-2 pr-3">{e.ptkpStatus}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatIDR(e.baseSalary)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatIDR(e.allowances)}</td>
                      <td className="py-2">
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
                <RunRow key={r.id} run={r} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function RunRow({ run }: { run: ApiPayrollRun }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm">{run.runNo}</span>
        <span className="font-medium">Periode {run.period}</span>
        {run.journalNo ? <Badge tone="brand">jurnal {run.journalNo}</Badge> : null}
        <span className="text-xs text-slate-400">{run.payslips.length} karyawan</span>
        <span className="ml-auto text-sm">
          Bruto <strong className="tabular-nums">{formatIDR(run.totalGross)}</strong> · Netto{" "}
          <strong className="tabular-nums">{formatIDR(run.totalNet)}</strong>
        </span>
        <Button variant="ghost" className="h-8" onClick={() => setOpen((o) => !o)}>
          {open ? "Tutup" : "Slip gaji"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="pb-1.5 pr-3 font-medium">Karyawan</th>
                <th className="pb-1.5 pr-3 text-right font-medium">Bruto</th>
                <th className="pb-1.5 pr-3 text-right font-medium">BPJS</th>
                <th className="pb-1.5 pr-3 text-right font-medium">PPh 21 (TER)</th>
                <th className="pb-1.5 text-right font-medium">Netto</th>
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
                  <td className="py-1.5 text-right font-medium tabular-nums">{formatIDR(p.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

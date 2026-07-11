import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUSES,
  type ApiAttendance,
  type ApiAttendanceRecap,
  type AttendanceStatus,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, downloadCsv } from "../api/client";
import {
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

const STATUS_TONE: Record<AttendanceStatus, "green" | "amber" | "neutral" | "red"> = {
  hadir: "green",
  izin: "amber",
  sakit: "amber",
  cuti: "neutral",
  alfa: "red",
};

export function AttendancePage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(thisMonth);
  const [form, setForm] = useState({
    employeeId: "",
    date: today(),
    status: "hadir" as AttendanceStatus,
    clockIn: "",
    clockOut: "",
    note: "",
  });
  const [toDelete, setToDelete] = useState<ApiAttendance | null>(null);

  const employeesQuery = useQuery({
    queryKey: ["employees", tenant.tenantId],
    queryFn: () => api.employees(tenant.tenantId),
  });
  const attendanceQuery = useQuery({
    queryKey: ["attendance", tenant.tenantId, month],
    queryFn: () => api.attendance(tenant.tenantId, month),
  });

  const activeEmployees = (employeesQuery.data?.employees ?? []).filter((e) => e.isActive);
  const records: ApiAttendance[] = attendanceQuery.data?.records ?? [];
  const recap: ApiAttendanceRecap[] = attendanceQuery.data?.recap ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["attendance", tenant.tenantId] });

  const record = useMutation({
    mutationFn: () =>
      api.recordAttendance(tenant.tenantId, {
        employeeId: form.employeeId || activeEmployees[0]?.id || "",
        date: form.date,
        status: form.status,
        ...(form.clockIn ? { clockIn: form.clockIn } : {}),
        ...(form.clockOut ? { clockOut: form.clockOut } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      }),
    onSuccess: () => {
      toast("success", "Kehadiran tercatat.");
      setForm({ ...form, note: "" });
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAttendance(tenant.tenantId, id),
    onSuccess: () => {
      toast("success", "Catatan kehadiran dihapus.");
      setToDelete(null);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const exportRecap = () => {
    downloadCsv(
      `rekap-absensi-${month}.csv`,
      ["Karyawan", "Hadir", "Izin", "Sakit", "Alfa", "Cuti", "Total"],
      recap.map((r) => [r.employeeName, r.hadir, r.izin, r.sakit, r.alfa, r.cuti, r.total]),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Absensi</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Catat kehadiran harian karyawan dan lihat rekap bulanan per orang.
          </p>
        </div>
        <div>
          <Label htmlFor="att-month">Bulan</Label>
          <Input id="att-month" type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} />
        </div>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader title="Catat kehadiran" description="Satu catatan per karyawan per tanggal — mencatat ulang tanggal yang sama akan menimpa catatan sebelumnya." />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <Label htmlFor="att-emp">Karyawan</Label>
                <Select id="att-emp" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  {activeEmployees.length === 0 ? <option value="">— belum ada karyawan —</option> : null}
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="att-date">Tanggal</Label>
                <Input id="att-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="att-status">Status</Label>
                <Select id="att-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AttendanceStatus })}>
                  {ATTENDANCE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ATTENDANCE_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="att-in">Jam masuk</Label>
                <Input id="att-in" type="time" value={form.clockIn} onChange={(e) => setForm({ ...form, clockIn: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="att-out">Jam keluar</Label>
                <Input id="att-out" type="time" value={form.clockOut} onChange={(e) => setForm({ ...form, clockOut: e.target.value })} />
              </div>
              <div className="sm:col-span-2 lg:col-span-5">
                <Label htmlFor="att-note">Catatan (opsional)</Label>
                <Input id="att-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => record.mutate()} disabled={record.isPending || activeEmployees.length === 0}>
                {record.isPending ? <Spinner /> : <CalendarCheck className="size-4" aria-hidden />} Simpan
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Rekap bulanan"
          description={`Jumlah hari per status untuk ${month}.`}
          action={
            recap.length > 0 ? (
              <Button variant="secondary" className="h-8" onClick={exportRecap}>
                <Download className="size-4" aria-hidden /> CSV
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {attendanceQuery.isLoading ? (
            <Spinner />
          ) : recap.length === 0 ? (
            <EmptyState icon={<CalendarCheck className="size-6" aria-hidden />} title="Belum ada karyawan" description="Tambahkan karyawan di menu Penggajian terlebih dahulu." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="py-2 pr-3 font-medium">Karyawan</th>
                    <th className="py-2 px-2 text-right font-medium">Hadir</th>
                    <th className="py-2 px-2 text-right font-medium">Izin</th>
                    <th className="py-2 px-2 text-right font-medium">Sakit</th>
                    <th className="py-2 px-2 text-right font-medium">Alfa</th>
                    <th className="py-2 px-2 text-right font-medium">Cuti</th>
                    <th className="py-2 pl-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recap.map((r) => (
                    <tr key={r.employeeId}>
                      <td className="py-2 pr-3 font-medium">{r.employeeName}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.hadir}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.izin}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.sakit}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-red-600 dark:text-red-400">{r.alfa || ""}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.cuti}</td>
                      <td className="py-2 pl-2 text-right font-semibold tabular-nums">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Catatan kehadiran" description={`Daftar catatan pada ${month} (terbaru di atas).`} />
        <CardBody>
          {attendanceQuery.isLoading ? (
            <Spinner />
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada catatan kehadiran pada bulan ini.</p>
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <span className="w-24 shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{r.date}</span>
                  <span className="font-medium">{r.employeeName}</span>
                  <Badge tone={STATUS_TONE[r.status]}>{ATTENDANCE_STATUS_LABELS[r.status]}</Badge>
                  {r.clockIn || r.clockOut ? (
                    <span className="text-xs text-slate-400">
                      {r.clockIn ?? "—"} s.d. {r.clockOut ?? "—"}
                    </span>
                  ) : null}
                  {r.note ? <span className="text-xs text-slate-400">“{r.note}”</span> : null}
                  {isAdmin ? (
                    <button
                      type="button"
                      className="ml-auto inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      onClick={() => setToDelete(r)}
                      aria-label={`Hapus kehadiran ${r.employeeName} ${r.date}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        title="Hapus catatan kehadiran?"
        description={toDelete ? `Catatan ${toDelete.employeeName} pada ${toDelete.date} akan dihapus.` : ""}
        confirmLabel="Hapus"
        danger
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
        busy={remove.isPending}
      />
    </div>
  );
}

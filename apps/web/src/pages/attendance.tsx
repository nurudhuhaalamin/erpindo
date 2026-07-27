import {
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
  PageHeading,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "../components/ui";
import { useUi, type UiKey } from "../i18n/ui";
import { useWorkspace } from "./app";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

/** Status kehadiran → kunci kamus (Fase 19k, pola 16t/16u). */
const ATT_STATUS_KEY = {
  hadir: "hadirStatus",
  izin: "izin",
  sakit: "sakit",
  alfa: "alfaStatus",
  cuti: "cutiStatus",
} satisfies Record<AttendanceStatus, UiKey>;

const STATUS_TONE: Record<AttendanceStatus, "green" | "amber" | "neutral" | "red"> = {
  hadir: "green",
  izin: "amber",
  sakit: "amber",
  cuti: "neutral",
  alfa: "red",
};

export function AttendancePage() {
  const u = useUi();
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
      toast("success", u("toastKehadiranTercatat"));
      setForm({ ...form, note: "" });
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAttendance(tenant.tenantId, id),
    onSuccess: () => {
      toast("success", u("toastKehadiranDihapus"));
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
          {/* Fase 19k: judul + pengantar ke PAGE_HEADINGS (Fase 16a) — berkas
              terakhir dari empat yang salah dihitung di 19f. */}
          <PageHeading k="absensi" />
        </div>
        <div>
          <Label htmlFor="att-month">{u("bulan")}</Label>
          <Input id="att-month" type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} />
        </div>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader title={u("catatKehadiran")} description={u("descCatatKehadiran")} />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="lg:col-span-2">
                <Label htmlFor="att-emp">{u("karyawan")}</Label>
                <Select id="att-emp" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  {activeEmployees.length === 0 ? <option value="">{u("belumAdaKaryawanOpsi")}</option> : null}
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="att-date">{u("tanggal")}</Label>
                <Input id="att-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="att-status">{u("status")}</Label>
                <Select id="att-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AttendanceStatus })}>
                  {ATTENDANCE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {u(ATT_STATUS_KEY[s])}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="att-in">{u("jamMasuk")}</Label>
                <Input id="att-in" type="time" value={form.clockIn} onChange={(e) => setForm({ ...form, clockIn: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="att-out">{u("jamKeluar")}</Label>
                <Input id="att-out" type="time" value={form.clockOut} onChange={(e) => setForm({ ...form, clockOut: e.target.value })} />
              </div>
              <div className="sm:col-span-2 lg:col-span-5">
                <Label htmlFor="att-note">{u("catatanOpsional")}</Label>
                <Input id="att-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => record.mutate()} disabled={record.isPending || activeEmployees.length === 0}>
                {record.isPending ? <Spinner /> : <CalendarCheck className="size-4" aria-hidden />} {u("simpan")}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={u("rekapBulanan")}
          description={`${u("jumlahHariPerStatus")} ${month}.`}
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
            <EmptyState icon={<CalendarCheck className="size-6" aria-hidden />} title={u("belumAdaKaryawan")} description={u("descTambahKaryawanDulu")} />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>{u("karyawan")}</Th>
                  <Th numeric>{u("hadirStatus")}</Th>
                  <Th numeric>{u("izin")}</Th>
                  <Th numeric>{u("sakit")}</Th>
                  <Th numeric>{u("alfaStatus")}</Th>
                  <Th numeric>{u("cutiStatus")}</Th>
                  <Th numeric>{u("total")}</Th>
                </tr>
              </Thead>
              <tbody>
                {recap.map((r) => (
                  <Tr key={r.employeeId}>
                    <Td label={u("karyawan")} className="font-medium">
                      {r.employeeName}
                    </Td>
                    <Td numeric label={u("hadirStatus")}>
                      {r.hadir}
                    </Td>
                    <Td numeric label={u("izin")}>
                      {r.izin}
                    </Td>
                    <Td numeric label={u("sakit")}>
                      {r.sakit}
                    </Td>
                    {/* Nol ditulis "—", bukan dikosongkan. Di tabel lebar sel
                        kosong terbaca sebagai "tidak ada" karena kolom di
                        kiri-kanannya berisi angka; di mode kartu ia berdiri
                        sendiri di sebelah label "Alfa" dan justru terbaca
                        seperti data yang hilang. Warna merah pun hanya dipakai
                        saat memang ada alfa. */}
                    <Td
                      numeric
                      label={u("alfaStatus")}
                      className={r.alfa ? "text-red-600 dark:text-red-400" : "text-slate-400"}
                    >
                      {r.alfa || "—"}
                    </Td>
                    <Td numeric label={u("cutiStatus")}>
                      {r.cuti}
                    </Td>
                    <Td numeric label={u("total")} className="font-semibold">
                      {r.total}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={u("catatanKehadiran")} description={`${u("daftarCatatanPada")} ${month} ${u("terbaruDiAtas")}`} />
        <CardBody>
          {attendanceQuery.isLoading ? (
            <Spinner />
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-400">{u("belumAdaCatatanBulanIni")}</p>
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <span className="w-24 shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{r.date}</span>
                  <span className="font-medium">{r.employeeName}</span>
                  <Badge tone={STATUS_TONE[r.status]}>{u(ATT_STATUS_KEY[r.status])}</Badge>
                  {r.clockIn || r.clockOut ? (
                    <span className="text-xs text-slate-400">
                      {r.clockIn ?? "—"} {u("sdKata")} {r.clockOut ?? "—"}
                    </span>
                  ) : null}
                  {r.note ? <span className="text-xs text-slate-400">“{r.note}”</span> : null}
                  {isAdmin ? (
                    <button
                      type="button"
                      className="ml-auto inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      onClick={() => setToDelete(r)}
                      aria-label={`${u("hapusKehadiran")} ${r.employeeName} ${r.date}`}
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
        title={u("konfirmHapusKehadiran")}
        description={toDelete ? `${u("catatanKata")} ${toDelete.employeeName} ${u("padaKata")} ${toDelete.date} ${u("akanDihapus")}` : ""}
        confirmLabel={u("hapus")}
        danger
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
        busy={remove.isPending}
      />
    </div>
  );
}

import type { ApiFixedAsset, ApiMaintenanceSchedule, ApiWorkOrder } from "@erpindo/shared";
import { useHeading } from "../i18n/pageHeadings";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Wrench } from "lucide-react";
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
  Table,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

type AccountRow = { id: string; code: string; name: string; type: string };
const today = () => new Date().toISOString().slice(0, 10);

export function MaintenancePage() {
  const h = useHeading("pemeliharaan");
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const schedulesQuery = useQuery({
    queryKey: ["maintenance-schedules", tenant.tenantId],
    queryFn: () => api.maintenanceSchedules(tenant.tenantId),
  });
  const workOrdersQuery = useQuery({
    queryKey: ["work-orders", tenant.tenantId],
    queryFn: () => api.workOrders(tenant.tenantId),
  });
  const assetsQuery = useQuery({
    queryKey: ["assets", tenant.tenantId],
    queryFn: () => api.assets(tenant.tenantId),
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });

  const assets = ((assetsQuery.data?.assets ?? []) as ApiFixedAsset[]).filter(
    (a) => a.status === "active"
  );
  const cashAccounts = ((accountsQuery.data?.accounts ?? []) as AccountRow[]).filter(
    (a) => a.type === "asset" && a.code.startsWith("1-1")
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["maintenance-schedules", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["work-orders", tenant.tenantId] });
  };

  // --- Form jadwal -----------------------------------------------------------
  const [schAsset, setSchAsset] = useState("");
  const [schName, setSchName] = useState("");
  const [schInterval, setSchInterval] = useState("1");
  const [schStart, setSchStart] = useState(today);
  const [schError, setSchError] = useState<string | null>(null);

  const createSchedule = useMutation({
    mutationFn: () =>
      api.createMaintenanceSchedule(tenant.tenantId, {
        assetId: schAsset,
        name: schName.trim(),
        intervalMonths: Number(schInterval) || 1,
        startDate: schStart,
      }),
    onSuccess: () => {
      toast("success", "Jadwal servis dibuat.");
      setSchAsset("");
      setSchName("");
      setSchInterval("1");
      setSchError(null);
      invalidate();
    },
    onError: (err) => setSchError((err as Error).message),
  });

  const run = useMutation({
    mutationFn: () => api.runMaintenance(tenant.tenantId),
    onSuccess: (res) => {
      toast(
        "success",
        res.generated > 0
          ? `${res.generated} work order servis diterbitkan.`
          : "Tidak ada yang jatuh tempo."
      );
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const toggleSchedule = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.setScheduleStatus(tenant.tenantId, id, active),
    onSuccess: () => invalidate(),
    onError: (err) => toast("error", (err as Error).message),
  });

  // --- Form work order ad-hoc ------------------------------------------------
  const [woAsset, setWoAsset] = useState("");
  const [woTitle, setWoTitle] = useState("");
  const [woDate, setWoDate] = useState(today);
  const [woError, setWoError] = useState<string | null>(null);

  const createWo = useMutation({
    mutationFn: () =>
      api.createWorkOrder(tenant.tenantId, {
        assetId: woAsset,
        title: woTitle.trim(),
        scheduledDate: woDate,
      }),
    onSuccess: () => {
      toast("success", "Work order dibuat.");
      setWoAsset("");
      setWoTitle("");
      setWoError(null);
      invalidate();
    },
    onError: (err) => setWoError((err as Error).message),
  });

  // --- Penyelesaian work order ----------------------------------------------
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const [doneDate, setDoneDate] = useState(today);
  const [doneCost, setDoneCost] = useState("0");
  const [doneAccount, setDoneAccount] = useState("");
  const [doneNotes, setDoneNotes] = useState("");

  const complete = useMutation({
    mutationFn: (id: string) =>
      api.completeWorkOrder(tenant.tenantId, id, {
        completedDate: doneDate,
        cost: Number(doneCost) || 0,
        cashAccountId: Number(doneCost) > 0 ? doneAccount : undefined,
        notes: doneNotes.trim() || undefined,
      }),
    onSuccess: () => {
      toast("success", "Work order selesai.");
      setDoneFor(null);
      setDoneCost("0");
      setDoneNotes("");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const workOrders = workOrdersQuery.data?.workOrders ?? [];
  const totalCost = workOrders.reduce((s, w) => s + w.cost, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Wrench className="size-6 text-brand-600" aria-hidden />
        <h1 className="text-2xl font-semibold">{h.title}</h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{h.desc}</p>

      {isAdmin ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Jadwal servis berkala"
              description="Servis otomatis diterbitkan saat jatuh tempo."
            />
            <CardBody className="space-y-4">
              <div>
                <Label htmlFor="sch-asset">Aset</Label>
                <Select
                  id="sch-asset"
                  value={schAsset}
                  onChange={(e) => setSchAsset(e.target.value)}
                >
                  <option value="">— pilih aset —</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="sch-name">Nama servis</Label>
                <Input
                  id="sch-name"
                  placeholder="mis. Servis rutin"
                  value={schName}
                  onChange={(e) => setSchName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sch-interval">Interval (bulan)</Label>
                  <Input
                    id="sch-interval"
                    type="number"
                    min={1}
                    value={schInterval}
                    onChange={(e) => setSchInterval(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="sch-start">Servis pertama</Label>
                  <Input
                    id="sch-start"
                    type="date"
                    value={schStart}
                    onChange={(e) => setSchStart(e.target.value)}
                  />
                </div>
              </div>
              {schError ? <Alert tone="error">{schError}</Alert> : null}
              <div className="flex gap-2">
                <Button
                  onClick={() => createSchedule.mutate()}
                  disabled={createSchedule.isPending || !schAsset || schName.trim().length < 2}
                >
                  {createSchedule.isPending ? <Spinner /> : null} Simpan Jadwal
                </Button>
                <Button variant="secondary" onClick={() => run.mutate()} disabled={run.isPending}>
                  <RefreshCw className="size-4" aria-hidden /> Terbitkan Jatuh Tempo
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Work order ad-hoc"
              description="Buat pekerjaan servis di luar jadwal."
            />
            <CardBody className="space-y-4">
              <div>
                <Label htmlFor="wo-asset">Aset</Label>
                <Select id="wo-asset" value={woAsset} onChange={(e) => setWoAsset(e.target.value)}>
                  <option value="">— pilih aset —</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="wo-title">Judul pekerjaan</Label>
                <Input
                  id="wo-title"
                  placeholder="mis. Ganti oli mesin"
                  value={woTitle}
                  onChange={(e) => setWoTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="wo-date">Tanggal rencana</Label>
                <Input
                  id="wo-date"
                  type="date"
                  className="sm:w-48"
                  value={woDate}
                  onChange={(e) => setWoDate(e.target.value)}
                />
              </div>
              {woError ? <Alert tone="error">{woError}</Alert> : null}
              <Button
                onClick={() => createWo.mutate()}
                disabled={createWo.isPending || !woAsset || woTitle.trim().length < 2}
              >
                {createWo.isPending ? <Spinner /> : null} Buat Work Order
              </Button>
            </CardBody>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Jadwal servis" />
        <CardBody>
          {schedulesQuery.isLoading ? (
            <Spinner />
          ) : (schedulesQuery.data?.schedules.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Wrench className="size-6" aria-hidden />}
              title="Belum ada jadwal"
              description="Buat jadwal servis berkala per aset."
            />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Aset</Th>
                  <Th>Servis</Th>
                  <Th>Interval</Th>
                  <Th>Jatuh tempo berikut</Th>
                  <Th>Status</Th>
                  {isAdmin ? <Th>Aksi</Th> : null}
                </tr>
              </Thead>
              <tbody>
                {(schedulesQuery.data?.schedules ?? []).map((s: ApiMaintenanceSchedule) => (
                  <Tr key={s.id}>
                    <Td label="Aset">{s.assetName}</Td>
                    <Td label="Servis">{s.name}</Td>
                    <Td label="Interval">{s.intervalMonths} bln</Td>
                    <Td label="Jatuh tempo berikut">{formatDate(s.nextDueDate)}</Td>
                    <Td label="Status">
                      <Badge tone={s.active ? "green" : "neutral"}>
                        {s.active ? "aktif" : "jeda"}
                      </Badge>
                    </Td>
                    {isAdmin ? (
                      <Td label="Aksi">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => toggleSchedule.mutate({ id: s.id, active: !s.active })}
                        >
                          {s.active ? "Jeda" : "Aktifkan"}
                        </Button>
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Work order & riwayat servis"
          description={`Total biaya servis tercatat: ${formatIDR(totalCost)}`}
        />
        <CardBody>
          {workOrdersQuery.isLoading ? (
            <Spinner />
          ) : workOrders.length === 0 ? (
            <EmptyState
              icon={<Wrench className="size-6" aria-hidden />}
              title="Belum ada work order"
              description="Work order servis akan muncul di sini."
            />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>No.</Th>
                  <Th>Aset / Pekerjaan</Th>
                  <Th>Rencana</Th>
                  <Th numeric>Biaya</Th>
                  <Th>Status</Th>
                  {isAdmin ? <Th>Aksi</Th> : null}
                </tr>
              </Thead>
              <tbody>
                {workOrders.map((w: ApiWorkOrder) => (
                  <Tr key={w.id} className="align-top">
                    <Td label="No." className="font-mono text-xs">
                      {w.orderNo}
                    </Td>
                    <Td label="Aset / Pekerjaan">
                      {w.title}
                      <span className="block text-xs text-slate-400">{w.assetName}</span>
                    </Td>
                    <Td label="Rencana">{formatDate(w.scheduledDate)}</Td>
                    <Td numeric label="Biaya">
                      {w.status === "done" ? formatIDR(w.cost) : "—"}
                    </Td>
                    <Td label="Status">
                      <Badge tone={w.status === "done" ? "green" : "amber"}>
                        {w.status === "done" ? "selesai" : "terbuka"}
                      </Badge>
                    </Td>
                    {isAdmin ? (
                      <Td label="Aksi">
                          {w.status === "open" ? (
                            doneFor === w.id ? (
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="date"
                                  value={doneDate}
                                  onChange={(e) => setDoneDate(e.target.value)}
                                />
                                <Input
                                  type="number"
                                  min={0}
                                  placeholder="Biaya"
                                  value={doneCost}
                                  onChange={(e) => setDoneCost(e.target.value)}
                                />
                                {Number(doneCost) > 0 ? (
                                  <Select
                                    value={doneAccount}
                                    onChange={(e) => setDoneAccount(e.target.value)}
                                  >
                                    <option value="">— akun pembayar —</option>
                                    {cashAccounts.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {a.name}
                                      </option>
                                    ))}
                                  </Select>
                                ) : null}
                                <Input
                                  placeholder="Catatan (opsional)"
                                  value={doneNotes}
                                  onChange={(e) => setDoneNotes(e.target.value)}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="xs"
                                    onClick={() => complete.mutate(w.id)}
                                    disabled={
                                      complete.isPending || (Number(doneCost) > 0 && !doneAccount)
                                    }
                                  >
                                    Simpan
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    onClick={() => setDoneFor(null)}
                                  >
                                    Batal
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => {
                                  setDoneFor(w.id);
                                  setDoneDate(today());
                                  setDoneCost("0");
                                  setDoneAccount("");
                                  setDoneNotes("");
                                }}
                              >
                                Selesaikan
                              </Button>
                            )
                        ) : (
                          <span className="text-xs text-slate-400">{w.completedDate}</span>
                        )}
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

import type { ApiBom, ApiProductionOrder, ApiRoutingStep } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Plus, Trash2 } from "lucide-react";
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
  SearchSelect,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

type ProductRow = { id: string; sku: string; name: string; unit?: string; is_service?: number };
type WarehouseRow = { id: string; name: string };
type CompLine = { componentId: string; componentLabel: string; qty: string };

const QC_TONE = { none: "neutral", pending: "amber", passed: "green", quarantined: "red" } as const;
const QC_LABEL = { none: "—", pending: "menunggu QC", passed: "lulus QC", quarantined: "karantina" } as const;

export function ManufacturingPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const bomsQuery = useQuery({ queryKey: ["boms", tenant.tenantId], queryFn: () => api.boms(tenant.tenantId) });
  const ordersQuery = useQuery({
    queryKey: ["production-orders", tenant.tenantId],
    queryFn: () => api.productionOrders(tenant.tenantId),
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses"),
  });

  const warehouses = (warehousesQuery.data?.items ?? []) as WarehouseRow[];
  const boms = bomsQuery.data?.boms ?? [];

  // Produk dicari on-type (jasa dikecualikan — BoM hanya untuk barang berstok).
  async function fetchGoodsOptions(q: string, excludeId?: string) {
    const res = await api.listItems<ProductRow>(tenant.tenantId, "products", { q, limit: 20 });
    return res.items
      .filter((p) => !p.is_service && p.id !== excludeId)
      .map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` }));
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["boms", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["production-orders", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
  };

  // --- Form BoM --------------------------------------------------------------
  const [bomProduct, setBomProduct] = useState("");
  const [bomProductLabel, setBomProductLabel] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [comps, setComps] = useState<CompLine[]>([{ componentId: "", componentLabel: "", qty: "1" }]);
  const [bomError, setBomError] = useState<string | null>(null);

  const saveBom = useMutation({
    mutationFn: () =>
      api.setBom(tenant.tenantId, {
        productId: bomProduct,
        outputQty: Number(outputQty) || 1,
        lines: comps
          .filter((l) => l.componentId)
          .map((l) => ({ componentId: l.componentId, qty: Number(l.qty) || 0 })),
      }),
    onSuccess: () => {
      toast("success", "Resep (BoM) disimpan.");
      setBomProduct("");
      setBomProductLabel("");
      setOutputQty("1");
      setComps([{ componentId: "", componentLabel: "", qty: "1" }]);
      setBomError(null);
      invalidate();
    },
    onError: (err) => setBomError((err as Error).message),
  });

  // --- Form perintah produksi -----------------------------------------------
  const [ordProduct, setOrdProduct] = useState("");
  const [ordWarehouse, setOrdWarehouse] = useState("");
  const [ordQty, setOrdQty] = useState("1");
  const [ordError, setOrdError] = useState<string | null>(null);
  const [qcWarehouse, setQcWarehouse] = useState("");

  const createOrder = useMutation({
    mutationFn: () =>
      api.createProductionOrder(tenant.tenantId, {
        productId: ordProduct,
        warehouseId: ordWarehouse || warehouses[0]?.id || "",
        qty: Number(ordQty) || 0,
      }),
    onSuccess: () => {
      toast("success", "Perintah produksi dibuat.");
      setOrdProduct("");
      setOrdQty("1");
      setOrdError(null);
      invalidate();
    },
    onError: (err) => setOrdError((err as Error).message),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.completeProduction(tenant.tenantId, id),
    onSuccess: (res) => {
      toast("success", `Produksi selesai — biaya total ${formatIDR(res.totalCost)}.`);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const qc = useMutation({
    mutationFn: ({ id, result }: { id: string; result: "passed" | "quarantined" }) =>
      api.qcInspect(tenant.tenantId, id, { result, warehouseId: result === "quarantined" ? qcWarehouse : undefined }),
    onSuccess: (res) => {
      toast("success", res.result === "passed" ? "Hasil produksi diluluskan QC." : "Hasil produksi dikarantina.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Factory className="size-6 text-brand-600" aria-hidden />
        <h1 className="text-2xl font-semibold">Manufaktur &amp; QC</h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Susun resep produk (BoM), lalu jalankan perintah produksi: bahan dikonsumsi dari stok dan produk jadi masuk stok
        dengan biaya gabungan. Inspeksi QC menentukan hasil siap jual atau dikarantina.
      </p>

      {isAdmin ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* BoM */}
          <Card>
            <CardHeader title="Resep produk (BoM)" description="Komponen & jumlah untuk menghasilkan produk jadi." />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="bom-product">Produk jadi</Label>
                  <SearchSelect
                    id="bom-product"
                    value={bomProduct}
                    valueLabel={bomProductLabel}
                    placeholder="Cari produk…"
                    fetchOptions={(q) => fetchGoodsOptions(q)}
                    onSelect={(opt) => {
                      setBomProduct(opt.value);
                      setBomProductLabel(opt.label);
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="bom-output">Hasil per resep</Label>
                  <Input
                    id="bom-output"
                    type="number"
                    min={1}
                    value={outputQty}
                    onChange={(e) => setOutputQty(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Komponen</Label>
                {comps.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <SearchSelect
                        value={line.componentId}
                        valueLabel={line.componentLabel}
                        placeholder="Cari komponen…"
                        fetchOptions={(q) => fetchGoodsOptions(q, bomProduct)}
                        onSelect={(opt) =>
                          setComps((cs) =>
                            cs.map((c, j) => (j === i ? { ...c, componentId: opt.value, componentLabel: opt.label } : c)),
                          )
                        }
                      />
                    </div>
                    <Input
                      type="number"
                      min={1}
                      className="w-24"
                      value={line.qty}
                      onChange={(e) => setComps((cs) => cs.map((c, j) => (j === i ? { ...c, qty: e.target.value } : c)))}
                    />
                    {comps.length > 1 ? (
                      <button
                        onClick={() => setComps((cs) => cs.filter((_, j) => j !== i))}
                        className="text-slate-400 hover:text-red-500"
                        aria-label="Hapus komponen"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="secondary"
                  className="h-8"
                  onClick={() => setComps((cs) => [...cs, { componentId: "", componentLabel: "", qty: "1" }])}
                >
                  <Plus className="size-4" aria-hidden /> Tambah komponen
                </Button>
              </div>

              {bomError ? <Alert tone="error">{bomError}</Alert> : null}
              <Button
                onClick={() => saveBom.mutate()}
                disabled={saveBom.isPending || !bomProduct || !comps.some((c) => c.componentId)}
              >
                {saveBom.isPending ? <Spinner /> : null} Simpan Resep
              </Button>
            </CardBody>
          </Card>

          {/* Perintah produksi */}
          <Card>
            <CardHeader title="Perintah produksi" description="Jalankan produksi berdasarkan resep." />
            <CardBody className="space-y-4">
              <div>
                <Label htmlFor="ord-product">Produk (harus punya resep)</Label>
                <Select id="ord-product" value={ordProduct} onChange={(e) => setOrdProduct(e.target.value)}>
                  <option value="">— pilih —</option>
                  {boms.map((b) => (
                    <option key={b.productId} value={b.productId}>
                      {b.productSku} · {b.productName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ord-wh">Gudang</Label>
                  <Select id="ord-wh" value={ordWarehouse} onChange={(e) => setOrdWarehouse(e.target.value)}>
                    <option value="">{warehouses[0]?.name ?? "— gudang —"}</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ord-qty">Jumlah</Label>
                  <Input id="ord-qty" type="number" min={1} value={ordQty} onChange={(e) => setOrdQty(e.target.value)} />
                </div>
              </div>
              {ordError ? <Alert tone="error">{ordError}</Alert> : null}
              <Button onClick={() => createOrder.mutate()} disabled={createOrder.isPending || !ordProduct}>
                {createOrder.isPending ? <Spinner /> : null} Buat Perintah
              </Button>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* Daftar BoM */}
      <Card>
        <CardHeader title="Daftar resep" />
        <CardBody>
          {bomsQuery.isLoading ? (
            <Spinner />
          ) : boms.length === 0 ? (
            <EmptyState
              icon={<Factory className="size-6" aria-hidden />}
              title="Belum ada resep"
              description="Buat resep (BoM) untuk mulai memproduksi."
            />
          ) : (
            <div className="space-y-3">
              {boms.map((b: ApiBom) => (
                <div key={b.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{b.productName}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">hasil {b.outputQty} / resep</span>
                  </div>
                  <ul className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {b.lines.map((l) => (
                      <li key={l.componentId}>
                        • {l.qty} {l.unit} {l.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Daftar perintah produksi */}
      <Card>
        <CardHeader title="Riwayat produksi" />
        <CardBody className="space-y-4">
          {isAdmin ? (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="qc-wh">Gudang karantina (untuk QC gagal)</Label>
                <Select id="qc-wh" className="w-56" value={qcWarehouse} onChange={(e) => setQcWarehouse(e.target.value)}>
                  <option value="">— pilih gudang —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}

          {ordersQuery.isLoading ? (
            <Spinner />
          ) : (ordersQuery.data?.orders.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Factory className="size-6" aria-hidden />}
              title="Belum ada produksi"
              description="Perintah produksi akan muncul di sini."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="pb-2 pr-4 font-medium">No.</th>
                    <th className="pb-2 pr-4 font-medium">Produk</th>
                    <th className="pb-2 pr-4 text-right font-medium">Jumlah</th>
                    <th className="pb-2 pr-4 text-right font-medium">Biaya total</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">QC</th>
                    {isAdmin ? <th className="pb-2 font-medium">Aksi</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {(ordersQuery.data?.orders ?? []).map((o: ApiProductionOrder) => (
                    <tr key={o.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="py-2.5 pr-4 font-mono text-xs">{o.orderNo}</td>
                      <td className="py-2.5 pr-4">
                        {o.productName}
                        <span className="block text-xs text-slate-400">{o.warehouseName}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{o.qty}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        {o.status === "produced" ? formatIDR(o.totalCost) : "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={o.status === "produced" ? "green" : "neutral"}>
                          {o.status === "produced" ? "selesai" : "draf"}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={QC_TONE[o.qcStatus]}>{QC_LABEL[o.qcStatus]}</Badge>
                        {o.qcWarehouseName ? (
                          <span className="block text-xs text-slate-400">→ {o.qcWarehouseName}</span>
                        ) : null}
                      </td>
                      {isAdmin ? (
                        <td className="py-2.5">
                          {o.status === "draft" ? (
                            <Button
                              variant="secondary"
                              className="h-8"
                              onClick={() => complete.mutate(o.id)}
                              disabled={complete.isPending}
                            >
                              Produksi
                            </Button>
                          ) : o.qcStatus === "pending" ? (
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                className="h-8"
                                onClick={() => qc.mutate({ id: o.id, result: "passed" })}
                                disabled={qc.isPending}
                              >
                                Luluskan
                              </Button>
                              <Button
                                variant="danger"
                                className="h-8"
                                onClick={() => {
                                  if (!qcWarehouse) {
                                    toast("error", "Pilih gudang karantina dulu.");
                                    return;
                                  }
                                  qc.mutate({ id: o.id, result: "quarantined" });
                                }}
                                disabled={qc.isPending}
                              >
                                Karantina
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">selesai</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {isAdmin ? <WorkCentersCard /> : null}
      <RoutingCard orders={ordersQuery.data?.orders ?? []} isAdmin={isAdmin} />
    </div>
  );
}

/** Master work center / pusat kerja (Fase 7g). */
function WorkCentersCard() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["work-centers", tenant.tenantId], queryFn: () => api.workCenters(tenant.tenantId) });
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["work-centers", tenant.tenantId] });
  const create = useMutation({
    mutationFn: () => api.createWorkCenter(tenant.tenantId, { code: code.trim(), name: name.trim(), hourlyRate: Number(rate) || 0 }),
    onSuccess: () => { setCode(""); setName(""); setRate(""); invalidate(); toast("success", "Work center ditambahkan."); },
    onError: (e: Error) => toast("error", e.message),
  });
  const items = query.data?.items ?? [];
  return (
    <Card>
      <CardHeader title="Work center (pusat kerja)" description="Stasiun/tahap produksi dengan tarif per jam, dipakai untuk routing." />
      <CardBody className="space-y-4">
        <form className="grid gap-3 sm:grid-cols-[8rem_1fr_9rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); if (code.trim() && name.trim()) create.mutate(); }}>
          <div><Label htmlFor="wc-code">Kode</Label><Input id="wc-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="WC-CUT" /></div>
          <div><Label htmlFor="wc-name">Nama</Label><Input id="wc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pemotongan" /></div>
          <div><Label htmlFor="wc-rate">Tarif/jam (Rp)</Label><Input id="wc-rate" type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="50000" /></div>
          <Button type="submit" disabled={create.isPending || !code.trim() || !name.trim()}>{create.isPending ? <Spinner /> : null} Tambah</Button>
        </form>
        {items.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {items.map((w) => (
              <li key={w.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                <span><span className="font-mono text-xs text-slate-400">{w.code}</span> {w.name}</span>
                <span className="tabular-nums text-slate-500">{formatIDR(w.hourlyRate)}/jam</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada work center.</p>}
      </CardBody>
    </Card>
  );
}

/** Routing per perintah produksi: tahapan + biaya standar vs aktual (WIP → selesai). */
function RoutingCard({ orders, isAdmin }: { orders: ApiProductionOrder[]; isAdmin: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [prodId, setProdId] = useState("");
  const wcQuery = useQuery({ queryKey: ["work-centers", tenant.tenantId], queryFn: () => api.workCenters(tenant.tenantId) });
  const routingQuery = useQuery({ queryKey: ["routing", tenant.tenantId, prodId], queryFn: () => api.productionRouting(tenant.tenantId, prodId), enabled: Boolean(prodId) });
  const [wcId, setWcId] = useState("");
  const [stepName, setStepName] = useState("");
  const [stdCost, setStdCost] = useState("");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["routing", tenant.tenantId, prodId] });

  const addStep = useMutation({
    mutationFn: () => api.addRoutingStep(tenant.tenantId, prodId, { workCenterId: wcId, name: stepName.trim(), standardCost: Number(stdCost) || 0 }),
    onSuccess: () => { setStepName(""); setStdCost(""); invalidate(); toast("success", "Tahap routing ditambahkan."); },
    onError: (e: Error) => toast("error", e.message),
  });
  const complete = useMutation({
    mutationFn: (v: { stepId: string; actual: number }) => api.completeRoutingStep(tenant.tenantId, prodId, v.stepId, { actualCost: v.actual }),
    onSuccess: () => { invalidate(); toast("success", "Biaya aktual dicatat."); },
    onError: (e: Error) => toast("error", e.message),
  });

  const steps = routingQuery.data?.steps ?? [];
  const wcs = wcQuery.data?.items ?? [];
  return (
    <Card>
      <CardHeader title="Routing produksi (biaya standar vs aktual)" description="Tahapan proses per perintah produksi di tiap work center — bandingkan biaya standar dengan aktual (WIP)." />
      <CardBody className="space-y-4">
        <div>
          <Label htmlFor="rt-prod">Perintah produksi</Label>
          <Select id="rt-prod" className="max-w-md" value={prodId} onChange={(e) => setProdId(e.target.value)}>
            <option value="">— pilih perintah produksi —</option>
            {orders.map((o) => (<option key={o.id} value={o.id}>{o.orderNo} · {o.productName} ({o.qty})</option>))}
          </Select>
        </div>
        {prodId ? (
          <>
            {isAdmin ? (
              <form className="grid gap-2 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); if (wcId && stepName.trim()) addStep.mutate(); }}>
                <div>
                  <Label htmlFor="rt-wc">Work center</Label>
                  <Select id="rt-wc" value={wcId} onChange={(e) => setWcId(e.target.value)}>
                    <option value="">— pilih —</option>
                    {wcs.map((w) => (<option key={w.id} value={w.id}>{w.code} · {w.name}</option>))}
                  </Select>
                </div>
                <div><Label htmlFor="rt-name">Nama tahap</Label><Input id="rt-name" value={stepName} onChange={(e) => setStepName(e.target.value)} placeholder="Potong bahan" /></div>
                <div><Label htmlFor="rt-std">Biaya standar</Label><Input id="rt-std" type="number" min={0} value={stdCost} onChange={(e) => setStdCost(e.target.value)} placeholder="100000" /></div>
                <Button type="submit" disabled={addStep.isPending || !wcId || !stepName.trim()}>Tambah tahap</Button>
              </form>
            ) : null}
            {steps.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada tahapan routing.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="pb-2 pr-4 font-medium">#</th>
                      <th className="pb-2 pr-4 font-medium">Tahap</th>
                      <th className="pb-2 pr-4 font-medium">Work center</th>
                      <th className="pb-2 pr-4 text-right font-medium">Standar</th>
                      <th className="pb-2 pr-4 text-right font-medium">Aktual</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      {isAdmin ? <th className="pb-2 font-medium"></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((s) => (
                      <RoutingRow key={s.id} step={s} isAdmin={isAdmin} onComplete={(actual) => complete.mutate({ stepId: s.id, actual })} busy={complete.isPending} />
                    ))}
                    <tr className="font-semibold">
                      <td className="py-2 pr-4" colSpan={3}>Total (varian = aktual − standar)</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatIDR(routingQuery.data?.totalStandard ?? 0)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatIDR(routingQuery.data?.totalActual ?? 0)}</td>
                      <td className={`py-2 pr-4 tabular-nums ${(routingQuery.data?.variance ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`} colSpan={isAdmin ? 2 : 1}>
                        {(routingQuery.data?.variance ?? 0) >= 0 ? "+" : ""}{formatIDR(routingQuery.data?.variance ?? 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function RoutingRow({ step, isAdmin, onComplete, busy }: { step: ApiRoutingStep; isAdmin: boolean; onComplete: (actual: number) => void; busy: boolean }) {
  const [actual, setActual] = useState("");
  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
      <td className="py-2 pr-4 text-slate-400">{step.stepOrder}</td>
      <td className="py-2 pr-4">{step.name}</td>
      <td className="py-2 pr-4 text-slate-500">{step.workCenterName}</td>
      <td className="py-2 pr-4 text-right tabular-nums">{formatIDR(step.standardCost)}</td>
      <td className="py-2 pr-4 text-right tabular-nums">{step.actualCost !== null && step.actualCost !== undefined ? formatIDR(step.actualCost) : "—"}</td>
      <td className="py-2 pr-4"><Badge tone={step.status === "done" ? "green" : "amber"}>{step.status === "done" ? "selesai" : "WIP"}</Badge></td>
      {isAdmin ? (
        <td className="py-2">
          {step.status === "pending" ? (
            <span className="flex items-center gap-1">
              <Input type="number" min={0} value={actual} onChange={(e) => setActual(e.target.value)} placeholder="aktual" className="h-8 w-24" />
              <Button className="h-8" onClick={() => onComplete(Number(actual) || 0)} disabled={busy || !actual}>Selesai</Button>
            </span>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}

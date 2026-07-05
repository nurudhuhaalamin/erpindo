import type { ApiBom, ApiProductionOrder } from "@erpindo/shared";
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
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

type ProductRow = { id: string; sku: string; name: string; unit?: string; is_service?: number };
type WarehouseRow = { id: string; name: string };
type CompLine = { componentId: string; qty: string };

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
  const productsQuery = useQuery({
    queryKey: ["products", tenant.tenantId],
    queryFn: () => api.listItems<ProductRow>(tenant.tenantId, "products"),
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses"),
  });

  const products = ((productsQuery.data?.items ?? []) as ProductRow[]).filter((p) => !p.is_service);
  const warehouses = (warehousesQuery.data?.items ?? []) as WarehouseRow[];
  const boms = bomsQuery.data?.boms ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["boms", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["production-orders", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
  };

  // --- Form BoM --------------------------------------------------------------
  const [bomProduct, setBomProduct] = useState("");
  const [outputQty, setOutputQty] = useState("1");
  const [comps, setComps] = useState<CompLine[]>([{ componentId: "", qty: "1" }]);
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
      setOutputQty("1");
      setComps([{ componentId: "", qty: "1" }]);
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

  const bomProducts = new Set(boms.map((b) => b.productId));

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
                  <Select id="bom-product" value={bomProduct} onChange={(e) => setBomProduct(e.target.value)}>
                    <option value="">— pilih —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
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
                    <Select
                      className="flex-1"
                      value={line.componentId}
                      onChange={(e) =>
                        setComps((cs) => cs.map((c, j) => (j === i ? { ...c, componentId: e.target.value } : c)))
                      }
                    >
                      <option value="">— komponen —</option>
                      {products
                        .filter((p) => p.id !== bomProduct)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </Select>
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
                  onClick={() => setComps((cs) => [...cs, { componentId: "", qty: "1" }])}
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
                  {products
                    .filter((p) => bomProducts.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
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
              <table className="w-full text-sm">
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
    </div>
  );
}

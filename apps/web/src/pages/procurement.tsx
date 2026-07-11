import {
  PO_STATUS_LABELS,
  REQUISITION_STATUS_LABELS,
  TAX_RATES,
  type ApiPurchaseOrder,
  type ApiRequisition,
  type PoStatus,
  type RequisitionStatus,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, PackageCheck, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import { useState } from "react";
import { api, formatIDR } from "../api/client";
import {
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

type ProductRow = { id: string; name: string; buy_price: number };
type ContactRow = { id: string; name: string; type: string };
type WarehouseRow = { id: string; name: string };

const today = () => new Date().toISOString().slice(0, 10);
const REQ_TONE: Record<RequisitionStatus, "neutral" | "green" | "red" | "brand"> = {
  submitted: "neutral",
  approved: "green",
  rejected: "red",
  ordered: "brand",
};
const PO_TONE: Record<PoStatus, "brand" | "green" | "red"> = { ordered: "brand", received: "green", cancelled: "red" };

export function ProcurementPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";

  const productsQuery = useQuery({
    queryKey: ["products", tenant.tenantId],
    queryFn: () => api.listItems<ProductRow>(tenant.tenantId, "products"),
  });
  const contactsQuery = useQuery({
    queryKey: ["contacts", tenant.tenantId],
    queryFn: () => api.listItems<ContactRow>(tenant.tenantId, "contacts"),
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses"),
  });
  const requisitionsQuery = useQuery({
    queryKey: ["requisitions", tenant.tenantId],
    queryFn: () => api.requisitions(tenant.tenantId),
  });
  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", tenant.tenantId],
    queryFn: () => api.purchaseOrders(tenant.tenantId),
  });
  const receiptsQuery = useQuery({
    queryKey: ["goods-receipts", tenant.tenantId],
    queryFn: () => api.goodsReceipts(tenant.tenantId),
  });

  const products = (productsQuery.data?.items ?? []) as ProductRow[];
  const suppliers = ((contactsQuery.data?.items ?? []) as ContactRow[]).filter((k) => ["supplier", "both"].includes(k.type));
  const warehouses = (warehousesQuery.data?.items ?? []) as WarehouseRow[];
  const requisitions = requisitionsQuery.data?.requisitions ?? [];
  const orders = ordersQuery.data?.orders ?? [];
  const receipts = receiptsQuery.data?.receipts ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pengadaan (Procurement)</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Alur pengadaan lengkap: permintaan barang → pesanan ke pemasok → penerimaan barang (otomatis jadi faktur pembelian & stok masuk).
        </p>
      </div>

      <RequisitionCard tenantId={tenant.tenantId} products={products} requisitions={requisitions} isAdmin={isAdmin} loading={requisitionsQuery.isLoading} />
      <PurchaseOrderCard
        tenantId={tenant.tenantId}
        products={products}
        suppliers={suppliers}
        warehouses={warehouses}
        requisitions={requisitions}
        orders={orders}
        isAdmin={isAdmin}
        loading={ordersQuery.isLoading}
      />
      <ReceiptsCard receipts={receipts} loading={receiptsQuery.isLoading} />
    </div>
  );
}

// --- Permintaan pembelian (PR) ------------------------------------------------

function RequisitionCard({
  tenantId,
  products,
  requisitions,
  isAdmin,
  loading,
}: {
  tenantId: string;
  products: ProductRow[];
  requisitions: ApiRequisition[];
  isAdmin: boolean;
  loading: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<{ productId: string; qty: string; note: string }[]>([{ productId: "", qty: "1", note: "" }]);
  const [note, setNote] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["requisitions", tenantId] });

  const create = useMutation({
    mutationFn: () =>
      api.createRequisition(tenantId, {
        ...(note.trim() ? { note: note.trim() } : {}),
        lines: lines
          .filter((l) => l.productId && Number(l.qty) > 0)
          .map((l) => ({ productId: l.productId, qty: Number(l.qty), ...(l.note.trim() ? { note: l.note.trim() } : {}) })),
      }),
    onSuccess: (res) => {
      toast("success", `Permintaan ${res.reqNo} diajukan.`);
      setLines([{ productId: "", qty: "1", note: "" }]);
      setNote("");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "rejected" }) => api.decideRequisition(tenantId, v.id, v.status),
    onSuccess: (_r, v) => {
      toast("success", v.status === "approved" ? "Permintaan disetujui." : "Permintaan ditolak.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const validLines = lines.filter((l) => l.productId && Number(l.qty) > 0);

  return (
    <Card>
      <CardHeader title="1. Permintaan pembelian (PR)" description="Ajukan daftar barang yang dibutuhkan — belum ada harga/pemasok. Perlu disetujui sebelum jadi pesanan." />
      <CardBody className="space-y-4">
        {isAdmin ? (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            {lines.map((line, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Produk"
                  className="min-w-[10rem] flex-1"
                  value={line.productId}
                  onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, productId: e.target.value } : l)))}
                >
                  <option value="">— pilih produk —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Input aria-label="Jumlah" type="number" min={1} className="w-20" value={line.qty} onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, qty: e.target.value } : l)))} />
                <Input aria-label="Catatan baris" placeholder="Catatan (opsional)" className="min-w-[8rem] flex-1" value={line.note} onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, note: e.target.value } : l)))} />
                {lines.length > 1 ? (
                  <button type="button" aria-label="Hapus baris" className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:text-red-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" className="h-8" onClick={() => setLines([...lines, { productId: "", qty: "1", note: "" }])}>
                <Plus className="size-4" aria-hidden /> Baris
              </Button>
              <Input aria-label="Catatan permintaan" placeholder="Catatan permintaan (opsional)" className="min-w-[10rem] flex-1" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button onClick={() => create.mutate()} disabled={create.isPending || validLines.length === 0}>
                {create.isPending ? <Spinner /> : <ClipboardList className="size-4" aria-hidden />} Ajukan
              </Button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <Spinner />
        ) : requisitions.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada permintaan pembelian.</p>
        ) : (
          <div className="space-y-2">
            {requisitions.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs">{r.reqNo}</span>
                  <Badge tone={REQ_TONE[r.status]}>{REQUISITION_STATUS_LABELS[r.status]}</Badge>
                  {r.note ? <span className="text-xs text-slate-400">“{r.note}”</span> : null}
                  {isAdmin && r.status === "submitted" ? (
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
                <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {r.lines.map((l) => `${l.productName} ×${l.qty}`).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// --- Pesanan pembelian (PO) ---------------------------------------------------

function PurchaseOrderCard({
  tenantId,
  products,
  suppliers,
  warehouses,
  requisitions,
  orders,
  isAdmin,
  loading,
}: {
  tenantId: string;
  products: ProductRow[];
  suppliers: ContactRow[];
  warehouses: WarehouseRow[];
  requisitions: ApiRequisition[];
  orders: ApiPurchaseOrder[];
  isAdmin: boolean;
  loading: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [head, setHead] = useState({ requisitionId: "", contactId: "", warehouseId: "", taxRate: "0", orderDate: today(), expectedDate: "" });
  const [lines, setLines] = useState<{ productId: string; qty: string; unitPrice: string }[]>([{ productId: "", qty: "1", unitPrice: "" }]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["purchase-orders", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["requisitions", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["goods-receipts", tenantId] });
  };

  const approvedReqs = requisitions.filter((r) => r.status === "approved");

  // Pilih PR sumber → prefill baris (harga dari harga beli produk bila ada).
  const pickRequisition = (id: string) => {
    setHead({ ...head, requisitionId: id });
    const req = requisitions.find((r) => r.id === id);
    if (req) {
      setLines(req.lines.map((l) => ({ productId: l.productId, qty: String(l.qty), unitPrice: String(products.find((p) => p.id === l.productId)?.buy_price ?? 0) })));
    }
  };

  const create = useMutation({
    mutationFn: () =>
      api.createPurchaseOrder(tenantId, {
        ...(head.requisitionId ? { requisitionId: head.requisitionId } : {}),
        contactId: head.contactId,
        orderDate: head.orderDate,
        ...(head.expectedDate ? { expectedDate: head.expectedDate } : {}),
        warehouseId: head.warehouseId,
        taxRate: Number(head.taxRate) as (typeof TAX_RATES)[number],
        lines: lines.filter((l) => l.productId && Number(l.qty) > 0).map((l) => ({ productId: l.productId, qty: Number(l.qty), unitPrice: Number(l.unitPrice) || 0 })),
      }),
    onSuccess: (res) => {
      toast("success", `Pesanan ${res.poNo} dibuat.`);
      setHead({ requisitionId: "", contactId: "", warehouseId: "", taxRate: "0", orderDate: today(), expectedDate: "" });
      setLines([{ productId: "", qty: "1", unitPrice: "" }]);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const canSubmit = head.contactId && head.warehouseId && lines.some((l) => l.productId && Number(l.qty) > 0);

  return (
    <Card>
      <CardHeader title="2. Pesanan pembelian (PO)" description="Buat pesanan ke pemasok — pilih pemasok, gudang tujuan, harga per barang. Bisa menarik dari permintaan yang disetujui." />
      <CardBody className="space-y-4">
        {isAdmin ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="po-req">Dari permintaan (opsional)</Label>
                <Select id="po-req" value={head.requisitionId} onChange={(e) => pickRequisition(e.target.value)}>
                  <option value="">— tanpa permintaan —</option>
                  {approvedReqs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.reqNo} ({r.lines.length} barang)
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="po-supplier">Pemasok</Label>
                <Select id="po-supplier" value={head.contactId} onChange={(e) => setHead({ ...head, contactId: e.target.value })}>
                  <option value="">— pilih pemasok —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="po-wh">Gudang tujuan</Label>
                <Select id="po-wh" value={head.warehouseId} onChange={(e) => setHead({ ...head, warehouseId: e.target.value })}>
                  <option value="">— pilih gudang —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="po-date">Tanggal pesan</Label>
                <Input id="po-date" type="date" value={head.orderDate} onChange={(e) => setHead({ ...head, orderDate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="po-exp">Perkiraan tiba (opsional)</Label>
                <Input id="po-exp" type="date" value={head.expectedDate} onChange={(e) => setHead({ ...head, expectedDate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="po-tax">PPN</Label>
                <Select id="po-tax" value={head.taxRate} onChange={(e) => setHead({ ...head, taxRate: e.target.value })}>
                  {TAX_RATES.map((t) => (
                    <option key={t} value={t}>
                      {t}%
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select aria-label="Produk" className="min-w-[10rem] flex-1" value={line.productId} onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, productId: e.target.value, unitPrice: l.unitPrice || String(products.find((p) => p.id === e.target.value)?.buy_price ?? 0) } : l)))}>
                    <option value="">— pilih produk —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <Input aria-label="Jumlah" type="number" min={1} className="w-20" value={line.qty} onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, qty: e.target.value } : l)))} />
                  <Input aria-label="Harga satuan" type="number" min={0} placeholder="Harga" className="w-32" value={line.unitPrice} onChange={(e) => setLines(lines.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l)))} />
                  {lines.length > 1 ? (
                    <button type="button" aria-label="Hapus baris" className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:text-red-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button variant="ghost" className="h-8" onClick={() => setLines([...lines, { productId: "", qty: "1", unitPrice: "" }])}>
                  <Plus className="size-4" aria-hidden /> Baris
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending || !canSubmit}>
                  {create.isPending ? <Spinner /> : <ShoppingBag className="size-4" aria-hidden />} Buat pesanan
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <EmptyState icon={<ShoppingBag className="size-6" aria-hidden />} title="Belum ada pesanan" description="Buat pesanan pembelian ke pemasok untuk mulai." />
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <PurchaseOrderRow key={o.id} tenantId={tenantId} order={o} isAdmin={isAdmin} onChange={invalidate} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function PurchaseOrderRow({ tenantId, order, isAdmin, onChange }: { tenantId: string; order: ApiPurchaseOrder; isAdmin: boolean; onChange: () => void }) {
  const toast = useToast();
  const [receiving, setReceiving] = useState(false);
  const [recv, setRecv] = useState<Record<string, string>>(() => Object.fromEntries(order.lines.map((l) => [l.id, String(l.qty)])));
  const [receiptDate, setReceiptDate] = useState(today());

  const cancel = useMutation({
    mutationFn: () => api.cancelPurchaseOrder(tenantId, order.id),
    onSuccess: () => {
      toast("success", "Pesanan dibatalkan.");
      onChange();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const receive = useMutation({
    mutationFn: () =>
      api.receiveGoods(tenantId, order.id, {
        receiptDate,
        lines: order.lines.map((l) => ({ poLineId: l.id, qtyReceived: Number(recv[l.id]) || 0 })),
      }),
    onSuccess: (res) => {
      toast("success", `Barang diterima — faktur ${res.purchaseNo} terbentuk (stok masuk).`);
      setReceiving(false);
      onChange();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-xs">{order.poNo}</span>
        <span className="font-medium">{order.contactName}</span>
        <Badge tone={PO_TONE[order.status]}>{PO_STATUS_LABELS[order.status]}</Badge>
        {order.purchaseNo ? <Badge tone="green">faktur {order.purchaseNo}</Badge> : null}
        <span className="ml-auto font-semibold tabular-nums">{formatIDR(order.total)}</span>
      </div>
      <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
        {order.lines.map((l) => `${l.productName} ×${l.qty} @ ${formatIDR(l.unitPrice)}`).join(" · ")}
      </div>
      {isAdmin && order.status === "ordered" ? (
        <div className="mt-2.5 border-t pt-2.5 dark:border-slate-700">
          {receiving ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Jumlah barang diterima:</div>
              {order.lines.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{l.productName}</span>
                  <span className="text-xs text-slate-400">dari {l.qty}</span>
                  <Input aria-label={`Diterima ${l.productName}`} type="number" min={0} max={l.qty} className="w-24" value={recv[l.id] ?? ""} onChange={(e) => setRecv({ ...recv, [l.id]: e.target.value })} />
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`rd-${order.id}`} className="text-xs">Tanggal terima</Label>
                <Input id={`rd-${order.id}`} type="date" className="w-40" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
                <span className="ml-auto flex gap-2">
                  <Button variant="ghost" className="h-8" onClick={() => setReceiving(false)}>
                    Batal
                  </Button>
                  <Button className="h-8" onClick={() => receive.mutate()} disabled={receive.isPending}>
                    {receive.isPending ? <Spinner /> : <PackageCheck className="size-4" aria-hidden />} Terima & buat faktur
                  </Button>
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button className="h-8" onClick={() => setReceiving(true)}>
                <Truck className="size-4" aria-hidden /> Terima barang
              </Button>
              <Button variant="ghost" className="h-8" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Batalkan
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// --- Penerimaan barang (GRN) --------------------------------------------------

function ReceiptsCard({ receipts, loading }: { receipts: { id: string; grnNo: string; poNo: string; receiptDate: string; purchaseNo: string | null; note: string | null }[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader title="3. Penerimaan barang (GRN)" description="Riwayat penerimaan — tiap penerimaan otomatis menjadi faktur pembelian & menambah stok." />
      <CardBody>
        {loading ? (
          <Spinner />
        ) : receipts.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada penerimaan barang.</p>
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <span className="font-mono text-xs">{r.grnNo}</span>
                <span className="text-xs text-slate-400">dari {r.poNo}</span>
                <span className="text-slate-500 dark:text-slate-400">{r.receiptDate}</span>
                {r.purchaseNo ? <Badge tone="green">faktur {r.purchaseNo}</Badge> : null}
                {r.note ? <span className="text-xs text-slate-400">“{r.note}”</span> : null}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

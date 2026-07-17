import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, PackageOpen } from "lucide-react";
import { useState } from "react";
import { api, downloadCsv, formatDate, formatIDR } from "../api/client";
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

const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";

type ProductRow = { id: string; sku: string; name: string; sell_price: number; buy_price: number; track_expiry: number };
type WarehouseRow = { id: string; name: string };

// ---------------------------------------------------------------------------
// Stok per gudang — diekstrak dari commerce.tsx pada Fase 12c (pola Fase 9d:
// commerce.tsx me-re-export StockPage sehingga main.tsx tidak berubah).
// ---------------------------------------------------------------------------

const REF_TYPE_LABELS: Record<string, string> = {
  purchase: "Pembelian",
  sale: "Penjualan",
  adjustment: "Penyesuaian",
};

function StockCard({ productId, warehouseId, title }: { productId: string; warehouseId: string; title: string }) {
  const { tenant } = useWorkspace();
  const query = useQuery({
    queryKey: ["stock-card", tenant.tenantId, productId, warehouseId],
    queryFn: () => api.stockCard(tenant.tenantId, productId, warehouseId),
  });

  return (
    <Card>
      <CardHeader title={`Kartu stok — ${title}`} description="Riwayat mutasi dengan saldo berjalan." />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Waktu</th>
                  <th className="pb-2 pr-4 font-medium">Jenis</th>
                  <th className="pb-2 pr-4 text-right font-medium">Masuk/Keluar</th>
                  <th className="pb-2 pr-4 text-right font-medium">Biaya Satuan</th>
                  <th className="pb-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="border-b border-slate-100 py-2 pr-4 dark:border-slate-800/60">{formatDate(r.date)}</td>
                    <td className="border-b border-slate-100 py-2 pr-4 dark:border-slate-800/60">
                      {REF_TYPE_LABELS[r.refType] ?? r.refType}
                    </td>
                    <td
                      className={`border-b border-slate-100 py-2 pr-4 text-right tabular-nums dark:border-slate-800/60 ${
                        r.qty >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {r.qty >= 0 ? `+${r.qty}` : r.qty}
                    </td>
                    <td className="border-b border-slate-100 py-2 pr-4 text-right tabular-nums dark:border-slate-800/60">
                      {formatIDR(r.unitCost)}
                    </td>
                    <td className="border-b border-slate-100 py-2 text-right font-medium tabular-nums dark:border-slate-800/60">
                      {r.balance}
                    </td>
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

function StockAdjustmentForm() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [physicalQty, setPhysicalQty] = useState("");
  const [note, setNote] = useState("");

  const productsQuery = useQuery({
    queryKey: ["products", tenant.tenantId],
    queryFn: () => api.listItems<ProductRow>(tenant.tenantId, "products"),
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses"),
  });

  const adjust = useMutation({
    mutationFn: () =>
      api.adjustStock(tenant.tenantId, {
        productId,
        warehouseId: warehouseId || (warehousesQuery.data?.items[0] as WarehouseRow | undefined)?.id || "",
        physicalQty: Number(physicalQty),
        note: note || undefined,
      }),
    onSuccess: (res) => {
      toast(
        "success",
        `Stok disesuaikan (${res.delta > 0 ? "+" : ""}${res.delta}${res.entryNo ? `, jurnal ${res.entryNo}` : ""}).`,
      );
      setPhysicalQty("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["stock-card", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <Card>
      <CardHeader
        title="Penyesuaian stok (opname)"
        description="Samakan stok sistem dengan hasil hitung fisik — selisih nilainya otomatis dijurnal ke Beban Operasional Lain."
      />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_8rem_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="adj-product">Produk</Label>
            <Select id="adj-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">— pilih produk —</option>
              {((productsQuery.data?.items ?? []) as ProductRow[]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="adj-wh">Gudang</Label>
            <Select id="adj-wh" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {((warehousesQuery.data?.items ?? []) as WarehouseRow[]).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="adj-qty">Qty fisik</Label>
            <Input
              id="adj-qty"
              type="number"
              min={0}
              value={physicalQty}
              onChange={(e) => setPhysicalQty(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adj-note">Catatan</Label>
            <Input id="adj-note" placeholder="opsional" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button onClick={() => adjust.mutate()} disabled={!productId || physicalQty === "" || adjust.isPending}>
            {adjust.isPending ? <Spinner /> : null} Sesuaikan
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function StockTransferForm() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [qty, setQty] = useState("");

  const productsQuery = useQuery({
    queryKey: ["products", tenant.tenantId],
    queryFn: () => api.listItems<ProductRow>(tenant.tenantId, "products"),
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses"),
  });
  const warehouses = (warehousesQuery.data?.items ?? []) as WarehouseRow[];

  const transfer = useMutation({
    mutationFn: () =>
      api.transferStock(tenant.tenantId, {
        productId,
        fromWarehouseId: fromWh || warehouses[0]?.id || "",
        toWarehouseId: toWh,
        qty: Number(qty),
      }),
    onSuccess: (res) => {
      toast("success", `Transfer ${res.qty} unit berhasil (nilai ${formatIDR(res.value)}).`);
      setQty("");
      queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  if (warehouses.length < 2) return null;

  return (
    <Card>
      <CardHeader title="Transfer antar gudang" description="Nilai persediaan berpindah pada biaya rata-rata — tanpa jurnal." />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-[1fr_11rem_11rem_7rem_auto] sm:items-end">
          <div>
            <Label htmlFor="tr-product">Produk</Label>
            <Select id="tr-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">— pilih produk —</option>
              {((productsQuery.data?.items ?? []) as ProductRow[]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-from">Dari gudang</Label>
            <Select id="tr-from" value={fromWh} onChange={(e) => setFromWh(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-to">Ke gudang</Label>
            <Select id="tr-to" value={toWh} onChange={(e) => setToWh(e.target.value)}>
              <option value="">— pilih —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-qty">Qty</Label>
            <Input id="tr-qty" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <Button onClick={() => transfer.mutate()} disabled={!productId || !toWh || !qty || transfer.isPending}>
            {transfer.isPending ? <Spinner /> : null} Transfer
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/** Daftar lot aktif urut FEFO dengan badge kedaluwarsa (merah lewat, kuning ≤30 hari). */
function LotsCard() {
  const { tenant } = useWorkspace();
  const query = useQuery({
    queryKey: ["stock-lots", tenant.tenantId],
    queryFn: () => api.stockLots(tenant.tenantId),
  });
  const lots = query.data?.lots ?? [];
  if (query.isLoading || lots.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Lot & kedaluwarsa"
        description="Lot aktif urut kedaluwarsa terdekat — penjualan mengambil lot paling awal kedaluwarsa lebih dulu (FEFO)."
      />
      <CardBody>
        {(query.data?.expiringSoon ?? 0) > 0 ? (
          <Alert tone="error">
            {query.data!.expiringSoon} lot kedaluwarsa dalam ≤ 30 hari — prioritaskan penjualannya atau tarik dari rak.
          </Alert>
        ) : null}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className={th}>SKU</th>
                <th className={th}>Produk</th>
                <th className={th}>Gudang</th>
                <th className={th}>Lot</th>
                <th className={th}>Kedaluwarsa</th>
                <th className={`${th} text-right`}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id}>
                  <td className="border-b border-slate-100 py-2.5 pr-4 font-mono text-xs dark:border-slate-800/60">
                    {l.sku}
                  </td>
                  <td className="border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60">{l.productName}</td>
                  <td className="border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60">{l.warehouseName}</td>
                  <td className="border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60">{l.lotNo ?? "—"}</td>
                  <td className="border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60">
                    {l.expiryDate ? (
                      <span className="inline-flex items-center gap-2">
                        {formatDate(l.expiryDate)}
                        {l.daysToExpiry !== null && l.daysToExpiry < 0 ? (
                          <Badge tone="red">kedaluwarsa</Badge>
                        ) : l.daysToExpiry !== null && l.daysToExpiry <= 30 ? (
                          <Badge tone="amber">{l.daysToExpiry} hari lagi</Badge>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="border-b border-slate-100 py-2.5 text-right tabular-nums dark:border-slate-800/60">
                    {l.qty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Titik pesan otomatis (Fase 7c): produk dengan stok ≤ minimum → usulan qty beli.
 * Sekali klik membuat Permintaan Pembelian (PR) yang diteruskan ke modul Pengadaan.
 */
function ReorderCard() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["reorder", tenant.tenantId], queryFn: () => api.reorderSuggestions(tenant.tenantId) });
  const suggestions = query.data?.suggestions ?? [];

  const createPr = useMutation({
    mutationFn: () =>
      api.createRequisition(tenant.tenantId, {
        note: "Usulan otomatis dari titik pesan (stok menipis)",
        lines: suggestions.map((s) => ({ productId: s.productId, qty: s.suggestedQty, note: `Stok ${s.qty} ≤ minimum ${s.minStock}` })),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["requisitions", tenant.tenantId] });
      toast("success", `Permintaan pembelian ${r.reqNo} dibuat — lanjutkan di menu Pengadaan.`);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  if (query.isLoading || suggestions.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title="Usulan pembelian otomatis"
        description="Produk dengan total stok di bawah/di ambang minimum. Buat permintaan pembelian sekali klik."
        action={
          <Button className="h-9" onClick={() => createPr.mutate()} disabled={createPr.isPending}>
            {createPr.isPending ? <Spinner /> : null} Buat permintaan pembelian
          </Button>
        }
      />
      <CardBody>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className={th}>SKU</th>
                <th className={th}>Produk</th>
                <th className={`${th} text-right`}>Stok</th>
                <th className={`${th} text-right`}>Minimum</th>
                <th className={`${th} text-right`}>Usulan beli</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.productId}>
                  <td className="border-b border-slate-100 py-2.5 pr-4 font-mono text-xs dark:border-slate-800/60">{s.sku}</td>
                  <td className="border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60">{s.name}</td>
                  <td className="border-b border-slate-100 py-2.5 pr-4 text-right tabular-nums dark:border-slate-800/60">
                    <Badge tone={s.qty <= 0 ? "red" : "amber"}>{s.qty} {s.unit}</Badge>
                  </td>
                  <td className="border-b border-slate-100 py-2.5 pr-4 text-right tabular-nums dark:border-slate-800/60">{s.minStock}</td>
                  <td className="border-b border-slate-100 py-2.5 pr-4 text-right font-medium tabular-nums dark:border-slate-800/60">{s.suggestedQty} {s.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

export function StockPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const query = useQuery({ queryKey: ["stock", tenant.tenantId], queryFn: () => api.stock(tenant.tenantId) });
  const [selected, setSelected] = useState<{ productId: string; warehouseId: string; title: string } | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const [threshold, setThreshold] = useState("10");

  const allLevels = query.data?.levels ?? [];
  const lowLimit = Number(threshold) || 0;
  const levels = lowOnly ? allLevels.filter((l) => l.qty <= lowLimit) : allLevels;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stok</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Level stok per gudang beserta nilai persediaan, kartu stok, transfer antar gudang, dan opname.</p>
      {isAdmin ? <ReorderCard /> : null}
      {isAdmin ? <StockAdjustmentForm /> : null}
      {isAdmin ? <StockTransferForm /> : null}
      <LotsCard />
      <Card>
        <CardHeader
          title="Level stok per gudang"
          description="Nilai persediaan memakai metode biaya rata-rata bergerak (moving average)."
          action={
            allLevels.length > 0 ? (
              <Button
                variant="secondary"
                className="h-9"
                onClick={() =>
                  downloadCsv(
                    "stok.csv",
                    ["SKU", "Produk", "Gudang", "Qty", "Satuan", "Biaya rata-rata", "Nilai"],
                    levels.map((l) => [l.sku, l.productName, l.warehouseName, l.qty, l.unit, l.avgCost, l.value]),
                  )
                }
              >
                <Download className="size-4" aria-hidden /> Ekspor CSV
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {allLevels.length > 0 ? (
            <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lowOnly}
                onChange={(e) => setLowOnly(e.target.checked)}
                className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Hanya tampilkan stok menipis (qty ≤
              <input
                type="number"
                min={0}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-16 rounded border border-slate-300 px-2 py-0.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                aria-label="Ambang stok menipis"
              />
              )
            </label>
          ) : null}
          {query.isLoading ? (
            <Spinner />
          ) : allLevels.length === 0 ? (
            <EmptyState
              icon={<PackageOpen className="size-6" aria-hidden />}
              title="Belum ada stok"
              description="Catat faktur pembelian untuk mengisi stok — level per gudang akan tampil di sini."
            />
          ) : levels.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada produk dengan stok ≤ {lowLimit}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>SKU</th>
                    <th className={th}>Produk</th>
                    <th className={th}>Gudang</th>
                    <th className={`${th} text-right`}>Qty</th>
                    <th className={`${th} text-right`}>Biaya Rata-rata</th>
                    <th className={`${th} text-right`}>Nilai</th>
                    <th className={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((l) => (
                    <tr key={`${l.productId}-${l.warehouseId}`}>
                      <td className="border-b border-slate-100 py-2.5 pr-4 font-mono text-xs dark:border-slate-800/60">
                        {l.sku}
                      </td>
                      <td className="border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60">{l.productName}</td>
                      <td className="border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60">{l.warehouseName}</td>
                      <td className="border-b border-slate-100 py-2.5 pr-4 text-right tabular-nums dark:border-slate-800/60">
                        {l.qty} {l.unit}
                      </td>
                      <td className="border-b border-slate-100 py-2.5 pr-4 text-right tabular-nums dark:border-slate-800/60">
                        {formatIDR(l.avgCost)}
                      </td>
                      <td className="border-b border-slate-100 py-2.5 text-right font-medium tabular-nums dark:border-slate-800/60">
                        {formatIDR(l.value)}
                      </td>
                      <td className="border-b border-slate-100 py-2.5 text-right dark:border-slate-800/60">
                        <Button
                          variant="ghost"
                          className="h-8"
                          onClick={() =>
                            setSelected({
                              productId: l.productId,
                              warehouseId: l.warehouseId,
                              title: `${l.productName} @ ${l.warehouseName}`,
                            })
                          }
                        >
                          Kartu
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2.5 pr-4" colSpan={5}>
                      {lowOnly ? "Total nilai (terfilter)" : "Total nilai persediaan"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatIDR(lowOnly ? levels.reduce((s, l) => s + l.value, 0) : query.data!.totalValue)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {selected ? (
        <StockCard productId={selected.productId} warehouseId={selected.warehouseId} title={selected.title} />
      ) : null}
    </div>
  );
}

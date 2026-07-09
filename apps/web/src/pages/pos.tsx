import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, formatIDR } from "../api/client";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Input, Label, Select, Spinner, useToast } from "../components/ui";
import { useWorkspace } from "./app";
import { useDebounced } from "./commerce";

type ProductRow = { id: string; sku: string; name: string; unit: string; sell_price: number };
type WarehouseRow = { id: string; name: string };
type CartItem = { productId: string; name: string; unitPrice: number; qty: number; discountPct: number };

/** Nilai item setelah diskon — meniru pembulatan backend. */
function itemAmount(i: CartItem): number {
  return Math.round(i.qty * i.unitPrice * (1 - i.discountPct / 100));
}

/** Struk sederhana dicetak lewat jendela print browser (kompatibel printer thermal). */
function printReceipt(opts: {
  companyName: string;
  logoDataUrl?: string;
  invoiceNo: string;
  items: CartItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  cashReceived: number;
  change: number;
}) {
  const rows = opts.items
    .map(
      (i) =>
        `<tr><td>${i.name} x${i.qty}${i.discountPct > 0 ? ` (-${i.discountPct}%)` : ""}</td><td style="text-align:right">${itemAmount(i).toLocaleString("id-ID")}</td></tr>`,
    )
    .join("");
  const w = window.open("", "_blank", "width=300,height=600");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${opts.invoiceNo}</title><style>
    body{font-family:monospace;font-size:12px;width:260px;margin:0 auto;padding:8px}
    table{width:100%;border-collapse:collapse} td{padding:1px 0}
    .c{text-align:center} .b{font-weight:bold} hr{border:none;border-top:1px dashed #000}
  </style></head><body>
    ${opts.logoDataUrl ? `<div class="c"><img src="${opts.logoDataUrl}" alt="" style="max-height:48px;max-width:160px"/></div>` : ""}
    <div class="c b">${opts.companyName}</div>
    <div class="c">${opts.invoiceNo} · ${new Date().toLocaleString("id-ID")}</div>
    <hr/><table>${rows}</table><hr/>
    <table>
      <tr><td>Subtotal</td><td style="text-align:right">${opts.subtotal.toLocaleString("id-ID")}</td></tr>
      ${opts.taxAmount > 0 ? `<tr><td>PPN ${opts.taxRate}%</td><td style="text-align:right">${opts.taxAmount.toLocaleString("id-ID")}</td></tr>` : ""}
      <tr class="b"><td>TOTAL</td><td style="text-align:right">${opts.total.toLocaleString("id-ID")}</td></tr>
      <tr><td>Tunai</td><td style="text-align:right">${opts.cashReceived.toLocaleString("id-ID")}</td></tr>
      <tr><td>Kembalian</td><td style="text-align:right">${opts.change.toLocaleString("id-ID")}</td></tr>
    </table><hr/>
    <div class="c">Terima kasih 🙏</div>
    <script>window.print();</script>
  </body></html>`);
  w.document.close();
}

export function PosPage() {
  const { me, tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const shiftQuery = useQuery({ queryKey: ["pos-shift", tenant.tenantId], queryFn: () => api.posShift(tenant.tenantId) });
  const [search, setSearch] = useState("");
  const posQ = useDebounced(search);
  // Pencarian di sisi server: grid hanya memuat 100 produk yang cocok,
  // sehingga katalog ribuan produk tetap ringan.
  const productsQuery = useQuery({
    queryKey: ["products", tenant.tenantId, posQ],
    queryFn: () => api.listItems<ProductRow>(tenant.tenantId, "products", { q: posQ, limit: 100 }),
    placeholderData: (prev) => prev,
  });
  const warehousesQuery = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses"),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings", tenant.tenantId],
    queryFn: () => api.settings(tenant.tenantId),
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [cashReceived, setCashReceived] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [openWh, setOpenWh] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closing, setClosing] = useState(false);

  const invalidateShift = () => queryClient.invalidateQueries({ queryKey: ["pos-shift", tenant.tenantId] });

  const openShift = useMutation({
    mutationFn: () =>
      api.posOpenShift(tenant.tenantId, {
        warehouseId: openWh || ((warehousesQuery.data?.items[0] as WarehouseRow | undefined)?.id ?? ""),
        openingCash: Number(openingCash) || 0,
      }),
    onSuccess: (res) => {
      toast("success", `Shift ${res.shiftNo} dibuka.`);
      invalidateShift();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const sale = useMutation({
    mutationFn: () =>
      api.posSale(tenant.tenantId, {
        shiftId: shiftQuery.data!.shift!.id,
        taxRate,
        cashReceived: Number(cashReceived) || 0,
        lines: cart.map((i) => ({
          productId: i.productId,
          qty: i.qty,
          unitPrice: i.unitPrice,
          ...(i.discountPct > 0 ? { discountPct: i.discountPct } : {}),
        })),
      }),
    onSuccess: (res) => {
      toast("success", `${res.invoiceNo} — kembalian ${formatIDR(res.change)}`);
      printReceipt({
        companyName: tenant.tenantName,
        logoDataUrl: settingsQuery.data?.settings.logo_data_url,
        invoiceNo: res.invoiceNo,
        items: cart,
        subtotal,
        taxRate,
        taxAmount,
        total,
        cashReceived: Number(cashReceived) || 0,
        change: res.change,
      });
      setCart([]);
      setCashReceived("");
      invalidateShift();
      queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["invoices", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const closeShift = useMutation({
    mutationFn: () => api.posCloseShift(tenant.tenantId, shiftQuery.data!.shift!.id, Number(closingCash) || 0),
    onSuccess: (res) => {
      toast(
        res.difference === 0 ? "success" : "error",
        `Shift ditutup. Seharusnya ${formatIDR(res.expected)}, fisik ${formatIDR(res.closingCash)} (selisih ${formatIDR(res.difference)}).`,
      );
      setClosing(false);
      setClosingCash("");
      invalidateShift();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const products = (productsQuery.data?.items ?? []) as ProductRow[];

  const subtotal = useMemo(() => cart.reduce((s, i) => s + itemAmount(i), 0), [cart]);
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const total = subtotal + taxAmount;
  const change = (Number(cashReceived) || 0) - total;

  function addToCart(p: ProductRow) {
    setCart((c) => {
      const existing = c.find((i) => i.productId === p.id);
      if (existing) return c.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { productId: p.id, name: p.name, unitPrice: p.sell_price, qty: 1, discountPct: 0 }];
    });
  }

  function setQty(productId: string, qty: number) {
    setCart((c) => (qty <= 0 ? c.filter((i) => i.productId !== productId) : c.map((i) => (i.productId === productId ? { ...i, qty } : i))));
  }

  function setDiscount(productId: string, discountPct: number) {
    const disc = Math.min(Math.max(discountPct, 0), 100);
    setCart((c) => c.map((i) => (i.productId === productId ? { ...i, discountPct: disc } : i)));
  }

  if (!isAdmin) {
    return (
      <div className="p-2">
        <Alert tone="info">Halaman kasir hanya untuk Owner/Admin.</Alert>
      </div>
    );
  }
  if (shiftQuery.isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const shift = shiftQuery.data?.shift ?? null;

  // ---- Belum ada shift terbuka: form buka shift -----------------------------
  if (!shift) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Kasir (POS)</h1>
        <Card>
          <CardHeader title="Buka shift" description="Mulai sesi kasir dengan mencatat kas awal di laci." />
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="pos-wh">Gudang</Label>
              <Select id="pos-wh" value={openWh} onChange={(e) => setOpenWh(e.target.value)}>
                {((warehousesQuery.data?.items ?? []) as WarehouseRow[]).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="pos-opening">Kas awal (Rp)</Label>
              <Input
                id="pos-opening"
                type="number"
                min={0}
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="500000"
              />
            </div>
            <Button className="w-full" onClick={() => openShift.mutate()} disabled={openShift.isPending}>
              {openShift.isPending ? <Spinner /> : null} Buka Shift
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ---- Shift terbuka: layar kasir -------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Kasir (POS)</h1>
          <Badge tone="brand">{shift.shiftNo}</Badge>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {shift.salesCount} transaksi · {formatIDR(shift.cashSalesTotal)}
          </span>
        </div>
        <Button variant="secondary" onClick={() => setClosing((o) => !o)}>
          Tutup Shift
        </Button>
      </div>

      {closing ? (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="pos-closing">Kas fisik di laci (Rp)</Label>
              <Input
                id="pos-closing"
                type="number"
                min={0}
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
              />
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Seharusnya: <strong className="tabular-nums">{formatIDR(shift.expectedCash)}</strong>
            </div>
            <Button variant="danger" onClick={() => closeShift.mutate()} disabled={closeShift.isPending || closingCash === ""}>
              {closeShift.isPending ? <Spinner /> : null} Konfirmasi Tutup
            </Button>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        {/* Grid produk */}
        <Card>
          <CardBody className="space-y-3">
            <Input placeholder="Cari produk / SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="rounded-lg border border-slate-200 p-3 text-left hover:border-brand-500 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-900/20"
                >
                  <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
                  <div className="mt-1 text-xs text-slate-400">{p.sku}</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums">{formatIDR(p.sell_price)}</div>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Keranjang */}
        <Card>
          <CardHeader title="Keranjang" />
          <CardBody className="space-y-3">
            {cart.length === 0 ? (
              <p className="text-sm text-slate-400">Klik produk untuk menambahkan.</p>
            ) : (
              cart.map((i) => (
                <div key={i.productId} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{i.name}</span>
                  <button
                    className="size-7 rounded border border-slate-300 dark:border-slate-700"
                    onClick={() => setQty(i.productId, i.qty - 1)}
                  >
                    −
                  </button>
                  <span className="w-6 text-center tabular-nums">{i.qty}</span>
                  <button
                    className="size-7 rounded border border-slate-300 dark:border-slate-700"
                    onClick={() => setQty(i.productId, i.qty + 1)}
                  >
                    +
                  </button>
                  <input
                    aria-label={`Diskon % ${i.name}`}
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0%"
                    className="w-14 rounded border border-slate-300 bg-transparent px-1 py-0.5 text-right text-sm dark:border-slate-700"
                    value={i.discountPct || ""}
                    onChange={(e) => setDiscount(i.productId, Number(e.target.value) || 0)}
                  />
                  <span className="w-24 text-right tabular-nums">{formatIDR(itemAmount(i))}</span>
                </div>
              ))
            )}

            <div className="border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatIDR(subtotal)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>PPN</span>
                <select
                  aria-label="PPN"
                  className="rounded border border-slate-300 bg-transparent px-1 py-0.5 text-sm dark:border-slate-700"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                >
                  <option value={0}>0%</option>
                  <option value={11}>11%</option>
                  <option value={12}>12%</option>
                </select>
                <span className="tabular-nums">{formatIDR(taxAmount)}</span>
              </div>
              <div className="mt-2 flex justify-between text-lg font-bold">
                <span>TOTAL</span>
                <span className="tabular-nums">{formatIDR(total)}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="pos-cash">Tunai diterima (Rp)</Label>
              <Input
                id="pos-cash"
                type="number"
                min={0}
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                placeholder={String(total)}
              />
              {change >= 0 && cashReceived !== "" ? (
                <p className="mt-1 text-sm">
                  Kembalian: <strong className="tabular-nums">{formatIDR(change)}</strong>
                </p>
              ) : null}
            </div>

            <Button
              className="h-12 w-full text-base"
              onClick={() => sale.mutate()}
              disabled={cart.length === 0 || change < 0 || sale.isPending}
            >
              {sale.isPending ? <Spinner /> : null} Bayar & Cetak Struk
            </Button>
          </CardBody>
        </Card>
      </div>
      <span className="hidden">{me.user.name}</span>
    </div>
  );
}

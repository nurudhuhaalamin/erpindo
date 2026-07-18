import { POS_PAYMENT_METHOD_LABELS, POS_PAYMENT_METHODS, type PosPaymentMethod } from "@erpindo/shared";
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

/**
 * Panel Struk & Refund (Fase 10c): struk POS lunas tidak bisa dibatalkan —
 * koreksinya refund tunai dari laci shift yang sedang terbuka.
 */
/**
 * Rekap penjualan hari ini (Fase 12e): per jam, per shift, per metode — kartu
 * lipat agar layar kasir tetap ringkas; data baru diambil saat dibuka.
 */
function RecapCard({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["pos-recap", tenantId],
    queryFn: () => api.posRecap(tenantId),
    enabled: open,
  });
  // Jam dari API dalam UTC → konversi ke jam lokal perangkat kasir.
  const localHour = (hUtc: number) => new Date(Date.UTC(2000, 0, 1, hUtc)).getHours();
  const recap = query.data;

  return (
    <Card>
      <CardHeader
        title="Rekap hari ini"
        description="Penjualan POS per jam, per shift, dan per metode pembayaran."
        action={
          <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
            {open ? "Tutup" : "Lihat rekap"}
          </Button>
        }
      />
      {open ? (
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : !recap || recap.salesCount === 0 ? (
            <p className="py-2 text-center text-sm text-slate-500 dark:text-slate-400">
              Belum ada penjualan POS hari ini.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Per jam ({recap.salesCount} transaksi · {formatIDR(recap.salesTotal)})
                </div>
                <ul className="space-y-1 text-sm">
                  {recap.byHour.map((h) => (
                    <li key={h.hourUtc} className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {String(localHour(h.hourUtc)).padStart(2, "0")}:00 · {h.count} trx
                      </span>
                      <span className="tabular-nums">{formatIDR(h.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Per shift</div>
                <ul className="space-y-1 text-sm">
                  {recap.byShift.map((s) => (
                    <li key={s.shiftNo} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate text-slate-500 dark:text-slate-400">
                        {s.shiftNo} {s.status === "open" ? "(buka)" : ""} · {s.count} trx
                      </span>
                      <span className="tabular-nums">{formatIDR(s.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Per metode</div>
                <ul className="space-y-1 text-sm">
                  {recap.byMethod.map((m) => (
                    <li key={m.method} className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {POS_PAYMENT_METHOD_LABELS[m.method as PosPaymentMethod] ?? m.method}
                      </span>
                      <span className="tabular-nums">{formatIDR(m.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardBody>
      ) : null}
    </Card>
  );
}

function RefundPanel({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [qty, setQtyMap] = useState<Record<string, string>>({});
  const receiptsQuery = useQuery({
    queryKey: ["pos-receipts", tenantId, q],
    queryFn: () => api.posReceipts(tenantId, q),
    placeholderData: (prev) => prev,
  });
  const refund = useMutation({
    mutationFn: (invoiceId: string) =>
      api.posRefund(tenantId, {
        invoiceId,
        lines: Object.entries(qty)
          .filter(([, v]) => Number(v) > 0)
          .map(([productId, v]) => ({ productId, qty: Number(v) })),
      }),
    onSuccess: (res) => {
      toast("success", `Refund ${res.returnNo} — ${formatIDR(res.total)} keluar dari laci (jurnal ${res.journalNo}).`);
      setActiveId(null);
      setQtyMap({});
      receiptsQuery.refetch();
      onDone();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const receipts = receiptsQuery.data?.receipts ?? [];
  return (
    <Card>
      <CardHeader
        title="Struk & Refund"
        description="Pilih struk, isi qty barang yang dikembalikan — uang tunai keluar dari laci shift ini."
      />
      <CardBody className="space-y-2">
        <Input placeholder="Cari nomor struk…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {receiptsQuery.isLoading ? (
          <Spinner />
        ) : receipts.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada struk POS.</p>
        ) : (
          receipts.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-xs font-semibold">{r.invoiceNo}</span>
                <span className="text-slate-500 dark:text-slate-400">{r.invoiceDate}</span>
                <span className="tabular-nums font-medium">{formatIDR(r.total)}</span>
                {r.returnedAmount > 0 ? <Badge tone="amber">refund {formatIDR(r.returnedAmount)}</Badge> : null}
                <Button
                  variant="ghost"
                  className="ml-auto h-7"
                  onClick={() => {
                    setActiveId((cur) => (cur === r.id ? null : r.id));
                    setQtyMap({});
                  }}
                >
                  {activeId === r.id ? "Tutup" : "Refund"}
                </Button>
              </div>
              {activeId === r.id ? (
                <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800/60">
                  {r.lines.map((l) => (
                    <div key={l.productId} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate">
                        {l.productName}{" "}
                        <span className="text-xs text-slate-400">(sisa {l.qtyReturnable} dari {l.qty})</span>
                      </span>
                      {/* w-full bawaan Input dikalahkan pembungkus berlebar tetap. */}
                      <span className="w-20 shrink-0">
                        <Input
                          aria-label={`Qty refund ${l.productName}`}
                          type="number"
                          min={0}
                          max={l.qtyReturnable}
                          className="h-8"
                          placeholder="0"
                          disabled={l.qtyReturnable === 0}
                          value={qty[l.productId] ?? ""}
                          onChange={(e) => setQtyMap((m) => ({ ...m, [l.productId]: e.target.value }))}
                        />
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1">
                    <Button
                      className="h-8"
                      onClick={() => refund.mutate(r.id)}
                      disabled={refund.isPending || !Object.values(qty).some((v) => Number(v) > 0)}
                    >
                      {refund.isPending ? <Spinner /> : null} Proses Refund
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
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
  const [tenders, setTenders] = useState<{ method: PosPaymentMethod; amount: string }[]>([]);
  const [openingCash, setOpeningCash] = useState("");
  const [openWh, setOpenWh] = useState("");
  const [closingCash, setClosingCash] = useState("");
  const [closing, setClosing] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);

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

  const heldQuery = useQuery({
    queryKey: ["pos-held", tenant.tenantId, shiftQuery.data?.shift?.id],
    queryFn: () => api.posHeld(tenant.tenantId, shiftQuery.data!.shift!.id),
    enabled: Boolean(shiftQuery.data?.shift?.id),
  });

  const sale = useMutation({
    mutationFn: () =>
      api.posSale(tenant.tenantId, {
        shiftId: shiftQuery.data!.shift!.id,
        taxRate,
        payments: tenders.filter((t) => Number(t.amount) > 0).map((t) => ({ method: t.method, amount: Number(t.amount) })),
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
        cashReceived: tenders.filter((t) => t.method === "tunai").reduce((s, t) => s + (Number(t.amount) || 0), 0),
        change: res.change,
      });
      setCart([]);
      setTenders([]);
      invalidateShift();
      queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["invoices", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const hold = useMutation({
    mutationFn: () =>
      api.posHold(tenant.tenantId, {
        shiftId: shiftQuery.data!.shift!.id,
        label: holdLabel.trim() || `Tahan ${new Date().toLocaleTimeString("id-ID")}`,
        cart: cart.map((i) => ({ productId: i.productId, qty: i.qty, unitPrice: i.unitPrice, ...(i.discountPct > 0 ? { discountPct: i.discountPct } : {}) })),
        taxRate,
      }),
    onSuccess: () => {
      toast("success", "Transaksi ditahan.");
      setCart([]);
      setTenders([]);
      setHoldLabel("");
      heldQuery.refetch();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const deleteHeld = useMutation({
    mutationFn: (id: string) => api.posDeleteHeld(tenant.tenantId, id),
    onSuccess: () => heldQuery.refetch(),
    onError: (err) => toast("error", (err as Error).message),
  });

  function recallHeld(h: { id: string; cart: { productId: string; qty: number; unitPrice: number; discountPct?: number }[]; taxRate: number }) {
    const names = new Map((productsQuery.data?.items ?? []).map((p) => [(p as ProductRow).id, (p as ProductRow).name]));
    setCart(h.cart.map((c) => ({ productId: c.productId, name: names.get(c.productId) ?? "Produk", unitPrice: c.unitPrice, qty: c.qty, discountPct: c.discountPct ?? 0 })));
    setTaxRate(h.taxRate);
    deleteHeld.mutate(h.id);
  }

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
  const tenderedTotal = tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const cashTendered = tenders.filter((t) => t.method === "tunai").reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const remaining = Math.max(0, total - tenderedTotal);
  const change = Math.max(0, tenderedTotal - total);
  // Boleh bayar bila total tertutup & kembalian tak melebihi tunai yang diterima.
  const canPay = cart.length > 0 && tenderedTotal >= total && change <= cashTendered;

  function addTender(method: PosPaymentMethod) {
    // Prefill sisa yang harus dibayar (untuk tunai boleh diubah lebih besar untuk kembalian).
    setTenders((t) => [...t, { method, amount: remaining > 0 ? String(remaining) : "" }]);
  }
  /**
   * Tombol nominal cepat (Fase 12e): "Uang pas" mengisi tender tunai persis
   * sebesar sisa di luar metode non-tunai; +50rb/+100rb menambah nominal tunai
   * (pelanggan menyerahkan lembaran uang).
   */
  function quickCash(add?: number) {
    setTenders((t) => {
      const nonCash = t.filter((x) => x.method !== "tunai").reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const idx = t.findIndex((x) => x.method === "tunai");
      const cur = idx >= 0 ? Number(t[idx]!.amount) || 0 : 0;
      const amount = add === undefined ? Math.max(total - nonCash, 0) : cur + add;
      const next = { method: "tunai" as PosPaymentMethod, amount: String(amount) };
      return idx >= 0 ? t.map((x, i) => (i === idx ? next : x)) : [...t, next];
    });
  }
  function setTenderAmount(idx: number, amount: string) {
    setTenders((t) => t.map((x, i) => (i === idx ? { ...x, amount } : x)));
  }
  function removeTender(idx: number) {
    setTenders((t) => t.filter((_, i) => i !== idx));
  }

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
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setRefundOpen((o) => !o)}>
            Struk &amp; Refund
          </Button>
          <Button variant="secondary" onClick={() => setClosing((o) => !o)}>
            Tutup Shift
          </Button>
        </div>
      </div>

      {refundOpen ? <RefundPanel tenantId={tenant.tenantId} onDone={invalidateShift} /> : null}

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

            {/* Pembayaran multi-metode */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {POS_PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => addTender(m)}
                    disabled={cart.length === 0}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:border-brand-400 hover:bg-brand-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-brand-950/30"
                  >
                    + {POS_PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
              {tenders.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-20 text-xs text-slate-500 dark:text-slate-400">{POS_PAYMENT_METHOD_LABELS[t.method]}</span>
                  <Input aria-label={`Nominal ${POS_PAYMENT_METHOD_LABELS[t.method]}`} type="number" min={0} className="flex-1" value={t.amount} onChange={(e) => setTenderAmount(i, e.target.value)} />
                  <button type="button" aria-label="Hapus pembayaran" className="text-slate-400 hover:text-red-600" onClick={() => removeTender(i)}>
                    ✕
                  </button>
                </div>
              ))}
              {/* Nominal cepat tunai (Fase 12e) */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => quickCash()}
                  disabled={cart.length === 0}
                  className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Uang pas
                </button>
                {[50_000, 100_000].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => quickCash(n)}
                    disabled={cart.length === 0}
                    className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    +{n / 1000}rb
                  </button>
                ))}
              </div>
              <div className="flex items-baseline justify-between text-sm">
                {remaining > 0 ? (
                  <span className="text-amber-600 dark:text-amber-400">Sisa: {formatIDR(remaining)}</span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">Lunas</span>
                )}
                {change > 0 ? (
                  // Kembalian dibuat menonjol agar kasir tak salah hitung (Fase 12e).
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    Kembalian: <span className="tabular-nums">{formatIDR(change)}</span>
                  </span>
                ) : null}
              </div>
            </div>

            <Button className="h-12 w-full text-base" onClick={() => sale.mutate()} disabled={!canPay || sale.isPending}>
              {sale.isPending ? <Spinner /> : null} Bayar & Cetak Struk
            </Button>

            {/* Tahan transaksi */}
            <div className="flex items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              <Input aria-label="Nama tahan" placeholder="Nama tahan (opsional)" className="flex-1" value={holdLabel} onChange={(e) => setHoldLabel(e.target.value)} />
              <Button variant="secondary" className="h-9" onClick={() => hold.mutate()} disabled={cart.length === 0 || hold.isPending}>
                Tahan
              </Button>
            </div>
            {(heldQuery.data?.held ?? []).length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Transaksi ditahan</div>
                {(heldQuery.data?.held ?? []).map((h) => (
                  <div key={h.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800">
                    <span className="min-w-0 flex-1 truncate">{h.label}</span>
                    <span className="text-xs text-slate-400">{h.cart.length} item</span>
                    <Button variant="ghost" className="h-7" onClick={() => recallHeld(h)}>
                      Panggil
                    </Button>
                    <button type="button" aria-label="Hapus tahan" className="text-slate-400 hover:text-red-600" onClick={() => deleteHeld.mutate(h.id)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <RecapCard tenantId={tenant.tenantId} />

      <span className="hidden">{me.user.name}</span>
    </div>
  );
}

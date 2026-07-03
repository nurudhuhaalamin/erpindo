import type { ApiCommerceDoc } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, formatIDR } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";

type Mode = "sale" | "purchase";

const MODE_CFG = {
  sale: {
    title: "Penjualan",
    docLabel: "Faktur penjualan",
    contactLabel: "Pelanggan",
    contactTypes: ["customer", "both"],
    priceField: "sell_price" as const,
    queryKey: "invoices" as const,
    stockHint: "Stok berkurang otomatis; jurnal piutang, pendapatan, PPN & HPP dibuat otomatis.",
  },
  purchase: {
    title: "Pembelian",
    docLabel: "Faktur pembelian",
    contactLabel: "Pemasok",
    contactTypes: ["supplier", "both"],
    priceField: "buy_price" as const,
    queryKey: "purchases" as const,
    stockHint: "Stok bertambah otomatis (biaya rata-rata); jurnal persediaan, PPN & hutang dibuat otomatis.",
  },
};

type DraftLine = { productId: string; qty: string; unitPrice: string };
const emptyLine = (): DraftLine => ({ productId: "", qty: "1", unitPrice: "" });

type ProductRow = { id: string; sku: string; name: string; sell_price: number; buy_price: number };
type ContactRow = { id: string; name: string; type: string };
type WarehouseRow = { id: string; name: string };

export function CommercePage({ mode }: { mode: Mode }) {
  const cfg = MODE_CFG[mode];
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const docsQuery = useQuery({
    queryKey: [cfg.queryKey, tenant.tenantId],
    queryFn: () => (mode === "sale" ? api.invoices(tenant.tenantId) : api.purchases(tenant.tenantId)),
  });
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

  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taxRate, setTaxRate] = useState<0 | 11 | 12>(11);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: Parameters<typeof api.createInvoice>[1]) =>
      mode === "sale" ? api.createInvoice(tenant.tenantId, input) : api.createPurchase(tenant.tenantId, input),
    onSuccess: (res) => {
      toast("success", `${cfg.docLabel} ${res.docNo} diposting (${formatIDR(res.total)}).`);
      setLines([emptyLine()]);
      setError(null);
      queryClient.invalidateQueries({ queryKey: [cfg.queryKey, tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const products = (productsQuery.data?.items ?? []) as ProductRow[];
  const contacts = ((contactsQuery.data?.items ?? []) as ContactRow[]).filter((k) =>
    cfg.contactTypes.includes(k.type),
  );
  const warehouses = (warehousesQuery.data?.items ?? []) as WarehouseRow[];

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function pickProduct(i: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    setLine(i, {
      productId,
      unitPrice: product ? String(product[cfg.priceField] || "") : "",
    });
  }

  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const taxAmount = Math.round((subtotal * taxRate) / 100);

  function submit() {
    setError(null);
    create.mutate({
      contactId,
      invoiceDate: date,
      taxRate,
      warehouseId: warehouseId || warehouses[0]?.id || "",
      lines: lines
        .filter((l) => l.productId)
        .map((l) => ({ productId: l.productId, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0 })),
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{cfg.title}</h1>

      {isAdmin ? (
        <Card>
          <CardHeader title={`${cfg.docLabel} baru`} description={cfg.stockHint} />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="doc-contact">{cfg.contactLabel}</Label>
                <Select id="doc-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">— pilih —</option>
                  {contacts.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="doc-wh">Gudang</Label>
                <Select id="doc-wh" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="doc-date">Tanggal</Label>
                <Input id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="doc-tax">PPN</Label>
                <Select
                  id="doc-tax"
                  value={String(taxRate)}
                  onChange={(e) => setTaxRate(Number(e.target.value) as 0 | 11 | 12)}
                >
                  <option value="0">Tanpa PPN</option>
                  <option value="11">PPN 11%</option>
                  <option value="12">PPN 12%</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_10rem_10rem_2.5rem] sm:items-center">
                  <Select
                    aria-label={`Produk baris ${i + 1}`}
                    value={line.productId}
                    onChange={(e) => pickProduct(i, e.target.value)}
                  >
                    <option value="">— pilih produk —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`Qty baris ${i + 1}`}
                    type="number"
                    min={1}
                    value={line.qty}
                    onChange={(e) => setLine(i, { qty: e.target.value })}
                  />
                  <Input
                    aria-label={`Harga baris ${i + 1}`}
                    type="number"
                    min={0}
                    placeholder="Harga satuan"
                    value={line.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                  />
                  <div className="text-right text-sm tabular-nums">
                    {formatIDR((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Hapus baris ${i + 1}`}
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                + Tambah barang
              </Button>
              <div className="text-sm">
                Subtotal <strong className="tabular-nums">{formatIDR(subtotal)}</strong>
                {taxRate > 0 ? (
                  <>
                    {" "}
                    · PPN <strong className="tabular-nums">{formatIDR(taxAmount)}</strong>
                  </>
                ) : null}{" "}
                · Total <strong className="tabular-nums">{formatIDR(subtotal + taxAmount)}</strong>
              </div>
              <Button onClick={submit} disabled={create.isPending || !contactId || subtotal === 0}>
                {create.isPending ? <Spinner /> : null} Posting Faktur
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={`Daftar ${cfg.title.toLowerCase()}`} />
        <CardBody>
          {docsQuery.isLoading ? (
            <Spinner />
          ) : (docsQuery.data?.docs.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada {cfg.docLabel.toLowerCase()}.</p>
          ) : (
            <div className="space-y-3">
              {docsQuery.data!.docs.map((doc) => (
                <DocRow key={doc.id} doc={doc} mode={mode} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function DocRow({ doc, mode, isAdmin }: { doc: ApiCommerceDoc; mode: Mode; isAdmin: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const remaining = doc.total - doc.paidAmount;

  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
    enabled: payOpen,
  });
  const cashAccounts = (accountsQuery.data?.accounts ?? []).filter(
    (a) => !a.isArchived && a.type === "asset" && (a.code.startsWith("1-10") || a.code.startsWith("1-11")),
  );

  const [payAccount, setPayAccount] = useState("");
  const [payAmount, setPayAmount] = useState(String(remaining));
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const pay = useMutation({
    mutationFn: () =>
      api.createPayment(tenant.tenantId, {
        refType: mode === "sale" ? "invoice" : "purchase",
        refId: doc.id,
        accountId: payAccount,
        amount: Number(payAmount) || 0,
        paymentDate: payDate,
      }),
    onSuccess: (res) => {
      toast("success", res.settled ? `${doc.docNo} lunas.` : `Pembayaran ${res.paymentNo} dicatat.`);
      setPayOpen(false);
      queryClient.invalidateQueries({ queryKey: [mode === "sale" ? "invoices" : "purchases", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-xs font-semibold">{doc.docNo}</span>
          <span className="text-slate-500 dark:text-slate-400">{doc.date}</span>
          <span>{doc.contactName}</span>
          {doc.status === "paid" ? <Badge tone="brand">lunas</Badge> : <Badge tone="amber">belum lunas</Badge>}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold tabular-nums">{formatIDR(doc.total)}</span>
          {isAdmin && doc.status !== "paid" ? (
            <Button variant="secondary" className="h-8" onClick={() => setPayOpen((o) => !o)}>
              {mode === "sale" ? "Terima Pembayaran" : "Bayar"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {doc.lines.map((l) => (
          <div key={l.id} className="flex justify-between">
            <span>
              {l.productName} × {l.qty}
            </span>
            <span className="tabular-nums">{formatIDR(l.amount)}</span>
          </div>
        ))}
        {doc.taxAmount > 0 ? (
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>PPN {doc.taxRate}%</span>
            <span className="tabular-nums">{formatIDR(doc.taxAmount)}</span>
          </div>
        ) : null}
        {doc.paidAmount > 0 && doc.status !== "paid" ? (
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Sudah dibayar</span>
            <span className="tabular-nums">{formatIDR(doc.paidAmount)}</span>
          </div>
        ) : null}
      </div>

      {payOpen ? (
        <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end dark:bg-slate-800/50">
          <div>
            <Label htmlFor={`pay-acc-${doc.id}`}>Masuk/keluar dari akun</Label>
            <Select id={`pay-acc-${doc.id}`} value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
              <option value="">— pilih kas/bank —</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`pay-amt-${doc.id}`}>Nominal</Label>
            <Input
              id={`pay-amt-${doc.id}`}
              type="number"
              min={1}
              max={remaining}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`pay-date-${doc.id}`}>Tanggal</Label>
            <Input id={`pay-date-${doc.id}`} type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <Button onClick={() => pay.mutate()} disabled={pay.isPending || !payAccount}>
            {pay.isPending ? <Spinner /> : null} Catat
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SalesPage() {
  return <CommercePage mode="sale" />;
}

export function PurchasesPage() {
  return <CommercePage mode="purchase" />;
}

// ---------------------------------------------------------------------------
// Stok per gudang
// ---------------------------------------------------------------------------

export function StockPage() {
  const { tenant } = useWorkspace();
  const query = useQuery({ queryKey: ["stock", tenant.tenantId], queryFn: () => api.stock(tenant.tenantId) });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stok</h1>
      <Card>
        <CardHeader
          title="Level stok per gudang"
          description="Nilai persediaan memakai metode biaya rata-rata bergerak (moving average)."
        />
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (query.data?.levels.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Belum ada stok — catat faktur pembelian untuk mengisi stok.
            </p>
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
                  </tr>
                </thead>
                <tbody>
                  {query.data!.levels.map((l) => (
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
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-2.5 pr-4" colSpan={5}>
                      Total nilai persediaan
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatIDR(query.data!.totalValue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

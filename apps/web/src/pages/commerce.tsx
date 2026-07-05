import type { ApiCommerceDoc } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, PackageOpen, Printer } from "lucide-react";
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

type DraftLine = { productId: string; qty: string; unitPrice: string; lotNo: string; expiryDate: string };
const emptyLine = (): DraftLine => ({ productId: "", qty: "1", unitPrice: "", lotNo: "", expiryDate: "" });

type ProductRow = { id: string; sku: string; name: string; sell_price: number; buy_price: number; track_expiry: number };
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
  const projectsQuery = useQuery({
    queryKey: ["projects", tenant.tenantId],
    queryFn: () => api.projects(tenant.tenantId),
  });
  const activeProjects = (projectsQuery.data?.projects ?? []).filter((p) => p.status !== "completed");
  const currenciesQuery = useQuery({
    queryKey: ["currencies", tenant.tenantId],
    queryFn: () => api.currencies(tenant.tenantId),
  });
  const currencies = currenciesQuery.data?.currencies ?? [];

  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taxRate, setTaxRate] = useState<0 | 11 | 12>(11);
  const [projectId, setProjectId] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [exchangeRate, setExchangeRate] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const isForeign = currency !== "IDR";

  const create = useMutation({
    mutationFn: async (
      input: Parameters<typeof api.createInvoice>[1],
    ): Promise<{ total: number; docNo?: string; pendingApproval?: boolean; requestNo?: string }> =>
      mode === "sale" ? api.createInvoice(tenant.tenantId, input) : api.createPurchase(tenant.tenantId, input),
    onSuccess: (res) => {
      if (res.pendingApproval) {
        toast("success", `Pengajuan ${res.requestNo} menunggu persetujuan Owner (${formatIDR(res.total)}).`);
      } else {
        toast("success", `${cfg.docLabel} ${res.docNo} diposting (${formatIDR(res.total)}).`);
      }
      setLines([emptyLine()]);
      setError(null);
      queryClient.invalidateQueries({ queryKey: [cfg.queryKey, tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["stock-lots", tenant.tenantId] });
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
      ...(projectId ? { projectId } : {}),
      ...(isForeign ? { currency, exchangeRate: Number(exchangeRate) || 0 } : {}),
      lines: lines
        .filter((l) => l.productId)
        .map((l) => ({
          productId: l.productId,
          qty: Number(l.qty) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          ...(mode === "purchase" && l.lotNo ? { lotNo: l.lotNo } : {}),
          ...(mode === "purchase" && l.expiryDate ? { expiryDate: l.expiryDate } : {}),
        })),
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
              {activeProjects.length > 0 ? (
                <div>
                  <Label htmlFor="doc-project">Proyek (opsional)</Label>
                  <Select id="doc-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">— tanpa proyek —</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              {currencies.length > 1 ? (
                <div>
                  <Label htmlFor="doc-currency">Mata uang</Label>
                  <Select id="doc-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {currencies.map((cur) => (
                      <option key={cur.code} value={cur.code}>
                        {cur.code}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
              {isForeign ? (
                <div>
                  <Label htmlFor="doc-rate">Kurs (IDR/{currency})</Label>
                  <Input
                    id="doc-rate"
                    type="number"
                    min={0}
                    placeholder={String(currencies.find((cur) => cur.code === currency)?.rate ?? "")}
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => {
                const tracked = mode === "purchase" && products.find((p) => p.id === line.productId)?.track_expiry === 1;
                return (
                  <div key={i} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_10rem_10rem_2.5rem] sm:items-center">
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
                    {tracked ? (
                      <div className="grid grid-cols-2 gap-2 rounded-lg bg-amber-50 p-2 sm:grid-cols-[10rem_11rem_1fr] sm:items-center dark:bg-amber-950/40">
                        <Input
                          aria-label={`Nomor lot baris ${i + 1}`}
                          placeholder="No. lot (opsional)"
                          value={line.lotNo}
                          onChange={(e) => setLine(i, { lotNo: e.target.value })}
                        />
                        <Input
                          aria-label={`Tanggal kedaluwarsa baris ${i + 1}`}
                          type="date"
                          value={line.expiryDate}
                          onChange={(e) => setLine(i, { expiryDate: e.target.value })}
                        />
                        <span className="text-xs text-amber-700 dark:text-amber-300">
                          Produk ini melacak kedaluwarsa — tanggal exp wajib diisi (keluar otomatis FEFO).
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                + Tambah barang
              </Button>
              <div className="text-sm">
                {isForeign ? (
                  <>
                    Total{" "}
                    <strong className="tabular-nums">
                      {currency} {(subtotal + taxAmount).toLocaleString("id-ID")}
                    </strong>
                    {Number(exchangeRate) > 0 ? (
                      <span className="text-slate-500 dark:text-slate-400">
                        {" "}
                        ≈ {formatIDR(Math.round((subtotal + taxAmount) * Number(exchangeRate)))}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    Subtotal <strong className="tabular-nums">{formatIDR(subtotal)}</strong>
                    {taxRate > 0 ? (
                      <>
                        {" "}· PPN <strong className="tabular-nums">{formatIDR(taxAmount)}</strong>
                      </>
                    ) : null}{" "}
                    · Total <strong className="tabular-nums">{formatIDR(subtotal + taxAmount)}</strong>
                  </>
                )}
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
            <EmptyState
              icon={<FileText className="size-6" aria-hidden />}
              title={`Belum ada ${cfg.docLabel.toLowerCase()}`}
              description="Dokumen yang Anda posting akan muncul di sini beserta status pembayarannya."
            />
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
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const remaining = doc.total - doc.paidAmount - doc.returnedAmount;

  const warehousesQuery = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<{ id: string }>(tenant.tenantId, "warehouses"),
    enabled: returnOpen,
  });

  const doReturn = useMutation({
    mutationFn: () =>
      api.createReturn(tenant.tenantId, {
        refType: mode === "sale" ? "invoice" : "purchase",
        refId: doc.id,
        warehouseId: (warehousesQuery.data?.items[0] as { id: string } | undefined)?.id ?? "",
        returnDate: new Date().toISOString().slice(0, 10),
        lines: Object.entries(returnQty)
          .filter(([, q]) => Number(q) > 0)
          .map(([productId, q]) => ({ productId, qty: Number(q) })),
      }),
    onSuccess: (res) => {
      toast("success", `Retur ${res.returnNo} diposting (${formatIDR(res.total)}, jurnal ${res.journalNo}).`);
      setReturnOpen(false);
      setReturnQty({});
      queryClient.invalidateQueries({ queryKey: [mode === "sale" ? "invoices" : "purchases", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
    enabled: payOpen,
  });
  const cashAccounts = (accountsQuery.data?.accounts ?? []).filter(
    (a) => !a.isArchived && a.type === "asset" && (a.code.startsWith("1-10") || a.code.startsWith("1-11")),
  );

  const isForeign = doc.currency !== "IDR";
  const remainingForeign = doc.exchangeRate > 0 ? Math.round(remaining / doc.exchangeRate) : 0;
  const [payAccount, setPayAccount] = useState("");
  const [payAmount, setPayAmount] = useState(String(isForeign ? remainingForeign : remaining));
  const [payRate, setPayRate] = useState(String(doc.exchangeRate));
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));

  const pay = useMutation({
    mutationFn: () =>
      api.createPayment(tenant.tenantId, {
        refType: mode === "sale" ? "invoice" : "purchase",
        refId: doc.id,
        accountId: payAccount,
        paymentDate: payDate,
        ...(isForeign
          ? { foreignAmount: Number(payAmount) || 0, exchangeRate: Number(payRate) || 0 }
          : { amount: Number(payAmount) || 0 }),
      }),
    onSuccess: (res) => {
      const forex =
        res.forexGain && res.forexGain !== 0
          ? ` (selisih kurs ${res.forexGain > 0 ? "laba" : "rugi"} ${formatIDR(Math.abs(res.forexGain))})`
          : "";
      toast("success", (res.settled ? `${doc.docNo} lunas.` : `Pembayaran ${res.paymentNo} dicatat.`) + forex);
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
          {doc.status === "paid" ? <Badge tone="green">lunas</Badge> : <Badge tone="amber">belum lunas</Badge>}
          {isForeign ? <Badge tone="brand">{doc.currency} @ {doc.exchangeRate.toLocaleString("id-ID")}</Badge> : null}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold tabular-nums">
            {isForeign ? `${doc.currency} ${doc.foreignTotal.toLocaleString("id-ID")}` : formatIDR(doc.total)}
          </span>
          {mode === "sale" ? (
            <a
              href={`/cetak/faktur?tenant=${tenant.tenantId}&id=${doc.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Printer className="size-4" aria-hidden /> Cetak
            </a>
          ) : null}
          {isAdmin && remaining > 0 ? (
            <Button variant="ghost" className="h-8" onClick={() => setReturnOpen((o) => !o)}>
              Retur
            </Button>
          ) : null}
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
        {doc.returnedAmount > 0 ? (
          <div className="flex justify-between text-slate-500 dark:text-slate-400">
            <span>Sudah diretur</span>
            <span className="tabular-nums">− {formatIDR(doc.returnedAmount)}</span>
          </div>
        ) : null}
      </div>

      {returnOpen ? (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <div className="text-sm font-medium">Retur barang — isi qty yang dikembalikan:</div>
          {doc.lines.map((l) => (
            <div key={l.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1">
                {l.productName} <span className="text-slate-400">(dibeli {l.qty})</span>
              </span>
              <Input
                aria-label={`Qty retur ${l.productName}`}
                type="number"
                min={0}
                max={l.qty}
                className="h-9 w-24"
                placeholder="0"
                value={returnQty[l.productId] ?? ""}
                onChange={(e) => setReturnQty((q) => ({ ...q, [l.productId]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex justify-end">
            <Button
              onClick={() => doReturn.mutate()}
              disabled={doReturn.isPending || !Object.values(returnQty).some((q) => Number(q) > 0)}
            >
              {doReturn.isPending ? <Spinner /> : null} Posting Retur
            </Button>
          </div>
        </div>
      ) : null}

      {payOpen ? (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
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
              <Label htmlFor={`pay-amt-${doc.id}`}>{isForeign ? `Jumlah (${doc.currency})` : "Nominal"}</Label>
              <Input
                id={`pay-amt-${doc.id}`}
                type="number"
                min={1}
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
          {isForeign ? (
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:items-end">
              <div>
                <Label htmlFor={`pay-rate-${doc.id}`}>Kurs saat bayar (IDR/{doc.currency})</Label>
                <Input id={`pay-rate-${doc.id}`} type="number" min={0} value={payRate} onChange={(e) => setPayRate(e.target.value)} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Faktur pada kurs {doc.exchangeRate.toLocaleString("id-ID")}. Selisih dengan kurs bayar otomatis dijurnal
                sebagai laba/rugi selisih kurs.
              </p>
            </div>
          ) : null}
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
                    <td className="border-b border-slate-100 py-2 pr-4 dark:border-slate-800/60">{r.date}</td>
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
                        {l.expiryDate}
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

export function StockPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const query = useQuery({ queryKey: ["stock", tenant.tenantId], queryFn: () => api.stock(tenant.tenantId) });
  const [selected, setSelected] = useState<{ productId: string; warehouseId: string; title: string } | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stok</h1>
      {isAdmin ? <StockAdjustmentForm /> : null}
      {isAdmin ? <StockTransferForm /> : null}
      <LotsCard />
      <Card>
        <CardHeader
          title="Level stok per gudang"
          description="Nilai persediaan memakai metode biaya rata-rata bergerak (moving average)."
        />
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (query.data?.levels.length ?? 0) === 0 ? (
            <EmptyState
              icon={<PackageOpen className="size-6" aria-hidden />}
              title="Belum ada stok"
              description="Catat faktur pembelian untuk mengisi stok — level per gudang akan tampil di sini."
            />
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
                      Total nilai persediaan
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatIDR(query.data!.totalValue)}</td>
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

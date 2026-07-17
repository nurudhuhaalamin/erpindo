import type { ApiCommerceDoc } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, MessageCircle, Printer, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, formatDate, formatIDR } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  SearchSelect,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

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

type DraftLine = {
  productId: string;
  /** Label produk terpilih (cache dari hasil pencarian) untuk ditampilkan di combobox. */
  productLabel: string;
  trackExpiry: boolean;
  qty: string;
  unitPrice: string;
  discountPct: string;
  lotNo: string;
  expiryDate: string;
};
const emptyLine = (): DraftLine => ({
  productId: "",
  productLabel: "",
  trackExpiry: false,
  qty: "1",
  unitPrice: "",
  discountPct: "",
  lotNo: "",
  expiryDate: "",
});

/** Nilai baris setelah diskon — meniru pembulatan backend. */
function lineAmount(l: { qty: string; unitPrice: string; discountPct: string }): number {
  const disc = Math.min(Math.max(Number(l.discountPct) || 0, 0), 100);
  return Math.round((Number(l.qty) || 0) * (Number(l.unitPrice) || 0) * (1 - disc / 100));
}

type ProductRow = { id: string; sku: string; name: string; sell_price: number; buy_price: number; track_expiry: number };
type ContactRow = { id: string; name: string; type: string };
type WarehouseRow = { id: string; name: string };

/** Debounce nilai input (untuk kotak pencarian daftar). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function CommercePage({ mode }: { mode: Mode }) {
  const cfg = MODE_CFG[mode];
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const [docSearch, setDocSearch] = useState("");
  const docQ = useDebounced(docSearch);
  const [docLimit, setDocLimit] = useState(100);
  const docsQuery = useQuery({
    queryKey: [cfg.queryKey, tenant.tenantId, docQ, docLimit],
    queryFn: () =>
      mode === "sale"
        ? api.invoices(tenant.tenantId, { q: docQ, limit: docLimit })
        : api.purchases(tenant.tenantId, { q: docQ, limit: docLimit }),
    placeholderData: (prev) => prev,
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
  const [contactLabel, setContactLabel] = useState("");
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

  const warehouses = (warehousesQuery.data?.items ?? []) as WarehouseRow[];

  // Cache hasil pencarian produk agar pilihan (harga, lacak-exp) tetap tersedia
  // setelah dropdown ditutup — daftar lengkap tidak pernah dimuat semuanya.
  const productCache = useRef(new Map<string, ProductRow>());

  async function fetchProductOptions(q: string) {
    const res = await api.listItems<ProductRow>(tenant.tenantId, "products", { q, limit: 20 });
    for (const p of res.items) productCache.current.set(p.id, p);
    return res.items.map((p) => ({
      value: p.id,
      label: `${p.sku} · ${p.name}`,
      hint: formatIDR(p[cfg.priceField] || 0),
    }));
  }

  async function fetchContactOptions(q: string) {
    const res = await api.listItems<ContactRow>(tenant.tenantId, "contacts", { q, limit: 20 });
    return res.items.filter((k) => cfg.contactTypes.includes(k.type)).map((k) => ({ value: k.id, label: k.name }));
  }

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function pickProduct(i: number, opt: { value: string; label: string }) {
    const product = productCache.current.get(opt.value);
    setLine(i, {
      productId: opt.value,
      productLabel: opt.label,
      trackExpiry: product?.track_expiry === 1,
      unitPrice: product ? String(product[cfg.priceField] || "") : "",
    });
  }

  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);
  const taxAmount = Math.round((subtotal * taxRate) / 100);

  // Fase 10c — "Ubah" = void + prefill: isi form dari dokumen yang baru
  // dibatalkan; posting menghasilkan dokumen BARU bernomor baru (buku besar
  // immutable). Gudang memakai pilihan form (dokumen tidak menyimpannya).
  function prefillFromDoc(doc: ApiCommerceDoc) {
    setContactId(doc.contactId);
    setContactLabel(doc.contactName);
    setDate(new Date().toISOString().slice(0, 10));
    setTaxRate((doc.taxRate === 11 || doc.taxRate === 12 ? doc.taxRate : 0) as 0 | 11 | 12);
    setLines(
      doc.lines.map((l) => ({
        productId: l.productId,
        productLabel: l.productName,
        trackExpiry: false,
        qty: String(l.qty),
        unitPrice: String(l.unitPrice),
        discountPct: l.discountPct > 0 ? String(l.discountPct) : "",
        lotNo: "",
        expiryDate: "",
      })),
    );
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
          ...(Number(l.discountPct) > 0 ? { discountPct: Number(l.discountPct) } : {}),
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
                <SearchSelect
                  id="doc-contact"
                  value={contactId}
                  valueLabel={contactLabel}
                  placeholder={`Cari ${cfg.contactLabel.toLowerCase()}…`}
                  fetchOptions={fetchContactOptions}
                  onSelect={(opt) => {
                    setContactId(opt.value);
                    setContactLabel(opt.label);
                  }}
                />
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
                const tracked = mode === "purchase" && line.trackExpiry;
                return (
                  <div key={i} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_5rem_9rem_5.5rem_9rem_2.5rem] sm:items-center">
                      <SearchSelect
                        value={line.productId}
                        valueLabel={line.productLabel}
                        placeholder="Cari produk (SKU/nama)…"
                        fetchOptions={fetchProductOptions}
                        onSelect={(opt) => pickProduct(i, opt)}
                      />
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
                      <Input
                        aria-label={`Diskon % baris ${i + 1}`}
                        type="number"
                        min={0}
                        max={100}
                        placeholder="Disc %"
                        value={line.discountPct}
                        onChange={(e) => setLine(i, { discountPct: e.target.value })}
                      />
                      <div className="text-right text-sm tabular-nums">{formatIDR(lineAmount(line))}</div>
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
        <CardBody className="space-y-3">
          <div className="relative sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              aria-label={`Cari ${cfg.docLabel.toLowerCase()}`}
              className="pl-9"
              placeholder="Cari no. dokumen / nama kontak…"
              value={docSearch}
              onChange={(e) => {
                setDocSearch(e.target.value);
                setDocLimit(100);
              }}
            />
          </div>
          {docsQuery.isLoading ? (
            <Spinner />
          ) : (docsQuery.data?.docs.length ?? 0) === 0 ? (
            <EmptyState
              icon={<FileText className="size-6" aria-hidden />}
              title={docQ ? "Tidak ada dokumen yang cocok" : `Belum ada ${cfg.docLabel.toLowerCase()}`}
              description={
                docQ
                  ? "Coba kata kunci lain — pencarian mencocokkan nomor dokumen dan nama kontak."
                  : "Dokumen yang Anda posting akan muncul di sini beserta status pembayarannya."
              }
            />
          ) : (
            <>
              <div className="space-y-3">
                {docsQuery.data!.docs.map((doc) => (
                  <DocRow key={doc.id} doc={doc} mode={mode} isAdmin={isAdmin} onEdit={prefillFromDoc} />
                ))}
              </div>
              {(docsQuery.data?.total ?? 0) > (docsQuery.data?.docs.length ?? 0) ? (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Menampilkan {docsQuery.data!.docs.length} dari {docsQuery.data!.total}
                  </span>
                  <Button variant="secondary" className="h-8" onClick={() => setDocLimit((l) => Math.min(l + 100, 500))}>
                    Muat lebih banyak
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function DocRow({
  doc,
  mode,
  isAdmin,
  onEdit,
}: {
  doc: ApiCommerceDoc;
  mode: Mode;
  isAdmin: boolean;
  onEdit?: (doc: ApiCommerceDoc) => void;
}) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [voidPaymentId, setVoidPaymentId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const isVoided = doc.voidedAt !== null;
  const remaining = doc.total - doc.paidAmount - doc.returnedAmount;

  // Fase 11d — Tagih via WhatsApp: buat link bayar Midtrans (bila aktif) lalu
  // siapkan pesan tagihan di WhatsApp (wa.me — pengguna memilih kontak). Bila
  // Midtrans belum aktif / gagal, pesan tetap terkirim tanpa link bayar.
  const [tagihBusy, setTagihBusy] = useState(false);
  async function kirimTagih() {
    if (tagihBusy) return;
    setTagihBusy(true);
    let link: string | null = null;
    try {
      const res = await api.createInvoicePaymentLink(tenant.tenantId, doc.id);
      link = res.redirectUrl;
    } catch {
      // Midtrans belum dikonfigurasi / peran tak diizinkan → kirim reminder saja.
    } finally {
      setTagihBusy(false);
    }
    const msg =
      `Halo ${doc.contactName}, berikut tagihan faktur ${doc.docNo} sebesar ${formatIDR(remaining)}.` +
      (link ? `\nBayar online: ${link}` : `\nMohon segera diselesaikan. Terima kasih.`);
    try {
      await navigator.clipboard?.writeText(msg);
    } catch {
      /* clipboard opsional */
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    toast("success", link ? "Link bayar dibuat & pesan disiapkan di WhatsApp." : "Pesan tagihan disiapkan di WhatsApp.");
  }

  const doVoid = useMutation({
    mutationFn: () =>
      mode === "sale" ? api.voidInvoice(tenant.tenantId, doc.id) : api.voidPurchase(tenant.tenantId, doc.id),
    onSuccess: (res) => {
      toast("success", `${res.docNo} dibatalkan — jurnal pembalik ${res.reversalEntryNo} diposting, stok dikembalikan.`);
      setVoidOpen(false);
      if (editOpen) {
        setEditOpen(false);
        onEdit?.(doc);
      }
      queryClient.invalidateQueries({ queryKey: [mode === "sale" ? "invoices" : "purchases", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setVoidOpen(false);
      setEditOpen(false);
    },
  });

  // Fase 10c — daftar pembayaran dokumen ini + void per baris.
  const paymentsQuery = useQuery({
    queryKey: ["payments", tenant.tenantId, mode === "sale" ? "invoice" : "purchase", doc.id],
    queryFn: () => api.payments(tenant.tenantId, { refType: mode === "sale" ? "invoice" : "purchase", refId: doc.id }),
    enabled: paymentsOpen,
  });
  const doVoidPayment = useMutation({
    mutationFn: (paymentId: string) => api.voidPayment(tenant.tenantId, paymentId),
    onSuccess: (res) => {
      toast("success", `Pembayaran ${res.paymentNo} dihapus — jurnal pembalik ${res.reversalEntryNo} diposting.`);
      setVoidPaymentId(null);
      queryClient.invalidateQueries({ queryKey: ["payments", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: [mode === "sale" ? "invoices" : "purchases", tenant.tenantId] });
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setVoidPaymentId(null);
    },
  });

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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-mono text-xs font-semibold">{doc.docNo}</span>
          <span className="text-slate-500 dark:text-slate-400">{formatDate(doc.date)}</span>
          <span>{doc.contactName}</span>
          {isVoided ? (
            <Badge tone="red">DIBATALKAN</Badge>
          ) : doc.status === "paid" ? (
            <Badge tone="green">lunas</Badge>
          ) : (
            <Badge tone="amber">belum lunas</Badge>
          )}
          {isForeign ? <Badge tone="brand">{doc.currency} @ {doc.exchangeRate.toLocaleString("id-ID")}</Badge> : null}
        </div>
        <span className="text-base font-semibold tabular-nums">
          {isForeign ? `${doc.currency} ${doc.foreignTotal.toLocaleString("id-ID")}` : formatIDR(doc.total)}
        </span>
      </div>

      {(mode === "sale" || doc.paidAmount > 0 || (isAdmin && !isVoided && (remaining > 0 || doc.status !== "paid" || (doc.paidAmount === 0 && doc.returnedAmount === 0)))) ? (
        <div className="mt-2.5 flex flex-wrap gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800/60">
          {mode === "sale" ? (
            <a
              href={`/cetak/faktur?tenant=${tenant.tenantId}&id=${doc.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <Printer className="size-4" aria-hidden /> Cetak
            </a>
          ) : null}
          {mode === "sale" && isAdmin && !isVoided && remaining > 0 ? (
            <Button variant="secondary" className="h-8" onClick={kirimTagih} disabled={tagihBusy}>
              <span className="inline-flex items-center gap-1.5">
                <MessageCircle className="size-4" aria-hidden /> {tagihBusy ? "Menyiapkan…" : "Tagih (WA)"}
              </span>
            </Button>
          ) : null}
          {isAdmin && !isVoided && remaining > 0 ? (
            <Button variant="secondary" className="h-8" onClick={() => setReturnOpen((o) => !o)}>
              Retur
            </Button>
          ) : null}
          {isAdmin && !isVoided && doc.paidAmount === 0 && doc.returnedAmount === 0 ? (
            <>
              <Button variant="secondary" className="h-8" onClick={() => setEditOpen(true)}>
                Ubah
              </Button>
              <Button
                variant="secondary"
                className="h-8 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                onClick={() => setVoidOpen(true)}
              >
                Batalkan
              </Button>
            </>
          ) : null}
          {doc.paidAmount > 0 ? (
            <Button variant="secondary" className="h-8" onClick={() => setPaymentsOpen((o) => !o)}>
              Pembayaran
            </Button>
          ) : null}
          {isAdmin && !isVoided && doc.status !== "paid" ? (
            <Button className="h-8" onClick={() => setPayOpen((o) => !o)}>
              {mode === "sale" ? "Terima Pembayaran" : "Bayar"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {paymentsOpen ? (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <div className="text-sm font-medium">Pembayaran dokumen ini</div>
          {paymentsQuery.isLoading ? (
            <Spinner />
          ) : (paymentsQuery.data?.payments ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada pembayaran tercatat.</p>
          ) : (
            (paymentsQuery.data?.payments ?? []).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-mono text-xs font-semibold">{p.paymentNo}</span>
                <span className="text-slate-500 dark:text-slate-400">{formatDate(p.paymentDate)}</span>
                <span className="text-slate-500 dark:text-slate-400">{p.accountName}</span>
                <span className="tabular-nums font-medium">{formatIDR(p.amount)}</span>
                {p.voidedAt ? (
                  <Badge tone="red">DIHAPUS{p.voidJournalNo ? ` · ${p.voidJournalNo}` : ""}</Badge>
                ) : p.isPos ? (
                  <span className="text-xs text-slate-400" title="Pembayaran POS menyatu dengan struknya — gunakan Retur/Refund di Kasir.">
                    via Kasir
                  </span>
                ) : isAdmin ? (
                  <button
                    className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                    onClick={() => setVoidPaymentId(p.id)}
                  >
                    Hapus
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {doc.lines.map((l) => (
          <div key={l.id} className="flex justify-between">
            <span>
              {l.productName} × {l.qty}
              {l.discountPct > 0 ? <span className="text-emerald-600 dark:text-emerald-400"> (−{l.discountPct}%)</span> : null}
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

      <ConfirmDialog
        open={voidOpen}
        title={`Batalkan ${doc.docNo}?`}
        description={
          <>
            Jurnal pembalik akan diposting dan stok dikembalikan seperti sebelum dokumen ini dibuat. Dokumen tetap
            tercatat dengan tanda <strong>DIBATALKAN</strong> — aksi ini tidak bisa diurungkan.
          </>
        }
        confirmLabel="Ya, batalkan dokumen"
        danger
        busy={doVoid.isPending}
        onConfirm={() => doVoid.mutate()}
        onCancel={() => setVoidOpen(false)}
      />

      <ConfirmDialog
        open={editOpen}
        title={`Ubah ${doc.docNo}?`}
        description={
          <>
            Dokumen ini akan <strong>dibatalkan</strong> (jurnal pembalik + stok pulih), lalu isinya dimuat ke form di
            atas untuk diperbaiki dan diposting sebagai dokumen <strong>baru bernomor baru</strong> — begitulah koreksi
            pada pembukuan yang jejaknya utuh.
          </>
        }
        confirmLabel="Batalkan & muat ke form"
        busy={doVoid.isPending}
        onConfirm={() => doVoid.mutate()}
        onCancel={() => setEditOpen(false)}
      />

      <ConfirmDialog
        open={voidPaymentId !== null}
        title="Hapus pembayaran ini?"
        description={
          <>
            Jurnal pembayaran akan dibalik dan sisa tagihan dokumen kembali seperti sebelum pembayaran dicatat. Baris
            pembayaran tetap tercatat dengan tanda <strong>DIHAPUS</strong>.
          </>
        }
        confirmLabel="Ya, hapus pembayaran"
        danger
        busy={doVoidPayment.isPending}
        onConfirm={() => voidPaymentId && doVoidPayment.mutate(voidPaymentId)}
        onCancel={() => setVoidPaymentId(null)}
      />
    </div>
  );
}

export function SalesPage() {
  return <CommercePage mode="sale" />;
}

export function PurchasesPage() {
  return <CommercePage mode="purchase" />;
}


// Halaman Stok diekstrak ke ./stok pada Fase 12c; re-export agar impor lama tetap.
export { StockPage } from "./stok";

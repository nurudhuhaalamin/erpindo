import {
  CONTRACT_FREQUENCIES,
  CONTRACT_FREQUENCY_LABELS,
  type ApiContract,
  type ContractFrequency,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
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

const STATUS_TONE = { active: "green", paused: "amber", ended: "neutral" } as const;
const STATUS_LABEL = { active: "berjalan", paused: "jeda", ended: "berakhir" } as const;
const today = () => new Date().toISOString().slice(0, 10);

type ProductRow = { id: string; sku: string; name: string; sell_price: number };
type ContactRow = { id: string; name: string; type: string };
type WarehouseRow = { id: string; name: string };
type DraftLine = { productId: string; productLabel: string; qty: string; unitPrice: string };
const emptyLine = (): DraftLine => ({ productId: "", productLabel: "", qty: "1", unitPrice: "" });

export function ContractsPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const contractsQuery = useQuery({ queryKey: ["contracts", tenant.tenantId], queryFn: () => api.contracts(tenant.tenantId) });
  const warehousesQuery = useQuery({ queryKey: ["warehouses", tenant.tenantId], queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses") });

  const warehouses = (warehousesQuery.data?.items ?? []) as WarehouseRow[];

  const productCache = useRef(new Map<string, ProductRow>());
  async function fetchProductOptions(q: string) {
    const res = await api.listItems<ProductRow>(tenant.tenantId, "products", { q, limit: 20 });
    for (const p of res.items) productCache.current.set(p.id, p);
    return res.items.map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}`, hint: formatIDR(p.sell_price || 0) }));
  }
  async function fetchCustomerOptions(q: string) {
    const res = await api.listItems<ContactRow>(tenant.tenantId, "contacts", { q, limit: 20 });
    return res.items.filter((k) => ["customer", "both"].includes(k.type)).map((k) => ({ value: k.id, label: k.name }));
  }

  const [form, setForm] = useState({ code: "", name: "", contactId: "", contactLabel: "", frequency: "monthly" as ContractFrequency, taxRate: 11 as 0 | 11 | 12, startDate: today(), endDate: "" });
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.createContract(tenant.tenantId, {
        code: form.code.trim().toUpperCase(),
        contactId: form.contactId,
        name: form.name.trim(),
        frequency: form.frequency,
        taxRate: form.taxRate,
        warehouseId: warehouses[0]?.id || "",
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        lines: lines.filter((l) => l.productId).map((l) => ({ productId: l.productId, qty: Number(l.qty) || 0, unitPrice: Number(l.unitPrice) || 0 })),
      }),
    onSuccess: () => {
      toast("success", "Kontrak dibuat.");
      setForm({ code: "", name: "", contactId: "", contactLabel: "", frequency: "monthly", taxRate: 11, startDate: today(), endDate: "" });
      setLines([emptyLine()]);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["contracts", tenant.tenantId] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const runBilling = useMutation({
    mutationFn: () => api.runBilling(tenant.tenantId),
    onSuccess: (res) => {
      toast("success", res.issued > 0 ? `${res.issued} faktur diterbitkan (${formatIDR(res.total)}).` : "Tidak ada kontrak yang jatuh tempo hari ini.");
      queryClient.invalidateQueries({ queryKey: ["contracts", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["invoices", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function pickProduct(i: number, opt: { value: string; label: string }) {
    const p = productCache.current.get(opt.value);
    setLine(i, { productId: opt.value, productLabel: opt.label, unitPrice: p ? String(p.sell_price || "") : "" });
  }

  const contracts = contractsQuery.data?.contracts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kontrak & Tagihan Berulang</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Buat kontrak langganan — sistem menerbitkan faktur otomatis tiap periode. Bisa juga dipicu manual.
          </p>
        </div>
        {isAdmin ? (
          <Button variant="secondary" className="h-9 shrink-0" onClick={() => runBilling.mutate()} disabled={runBilling.isPending}>
            {runBilling.isPending ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />} Terbitkan Jatuh Tempo
          </Button>
        ) : null}
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader title="Kontrak baru" description="Faktur diterbitkan otomatis pada tanggal tagih; gunakan produk 'jasa' agar tak butuh stok." />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="ct-code">Kode</Label>
                <Input id="ct-code" placeholder="LGN-01" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="ct-name">Nama kontrak</Label>
                <Input id="ct-name" placeholder="Langganan Maintenance Bulanan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ct-contact">Pelanggan</Label>
                <SearchSelect
                  id="ct-contact"
                  value={form.contactId}
                  valueLabel={form.contactLabel}
                  placeholder="Cari pelanggan…"
                  fetchOptions={fetchCustomerOptions}
                  onSelect={(opt) => setForm({ ...form, contactId: opt.value, contactLabel: opt.label })}
                />
              </div>
              <div>
                <Label htmlFor="ct-freq">Frekuensi</Label>
                <Select id="ct-freq" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as ContractFrequency })}>
                  {CONTRACT_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {CONTRACT_FREQUENCY_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="ct-start">Mulai tagih</Label>
                <Input id="ct-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ct-end">Berakhir (opsional)</Label>
                <Input id="ct-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ct-tax">PPN</Label>
                <Select id="ct-tax" value={String(form.taxRate)} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) as 0 | 11 | 12 })}>
                  <option value="0">Tanpa PPN</option>
                  <option value="11">PPN 11%</option>
                  <option value="12">PPN 12%</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_10rem_10rem_2.5rem] sm:items-center">
                  <SearchSelect
                    value={line.productId}
                    valueLabel={line.productLabel}
                    placeholder="Cari produk/jasa…"
                    fetchOptions={fetchProductOptions}
                    onSelect={(opt) => pickProduct(i, opt)}
                  />
                  <Input aria-label={`Qty baris ${i + 1}`} type="number" min={1} value={line.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                  <Input aria-label={`Harga baris ${i + 1}`} type="number" min={0} placeholder="Harga satuan" value={line.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                  <div className="text-right text-sm tabular-nums">{formatIDR((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))}</div>
                  <Button type="button" variant="ghost" aria-label={`Hapus baris ${i + 1}`} onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))}>
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                + Tambah baris
              </Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !form.contactId || form.code.trim().length < 1 || warehouses.length === 0}>
                {create.isPending ? <Spinner /> : <Plus className="size-4" aria-hidden />} Buat Kontrak
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Daftar kontrak" />
        <CardBody>
          {contractsQuery.isLoading ? (
            <Spinner />
          ) : contracts.length === 0 ? (
            <EmptyState icon={<CalendarClock className="size-6" aria-hidden />} title="Belum ada kontrak" description="Buat kontrak langganan agar faktur terbit otomatis tiap periode." />
          ) : (
            <div className="space-y-3">
              {contracts.map((ct) => (
                <ContractRow key={ct.id} contract={ct} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function ContractRow({ contract, isAdmin }: { contract: ApiContract; isAdmin: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();

  const setStatus = useMutation({
    mutationFn: (status: string) => api.setContractStatus(tenant.tenantId, contract.id, status),
    onSuccess: () => {
      toast("success", "Status kontrak diperbarui.");
      queryClient.invalidateQueries({ queryKey: ["contracts", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm">{contract.code}</span>
        <span className="font-medium">{contract.name}</span>
        <Badge tone={STATUS_TONE[contract.status]}>{STATUS_LABEL[contract.status]}</Badge>
        <span className="text-xs text-slate-400">{contract.contactName}</span>
        <span className="ml-auto text-sm">
          {CONTRACT_FREQUENCY_LABELS[contract.frequency]} · <strong className="tabular-nums">{formatIDR(contract.total)}</strong>/periode
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>
          {contract.status === "ended" ? "Berakhir" : "Tagih berikutnya"}: {contract.nextInvoiceDate}
        </span>
        <span>· {contract.invoiceCount} faktur terbit</span>
        {contract.endDate ? <span>· sampai {contract.endDate}</span> : null}
        {contract.lines.map((l) => (
          <span key={l.id} className="text-slate-500 dark:text-slate-400">
            · {l.productName} ×{l.qty}
          </span>
        ))}
        {isAdmin && contract.status !== "ended" ? (
          <button
            onClick={() => setStatus.mutate(contract.status === "active" ? "paused" : "active")}
            className="text-brand-700 hover:underline dark:text-brand-400"
          >
            {contract.status === "active" ? "jeda" : "aktifkan"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

import type { ApiFixedAsset } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Landmark } from "lucide-react";
import { useState } from "react";
import { api, formatIDR } from "../api/client";
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
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
type AccountRow = { id: string; code: string; name: string; type: string };

export function AssetsPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const assetsQuery = useQuery({
    queryKey: ["assets", tenant.tenantId],
    queryFn: () => api.assets(tenant.tenantId),
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });
  const cashAccounts = (accountsQuery.data?.accounts ?? []).filter((a: AccountRow) => a.type === "asset");

  const [form, setForm] = useState({ name: "", category: "", acquisitionDate: today(), acquisitionCost: "", usefulLifeMonths: "48", residualValue: "" });
  const [cashAccountId, setCashAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [depPeriod, setDepPeriod] = useState(thisMonth);
  const [depDate, setDepDate] = useState(today);

  const create = useMutation({
    mutationFn: () =>
      api.createAsset(tenant.tenantId, {
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        acquisitionDate: form.acquisitionDate,
        acquisitionCost: Number(form.acquisitionCost) || 0,
        usefulLifeMonths: Number(form.usefulLifeMonths) || 0,
        residualValue: Number(form.residualValue) || 0,
        cashAccountId: cashAccountId || cashAccounts[0]?.id || "",
      }),
    onSuccess: () => {
      toast("success", "Aset terdaftar & jurnal perolehan dibuat.");
      setForm({ name: "", category: "", acquisitionDate: today(), acquisitionCost: "", usefulLifeMonths: "48", residualValue: "" });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["assets", tenant.tenantId] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const depreciate = useMutation({
    mutationFn: () => api.runDepreciation(tenant.tenantId, { period: depPeriod, date: depDate }),
    onSuccess: (res) => {
      toast(
        "success",
        res.count > 0 ? `Penyusutan ${depPeriod}: ${res.count} aset, total ${formatIDR(res.total)}.` : "Tidak ada aset yang perlu disusutkan bulan ini.",
      );
      queryClient.invalidateQueries({ queryKey: ["assets", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const assets = assetsQuery.data?.assets ?? [];
  const active = assets.filter((a) => a.status === "active");
  const totalBook = active.reduce((s, a) => s + a.bookValue, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Aset Tetap</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Register aset, penyusutan garis lurus otomatis tiap bulan (jurnal beban penyusutan), dan pelepasan aset.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody className="py-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">Aset aktif</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{active.length}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">Nilai buku total</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{formatIDR(totalBook)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="py-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">Penyusutan/bulan</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatIDR(active.reduce((s, a) => s + Math.min(a.monthlyDepreciation, a.bookValue - a.residualValue), 0))}
            </div>
          </CardBody>
        </Card>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader title="Daftarkan aset baru" description="Jurnal perolehan (Debit Aset Tetap / Kredit kas-bank) dibuat otomatis." />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="as-name">Nama aset</Label>
                <Input id="as-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="as-cat">Kategori</Label>
                <Input id="as-cat" placeholder="mis. Kendaraan, Peralatan" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="as-date">Tanggal perolehan</Label>
                <Input id="as-date" type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="as-cost">Nilai perolehan</Label>
                <Input id="as-cost" type="number" min={1} value={form.acquisitionCost} onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="as-life">Masa manfaat (bulan)</Label>
                <Input id="as-life" type="number" min={1} value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="as-res">Nilai residu</Label>
                <Input id="as-res" type="number" min={0} value={form.residualValue} onChange={(e) => setForm({ ...form, residualValue: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="as-cash">Dibayar dari akun</Label>
                <Select id="as-cash" value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
                  {cashAccounts.map((a: AccountRow) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => create.mutate()}
                disabled={create.isPending || form.name.trim().length < 2 || !form.acquisitionCost || cashAccounts.length === 0}
              >
                {create.isPending ? <Spinner /> : <PackagePlus className="size-4" aria-hidden />} Daftarkan Aset
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardHeader title="Jalankan penyusutan bulanan" description="Otomatis tiap awal bulan; bisa juga dipicu manual. Aman diulang (tak dobel per periode)." />
          <CardBody className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="dep-period">Periode</Label>
              <Input id="dep-period" type="month" value={depPeriod} onChange={(e) => setDepPeriod(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="dep-date">Tanggal jurnal</Label>
              <Input id="dep-date" type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)} />
            </div>
            <Button variant="secondary" onClick={() => depreciate.mutate()} disabled={depreciate.isPending || active.length === 0}>
              {depreciate.isPending ? <Spinner /> : null} Jalankan Penyusutan
            </Button>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Daftar aset" />
        <CardBody>
          {assetsQuery.isLoading ? (
            <Spinner />
          ) : assets.length === 0 ? (
            <EmptyState icon={<Landmark className="size-6" aria-hidden />} title="Belum ada aset" description="Daftarkan aset tetap (kendaraan, peralatan, dll.) untuk mulai menyusutkan otomatis." />
          ) : (
            <div className="space-y-3">
              {assets.map((a) => (
                <AssetRow key={a.id} asset={a} isAdmin={isAdmin} cashAccounts={cashAccounts} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AssetRow({ asset, isAdmin, cashAccounts }: { asset: ApiFixedAsset; isAdmin: boolean; cashAccounts: AccountRow[] }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [proceeds, setProceeds] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [date, setDate] = useState(today);

  const dispose = useMutation({
    mutationFn: () =>
      api.disposeAsset(tenant.tenantId, asset.id, {
        disposalDate: date,
        proceeds: Number(proceeds) || 0,
        cashAccountId: cashAccountId || cashAccounts[0]?.id || "",
      }),
    onSuccess: (res) => {
      toast("success", `Aset dilepas. ${res.gain >= 0 ? "Laba" : "Rugi"} pelepasan ${formatIDR(Math.abs(res.gain))}.`);
      setOpen(false);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["assets", tenant.tenantId] });
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setConfirmOpen(false);
    },
  });

  const pct = asset.acquisitionCost > 0 ? Math.round((asset.accumulatedDepreciation / asset.acquisitionCost) * 100) : 0;

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{asset.name}</span>
        {asset.category ? <span className="text-xs text-slate-400">{asset.category}</span> : null}
        {asset.status === "disposed" ? <Badge tone="neutral">dilepas</Badge> : <Badge tone="green">aktif</Badge>}
        <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
          Perolehan <span className="tabular-nums">{formatIDR(asset.acquisitionCost)}</span> · Nilai buku{" "}
          <strong className="tabular-nums text-slate-800 dark:text-slate-100">{formatIDR(asset.bookValue)}</strong>
        </span>
        {isAdmin && asset.status === "active" ? (
          <Button variant="ghost" className="h-8" onClick={() => setOpen((o) => !o)}>
            {open ? "Batal" : "Lepas"}
          </Button>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-slate-400">
        Sejak {asset.acquisitionDate} · masa {asset.usefulLifeMonths} bln · penyusutan {formatIDR(asset.monthlyDepreciation)}/bln · tersusut {pct}%
        {asset.disposedDate ? ` · dilepas ${asset.disposedDate}` : ""}
      </div>

      {open && asset.status === "active" ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
          <div>
            <Label htmlFor={`d-date-${asset.id}`}>Tanggal pelepasan</Label>
            <Input id={`d-date-${asset.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`d-proc-${asset.id}`}>Hasil penjualan (0 bila dibuang)</Label>
            <Input id={`d-proc-${asset.id}`} type="number" min={0} value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`d-cash-${asset.id}`}>Diterima di akun</Label>
            <Select id={`d-cash-${asset.id}`} value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="danger" onClick={() => setConfirmOpen(true)} disabled={dispose.isPending}>
            Lepas Aset
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            title={`Lepas aset ${asset.name}?`}
            description={`Nilai buku ${formatIDR(asset.bookValue)} akan dihapus dari neraca dan laba/rugi pelepasan dijurnal otomatis. Aksi ini tidak bisa diurungkan.`}
            confirmLabel="Ya, lepas aset"
            danger
            busy={dispose.isPending}
            onConfirm={() => dispose.mutate()}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

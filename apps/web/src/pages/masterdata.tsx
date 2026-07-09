import { contactSchema, productSchema, warehouseSchema, type ContactType } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, downloadCsv, formatIDR, parseCsv } from "../api/client";
import { useDebounced } from "./commerce";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  FieldError,
  Input,
  Label,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";
const td = "border-b border-slate-100 py-2.5 pr-4 dark:border-slate-800/60";

/**
 * Tombol impor CSV: pilih file → parse di browser → petakan kolom → kirim batch
 * ke server (validasi per baris di sana) → tampilkan hasil.
 */
function ImportCsvButton({
  entity,
  templateHeaders,
  templateExample,
  mapRow,
}: {
  entity: "products" | "contacts";
  templateHeaders: string[];
  templateExample: (string | number)[];
  mapRow: (r: Record<string, string>) => unknown;
}) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ inserted: number; failed: number; errors: { row: number; message: string }[] } | null>(null);

  const importMutation = useMutation({
    mutationFn: (rows: unknown[]) => api.importItems(tenant.tenantId, entity, rows),
    onSuccess: (res) => {
      setResult(res);
      toast(res.failed === 0 ? "success" : "error", `Impor selesai: ${res.inserted} masuk, ${res.failed} gagal/dilewati.`);
      queryClient.invalidateQueries({ queryKey: [entity, tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (rows.length === 0) {
      toast("error", "File kosong atau header tidak terbaca.");
      return;
    }
    importMutation.mutate(rows.map(mapRow));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
        {importMutation.isPending ? <Spinner /> : null} ⬆ Impor CSV
      </Button>
      <Button
        variant="ghost"
        onClick={() => downloadCsv(`template-${entity}.csv`, templateHeaders, [templateExample])}
      >
        Unduh template
      </Button>
      {result && result.errors.length > 0 ? (
        <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {result.errors.slice(0, 8).map((er) => (
            <div key={er.row}>
              Baris {er.row}: {er.message}
            </div>
          ))}
          {result.errors.length > 8 ? <div>… dan {result.errors.length - 8} lainnya</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Kerangka halaman master data seragam: form tambah/ubah (admin) + tabel +
 * arsip berkonfirmasi. `editing` menampung baris yang sedang diubah — form
 * yang sama dipakai untuk tambah maupun ubah (dibedakan lewat submit).
 */
function useEntityPage<Row extends { id: string }>(entity: "products" | "contacts" | "warehouses") {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [toArchive, setToArchive] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [limit, setLimit] = useState(100);

  const query = useQuery({
    queryKey: [entity, tenant.tenantId, q, limit],
    queryFn: () => api.listItems(tenant.tenantId, entity, { q, limit }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [entity, tenant.tenantId] });

  const create = useMutation({
    mutationFn: (input: Parameters<typeof api.createItem>[2]) => api.createItem(tenant.tenantId, entity, input),
    onSuccess: () => {
      toast("success", "Data tersimpan.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; input: Parameters<typeof api.updateItem>[3] }) =>
      api.updateItem(tenant.tenantId, entity, vars.id, vars.input),
    onSuccess: () => {
      toast("success", "Perubahan tersimpan.");
      setEditing(null);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.archiveItem(tenant.tenantId, entity, id),
    onSuccess: () => {
      toast("success", "Data diarsipkan.");
      setToArchive(null);
      invalidate();
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setToArchive(null);
    },
  });

  return {
    tenant,
    isAdmin,
    query,
    create,
    update,
    archive,
    issues,
    setIssues,
    editing,
    setEditing,
    toArchive,
    setToArchive,
    search,
    setSearch,
    q,
    limit,
    setLimit,
  };
}

/** Kotak cari daftar master data (debounce lewat useEntityPage). */
function SearchBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <Input aria-label={label} className="pl-9" placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Footer "Menampilkan X dari Y" + tombol muat lebih banyak. */
function LoadMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (total <= shown) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Menampilkan {shown} dari {total}
      </span>
      <Button variant="secondary" className="h-8" onClick={onMore}>
        Muat lebih banyak
      </Button>
    </div>
  );
}

/** Tombol aksi baris (Ubah + Arsipkan) yang seragam di ketiga halaman. */
function RowActions({ onEdit, onArchive }: { onEdit: () => void; onArchive: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" className="h-8" onClick={onEdit}>
        Ubah
      </Button>
      <Button variant="ghost" className="h-8 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950" onClick={onArchive}>
        Arsipkan
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  sell_price: number;
  buy_price: number;
  track_expiry: number;
  is_service: number;
  min_stock: number;
};

export function ProductsPage() {
  const {
    isAdmin, query, create, update, archive, issues, setIssues, editing, setEditing, toArchive, setToArchive,
    search, setSearch, limit, setLimit,
  } = useEntityPage<ProductRow>("products");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIssues({});
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const parsed = productSchema.safeParse({
      sku: raw.sku,
      name: raw.name,
      unit: raw.unit || "pcs",
      sellPrice: Number(raw.sellPrice) || 0,
      buyPrice: Number(raw.buyPrice) || 0,
      trackExpiry: raw.trackExpiry === "on",
      isService: raw.isService === "on",
      minStock: Number(raw.minStock) || 0,
    });
    if (!parsed.success) {
      setIssues(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    if (editing) {
      update.mutate({ id: editing.id, input: parsed.data });
    } else {
      create.mutate(parsed.data, { onSuccess: () => form.reset() });
    }
  }

  const busy = create.isPending || update.isPending;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Produk</h1>

      {isAdmin ? (
        <Card>
          <CardHeader
            title={editing ? `Ubah produk — ${editing.sku}` : "Tambah produk"}
            description={
              editing
                ? "Perubahan hanya memengaruhi data master; transaksi lama tetap memakai nilai saat diposting."
                : "Tambah satu per satu, atau impor sekaligus dari file CSV/Excel."
            }
          />
          <CardBody className="space-y-4">
            {editing ? null : (
              <ImportCsvButton
                entity="products"
                templateHeaders={["sku", "nama", "satuan", "harga_jual", "harga_beli", "lacak_exp"]}
                templateExample={["BRG-001", "Kopi Arabika 1kg", "pcs", 150000, 100000, "tidak"]}
                mapRow={(r) => ({
                  sku: r.sku ?? "",
                  name: r.nama ?? r.name ?? "",
                  unit: r.satuan || r.unit || "pcs",
                  sellPrice: Number(r.harga_jual ?? r.sellprice ?? 0) || 0,
                  buyPrice: Number(r.harga_beli ?? r.buyprice ?? 0) || 0,
                  trackExpiry: ["ya", "yes", "1", "true"].includes((r.lacak_exp ?? "").toLowerCase()),
                })}
              />
            )}
            <form
              key={editing?.id ?? "new"}
              onSubmit={onSubmit}
              className="grid gap-3 sm:grid-cols-[8rem_1fr_5rem_9rem_9rem_8rem_auto] sm:items-end"
              noValidate
            >
              <div>
                <Label htmlFor="p-sku">SKU</Label>
                <Input id="p-sku" name="sku" placeholder="BRG-001" defaultValue={editing?.sku} required />
                <FieldError messages={issues.sku} />
              </div>
              <div>
                <Label htmlFor="p-name">Nama</Label>
                <Input id="p-name" name="name" placeholder="Kopi Arabika 1kg" defaultValue={editing?.name} required />
                <FieldError messages={issues.name} />
              </div>
              <div>
                <Label htmlFor="p-unit">Satuan</Label>
                <Input id="p-unit" name="unit" placeholder="pcs" defaultValue={editing?.unit ?? "pcs"} />
              </div>
              <div>
                <Label htmlFor="p-sell">Harga jual (Rp)</Label>
                <Input id="p-sell" name="sellPrice" type="number" min={0} placeholder="150000" defaultValue={editing?.sell_price} />
              </div>
              <div>
                <Label htmlFor="p-buy">Harga beli (Rp)</Label>
                <Input id="p-buy" name="buyPrice" type="number" min={0} placeholder="100000" defaultValue={editing?.buy_price} />
              </div>
              <div>
                <Label htmlFor="p-minstock">Stok minimum</Label>
                <Input
                  id="p-minstock"
                  name="minStock"
                  type="number"
                  min={0}
                  placeholder="0 = tanpa peringatan"
                  defaultValue={editing?.min_stock || ""}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? <Spinner /> : null} {editing ? "Simpan" : "Tambah"}
                </Button>
                {editing ? (
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                    Batal
                  </Button>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-3 dark:text-slate-300">
                <input
                  type="checkbox"
                  name="trackExpiry"
                  className="h-4 w-4 rounded border-slate-300"
                  defaultChecked={editing ? editing.track_expiry === 1 : false}
                />
                Lacak lot &amp; tanggal kedaluwarsa (F&amp;B/farmasi) — wajib isi tgl exp saat pembelian, keluar otomatis
                FEFO
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-3 dark:text-slate-300">
                <input
                  type="checkbox"
                  name="isService"
                  className="h-4 w-4 rounded border-slate-300"
                  defaultChecked={editing ? editing.is_service === 1 : false}
                />
                Jasa (tanpa stok) — faktur tidak menggerakkan stok/HPP; cocok untuk layanan, sewa, langganan
              </label>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          <SearchBox label="Cari SKU / nama produk…" value={search} onChange={(v) => { setSearch(v); setLimit(100); }} />
          {query.isLoading ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>SKU</th>
                    <th className={th}>Nama</th>
                    <th className={th}>Satuan</th>
                    <th className={`${th} text-right`}>Harga Jual</th>
                    <th className={`${th} text-right`}>Harga Beli</th>
                    <th className={th}>Exp</th>
                    {isAdmin ? <th className={th}></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {((query.data?.items ?? []) as ProductRow[]).map((p) => (
                    <tr key={p.id}>
                      <td className={`${td} font-mono text-xs`}>{p.sku}</td>
                      <td className={td}>{p.name}</td>
                      <td className={td}>{p.unit}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(p.sell_price)}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(p.buy_price)}</td>
                      <td className={td}>{p.track_expiry ? <Badge tone="amber">FEFO</Badge> : "—"}</td>
                      {isAdmin ? (
                        <td className={`${td} text-right`}>
                          <RowActions onEdit={() => setEditing(p)} onArchive={() => setToArchive(p)} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <LoadMore
                shown={query.data?.items.length ?? 0}
                total={query.data?.total ?? 0}
                onMore={() => setLimit((l) => Math.min(l + 100, 500))}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={toArchive !== null}
        title="Arsipkan produk ini?"
        description={
          toArchive ? `${toArchive.sku} — ${toArchive.name} akan disembunyikan dari daftar & form transaksi. Riwayat transaksi tetap utuh.` : undefined
        }
        confirmLabel="Arsipkan"
        danger
        busy={archive.isPending}
        onConfirm={() => toArchive && archive.mutate(toArchive.id)}
        onCancel={() => setToArchive(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

type ContactRow = {
  id: string;
  type: ContactType;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  npwp: string | null;
};

const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  customer: "Pelanggan",
  supplier: "Pemasok",
  both: "Pelanggan & Pemasok",
};

export function ContactsPage() {
  const {
    isAdmin, query, create, update, archive, issues, setIssues, editing, setEditing, toArchive, setToArchive,
    search, setSearch, limit, setLimit,
  } = useEntityPage<ContactRow>("contacts");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIssues({});
    const form = e.currentTarget;
    const parsed = contactSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setIssues(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    if (editing) {
      update.mutate({ id: editing.id, input: parsed.data });
    } else {
      create.mutate(parsed.data, { onSuccess: () => form.reset() });
    }
  }

  const busy = create.isPending || update.isPending;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Kontak</h1>

      {isAdmin ? (
        <Card>
          <CardHeader
            title={editing ? `Ubah kontak — ${editing.name}` : "Tambah kontak"}
            description={editing ? "Perubahan berlaku untuk transaksi berikutnya." : "Pelanggan dan pemasok Anda — bisa impor sekaligus dari CSV."}
          />
          <CardBody className="space-y-4">
            {editing ? null : (
              <ImportCsvButton
                entity="contacts"
                templateHeaders={["jenis", "nama", "email", "telepon", "alamat", "npwp"]}
                templateExample={["pelanggan", "PT Pelanggan Setia", "info@pelanggan.co.id", "0812345678", "Jakarta", ""]}
                mapRow={(r) => ({
                  type:
                    { pelanggan: "customer", pemasok: "supplier", keduanya: "both" }[
                      (r.jenis ?? r.type ?? "").toLowerCase()
                    ] ?? (r.type || "customer"),
                  name: r.nama ?? r.name ?? "",
                  email: r.email || undefined,
                  phone: r.telepon || r.phone || undefined,
                  address: r.alamat || r.address || undefined,
                  npwp: r.npwp || undefined,
                })}
              />
            )}
            <form
              key={editing?.id ?? "new"}
              onSubmit={onSubmit}
              className="grid gap-3 sm:grid-cols-[11rem_1fr_1fr_1fr_auto] sm:items-end"
              noValidate
            >
              <div>
                <Label htmlFor="k-type">Jenis</Label>
                <Select id="k-type" name="type" defaultValue={editing?.type ?? "customer"}>
                  <option value="customer">Pelanggan</option>
                  <option value="supplier">Pemasok</option>
                  <option value="both">Keduanya</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="k-name">Nama</Label>
                <Input id="k-name" name="name" placeholder="PT Pelanggan Setia" defaultValue={editing?.name} required />
                <FieldError messages={issues.name} />
              </div>
              <div>
                <Label htmlFor="k-email">Email</Label>
                <Input id="k-email" name="email" type="email" placeholder="opsional" defaultValue={editing?.email ?? ""} />
                <FieldError messages={issues.email} />
              </div>
              <div>
                <Label htmlFor="k-phone">Telepon</Label>
                <Input id="k-phone" name="phone" placeholder="opsional" defaultValue={editing?.phone ?? ""} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? <Spinner /> : null} {editing ? "Simpan" : "Tambah"}
                </Button>
                {editing ? (
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                    Batal
                  </Button>
                ) : null}
              </div>
              {editing ? (
                <>
                  <div className="sm:col-span-2">
                    <Label htmlFor="k-address">Alamat</Label>
                    <Input id="k-address" name="address" placeholder="opsional" defaultValue={editing.address ?? ""} />
                  </div>
                  <div>
                    <Label htmlFor="k-npwp">NPWP</Label>
                    <Input id="k-npwp" name="npwp" placeholder="opsional" defaultValue={editing.npwp ?? ""} />
                  </div>
                </>
              ) : null}
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          <SearchBox label="Cari nama / email / telepon…" value={search} onChange={(v) => { setSearch(v); setLimit(100); }} />
          {query.isLoading ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>Nama</th>
                    <th className={th}>Jenis</th>
                    <th className={th}>Email</th>
                    <th className={th}>Telepon</th>
                    {isAdmin ? <th className={th}></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {((query.data?.items ?? []) as ContactRow[]).map((k) => (
                    <tr key={k.id}>
                      <td className={td}>{k.name}</td>
                      <td className={td}>
                        <Badge>{CONTACT_TYPE_LABELS[k.type]}</Badge>
                      </td>
                      <td className={td}>{k.email ?? "—"}</td>
                      <td className={td}>{k.phone ?? "—"}</td>
                      {isAdmin ? (
                        <td className={`${td} text-right`}>
                          <RowActions onEdit={() => setEditing(k)} onArchive={() => setToArchive(k)} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <LoadMore
                shown={query.data?.items.length ?? 0}
                total={query.data?.total ?? 0}
                onMore={() => setLimit((l) => Math.min(l + 100, 500))}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={toArchive !== null}
        title="Arsipkan kontak ini?"
        description={toArchive ? `${toArchive.name} akan disembunyikan dari daftar & form transaksi. Riwayat transaksi tetap utuh.` : undefined}
        confirmLabel="Arsipkan"
        danger
        busy={archive.isPending}
        onConfirm={() => toArchive && archive.mutate(toArchive.id)}
        onCancel={() => setToArchive(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

type WarehouseRow = { id: string; code: string; name: string; address: string | null };

export function WarehousesPage() {
  const {
    isAdmin, query, create, update, archive, issues, setIssues, editing, setEditing, toArchive, setToArchive,
    search, setSearch, limit, setLimit,
  } = useEntityPage<WarehouseRow>("warehouses");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIssues({});
    const form = e.currentTarget;
    const parsed = warehouseSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setIssues(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    if (editing) {
      update.mutate({ id: editing.id, input: parsed.data });
    } else {
      create.mutate(parsed.data, { onSuccess: () => form.reset() });
    }
  }

  const busy = create.isPending || update.isPending;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Gudang</h1>

      {isAdmin ? (
        <Card>
          <CardHeader
            title={editing ? `Ubah gudang — ${editing.code}` : "Tambah gudang"}
            description={editing ? "Stok & riwayat mutasi tetap terikat pada gudang ini." : "Gudang Utama sudah dibuat otomatis."}
          />
          <CardBody>
            <form
              key={editing?.id ?? "new"}
              onSubmit={onSubmit}
              className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end"
              noValidate
            >
              <div>
                <Label htmlFor="w-code">Kode</Label>
                <Input id="w-code" name="code" placeholder="CAB-01" defaultValue={editing?.code} required />
                <FieldError messages={issues.code} />
              </div>
              <div>
                <Label htmlFor="w-name">Nama</Label>
                <Input id="w-name" name="name" placeholder="Gudang Cabang Bandung" defaultValue={editing?.name} required />
                <FieldError messages={issues.name} />
              </div>
              <div>
                <Label htmlFor="w-address">Alamat</Label>
                <Input id="w-address" name="address" placeholder="opsional" defaultValue={editing?.address ?? ""} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? <Spinner /> : null} {editing ? "Simpan" : "Tambah"}
                </Button>
                {editing ? (
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                    Batal
                  </Button>
                ) : null}
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-3">
          <SearchBox label="Cari kode / nama gudang…" value={search} onChange={(v) => { setSearch(v); setLimit(100); }} />
          {query.isLoading ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>Kode</th>
                    <th className={th}>Nama</th>
                    <th className={th}>Alamat</th>
                    {isAdmin ? <th className={th}></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {((query.data?.items ?? []) as WarehouseRow[]).map((w) => (
                    <tr key={w.id}>
                      <td className={`${td} font-mono text-xs`}>{w.code}</td>
                      <td className={td}>{w.name}</td>
                      <td className={td}>{w.address ?? "—"}</td>
                      {isAdmin ? (
                        <td className={`${td} text-right`}>
                          <RowActions onEdit={() => setEditing(w)} onArchive={() => setToArchive(w)} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <LoadMore
                shown={query.data?.items.length ?? 0}
                total={query.data?.total ?? 0}
                onMore={() => setLimit((l) => Math.min(l + 100, 500))}
              />
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={toArchive !== null}
        title="Arsipkan gudang ini?"
        description={toArchive ? `${toArchive.code} — ${toArchive.name} akan disembunyikan dari daftar & form transaksi. Riwayat mutasi stok tetap utuh.` : undefined}
        confirmLabel="Arsipkan"
        danger
        busy={archive.isPending}
        onConfirm={() => toArchive && archive.mutate(toArchive.id)}
        onCancel={() => setToArchive(null)}
      />
    </div>
  );
}

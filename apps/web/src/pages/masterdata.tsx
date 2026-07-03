import { contactSchema, productSchema, warehouseSchema, type ContactType } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, formatIDR } from "../api/client";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
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

/** Kerangka halaman master data seragam: form tambah (admin) + tabel + arsip. */
function useEntityPage(entity: "products" | "contacts" | "warehouses") {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();
  const [issues, setIssues] = useState<Record<string, string[]>>({});

  const query = useQuery({
    queryKey: [entity, tenant.tenantId],
    queryFn: () => api.listItems(tenant.tenantId, entity),
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

  const archive = useMutation({
    mutationFn: (id: string) => api.archiveItem(tenant.tenantId, entity, id),
    onSuccess: () => {
      toast("success", "Data diarsipkan.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return { tenant, isAdmin, query, create, archive, issues, setIssues };
}

// ---------------------------------------------------------------------------

type ProductRow = { id: string; sku: string; name: string; unit: string; sell_price: number; buy_price: number };

export function ProductsPage() {
  const { isAdmin, query, create, archive, issues, setIssues } = useEntityPage("products");

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
    });
    if (!parsed.success) {
      setIssues(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    create.mutate(parsed.data, { onSuccess: () => form.reset() });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Produk</h1>

      {isAdmin ? (
        <Card>
          <CardHeader title="Tambah produk" />
          <CardBody>
            <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[8rem_1fr_6rem_10rem_10rem_auto] sm:items-end" noValidate>
              <div>
                <Label htmlFor="p-sku">SKU</Label>
                <Input id="p-sku" name="sku" placeholder="BRG-001" required />
                <FieldError messages={issues.sku} />
              </div>
              <div>
                <Label htmlFor="p-name">Nama</Label>
                <Input id="p-name" name="name" placeholder="Kopi Arabika 1kg" required />
                <FieldError messages={issues.name} />
              </div>
              <div>
                <Label htmlFor="p-unit">Satuan</Label>
                <Input id="p-unit" name="unit" placeholder="pcs" defaultValue="pcs" />
              </div>
              <div>
                <Label htmlFor="p-sell">Harga jual (Rp)</Label>
                <Input id="p-sell" name="sellPrice" type="number" min={0} placeholder="150000" />
              </div>
              <div>
                <Label htmlFor="p-buy">Harga beli (Rp)</Label>
                <Input id="p-buy" name="buyPrice" type="number" min={0} placeholder="100000" />
              </div>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner /> : null} Tambah
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
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
                      {isAdmin ? (
                        <td className={`${td} text-right`}>
                          <Button variant="ghost" className="h-8" onClick={() => archive.mutate(p.id)}>
                            Arsipkan
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
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
  npwp: string | null;
};

const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  customer: "Pelanggan",
  supplier: "Pemasok",
  both: "Pelanggan & Pemasok",
};

export function ContactsPage() {
  const { isAdmin, query, create, archive, issues, setIssues } = useEntityPage("contacts");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIssues({});
    const form = e.currentTarget;
    const parsed = contactSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setIssues(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    create.mutate(parsed.data, { onSuccess: () => form.reset() });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Kontak</h1>

      {isAdmin ? (
        <Card>
          <CardHeader title="Tambah kontak" description="Pelanggan dan pemasok Anda." />
          <CardBody>
            <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[11rem_1fr_1fr_1fr_auto] sm:items-end" noValidate>
              <div>
                <Label htmlFor="k-type">Jenis</Label>
                <Select id="k-type" name="type" defaultValue="customer">
                  <option value="customer">Pelanggan</option>
                  <option value="supplier">Pemasok</option>
                  <option value="both">Keduanya</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="k-name">Nama</Label>
                <Input id="k-name" name="name" placeholder="PT Pelanggan Setia" required />
                <FieldError messages={issues.name} />
              </div>
              <div>
                <Label htmlFor="k-email">Email</Label>
                <Input id="k-email" name="email" type="email" placeholder="opsional" />
                <FieldError messages={issues.email} />
              </div>
              <div>
                <Label htmlFor="k-phone">Telepon</Label>
                <Input id="k-phone" name="phone" placeholder="opsional" />
              </div>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner /> : null} Tambah
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
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
                          <Button variant="ghost" className="h-8" onClick={() => archive.mutate(k.id)}>
                            Arsipkan
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

type WarehouseRow = { id: string; code: string; name: string; address: string | null };

export function WarehousesPage() {
  const { isAdmin, query, create, archive, issues, setIssues } = useEntityPage("warehouses");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIssues({});
    const form = e.currentTarget;
    const parsed = warehouseSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setIssues(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    create.mutate(parsed.data, { onSuccess: () => form.reset() });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Gudang</h1>

      {isAdmin ? (
        <Card>
          <CardHeader title="Tambah gudang" description="Gudang Utama sudah dibuat otomatis." />
          <CardBody>
            <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end" noValidate>
              <div>
                <Label htmlFor="w-code">Kode</Label>
                <Input id="w-code" name="code" placeholder="CAB-01" required />
                <FieldError messages={issues.code} />
              </div>
              <div>
                <Label htmlFor="w-name">Nama</Label>
                <Input id="w-name" name="name" placeholder="Gudang Cabang Bandung" required />
                <FieldError messages={issues.name} />
              </div>
              <div>
                <Label htmlFor="w-address">Alamat</Label>
                <Input id="w-address" name="address" placeholder="opsional" />
              </div>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? <Spinner /> : null} Tambah
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
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
                          <Button variant="ghost" className="h-8" onClick={() => archive.mutate(w.id)}>
                            Arsipkan
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

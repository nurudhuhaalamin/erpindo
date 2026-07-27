import {
  MARKETPLACE_CHANNELS,
  MARKETPLACE_CHANNEL_LABELS,
  type MarketplaceChannel,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, formatDate } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Label,
  PageHeading,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "../components/ui";
import { useUi, type UiKey } from "../i18n/ui";
import { useWorkspace } from "./app";

/**
 * Import Pesanan Marketplace (Fase 11e) — jembatan omnichannel tanpa kunci API.
 * Tempel/unggah CSV ekspor pesanan Shopee/Tokopedia/TikTok → tiap pesanan jadi
 * faktur penjualan (stok keluar + jurnal otomatis). Idempoten per nomor pesanan.
 */

type Row = {
  externalOrderNo: string;
  orderDate: string;
  sku: string;
  qty: number;
  unitPrice: number;
  discountPct?: number;
};

// Penerjemah diterima sebagai argumen: fungsi murni tingkat modul, tidak boleh
// memakai hook — pola yang sama dengan parseCsv di kasbank.tsx (19c).
function parseCsv(text: string, u: (k: UiKey) => string): { rows: Row[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rows: Row[] = [];
  const errors: string[] = [];
  lines.forEach((line, i) => {
    if (i === 0 && /sku/i.test(line) && /(order|pesanan)/i.test(line)) return; // baris header
    const cols = line.split(/[,;\t]/).map((c) => c.trim());
    if (cols.length < 5) {
      errors.push(`${u("barisKe")} ${i + 1}${u("csvKolomKurang")}`);
      return;
    }
    const [externalOrderNo, orderDate, sku, qtyS, priceS, discS] = cols;
    const qty = Number(qtyS);
    const unitPrice = Math.round(Number(priceS));
    if (
      !externalOrderNo ||
      !/^\d{4}-\d{2}-\d{2}$/.test(orderDate ?? "") ||
      !sku ||
      !Number.isFinite(qty) ||
      qty < 1 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      errors.push(`${u("barisKe")} ${i + 1}${u("csvDataTakValid")}`);
      return;
    }
    const row: Row = {
      externalOrderNo: externalOrderNo!,
      orderDate: orderDate!,
      sku: sku!,
      qty: Math.round(qty),
      unitPrice,
    };
    if (discS && Number.isFinite(Number(discS)))
      row.discountPct = Math.max(0, Math.min(100, Number(discS)));
    rows.push(row);
  });
  return { rows, errors };
}

export function MarketplacePage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = tenant.role === "owner" || tenant.role === "admin";

  const [channel, setChannel] = useState<MarketplaceChannel>("shopee");
  const [warehouseId, setWarehouseId] = useState("");
  const [contactId, setContactId] = useState("");
  const [csv, setCsv] = useState("");

  const warehouses = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () =>
      api.listItems<{ id: string; name: string }>(tenant.tenantId, "warehouses", { limit: 100 }),
  });
  const contacts = useQuery({
    queryKey: ["contacts", tenant.tenantId, "mp"],
    queryFn: () =>
      api.listItems<{ id: string; name: string }>(tenant.tenantId, "contacts", { limit: 200 }),
  });
  const orders = useQuery({
    queryKey: ["marketplace-orders", tenant.tenantId],
    queryFn: () => api.marketplaceOrders(tenant.tenantId),
  });

  // `u` WAJIB ada di dependensi — pelajaran 19f: tanpa itu pesan galat tetap
  // berbahasa lama setelah tombol bahasa ditekan.
  const parsed = useMemo(() => parseCsv(csv, u), [csv, u]);
  const orderCount = useMemo(
    () => new Set(parsed.rows.map((r) => r.externalOrderNo)).size,
    [parsed.rows]
  );

  const doImport = useMutation({
    mutationFn: () =>
      api.marketplaceImport(tenant.tenantId, {
        channel,
        warehouseId,
        contactId,
        rows: parsed.rows,
      }),
    onSuccess: (r) => {
      toast(
        r.failed.length ? "error" : "success",
        `${r.imported.length} ${u("pesananDiimporSuffix")}${r.skipped.length ? `, ${r.skipped.length} ${u("dilewatiKata")}` : ""}${r.failed.length ? `, ${r.failed.length} ${u("gagalKata")}` : ""}.`
      );
      void qc.invalidateQueries({ queryKey: ["marketplace-orders", tenant.tenantId] });
      void qc.invalidateQueries({ queryKey: ["invoices", tenant.tenantId] });
      void qc.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
    },
    onError: (e) => toast("error", (e as Error).message),
  });

  const result = doImport.data;
  const canImport =
    isAdmin &&
    Boolean(warehouseId) &&
    Boolean(contactId) &&
    parsed.rows.length > 0 &&
    !doImport.isPending;

  return (
    <div className="space-y-6">
      <div>
        <PageHeading k="marketplace" />
      </div>

      {!isAdmin ? (
        <Alert tone="info">{u("hanyaAdminImpor")}</Alert>
      ) : null}

      <Card>
        <CardHeader
          title={u("mpImporPesanan")}
          description={u("descImporMarketplace")}
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>{u("mpKanal")}</Label>
              <Select
                value={channel}
                onChange={(e) => setChannel(e.target.value as MarketplaceChannel)}
              >
                {MARKETPLACE_CHANNELS.map((ch) => (
                  <option key={ch} value={ch}>
                    {MARKETPLACE_CHANNEL_LABELS[ch]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{u("gudangStokKeluar")}</Label>
              <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">{u("pilihGudangOpsi")}</option>
                {(warehouses.data?.items ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{u("pelangganContohShopee")}</Label>
              <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">{u("pilihPelangganOpsi")}</option>
                {(contacts.data?.items ?? []).map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label>{u("mpDataCsv")}</Label>
            <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
              Kolom:{" "}
              <code>
                {u("kolomCsvMarketplace")}
              </code>
              {u("descSatuBarisPerItem")}
            </p>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={7}
              placeholder={
                "SHP-1001,2026-07-15,SKU-001,2,50000\nSHP-1001,2026-07-15,SKU-002,1,120000\nSHP-1002,2026-07-15,SKU-001,3,50000,10"
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
            />
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="mt-2 block text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) f.text().then(setCsv);
              }}
            />
          </div>

          {parsed.rows.length > 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Terbaca <strong>{parsed.rows.length}</strong> baris dalam{" "}
              <strong>{orderCount}</strong> pesanan.
            </p>
          ) : null}
          {parsed.errors.length > 0 ? (
            <Alert tone="info">
              {parsed.errors.length} {u("barisDilewati")}{" "}
              {parsed.errors.slice(0, 3).join(" ")}
            </Alert>
          ) : null}

          <div>
            <Button onClick={() => doImport.mutate()} disabled={!canImport}>
              {doImport.isPending ? "Mengimpor…" : `Impor ${orderCount || ""} pesanan`}
            </Button>
          </div>

          {result ? (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
              <div className="flex flex-wrap gap-2">
                <Badge tone="green">{result.imported.length} diimpor</Badge>
                {result.skipped.length ? (
                  <Badge tone="amber">
                    {result.skipped.length} {u("dilewatiKata")}
                  </Badge>
                ) : null}
                {result.failed.length ? (
                  <Badge tone="red">
                    {result.failed.length} {u("gagalKata")}
                  </Badge>
                ) : null}
              </div>
              {result.failed.slice(0, 8).map((f) => (
                <div key={f.externalOrderNo} className="text-xs text-red-600 dark:text-red-400">
                  {f.externalOrderNo}: {f.reason}
                </div>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={u("mpPesananTerimpor")} description="200 impor terakhir." />
        <CardBody>
          {orders.isLoading ? (
            <Spinner />
          ) : (orders.data?.orders ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {u("belumAdaPesananMarketplace")}
            </p>
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>{u("mpKanal")}</Th>
                  <Th>{u("mpNoPesanan")}</Th>
                  <Th>{u("faktur")}</Th>
                  <Th>{u("mpDiimpor")}</Th>
                </tr>
              </Thead>
              <tbody>
                {(orders.data?.orders ?? []).map((o) => (
                  // Tidak ada kolom `numeric` di sini: semuanya pengenal, label
                  // kanal, atau tanggal — bukan nilai (aturan 17h).
                  <Tr key={o.id}>
                    <Td label={u("mpKanal")}>
                      {MARKETPLACE_CHANNEL_LABELS[o.channel as MarketplaceChannel] ?? o.channel}
                    </Td>
                    <Td label={u("mpNoPesanan")} className="font-mono text-xs">
                      {o.externalOrderNo}
                    </Td>
                    <Td label={u("faktur")}>{o.invoiceNo ?? "—"}</Td>
                    <Td label={u("mpDiimpor")} className="text-slate-500 dark:text-slate-400">
                      {formatDate(o.importedAt.slice(0, 10))}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

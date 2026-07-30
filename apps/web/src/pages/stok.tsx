import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUi, type UiKey } from "../i18n/ui";
import { Download, PackageOpen } from "lucide-react";
import { useState } from "react";
import { api, downloadCsv, formatDate, formatIDR } from "../api/client";
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
import { useWorkspace } from "./app";


type ProductRow = {
  id: string;
  sku: string;
  name: string;
  sell_price: number;
  buy_price: number;
  track_expiry: number;
};
type WarehouseRow = { id: string; name: string };

// ---------------------------------------------------------------------------
// Stok per gudang — diekstrak dari commerce.tsx pada Fase 12c (pola Fase 9d:
// commerce.tsx me-re-export StockPage sehingga main.tsx tidak berubah).
// ---------------------------------------------------------------------------

// Konstanta tingkat modul tidak boleh memanggil hook, jadi yang disimpan
// adalah KUNCI kamus — diterjemahkan saat render (pola tetap sejak 16j).
const REF_TYPE_LABELS: Record<string, UiKey> = {
  purchase: "pembelianJudul",
  sale: "penjualanJudul",
  adjustment: "penyesuaian",
};

function StockCard({
  productId,
  warehouseId,
  title,
}: {
  productId: string;
  warehouseId: string;
  title: string;
}) {
  const u = useUi();
  const { tenant } = useWorkspace();
  const query = useQuery({
    queryKey: ["stock-card", tenant.tenantId, productId, warehouseId],
    queryFn: () => api.stockCard(tenant.tenantId, productId, warehouseId),
  });

  return (
    <Card>
      <CardHeader title={`${u("kartuStok")} — ${title}`} description={u("riwayatMutasi")} />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>{u("waktu")}</Th>
                <Th>{u("jenis")}</Th>
                <Th numeric>{u("masukKeluar")}</Th>
                <Th numeric>{u("biayaSatuan")}</Th>
                <Th numeric>{u("saldo")}</Th>
              </tr>
            </Thead>
            <tbody>
              {query.data?.rows.map((r, i) => {
                // refType datang dari server; bila jenisnya belum dikenal
                // kamus, tampilkan apa adanya daripada kunci mentah.
                const refKey = REF_TYPE_LABELS[r.refType];
                return (
                  <Tr key={i}>
                    <Td label={u("waktu")}>{formatDate(r.date)}</Td>
                    <Td label={u("jenis")}>{refKey ? u(refKey) : r.refType}</Td>
                    <Td
                      numeric
                      label={u("masukKeluar")}
                      className={
                        r.qty >= 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400"
                      }
                    >
                      {r.qty >= 0 ? `+${r.qty}` : r.qty}
                    </Td>
                    <Td numeric label={u("biayaSatuan")}>{formatIDR(r.unitCost)}</Td>
                    <Td numeric label={u("saldo")} className="font-medium">
                      {r.balance}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function StockAdjustmentForm() {
  const u = useUi();
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
        warehouseId:
          warehouseId || (warehousesQuery.data?.items[0] as WarehouseRow | undefined)?.id || "",
        physicalQty: Number(physicalQty),
        note: note || undefined,
      }),
    onSuccess: (res) => {
      toast(
        "success",
        `Stok disesuaikan (${res.delta > 0 ? "+" : ""}${res.delta}${res.entryNo ? `, jurnal ${res.entryNo}` : ""}).`
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
      <CardHeader title={u("penyesuaianStok")} description={u("descOpname")} />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_8rem_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="adj-product">{u("produk")}</Label>
            <Select
              id="adj-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">{u("pilihProdukOpsi")}</option>
              {((productsQuery.data?.items ?? []) as ProductRow[]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="adj-wh">{u("gudang")}</Label>
            <Select
              id="adj-wh"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              {((warehousesQuery.data?.items ?? []) as WarehouseRow[]).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="adj-qty">{u("qtyFisik")}</Label>
            <Input
              id="adj-qty"
              type="number"
              min={0}
              value={physicalQty}
              onChange={(e) => setPhysicalQty(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adj-note">{u("catatan")}</Label>
            <Input
              id="adj-note"
              placeholder={u("opsional")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button
            onClick={() => adjust.mutate()}
            disabled={!productId || physicalQty === "" || adjust.isPending}
          >
            {adjust.isPending ? <Spinner /> : null} Sesuaikan
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function StockTransferForm() {
  const u = useUi();
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
      <CardHeader title={u("transferAntarGudang")} description={u("descTransferGudang")} />
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-[1fr_11rem_11rem_7rem_auto] sm:items-end">
          <div>
            <Label htmlFor="tr-product">{u("produk")}</Label>
            <Select
              id="tr-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">{u("pilihProdukOpsi")}</option>
              {((productsQuery.data?.items ?? []) as ProductRow[]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-from">{u("dariGudang")}</Label>
            <Select id="tr-from" value={fromWh} onChange={(e) => setFromWh(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-to">{u("keGudang")}</Label>
            <Select id="tr-to" value={toWh} onChange={(e) => setToWh(e.target.value)}>
              <option value="">{u("pilihOpsi")}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tr-qty">Qty</Label>
            <Input
              id="tr-qty"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <Button
            onClick={() => transfer.mutate()}
            disabled={!productId || !toWh || !qty || transfer.isPending}
          >
            {transfer.isPending ? <Spinner /> : null} {u("transferAksi")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/** Daftar lot aktif urut FEFO dengan badge kedaluwarsa (merah lewat, kuning ≤30 hari). */
function LotsCard() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const query = useQuery({
    queryKey: ["stock-lots", tenant.tenantId],
    queryFn: () => api.stockLots(tenant.tenantId),
  });
  const lots = query.data?.lots ?? [];
  if (query.isLoading || lots.length === 0) return null;

  return (
    <Card>
      <CardHeader title={u("lotKedaluwarsa")} description={u("descLotFefo")} />
      <CardBody>
        {(query.data?.expiringSoon ?? 0) > 0 ? (
          <Alert tone="error">
            {query.data!.expiringSoon} {u("peringatanLotKedaluwarsa")}
          </Alert>
        ) : null}
        <div className="mt-3">
          <Table>
            <Thead>
              <tr>
                <Th>SKU</Th>
                <Th>{u("produk")}</Th>
                <Th>{u("gudang")}</Th>
                <Th>Lot</Th>
                <Th>{u("kedaluwarsa")}</Th>
                <Th numeric>Qty</Th>
              </tr>
            </Thead>
            <tbody>
              {lots.map((l) => (
                <Tr key={l.id}>
                  <Td label="SKU" className="font-mono text-xs">{l.sku}</Td>
                  <Td label={u("produk")}>{l.productName}</Td>
                  <Td label={u("gudang")}>{l.warehouseName}</Td>
                  <Td label="Lot">{l.lotNo ?? "—"}</Td>
                  <Td label={u("kedaluwarsa")}>
                    {l.expiryDate ? (
                      <span className="inline-flex items-center gap-2">
                        {formatDate(l.expiryDate)}
                        {l.daysToExpiry !== null && l.daysToExpiry < 0 ? (
                          <Badge tone="red">kedaluwarsa</Badge>
                        ) : l.daysToExpiry !== null && l.daysToExpiry <= 30 ? (
                          <Badge tone="amber">{l.daysToExpiry} hari lagi</Badge>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td numeric label="Qty">{l.qty}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Titik pesan otomatis (Fase 7c): produk dengan stok ≤ minimum → usulan qty beli.
 * Sekali klik membuat Permintaan Pembelian (PR) yang diteruskan ke modul Pengadaan.
 */
function ReorderCard() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["reorder", tenant.tenantId],
    queryFn: () => api.reorderSuggestions(tenant.tenantId),
  });
  const suggestions = query.data?.suggestions ?? [];

  const createPr = useMutation({
    mutationFn: () =>
      api.createRequisition(tenant.tenantId, {
        note: "Usulan otomatis dari titik pesan (stok menipis)",
        lines: suggestions.map((s) => ({
          productId: s.productId,
          qty: s.suggestedQty,
          note: `Stok ${s.qty} ≤ minimum ${s.minStock}`,
        })),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["requisitions", tenant.tenantId] });
      toast("success", `Permintaan pembelian ${r.reqNo} dibuat — lanjutkan di menu Pengadaan.`);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  if (query.isLoading || suggestions.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title={u("usulanPembelianOtomatis")}
        description={u("descUsulanBeli")}
        action={
          <Button className="h-9" onClick={() => createPr.mutate()} disabled={createPr.isPending}>
            {createPr.isPending ? <Spinner /> : null} {u("buatPermintaanPembelian")}
          </Button>
        }
      />
      <CardBody>
        <Table>
          <Thead>
            <tr>
              <Th>SKU</Th>
              <Th>{u("produk")}</Th>
              <Th numeric>{u("stok")}</Th>
              <Th numeric>{u("minimum")}</Th>
              <Th numeric>{u("usulanBeli")}</Th>
            </tr>
          </Thead>
          <tbody>
            {suggestions.map((s) => (
              <Tr key={s.productId}>
                <Td label="SKU" className="font-mono text-xs">{s.sku}</Td>
                <Td label={u("produk")}>{s.name}</Td>
                {/* Kolom ini berisi lencana, bukan angka telanjang — pakai
                    `text-right` saja, tanpa `numeric`, supaya lencananya tidak
                    ikut dipaksa font mono. */}
                <Td label={u("stok")} className="text-right">
                  <Badge tone={s.qty <= 0 ? "red" : "amber"}>
                    {s.qty} {s.unit}
                  </Badge>
                </Td>
                <Td numeric label={u("minimum")}>{s.minStock}</Td>
                <Td numeric label={u("usulanBeli")} className="font-medium">
                  {s.suggestedQty} {s.unit}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </CardBody>
    </Card>
  );
}

/**
 * Peramalan stok (Fase 20h). Deterministik — rata-rata bergerak atas riwayat
 * penjualan, bukan AI.
 *
 * Kolom "Keyakinan" sengaja tidak disembunyikan di balik tooltip. Pembagian
 * menghasilkan angka yang sama rapinya entah datanya 60 hari atau 2 hari, dan
 * pemilik yang membeli berdasarkan angka kedua akan menyalahkan sistemnya,
 * bukan datanya.
 */
function ForecastCard() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const [leadTime, setLeadTime] = useState("7");
  const [perluSaja, setPerluSaja] = useState(true);
  const lead = Math.max(Number(leadTime) || 0, 1);
  const query = useQuery({
    queryKey: ["stock-forecast", tenant.tenantId, lead],
    queryFn: () => api.stockForecast(tenant.tenantId, { leadTime: lead }),
  });

  const semua = query.data?.forecasts ?? [];
  const adaPenjualan = semua.filter((f) => f.rataHarian > 0);
  const baris = perluSaja ? adaPenjualan.filter((f) => f.perluPesan) : adaPenjualan;
  const adaKeyakinanRendah = baris.some((f) => f.keyakinan === "rendah");

  const labelTren: Record<string, UiKey> = {
    naik: "trenNaik",
    turun: "trenTurun",
    stabil: "trenStabil",
  };
  const labelKeyakinan: Record<string, UiKey> = {
    tinggi: "keyakinanTinggi",
    sedang: "keyakinanSedang",
    rendah: "keyakinanRendah",
  };

  return (
    <Card>
      <CardHeader title={u("peramalanStok")} description={u("descPeramalanStok")} />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Label htmlFor="fc-lead">{u("waktuTungguHari")}</Label>
            <Input
              id="fc-lead"
              type="number"
              min={1}
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
            />
          </div>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={perluSaja}
              onChange={(e) => setPerluSaja(e.target.checked)}
            />
            {u("hanyaPerluPesan")}
          </label>
        </div>
        {query.isLoading ? (
          <Spinner />
        ) : adaPenjualan.length === 0 ? (
          <Alert tone="info">{u("belumAdaRiwayatJual")}</Alert>
        ) : (
          <>
            {adaKeyakinanRendah ? <Alert tone="warning">{u("hintKeyakinanRendah")}</Alert> : null}
            {/* Pembungkus ber-testid: komponen `Tr` sengaja tidak meneruskan
                prop sembarangan, jadi penanda untuk ui-sim dipasang di wadahnya. */}
            <div data-testid="tabel-ramalan">
            <Table>
              <Thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>{u("produk")}</Th>
                  <Th numeric>{u("stok")}</Th>
                  <Th numeric>{u("rataJualHarian")}</Th>
                  <Th numeric>{u("sisaHariHabis")}</Th>
                  <Th numeric>{u("titikPesanDihitung")}</Th>
                  <Th numeric>{u("usulanBeli")}</Th>
                  <Th>{u("tren")}</Th>
                  <Th>{u("keyakinan")}</Th>
                </tr>
              </Thead>
              <tbody>
                {baris.map((f) => (
                  <Tr key={f.productId}>
                    <Td label="SKU" className="font-mono text-xs">
                      {f.sku}
                    </Td>
                    <Td label={u("produk")}>{f.name}</Td>
                    <Td numeric label={u("stok")}>
                      {f.stok}
                    </Td>
                    <Td numeric label={u("rataJualHarian")}>
                      {f.rataHarian.toFixed(2)}
                    </Td>
                    <Td numeric label={u("sisaHariHabis")}>
                      {f.hariHabis === null ? "—" : `${f.hariHabis} ${u("hariSuffix")}`}
                    </Td>
                    <Td numeric label={u("titikPesanDihitung")}>
                      {f.titikPesan}
                    </Td>
                    <Td numeric label={u("usulanBeli")} className="font-medium">
                      {f.qtyDisarankan > 0 ? `${f.qtyDisarankan} ${f.unit}` : "—"}
                    </Td>
                    <Td label={u("tren")}>
                      <Badge tone={f.tren === "naik" ? "green" : f.tren === "turun" ? "amber" : "neutral"}>
                        {u(labelTren[f.tren]!)}
                      </Badge>
                    </Td>
                    <Td label={u("keyakinan")}>
                      <Badge tone={f.keyakinan === "tinggi" ? "green" : f.keyakinan === "sedang" ? "amber" : "red"}>
                        {u(labelKeyakinan[f.keyakinan]!)}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function StockPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const query = useQuery({
    queryKey: ["stock", tenant.tenantId],
    queryFn: () => api.stock(tenant.tenantId),
  });
  const [selected, setSelected] = useState<{
    productId: string;
    warehouseId: string;
    title: string;
  } | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const [threshold, setThreshold] = useState("10");

  const allLevels = query.data?.levels ?? [];
  const lowLimit = Number(threshold) || 0;
  const levels = lowOnly ? allLevels.filter((l) => l.qty <= lowLimit) : allLevels;

  return (
    <div className="space-y-6">
      <PageHeading k="stok" />
      {isAdmin ? <ReorderCard /> : null}
      {isAdmin ? <ForecastCard /> : null}
      {isAdmin ? <StockAdjustmentForm /> : null}
      {isAdmin ? <StockTransferForm /> : null}
      <LotsCard />
      <Card>
        <CardHeader
          title={u("levelStokPerGudang")}
          description={u("descBiayaRataRataBergerak")}
          action={
            allLevels.length > 0 ? (
              <Button
                variant="secondary"
                className="h-9"
                onClick={() =>
                  downloadCsv(
                    "stok.csv",
                    ["SKU", "Produk", "Gudang", "Qty", "Satuan", "Biaya rata-rata", "Nilai"],
                    levels.map((l) => [
                      l.sku,
                      l.productName,
                      l.warehouseName,
                      l.qty,
                      l.unit,
                      l.avgCost,
                      l.value,
                    ])
                  )
                }
              >
                <Download className="size-4" aria-hidden /> {u("eksporCsv")}
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {allLevels.length > 0 ? (
            <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={lowOnly}
                onChange={(e) => setLowOnly(e.target.checked)}
                className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {u("hanyaStokMenipis")}
              <input
                type="number"
                min={0}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-16 rounded border border-slate-300 px-2 py-0.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                aria-label={u("ambangStokMenipis")}
              />
              )
            </label>
          ) : null}
          {query.isLoading ? (
            <Spinner />
          ) : allLevels.length === 0 ? (
            <EmptyState
              icon={<PackageOpen className="size-6" aria-hidden />}
              title={u("belumAdaStok")}
              description={u("descBelumAdaStok")}
            />
          ) : levels.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {u("tidakAdaProdukStokKurang")} {lowLimit}.
            </p>
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>{u("produk")}</Th>
                  <Th>{u("gudang")}</Th>
                  <Th numeric>Qty</Th>
                  <Th numeric>{u("biayaRataRata")}</Th>
                  <Th numeric>{u("nilai")}</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <tbody>
                {levels.map((l) => (
                  <Tr key={`${l.productId}-${l.warehouseId}`}>
                    <Td label="SKU" className="font-mono text-xs">{l.sku}</Td>
                    <Td label={u("produk")}>{l.productName}</Td>
                    <Td label={u("gudang")}>{l.warehouseName}</Td>
                    <Td numeric label="Qty">
                      {l.qty} {l.unit}
                    </Td>
                    <Td numeric label={u("biayaRataRata")}>{formatIDR(l.avgCost)}</Td>
                    <Td numeric label={u("nilai")} className="font-medium">
                      {formatIDR(l.value)}
                    </Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          setSelected({
                            productId: l.productId,
                            warehouseId: l.warehouseId,
                            title: `${l.productName} @ ${l.warehouseName}`,
                          })
                        }
                      >
                        {u("kartu")}
                      </Button>
                    </Td>
                  </Tr>
                ))}
                {/* Baris total: `Tr` memberi garis bawah pada baris terakhir
                    kecuali `last:border-0`, dan baris ini memang yang terakhir. */}
                <Tr className="font-semibold">
                  <Td colSpan={5}>{lowOnly ? u("totalNilaiTerfilter") : u("totalNilaiPersediaan")}</Td>
                  <Td numeric>
                    {formatIDR(
                      lowOnly ? levels.reduce((s, l) => s + l.value, 0) : query.data!.totalValue
                    )}
                  </Td>
                  <Td></Td>
                </Tr>
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {selected ? (
        <StockCard
          productId={selected.productId}
          warehouseId={selected.warehouseId}
          title={selected.title}
        />
      ) : null}
    </div>
  );
}

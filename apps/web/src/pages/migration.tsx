import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { useState } from "react";
import { api, formatIDR, parseCsv } from "../api/client";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Label,
  PageHeading,
  Spinner,
  useToast,
} from "../components/ui";
import { useUi } from "../i18n/ui";
import { useWorkspace } from "./app";

/**
 * Migrasi & saldo awal (Fase 13f) — impor saldo awal akun + stok awal dari CSV
 * lalu susun satu jurnal pembuka seimbang. Hanya tersedia saat buku masih kosong.
 * Format CSV sengaja sederhana agar kompatibel dengan ekspor sistem lama.
 */

type ProductRow = { id: string; sku: string; name: string };
type WarehouseRow = { id: string; name: string; code?: string };
type AccountRow = { code: string; name: string };

const ACCOUNTS_SAMPLE =
  "kode,debit,kredit\n1-1000,5000000,0\n1-1100,20000000,0\n1-1200,3000000,0\n2-1000,0,4000000\n3-1000,0,24000000";
const STOCK_SAMPLE = "sku,gudang,qty,biaya\nRTL-001,Utama,100,2000\nRTL-002,Utama,50,2500";

export function MigrationPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [accountsCsv, setAccountsCsv] = useState("");
  const [stockCsv, setStockCsv] = useState("");
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ["opening-status", tenant.tenantId],
    queryFn: () => api.openingStatus(tenant.tenantId),
  });
  const products = useQuery({
    queryKey: ["products-all", tenant.tenantId],
    queryFn: () => api.listItems<ProductRow>(tenant.tenantId, "products", { limit: 5000 }),
  });
  const warehouses = useQuery({
    queryKey: ["warehouses", tenant.tenantId],
    queryFn: () => api.listItems<WarehouseRow>(tenant.tenantId, "warehouses"),
  });
  const accounts = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });

  const submit = useMutation({
    mutationFn: () => {
      setError(null);
      const accRows = accountsCsv.trim() ? parseCsv(accountsCsv) : [];
      const stkRows = stockCsv.trim() ? parseCsv(stockCsv) : [];
      const validCodes = new Set((accounts.data?.accounts ?? []).map((a: AccountRow) => a.code));
      const accountsInput = accRows.map((r) => {
        const code = r.kode ?? r.code ?? "";
        if (!validCodes.has(code)) throw new Error(`${u("kodeAkunTakDikenal")} ${code}`);
        return {
          accountCode: code,
          debit: Math.round(Number(r.debit) || 0),
          credit: Math.round(Number(r.kredit ?? r.credit) || 0),
        };
      });
      const bySku = new Map((products.data?.items ?? []).map((p) => [p.sku.toLowerCase(), p.id]));
      const byWh = new Map((warehouses.data?.items ?? []).map((w) => [w.name.toLowerCase(), w.id]));
      const stockInput = stkRows.map((r) => {
        const pid = bySku.get((r.sku ?? "").toLowerCase());
        if (!pid) throw new Error(`${u("skuTakDitemukan")} ${r.sku}`);
        const wid = byWh.get((r.gudang ?? "").toLowerCase());
        if (!wid) throw new Error(`${u("gudangTakDitemukan")} ${r.gudang}`);
        return {
          productId: pid,
          warehouseId: wid,
          qty: Math.round(Number(r.qty) || 0),
          unitCost: Math.round(Number(r.biaya) || 0),
        };
      });
      return api.setOpeningBalances(tenant.tenantId, {
        asOfDate,
        accounts: accountsInput,
        stock: stockInput,
      });
    },
    onSuccess: (res) => {
      toast(
        "success",
        `${u("toastSaldoAwalPrefix")} ${res.entryNo}, ${u("toastNilaiStok")} ${formatIDR(res.stockValue)}).`
      );
      setAccountsCsv("");
      setStockCsv("");
      queryClient.invalidateQueries({ queryKey: ["opening-status", tenant.tenantId] });
    },
    onError: (e) => setError((e as Error).message),
  });

  if (status.isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  const canSet = status.data?.canSetOpening ?? false;
  const field =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <PageHeading k="migrasi" />
      </div>

      {!canSet ? (
        <Alert tone="info">
          {u("bukuSudahBerisi")} {status.data?.postedEntries ?? 0} {u("descBukuTerkunci")}
        </Alert>
      ) : (
        <Card>
          <CardHeader
            title={u("imporSaldoAwal")}
            description={u("descImporSaldoAwal")}
          />
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="asof">{u("tanggalSaldoAwal")}</Label>
              <input
                id="asof"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <Label htmlFor="acc">{u("labelCsvAkun")}</Label>
              <textarea
                id="acc"
                rows={5}
                className={field}
                placeholder={ACCOUNTS_SAMPLE}
                value={accountsCsv}
                onChange={(e) => setAccountsCsv(e.target.value)}
              />
              <button
                type="button"
                className="mt-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
                onClick={() => setAccountsCsv(ACCOUNTS_SAMPLE)}
              >
                Isi contoh
              </button>
            </div>
            <div>
              <Label htmlFor="stk">{u("labelCsvStok")}</Label>
              <textarea
                id="stk"
                rows={4}
                className={field}
                placeholder={STOCK_SAMPLE}
                value={stockCsv}
                onChange={(e) => setStockCsv(e.target.value)}
              />
              <button
                type="button"
                className="mt-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
                onClick={() => setStockCsv(STOCK_SAMPLE)}
              >
                Isi contoh
              </button>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || (!accountsCsv.trim() && !stockCsv.trim())}
            >
              {submit.isPending ? <Spinner /> : <UploadCloud className="size-4" aria-hidden />}{" "}
              {u("simpanSaldoAwal")}
            </Button>
            <p className="text-xs text-slate-400">
              {u("descJurnalPembuka")}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

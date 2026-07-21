import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud } from "lucide-react";
import { useState } from "react";
import { api, formatIDR, parseCsv } from "../api/client";
import { Alert, Button, Card, CardBody, CardHeader, Label, Spinner, useToast } from "../components/ui";
import { useWorkspace } from "./app";

/**
 * Migrasi & saldo awal (Fase 13f) — impor saldo awal akun + stok awal dari CSV
 * lalu susun satu jurnal pembuka seimbang. Hanya tersedia saat buku masih kosong.
 * Format CSV sengaja sederhana agar kompatibel dengan ekspor sistem lama.
 */

type ProductRow = { id: string; sku: string; name: string };
type WarehouseRow = { id: string; name: string; code?: string };
type AccountRow = { code: string; name: string };

const ACCOUNTS_SAMPLE = "kode,debit,kredit\n1-1000,5000000,0\n1-1100,20000000,0\n1-1200,3000000,0\n2-1000,0,4000000\n3-1000,0,24000000";
const STOCK_SAMPLE = "sku,gudang,qty,biaya\nRTL-001,Utama,100,2000\nRTL-002,Utama,50,2500";

export function MigrationPage() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [accountsCsv, setAccountsCsv] = useState("");
  const [stockCsv, setStockCsv] = useState("");
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({ queryKey: ["opening-status", tenant.tenantId], queryFn: () => api.openingStatus(tenant.tenantId) });
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
        if (!validCodes.has(code)) throw new Error(`Kode akun tidak dikenal: ${code}`);
        return { accountCode: code, debit: Math.round(Number(r.debit) || 0), credit: Math.round(Number(r.kredit ?? r.credit) || 0) };
      });
      const bySku = new Map((products.data?.items ?? []).map((p) => [p.sku.toLowerCase(), p.id]));
      const byWh = new Map((warehouses.data?.items ?? []).map((w) => [w.name.toLowerCase(), w.id]));
      const stockInput = stkRows.map((r) => {
        const pid = bySku.get((r.sku ?? "").toLowerCase());
        if (!pid) throw new Error(`SKU tidak ditemukan: ${r.sku}`);
        const wid = byWh.get((r.gudang ?? "").toLowerCase());
        if (!wid) throw new Error(`Gudang tidak ditemukan: ${r.gudang}`);
        return { productId: pid, warehouseId: wid, qty: Math.round(Number(r.qty) || 0), unitCost: Math.round(Number(r.biaya) || 0) };
      });
      return api.setOpeningBalances(tenant.tenantId, { asOfDate, accounts: accountsInput, stock: stockInput });
    },
    onSuccess: (res) => {
      toast("success", `Saldo awal tersimpan (jurnal ${res.entryNo}, nilai stok ${formatIDR(res.stockValue)}).`);
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
  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Migrasi &amp; saldo awal</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pindah dari sistem lama? Masukkan saldo awal akun &amp; stok. Sistem menyusun satu jurnal pembuka yang otomatis
          seimbang — selisih masuk ke Ekuitas Saldo Awal (Laba Ditahan).
        </p>
      </div>

      {!canSet ? (
        <Alert tone="info">
          Buku sudah berisi {status.data?.postedEntries ?? 0} jurnal terposting. Saldo awal hanya bisa diisi saat buku
          masih kosong (perusahaan baru) untuk menjaga integritas pembukuan.
        </Alert>
      ) : (
        <Card>
          <CardHeader
            title="Impor saldo awal"
            description="Tempel data CSV dari sistem lama. Persediaan diambil dari bagian Stok — jangan diisi di saldo akun."
          />
          <CardBody className="space-y-4">
            <div>
              <Label htmlFor="asof">Tanggal saldo awal</Label>
              <input id="asof" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </div>
            <div>
              <Label htmlFor="acc">Saldo akun — CSV: kode, debit, kredit</Label>
              <textarea id="acc" rows={5} className={field} placeholder={ACCOUNTS_SAMPLE} value={accountsCsv} onChange={(e) => setAccountsCsv(e.target.value)} />
              <button type="button" className="mt-1 text-xs text-brand-600 hover:underline dark:text-brand-400" onClick={() => setAccountsCsv(ACCOUNTS_SAMPLE)}>
                Isi contoh
              </button>
            </div>
            <div>
              <Label htmlFor="stk">Stok awal — CSV: sku, gudang, qty, biaya</Label>
              <textarea id="stk" rows={4} className={field} placeholder={STOCK_SAMPLE} value={stockCsv} onChange={(e) => setStockCsv(e.target.value)} />
              <button type="button" className="mt-1 text-xs text-brand-600 hover:underline dark:text-brand-400" onClick={() => setStockCsv(STOCK_SAMPLE)}>
                Isi contoh
              </button>
            </div>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || (!accountsCsv.trim() && !stockCsv.trim())}>
              {submit.isPending ? <Spinner /> : <UploadCloud className="size-4" aria-hidden />} Simpan saldo awal
            </Button>
            <p className="text-xs text-slate-400">
              Jurnal pembuka dijamin seimbang: jika total debit ≠ kredit, selisihnya otomatis ditempatkan di Ekuitas Saldo
              Awal. Nilai persediaan disetel agar cocok dengan buku besar.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

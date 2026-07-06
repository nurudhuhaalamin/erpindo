import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Input, Label, Spinner, useToast } from "../components/ui";
import { useWorkspace } from "./app";

export function CurrenciesPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["currencies", tenant.tenantId],
    queryFn: () => api.currencies(tenant.tenantId),
  });

  const [form, setForm] = useState({ code: "", name: "", rate: "" });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.setCurrency(tenant.tenantId, { code: form.code.trim().toUpperCase(), name: form.name.trim(), rate: Number(form.rate) || 0 }),
    onSuccess: () => {
      toast("success", "Kurs disimpan.");
      setForm({ code: "", name: "", rate: "" });
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["currencies", tenant.tenantId] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const currencies = query.data?.currencies ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mata Uang & Kurs</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          IDR adalah mata uang dasar. Tetapkan kurs valas untuk membuat faktur dalam mata uang asing — pembukuan tetap
          dalam Rupiah, dan selisih kurs saat pelunasan dijurnal otomatis.
        </p>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader title="Tambah / perbarui kurs" description="Kurs = nilai 1 unit valas dalam Rupiah (mis. 1 USD = Rp 16.200)." />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="cur-code">Kode (3 huruf)</Label>
                <Input id="cur-code" maxLength={3} placeholder="USD" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="cur-name">Nama</Label>
                <Input id="cur-name" placeholder="Dolar Amerika" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cur-rate">Kurs (IDR)</Label>
                <Input id="cur-rate" type="number" min={0} placeholder="16200" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending || form.code.trim().length !== 3 || form.name.trim().length < 2 || !form.rate}>
                {save.isPending ? <Spinner /> : null} Simpan Kurs
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Daftar mata uang" />
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="pb-2 pr-4 font-medium">Kode</th>
                    <th className="pb-2 pr-4 font-medium">Nama</th>
                    <th className="pb-2 text-right font-medium">Kurs (IDR)</th>
                  </tr>
                </thead>
                <tbody>
                  {currencies.map((cur) => (
                    <tr key={cur.code} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="py-2 pr-4 font-mono">
                        {cur.code} {cur.isBase ? <Badge tone="neutral">dasar</Badge> : null}
                      </td>
                      <td className="py-2 pr-4">{cur.name}</td>
                      <td className="py-2 text-right tabular-nums">{cur.rate.toLocaleString("id-ID")}</td>
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

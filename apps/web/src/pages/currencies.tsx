import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  PageHeading,
  Spinner,
  Table,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "../components/ui";
import { useUi } from "../i18n/ui";
import { useWorkspace } from "./app";

export function CurrenciesPage() {
  const u = useUi();
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
      api.setCurrency(tenant.tenantId, {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        rate: Number(form.rate) || 0,
      }),
    onSuccess: () => {
      toast("success", u("toastKursDisimpan"));
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
        <PageHeading k="mataUang" />
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader
            title={u("tambahPerbaruiKurs")}
            description={u("descKurs")}
          />
          <CardBody className="space-y-4">
            {error ? <Alert tone="error">{error}</Alert> : null}
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label htmlFor="cur-code">{u("kodeTigaHuruf")}</Label>
                <Input
                  id="cur-code"
                  maxLength={3}
                  placeholder="USD"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="cur-name">{u("nama")}</Label>
                <Input
                  id="cur-name"
                  placeholder={u("cuPhNamaMataUang")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="cur-rate">{u("kursIdr")}</Label>
                <Input
                  id="cur-rate"
                  type="number"
                  min={0}
                  placeholder="16200"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => save.mutate()}
                disabled={
                  save.isPending ||
                  form.code.trim().length !== 3 ||
                  form.name.trim().length < 2 ||
                  !form.rate
                }
              >
                {save.isPending ? <Spinner /> : null} {u("simpanKurs")}
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={u("daftarMataUang")} />
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>{u("kodeKolom")}</Th>
                  <Th>{u("nama")}</Th>
                  <Th numeric>{u("kursIdr")}</Th>
                </tr>
              </Thead>
              <tbody>
                {currencies.map((cur) => (
                  // Kolom Kode BUKAN `numeric`: selnya memuat kode plus lencana
                  // "dasar", bukan satu nilai (aturan 17g/17h).
                  <Tr key={cur.code}>
                    <Td label={u("kodeKolom")} className="font-mono">
                      {cur.code} {cur.isBase ? <Badge tone="neutral">{u("mataUangDasar")}</Badge> : null}
                    </Td>
                    <Td label={u("nama")}>{cur.name}</Td>
                    <Td numeric label={u("kursIdr")}>
                      {cur.rate.toLocaleString("id-ID")}
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

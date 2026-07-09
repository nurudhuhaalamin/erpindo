import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, formatIDR } from "../api/client";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Spinner, useToast } from "../components/ui";
import { useWorkspace } from "./app";

const STATUS_LABEL = { pending: "menunggu", approved: "disetujui", rejected: "ditolak" } as const;

export function ApprovalsPage() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["approvals", tenant.tenantId],
    queryFn: () => api.approvals(tenant.tenantId),
    enabled: tenant.role === "owner",
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["approvals", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["purchases", tenant.tenantId] });
    queryClient.invalidateQueries({ queryKey: ["stock", tenant.tenantId] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => api.approveRequest(tenant.tenantId, id),
    onSuccess: (res) => {
      toast("success", `Disetujui — faktur ${res.docNo} diposting (${formatIDR(res.total)}).`);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.rejectRequest(tenant.tenantId, id),
    onSuccess: () => {
      toast("success", "Permintaan ditolak.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  if (tenant.role !== "owner") {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">Persetujuan</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pengajuan pembelian di atas ambang menunggu keputusan Anda — disetujui baru diposting ke pembukuan.</p>
        <Alert tone="info">
          Halaman ini khusus Owner. Pembelian Anda yang melebihi ambang akan menunggu persetujuan Owner — statusnya
          terlihat lewat notifikasi saat pengajuan.
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Persetujuan</h1>
      <Card>
        <CardHeader
          title="Permintaan pembelian"
          description="Pembelian di atas ambang menunggu keputusan Anda — jurnal & stok baru diproses saat disetujui."
        />
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (query.data?.requests.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada permintaan.</p>
          ) : (
            <div className="space-y-3">
              {query.data!.requests.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{r.request_no}</span>
                    <span>{r.summary}</span>
                    <Badge tone={r.status === "pending" ? "amber" : r.status === "approved" ? "brand" : "neutral"}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatIDR(r.total)}</span>
                    {r.status === "pending" ? (
                      <>
                        <Button className="h-8" onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
                          Setujui
                        </Button>
                        <Button
                          variant="danger"
                          className="h-8"
                          onClick={() => reject.mutate(r.id)}
                          disabled={reject.isPending}
                        >
                          Tolak
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

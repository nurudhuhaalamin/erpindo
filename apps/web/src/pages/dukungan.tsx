import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, formatDate } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Label,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

/**
 * Dukungan & masukan (Fase 10e): semua pengguna bisa mengirim saran fitur,
 * laporan bug, atau pertanyaan langsung ke pengelola ERPindo — plus melihat
 * status masukan yang pernah dikirimnya.
 */
export function DukunganPage() {
  const { me, tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<FeedbackCategory>("saran");
  const [message, setMessage] = useState("");

  const mine = useQuery({ queryKey: ["feedback-mine"], queryFn: api.myFeedback });
  const submit = useMutation({
    mutationFn: () =>
      api.submitFeedback({
        category,
        message: message.trim(),
        pagePath: window.location.pathname,
        tenantId: tenant.tenantId,
      }),
    onSuccess: () => {
      toast("success", "Terima kasih! Masukan Anda sudah kami terima.");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["feedback-mine"] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const rows = mine.data?.feedback ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dukungan &amp; Masukan</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Ada kendala, ide fitur, atau pertanyaan? Sampaikan di sini — masukan Anda dibaca langsung oleh pengelola
          ERPindo dan ikut menentukan prioritas pengembangan.
        </p>
      </div>

      <Card>
        <CardHeader title="Kirim masukan" description={`Dikirim sebagai ${me.user.name} (${me.user.email}).`} />
        <CardBody className="space-y-4">
          {me.user.isDemo ? <Alert tone="info">Mode demo hanya untuk melihat-lihat — masuk dengan akun Anda untuk mengirim masukan.</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
            <div>
              <Label htmlFor="fb-category">Jenis</Label>
              <Select id="fb-category" value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)}>
                {FEEDBACK_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {FEEDBACK_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="fb-message">Pesan</Label>
              <textarea
                id="fb-message"
                rows={4}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Ceritakan sedetail mungkin — halaman apa, apa yang Anda harapkan, dan apa yang terjadi."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || message.trim().length < 5}>
              {submit.isPending ? <Spinner /> : null} Kirim Masukan
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Masukan saya" description="Status ditinjau oleh pengelola ERPindo." />
        <CardBody>
          {mine.isLoading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada masukan yang Anda kirim.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((f) => (
                <div key={f.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{FEEDBACK_CATEGORY_LABELS[f.category]}</Badge>
                    <Badge tone={f.status === "selesai" ? "green" : f.status === "dibaca" ? "amber" : "neutral"}>
                      {FEEDBACK_STATUS_LABELS[f.status]}
                    </Badge>
                    <span className="text-xs text-slate-400">{formatDate(f.createdAt.slice(0, 10))}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{f.message}</p>
                  {f.adminNote ? (
                    <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-brand-900 dark:bg-brand-950/50 dark:text-brand-100">
                      <strong>Balasan pengelola:</strong> {f.adminNote}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

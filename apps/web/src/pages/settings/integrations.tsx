// Bagian Pengaturan (dipecah dari settings.tsx pada Fase 14b — nama ekspor
// tak berubah; settings/index.tsx merakit ulang tab).
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS, type ApiApiKey, type ApiWebhook, type WebhookEvent } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiRequestError } from "../../api/client";
import { Alert, Button, Card, CardBody, CardHeader, ConfirmDialog, Input, Label, Select, Spinner, useToast } from "../../components/ui";

export function ApiIntegrationCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const keys = useQuery({ queryKey: ["api-keys", tenantId], queryFn: () => api.apiKeys(tenantId), retry: false });
  const hooks = useQuery({ queryKey: ["webhooks", tenantId], queryFn: () => api.webhooks(tenantId), retry: false });

  const [keyName, setKeyName] = useState("");
  const [keyScope, setKeyScope] = useState<"read" | "write">("read");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const createKey = useMutation({
    mutationFn: () => api.createApiKey(tenantId, { name: keyName.trim(), scope: keyScope }),
    onSuccess: (res) => {
      setNewKey(res.key);
      setKeyName("");
      queryClient.invalidateQueries({ queryKey: ["api-keys", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const revokeKey = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(tenantId, id),
    onSuccess: () => {
      toast("success", "API key dicabut.");
      queryClient.invalidateQueries({ queryKey: ["api-keys", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const createHook = useMutation({
    mutationFn: () => api.createWebhook(tenantId, { url: hookUrl.trim(), events: hookEvents }),
    onSuccess: (res) => {
      setNewSecret(res.secret);
      setHookUrl("");
      queryClient.invalidateQueries({ queryKey: ["webhooks", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const deleteHook = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(tenantId, id),
    onSuccess: () => {
      toast("success", "Webhook dihapus.");
      queryClient.invalidateQueries({ queryKey: ["webhooks", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const err = keys.error as ApiRequestError | undefined;
  if (err && err.status === 403) {
    return (
      <Card>
        <CardHeader title="API & Integrasi" description="API publik & webhook untuk menghubungkan sistem lain." />
        <CardBody>
          <Alert tone="info">
            <div className="font-medium">Tersedia di paket Enterprise</div>
            <p className="mt-1 text-sm">
              Buat API key (Bearer) untuk membaca &amp; menulis data lewat API terkurasi, dan terima webhook saat faktur
              atau pembayaran terjadi. Lihat <a className="underline" href="/api-docs" target="_blank" rel="noreferrer">dokumentasi API</a>.
              Tingkatkan ke Enterprise untuk mengaktifkannya.
            </p>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  const activeKeys = (keys.data?.keys ?? []).filter((k) => !k.revokedAt);

  return (
    <Card>
      <CardHeader
        title="API & Integrasi"
        description="Hubungkan toko online / sistem lain lewat API publik & webhook."
      />
      <CardBody className="space-y-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Panduan lengkap ada di <a className="text-brand-600 underline" href="/api-docs" target="_blank" rel="noreferrer">/api-docs</a>.
        </p>

        {/* --- API keys --- */}
        <div>
          <div className="text-sm font-semibold">API key</div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[10rem]">
              <Label>Nama kunci</Label>
              <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="mis. Integrasi toko online" />
            </div>
            <div>
              <Label>Skop</Label>
              <Select value={keyScope} onChange={(e) => setKeyScope(e.target.value as "read" | "write")}>
                <option value="read">Baca saja</option>
                <option value="write">Baca &amp; tulis</option>
              </Select>
            </div>
            <Button onClick={() => createKey.mutate()} disabled={createKey.isPending || keyName.trim().length < 2}>
              {createKey.isPending ? "Membuat…" : "Buat kunci"}
            </Button>
          </div>
          {newKey ? (
            <Alert tone="success">
              <div className="text-sm font-medium">Salin kunci ini sekarang — hanya ditampilkan sekali:</div>
              <code className="mt-1 block break-all rounded bg-white/70 px-2 py-1 text-xs dark:bg-slate-900/60">{newKey}</code>
              <button className="mt-1 text-xs underline" onClick={() => setNewKey(null)}>Sudah saya salin</button>
            </Alert>
          ) : null}
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/60">
            {keys.isLoading ? (
              <Spinner />
            ) : activeKeys.length === 0 ? (
              <p className="py-2 text-xs text-slate-500 dark:text-slate-400">Belum ada API key aktif.</p>
            ) : (
              activeKeys.map((k: ApiApiKey) => (
                <div key={k.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{k.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      <code>{k.prefix}</code> · {k.scope === "write" ? "baca & tulis" : "baca"} ·{" "}
                      {k.lastUsedAt ? `dipakai ${k.lastUsedAt.slice(0, 10)}` : "belum dipakai"}
                    </div>
                  </div>
                  <Button variant="secondary" className="h-8" onClick={() => revokeKey.mutate(k.id)} disabled={revokeKey.isPending}>
                    Cabut
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* --- Webhook --- */}
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="text-sm font-semibold">Webhook</div>
          <div className="mt-2 space-y-2">
            <div>
              <Label>URL penerima</Label>
              <Input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://sistem-anda.co.id/webhook" />
            </div>
            <div className="flex flex-wrap gap-3">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300"
                    checked={hookEvents.includes(ev)}
                    onChange={(e) =>
                      setHookEvents((prev) => (e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)))
                    }
                  />
                  {WEBHOOK_EVENT_LABELS[ev]}
                </label>
              ))}
            </div>
            <Button onClick={() => createHook.mutate()} disabled={createHook.isPending || hookUrl.trim().length < 8 || hookEvents.length === 0}>
              {createHook.isPending ? "Menyimpan…" : "Tambah webhook"}
            </Button>
          </div>
          {newSecret ? (
            <Alert tone="success">
              <div className="text-sm font-medium">Secret HMAC (untuk verifikasi tanda tangan) — simpan sekarang:</div>
              <code className="mt-1 block break-all rounded bg-white/70 px-2 py-1 text-xs dark:bg-slate-900/60">{newSecret}</code>
              <button className="mt-1 text-xs underline" onClick={() => setNewSecret(null)}>Sudah saya salin</button>
            </Alert>
          ) : null}
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/60">
            {hooks.isLoading ? (
              <Spinner />
            ) : (hooks.data?.webhooks ?? []).length === 0 ? (
              <p className="py-2 text-xs text-slate-500 dark:text-slate-400">Belum ada webhook.</p>
            ) : (
              (hooks.data?.webhooks ?? []).map((w: ApiWebhook) => (
                <div key={w.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{w.url}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {w.events.join(", ")}
                      {w.lastStatus ? ` · terakhir: ${w.lastStatus}` : ""}
                    </div>
                  </div>
                  <Button variant="secondary" className="h-8" onClick={() => deleteHook.mutate(w.id)} disabled={deleteHook.isPending}>
                    Hapus
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}


export function CloseBooksCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings", tenantId], queryFn: () => api.settings(tenantId) });
  const lockedBefore = settingsQuery.data?.settings.locked_before;

  const [date, setDate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closingOpen, setClosingOpen] = useState(false);
  const closing = useMutation({
    mutationFn: () => api.closingEntry(tenantId, date),
    onSuccess: (res) => {
      toast("success", `Jurnal penutup ${res.entryNo} diposting — laba/rugi bersih dipindahkan ke Laba Ditahan.`);
      setClosingOpen(false);
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setClosingOpen(false);
    },
  });
  const close = useMutation({
    mutationFn: () => api.closeBooks(tenantId, date),
    onSuccess: (res) => {
      toast("success", `Pembukuan dikunci sampai ${res.lockedBefore}.`);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["settings", tenantId] });
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setConfirmOpen(false);
    },
  });

  return (
    <Card>
      <CardHeader
        title="Tutup buku"
        description="Semua transaksi bertanggal pada atau sebelum tanggal ini akan dikunci — tidak bisa ditambah jurnal, faktur, maupun pembayaran. Tanggal kunci hanya bisa maju."
      />
      <CardBody className="space-y-3">
        {lockedBefore ? (
          <p className="text-sm">
            Pembukuan saat ini terkunci sampai <strong>{lockedBefore}</strong>.
          </p>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada periode yang ditutup.</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="close-date">Kunci sampai tanggal</Label>
            <Input id="close-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button variant="danger" disabled={!date || close.isPending} onClick={() => setConfirmOpen(true)}>
            Tutup Buku
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title={`Tutup buku sampai ${date}?`}
          description="Semua transaksi bertanggal pada atau sebelum tanggal ini akan terkunci permanen — jurnal, faktur, pembayaran, dan retur tidak bisa lagi ditambahkan. Tanggal kunci tidak bisa dimundurkan."
          confirmLabel="Ya, kunci pembukuan"
          danger
          busy={close.isPending}
          onConfirm={() => close.mutate()}
          onCancel={() => setConfirmOpen(false)}
        />

        <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Jurnal penutup tahunan: pindahkan laba/rugi berjalan sampai tanggal di atas ke akun Laba Ditahan —
            biasanya dilakukan sekali di akhir tahun buku, sebelum mengunci periode.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={!date || closing.isPending} onClick={() => setClosingOpen(true)}>
              Posting Jurnal Penutup
            </Button>
          </div>
          <ConfirmDialog
            open={closingOpen}
            title={`Posting jurnal penutup per ${date}?`}
            description="Semua saldo pendapatan dan beban sampai tanggal itu dinolkan; laba/rugi bersihnya dipindahkan ke Laba Ditahan. Ini jurnal biasa (bisa dilihat di Jurnal Umum), tapi sebaiknya hanya dilakukan di akhir tahun buku."
            confirmLabel="Ya, posting jurnal penutup"
            busy={closing.isPending}
            onConfirm={() => closing.mutate()}
            onCancel={() => setClosingOpen(false)}
          />
        </div>
      </CardBody>
    </Card>
  );
}


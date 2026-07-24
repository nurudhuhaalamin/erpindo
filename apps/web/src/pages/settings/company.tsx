// Bagian Pengaturan (dipecah dari settings.tsx pada Fase 14b — nama ekspor
// tak berubah; settings/index.tsx merakit ulang tab).
import { DOC_TYPES, isValidDocPattern, PLAN_LABELS, PLAN_LIMITS, renderDocNumber, type ApiDocNumbering, type DocType } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, formatDate } from "../../api/client";
import { Badge, Button, Card, CardBody, CardHeader, Input, Label, Skeleton, Spinner, useToast } from "../../components/ui";
import { useWorkspace } from "../app";

export function DocNumberingCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["doc-numbering", tenantId], queryFn: () => api.docNumbering(tenantId) });
  const [patterns, setPatterns] = useState<ApiDocNumbering>({});
  const [loaded, setLoaded] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  if (query.data && !loaded) {
    setPatterns(query.data.numbering ?? {});
    setLoaded(true);
  }

  const save = useMutation({
    mutationFn: () => api.updateDocNumbering(tenantId, patterns),
    onSuccess: (res) => {
      toast("success", "Format nomor dokumen disimpan.");
      setPatterns(res.numbering ?? {});
      queryClient.invalidateQueries({ queryKey: ["doc-numbering", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  // Pola tak valid (terisi tapi tanpa {SEQ}) menonaktifkan tombol simpan.
  const invalid = DOC_TYPES.some((d) => {
    const v = patterns[d.key];
    return v && v.trim().length > 0 && !isValidDocPattern(v.trim());
  });

  return (
    <Card>
      <CardHeader
        title="Penomoran dokumen"
        description="Sesuaikan format nomor faktur, pembelian, dan pembayaran. Kosongkan untuk format bawaan."
      />
      <CardBody className="space-y-4">
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {DOC_TYPES.map((d: (typeof DOC_TYPES)[number]) => {
              const key = d.key as DocType;
              const value = patterns[key] ?? "";
              const effective = value.trim() || d.example;
              const valid = isValidDocPattern(effective);
              return (
                <div key={key}>
                  <Label>{d.label}</Label>
                  <Input
                    value={value}
                    onChange={(e) => setPatterns((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={`Bawaan · contoh: ${d.example}`}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {valid ? (
                      <>
                        Pratinjau: <code>{renderDocNumber(effective, today, 1)}</code>
                        {value.trim() ? "" : " (format bawaan)"}
                      </>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400">Pola harus memuat token {"{SEQ}"}.</span>
                    )}
                  </p>
                </div>
              );
            })}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Token: <code>{"{YYYY}"}</code> tahun · <code>{"{MM}"}</code> bulan · <code>{"{SEQ:4}"}</code> nomor urut
              (4 digit). Bila memuat <code>{"{YYYY}"}</code>/<code>{"{MM}"}</code>, urutan otomatis reset tiap periode.
            </p>
            <Button onClick={() => save.mutate()} disabled={save.isPending || invalid}>
              {save.isPending ? "Menyimpan…" : "Simpan format"}
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API publik & webhook (Fase 13h) — modul apiAccess (paket Enterprise). Kelola
// API key (Bearer) + webhook langganan peristiwa. 403 → kartu upsell.
// ---------------------------------------------------------------------------

const INVOICE_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu bayar",
  paid: "Lunas",
  failed: "Gagal",
  expired: "Kedaluwarsa",
};

export function SubscriptionCard() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const isOwner = tenant.role === "owner";
  const billing = useQuery({ queryKey: ["billing", tenant.tenantId], queryFn: () => api.billing(tenant.tenantId) });

  const checkout = useMutation({
    mutationFn: (plan: "starter" | "business" | "enterprise") => api.billingCheckout(tenant.tenantId, plan),
    onSuccess: (r) => {
      // Alur redirect Snap (bukan popup snap.js) — aman terhadap CSP.
      window.location.href = r.redirectUrl;
    },
    onError: (e) => toast("error", (e as Error).message),
  });

  const b = billing.data;
  const daysLeft = tenant.trialEndsAt
    ? Math.max(Math.ceil((Date.parse(tenant.trialEndsAt) - Date.now()) / 86_400_000), 0)
    : null;
  const subUntil = b?.subscriptionEndsAt ?? tenant.subscriptionEndsAt ?? null;
  const legacy = b?.legacyFullAccess ?? false;

  return (
    <Card>
      <CardHeader title="Langganan" description="Paket, status, dan pembayaran akun perusahaan Anda." />
      <CardBody className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">Paket:</span>
          <Badge tone="brand">{PLAN_LABELS[tenant.plan]}</Badge>
          {tenant.tenantStatus === "past_due" ? (
            <Badge tone="amber">baca-saja — langganan berakhir</Badge>
          ) : tenant.tenantStatus === "trial" && daysLeft !== null ? (
            <Badge tone="amber">trial, sisa {daysLeft} hari</Badge>
          ) : (
            <Badge>aktif{subUntil ? ` s/d ${formatDate(subUntil.slice(0, 10))}` : ""}</Badge>
          )}
          {legacy ? <Badge tone="brand">akses penuh (pelanggan awal)</Badge> : null}
        </div>

        {legacy ? (
          <p className="text-slate-500 dark:text-slate-400">
            Sebagai pelanggan awal, akun Anda mendapat <span className="font-medium">akses semua modul</span> tanpa
            perubahan harga. Terima kasih sudah bergabung sejak awal. 🙏
          </p>
        ) : null}

        {/* Pemilih paket (Fase 13b): kartu Starter / Business / Enterprise. */}
        <div className="grid gap-3 sm:grid-cols-3">
          {(["starter", "business", "enterprise"] as const).map((plan) => {
            const info = PLAN_LIMITS[plan];
            const current = tenant.plan === plan;
            const popular = plan === "business";
            return (
              <div
                key={plan}
                className={`flex flex-col rounded-xl border p-3 ${
                  current
                    ? "border-brand-500 bg-brand-50/50 dark:border-brand-500 dark:bg-brand-950/30"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{info.label}</span>
                  {popular ? <Badge tone="brand">Populer</Badge> : null}
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  Rp {info.pricePerMonth.toLocaleString("id-ID")}
                  <span className="text-xs font-normal text-slate-400">/bln</span>
                </div>
                <ul className="mt-2 flex-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <li>Pengguna tak terbatas</li>
                  <li>
                    {plan === "starter"
                      ? "Akuntansi, penjualan, POS, stok, pajak"
                      : plan === "business"
                        ? "+ HR, proyek, manufaktur, pengadaan, CRM"
                        : "+ multi-entitas, konsolidasi, API, keamanan"}
                  </li>
                  <li>AI {info.aiDailyLimit}/hari{info.maxEntities > 1 ? ` · ${info.maxEntities} entitas` : ""}</li>
                </ul>
                {b?.configured && isOwner && !current ? (
                  <Button
                    className="mt-2 h-8 w-full text-xs"
                    variant={popular ? "primary" : "secondary"}
                    onClick={() => checkout.mutate(plan)}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? "Mengalihkan…" : "Pilih paket"}
                  </Button>
                ) : current ? (
                  <div className="mt-2 text-center text-xs font-medium text-brand-600 dark:text-brand-400">Paket Anda</div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!b?.configured ? (
          <p className="text-slate-500 dark:text-slate-400">
            Pembayaran langganan online sedang disiapkan — untuk saat ini hubungi kami untuk aktivasi paket.
          </p>
        ) : !isOwner ? (
          <p className="text-slate-500 dark:text-slate-400">Hubungi Pemilik perusahaan untuk mengatur pembayaran langganan.</p>
        ) : (
          <p className="text-xs text-slate-400">
            Pembayaran aman via Midtrans (QRIS, transfer bank, kartu, e-wallet). Akun aktif otomatis setelah pembayaran
            terkonfirmasi. Tim &amp; grup perusahaan dapat menghubungi kami untuk penawaran khusus.
          </p>
        )}

        {b && b.invoices.length > 0 ? (
          <div className="pt-1">
            <div className="mb-1 font-medium text-slate-600 dark:text-slate-300">Riwayat tagihan</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {b.invoices.slice(0, 6).map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="py-1.5 pr-3 text-slate-500 dark:text-slate-400">{formatDate(inv.createdAt.slice(0, 10))}</td>
                      <td className="py-1.5 pr-3 tabular-nums">Rp {inv.amount.toLocaleString("id-ID")}</td>
                      <td className="py-1.5">
                        <Badge tone={inv.status === "paid" ? "green" : inv.status === "pending" ? "amber" : "neutral"}>
                          {INVOICE_STATUS_LABEL[inv.status] ?? inv.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}


export function CompanySettingsCard({ tenantId, readOnly }: { tenantId: string; readOnly: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["settings", tenantId], queryFn: () => api.settings(tenantId) });

  const mutation = useMutation({
    mutationFn: (input: { displayName?: string; address?: string; npwp?: string }) =>
      api.updateSettings(tenantId, input),
    onSuccess: () => {
      toast("success", "Pengaturan perusahaan disimpan.");
      queryClient.invalidateQueries({ queryKey: ["settings", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    mutation.mutate({ displayName: data.displayName, address: data.address, npwp: data.npwp });
  }

  const s = query.data?.settings ?? {};
  return (
    <Card>
      <CardHeader title="Profil perusahaan" description="Data ini tersimpan di database khusus perusahaan Anda." />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="displayName">Nama tampilan</Label>
              <Input id="displayName" name="displayName" defaultValue={s.display_name ?? ""} disabled={readOnly} />
            </div>
            <div>
              <Label htmlFor="address">Alamat</Label>
              <Input id="address" name="address" defaultValue={s.address ?? ""} disabled={readOnly} />
            </div>
            <div>
              <Label htmlFor="npwp">NPWP</Label>
              <Input id="npwp" name="npwp" defaultValue={s.npwp ?? ""} disabled={readOnly} />
            </div>
            <LogoUploader tenantId={tenantId} current={s.logo_data_url ?? ""} readOnly={readOnly} />
            {readOnly ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Hanya Owner/Admin yang dapat mengubah pengaturan.
              </p>
            ) : (
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Spinner /> : null} Simpan
              </Button>
            )}
          </form>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Unggah logo kop faktur/struk: gambar dikecilkan di browser (kanvas, sisi
 * terpanjang 256px, PNG) sampai muat ≤64KB base64, lalu disimpan ke settings
 * DB tenant — tanpa butuh object storage.
 */
function LogoUploader({ tenantId, current, readOnly }: { tenantId: string; current: string; readOnly: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: (logoDataUrl: string) => api.updateSettings(tenantId, { logoDataUrl }),
    onSuccess: (_res, logoDataUrl) => {
      toast("success", logoDataUrl ? "Logo tersimpan — tampil di cetakan faktur & struk." : "Logo dihapus.");
      queryClient.invalidateQueries({ queryKey: ["settings", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      toast("error", "Format harus PNG, JPEG, WebP, atau SVG.");
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxSide = 256;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length > 90_000) {
        toast("error", "Logo masih terlalu besar setelah dikecilkan — gunakan gambar yang lebih sederhana.");
        return;
      }
      save.mutate(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toast("error", "Gambar tidak bisa dibaca.");
    };
    img.src = objectUrl;
  }

  return (
    <div>
      <Label>Logo kop faktur &amp; struk</Label>
      <div className="flex flex-wrap items-center gap-3">
        {current ? (
          <img
            src={current}
            alt="Logo perusahaan"
            className="h-12 w-auto max-w-28 rounded border border-slate-200 bg-white object-contain p-1 dark:border-slate-700"
          />
        ) : (
          <span className="text-sm text-slate-400">Belum ada logo.</span>
        )}
        {readOnly ? null : (
          <>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onFile} />
            <Button type="button" variant="secondary" className="h-9" onClick={() => fileRef.current?.click()} disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null} {current ? "Ganti logo" : "Unggah logo"}
            </Button>
            {current ? (
              <Button type="button" variant="ghost" className="h-9" onClick={() => save.mutate("")} disabled={save.isPending}>
                Hapus
              </Button>
            ) : null}
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">PNG/JPEG/WebP/SVG — otomatis dikecilkan; tampil di kop faktur cetak & struk POS.</p>
    </div>
  );
}


export function NewCompanyCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");

  const create = useMutation({
    mutationFn: () => api.createCompany({ companyName: companyName.trim() }),
    onSuccess: (res) => {
      toast("success", "Perusahaan baru dibuat. Beralih ke perusahaan tersebut…");
      setCompanyName("");
      queryClient.invalidateQueries({ queryKey: ["me"] });
      localStorage.setItem("erpindo-tenant", res.tenantId);
      window.location.href = "/app";
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <Card>
      <CardHeader
        title="Perusahaan lain"
        description="Kelola beberapa badan usaha dari satu akun. Setiap perusahaan punya pembukuan terpisah — laporan gabungannya tersedia di menu Konsolidasi."
      />
      <CardBody className="flex flex-wrap items-end gap-3">
        <div className="flex-1 sm:max-w-xs">
          <Label htmlFor="new-company">Nama perusahaan baru</Label>
          <Input
            id="new-company"
            placeholder="mis. PT Cabang Kedua"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending || companyName.trim().length < 2}>
          {create.isPending ? <Spinner /> : null} Tambah Perusahaan
        </Button>
      </CardBody>
    </Card>
  );
}


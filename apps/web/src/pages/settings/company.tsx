// Bagian Pengaturan (dipecah dari settings.tsx pada Fase 14b — nama ekspor
// tak berubah; settings/index.tsx merakit ulang tab).
import {
  CUSTOM_FIELD_MODULES,
  CUSTOM_FIELD_TYPES,
  DOC_TYPES,
  isValidDocPattern,
  PLAN_LABELS,
  PLAN_LIMITS,
  renderDocNumber,
  type ApiDocNumbering,
  type CustomFieldModule,
  type CustomFieldType,
  type DocType,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, formatDate } from "../../api/client";
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, Input, Label, Select, Skeleton, Spinner, useToast } from "../../components/ui";
import { TIPE_KEY } from "../../components/customFields";
import { useUi, type UiKey } from "../../i18n/ui";
import { useWorkspace } from "../app";

export function DocNumberingCard({ tenantId }: { tenantId: string }) {
  const u = useUi();
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
        title={u("penomoranDokumen")}
        description={u("descPenomoranDokumen")}
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
                    placeholder={`${u("bawaanContoh")} ${d.example}`}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {valid ? (
                      <>
                        {u("pratinjauLabel")} <code>{renderDocNumber(effective, today, 1)}</code>
                        {value.trim() ? "" : ` ${u("formatBawaan")}`}
                      </>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400">{u("polaHarusSeq")} {"{SEQ}"}.</span>
                    )}
                  </p>
                </div>
              );
            })}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Token: <code>{"{YYYY}"}</code> {u("tokenTahun")} · <code>{"{MM}"}</code> {u("tokenBulan")} ·{" "}
              <code>{"{SEQ:4}"}</code> {u("tokenNomorUrut")} <code>{"{YYYY}"}</code>/<code>{"{MM}"}</code>
              {u("tokenResetPeriode")}
            </p>
            <Button onClick={() => save.mutate()} disabled={save.isPending || invalid}>
              {save.isPending ? u("menyimpanEllipsis") : u("simpanFormat")}
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

// Status tagihan datang dari server sebagai kode; label diterjemahkan di sisi
// web lewat kunci kamus — pola tetap sejak Fase 16t.
const INVOICE_STATUS_KEY: Record<string, UiKey> = {
  pending: "statusMenungguBayar",
  paid: "statusLunas",
  failed: "statusGagal",
  expired: "statusKedaluwarsa",
};

export function SubscriptionCard() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isOwner = tenant.role === "owner";
  const billing = useQuery({ queryKey: ["billing", tenant.tenantId], queryFn: () => api.billing(tenant.tenantId) });

  // --- Ganti paket dengan prorata (Fase 20k) --------------------------------
  // Paket tujuan yang sedang dipertimbangkan. Pratinjau diambil untuk paket
  // ini SEBELUM apa pun ditagih — angkanya harus terlihat dulu.
  const [targetPlan, setTargetPlan] = useState<"starter" | "business" | "enterprise" | null>(null);
  const prorata = useQuery({
    queryKey: ["prorata", tenant.tenantId, targetPlan],
    queryFn: () => api.billingProrata(tenant.tenantId, targetPlan!),
    enabled: Boolean(targetPlan),
  });
  const changePlan = useMutation({
    mutationFn: (plan: "starter" | "business" | "enterprise") => api.billingChangePlan(tenant.tenantId, plan),
    onSuccess: (r) => {
      if (r.redirectUrl) {
        window.location.href = r.redirectUrl;
        return;
      }
      setTargetPlan(null);
      queryClient.invalidateQueries({ queryKey: ["billing", tenant.tenantId] });
      toast("success", `${u("turunPaket")} — ${u("prorataTurunInfo")}`);
    },
    onError: (e) => toast("error", (e as Error).message),
  });

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
  // Prorata hanya masuk akal bila ada siklus berjalan yang tersisa; tanpa itu
  // pindah paket = pembelian biasa (server juga menolaknya dengan 400).
  const langgananAktif = Boolean(subUntil && Date.parse(subUntil) > Date.now());

  return (
    <Card>
      <CardHeader title={u("langgananJudul")} description={u("descLangganan")} />
      <CardBody className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">{u("paketLabel")}</span>
          <Badge tone="brand">{PLAN_LABELS[tenant.plan]}</Badge>
          {tenant.tenantStatus === "past_due" ? (
            <Badge tone="amber">{u("bacaSajaBerakhir")}</Badge>
          ) : tenant.tenantStatus === "trial" && daysLeft !== null ? (
            <Badge tone="amber">{u("trialSisa")} {daysLeft} {u("hariTersisa")}</Badge>
          ) : (
            <Badge>{u("aktifKecil")}{subUntil ? ` ${u("sampaiDengan")} ${formatDate(subUntil.slice(0, 10))}` : ""}</Badge>
          )}
          {legacy ? <Badge tone="brand">{u("aksesPenuhPelangganAwal")}</Badge> : null}
          {/* Fase 20k: penurunan paket yang menunggu akhir periode. Ditampilkan
              supaya pemilik tidak mengira permintaannya tidak tercatat. */}
          {b?.pendingPlan ? (
            <Badge tone="amber">
              {u("paketTurunTerjadwal")} {PLAN_LABELS[b.pendingPlan]}
              {subUntil ? ` ${u("padaTanggal")} ${formatDate(subUntil.slice(0, 10))}` : ""}
            </Badge>
          ) : null}
        </div>

        {legacy ? (
          <p className="text-slate-500 dark:text-slate-400">
            {u("descPelangganAwal1")} <span className="font-medium">{u("aksesSemuaModul")}</span>{" "}
            {u("descPelangganAwal2")}
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
                  {popular ? <Badge tone="brand">{u("populer")}</Badge> : null}
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  Rp {info.pricePerMonth.toLocaleString("id-ID")}
                  <span className="text-xs font-normal text-slate-400">/bln</span>
                </div>
                <ul className="mt-2 flex-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <li>{u("penggunaTakTerbatas")}</li>
                  <li>
                    {plan === "starter"
                      ? u("fiturStarter")
                      : plan === "business"
                        ? u("fiturBusiness")
                        : u("fiturEnterprise")}
                  </li>
                  <li>{u("aiPerHari")} {info.aiDailyLimit}/{u("hariSuffix")}{info.maxEntities > 1 ? ` · ${info.maxEntities} ${u("entitasSatuan")}` : ""}</li>
                </ul>
                {isOwner && !current && langgananAktif ? (
                  // Sudah berlangganan → pindah paket dihitung prorata, bukan
                  // dibeli ulang sebulan penuh.
                  <Button
                    className="mt-2 h-8 w-full text-xs"
                    variant={popular ? "primary" : "secondary"}
                    data-testid={`ganti-paket-${plan}`}
                    onClick={() => setTargetPlan(plan)}
                    disabled={changePlan.isPending}
                  >
                    {info.pricePerMonth > PLAN_LIMITS[tenant.plan].pricePerMonth
                      ? u("naikPaket")
                      : u("turunPaket")}
                  </Button>
                ) : b?.configured && isOwner && !current ? (
                  <Button
                    className="mt-2 h-8 w-full text-xs"
                    variant={popular ? "primary" : "secondary"}
                    onClick={() => checkout.mutate(plan)}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? u("mengalihkanEllipsis") : u("pilihPaket")}
                  </Button>
                ) : current ? (
                  <div className="mt-2 text-center text-xs font-medium text-brand-600 dark:text-brand-400">{u("paketAnda")}</div>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Fase 20k — pratinjau prorata SEBELUM apa pun ditagih. Angkanya
            berasal dari `hitungProrata()` di server, rumus yang sama persis
            dengan yang dipakai saat menagih; tidak ada hitungan kedua di sini
            yang bisa berbeda diam-diam. */}
        <ConfirmDialog
          open={Boolean(targetPlan)}
          title={`${u("gantiPaket")} — ${targetPlan ? PLAN_LABELS[targetPlan] : ""}`}
          description={
            prorata.isLoading || !prorata.data ? (
              u("hitungProrataMemuat")
            ) : (
              <span className="space-y-2 block" data-testid="pratinjau-prorata">
                {prorata.data.arah === "naik" ? (
                  <>
                    <span className="block text-base font-semibold tabular-nums">
                      {u("prorataBayarSekarang")}: Rp{" "}
                      {prorata.data.bayarSekarang.toLocaleString("id-ID")}
                    </span>
                    <span className="block text-xs">
                      {prorata.data.sisaHari} {u("prorataSisaHari")}
                    </span>
                    <span className="block">{u("prorataNaikInfo")}</span>
                  </>
                ) : (
                  <span className="block">{u("prorataTurunInfo")}</span>
                )}
              </span>
            )
          }
          confirmLabel={u("gantiPaket")}
          busy={changePlan.isPending}
          onConfirm={() => targetPlan && changePlan.mutate(targetPlan)}
          onCancel={() => setTargetPlan(null)}
        />

        {!b?.configured ? (
          <p className="text-slate-500 dark:text-slate-400">
            {u("descBillingBelumSiap")}
          </p>
        ) : !isOwner ? (
          <p className="text-slate-500 dark:text-slate-400">{u("hubungiPemilikLangganan")}</p>
        ) : (
          <p className="text-xs text-slate-400">
            {u("descPembayaranAman")}
          </p>
        )}

        {b && b.invoices.length > 0 ? (
          <div className="pt-1">
            <div className="mb-1 font-medium text-slate-600 dark:text-slate-300">{u("riwayatTagihan")}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {b.invoices.slice(0, 6).map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="py-1.5 pr-3 text-slate-500 dark:text-slate-400">{formatDate(inv.createdAt.slice(0, 10))}</td>
                      <td className="py-1.5 pr-3 tabular-nums">Rp {inv.amount.toLocaleString("id-ID")}</td>
                      <td className="py-1.5">
                        <Badge tone={inv.status === "paid" ? "green" : inv.status === "pending" ? "amber" : "neutral"}>
                          {INVOICE_STATUS_KEY[inv.status] ? u(INVOICE_STATUS_KEY[inv.status]!) : inv.status}
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


/**
 * Definisi field kustom per modul (Fase 20j).
 *
 * Menghapus definisi = MENGARSIPKAN, bukan menghapus. Penghapusan sungguhan
 * ikut membuang seluruh nilainya (ON DELETE CASCADE) — data yang sudah dicatat
 * pemilik pada ratusan dokumen lenyap karena satu klik di layar pengaturan.
 */
export function CustomFieldsCard({ tenantId }: { tenantId: string }) {
  const u = useUi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["custom-fields", tenantId],
    queryFn: () => api.customFieldDefs(tenantId),
  });

  const [module, setModule] = useState<CustomFieldModule>("contact");
  const [fieldKey, setFieldKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("teks");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [hapusId, setHapusId] = useState<string | null>(null);

  const MODUL_KEY: Record<CustomFieldModule, UiKey> = {
    contact: "modulKontak",
    product: "modulProduk",
    invoice: "modulFaktur",
  };

  const reset = () => {
    setFieldKey("");
    setLabel("");
    setOptions("");
    setRequired(false);
  };

  const buat = useMutation({
    mutationFn: () =>
      api.createCustomFieldDef(tenantId, {
        module,
        fieldKey,
        label,
        type,
        required,
        sortOrder: 0,
        ...(type === "pilihan"
          ? { options: options.split(",").map((o) => o.trim()).filter(Boolean) }
          : {}),
      }),
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ["custom-fields", tenantId] });
      toast("success", `${u("fieldKustom")}: ${label}`);
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const arsip = useMutation({
    mutationFn: (id: string) => api.archiveCustomFieldDef(tenantId, id),
    onSuccess: () => {
      setHapusId(null);
      queryClient.invalidateQueries({ queryKey: ["custom-fields", tenantId] });
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const byModule = query.data?.byModule;
  const semua = byModule ? Object.values(byModule).flat() : [];

  return (
    <Card>
      <CardHeader title={u("fieldKustom")} description={u("descFieldKustom")} />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[10rem_10rem_1fr_9rem_auto] sm:items-end">
          <div>
            <Label htmlFor="cf-module">{u("modulField")}</Label>
            <Select
              id="cf-module"
              value={module}
              onChange={(e) => setModule(e.target.value as CustomFieldModule)}
            >
              {CUSTOM_FIELD_MODULES.map((m) => (
                <option key={m} value={m}>
                  {u(MODUL_KEY[m])}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cf-key">{u("kunciField")}</Label>
            <Input id="cf-key" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cf-label">{u("labelField")}</Label>
            <Input id="cf-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cf-type">{u("tipeField")}</Label>
            <Select
              id="cf-type"
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
            >
              {CUSTOM_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {u(TIPE_KEY[t])}
                </option>
              ))}
            </Select>
          </div>
          <Button
            onClick={() => buat.mutate()}
            disabled={buat.isPending || !fieldKey.trim() || label.trim().length < 2}
          >
            {buat.isPending ? <Spinner /> : null} {u("tambahFieldKustom")}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          {type === "pilihan" ? (
            <div>
              <Label htmlFor="cf-options">{u("pilihanField")}</Label>
              <Input id="cf-options" value={options} onChange={(e) => setOptions(e.target.value)} />
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">{u("hintKunciField")}</p>
          )}
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            {u("wajibDiisi")}
          </label>
        </div>

        {query.isLoading ? (
          <Spinner />
        ) : semua.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{u("belumAdaFieldKustom")}</p>
        ) : (
          <div data-testid="daftar-field-kustom" className="space-y-1">
            {semua.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-800"
              >
                <Badge>{u(MODUL_KEY[d.module])}</Badge>
                <span className="font-medium">{d.label}</span>
                <span className="font-mono text-xs text-slate-400">{d.fieldKey}</span>
                <Badge tone="neutral">{u(TIPE_KEY[d.type])}</Badge>
                {d.required ? <Badge tone="amber">{u("wajibDiisi")}</Badge> : null}
                <Button
                  className="ml-auto h-8 text-xs"
                  variant="ghost"
                  aria-label={`${u("arsipkanField")} ${d.label}`}
                  onClick={() => setHapusId(d.id)}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}

        <ConfirmDialog
          open={Boolean(hapusId)}
          title={u("konfirmArsipField")}
          description={u("descArsipField")}
          confirmLabel={u("arsipkanField")}
          busy={arsip.isPending}
          onConfirm={() => hapusId && arsip.mutate(hapusId)}
          onCancel={() => setHapusId(null)}
        />
      </CardBody>
    </Card>
  );
}

export function CompanySettingsCard({ tenantId, readOnly }: { tenantId: string; readOnly: boolean }) {
  const u = useUi();
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
      <CardHeader title={u("profilPerusahaan")} description={u("descProfilPerusahaanDb")} />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="displayName">{u("namaTampilan")}</Label>
              <Input id="displayName" name="displayName" defaultValue={s.display_name ?? ""} disabled={readOnly} />
            </div>
            <div>
              <Label htmlFor="address">{u("alamat")}</Label>
              <Input id="address" name="address" defaultValue={s.address ?? ""} disabled={readOnly} />
            </div>
            <div>
              <Label htmlFor="npwp">NPWP</Label>
              <Input id="npwp" name="npwp" defaultValue={s.npwp ?? ""} disabled={readOnly} />
            </div>
            <LogoUploader tenantId={tenantId} current={s.logo_data_url ?? ""} readOnly={readOnly} />
            {readOnly ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {u("hanyaOwnerAdminUbah")}
              </p>
            ) : (
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? <Spinner /> : null} {u("simpan")}
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
  const u = useUi();
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
      <Label>{u("logoKop")}</Label>
      <div className="flex flex-wrap items-center gap-3">
        {current ? (
          <img
            src={current}
            alt="Logo perusahaan"
            className="h-12 w-auto max-w-28 rounded border border-slate-200 bg-white object-contain p-1 dark:border-slate-700"
          />
        ) : (
          <span className="text-sm text-slate-400">{u("belumAdaLogo")}</span>
        )}
        {readOnly ? null : (
          <>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={onFile} />
            <Button type="button" variant="secondary" className="h-9" onClick={() => fileRef.current?.click()} disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null} {current ? u("gantiLogo") : u("unggahLogo")}
            </Button>
            {current ? (
              <Button type="button" variant="ghost" className="h-9" onClick={() => save.mutate("")} disabled={save.isPending}>
                {u("hapus")}
              </Button>
            ) : null}
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">{u("descLogo")}</p>
    </div>
  );
}


export function NewCompanyCard() {
  const u = useUi();
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
        title={u("perusahaanLain")}
        description={u("descPerusahaanLain")}
      />
      <CardBody className="flex flex-wrap items-end gap-3">
        <div className="flex-1 sm:max-w-xs">
          <Label htmlFor="new-company">{u("namaPerusahaanBaru")}</Label>
          <Input
            id="new-company"
            placeholder={u("contohCabangKedua")}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending || companyName.trim().length < 2}>
          {create.isPending ? <Spinner /> : null} {u("tambahPerusahaan")}
        </Button>
      </CardBody>
    </Card>
  );
}


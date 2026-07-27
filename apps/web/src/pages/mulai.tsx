import { contactSchema, productSchema } from "@erpindo/shared";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, GraduationCap, Rocket, SkipForward, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../api/client";
import { Alert, Button, Card, CardBody, Input, Label, Spinner, useToast } from "../components/ui";
import { useUi, type UiKey } from "../i18n/ui";
import { setSimpleMode, useWorkspace } from "./app";

/**
 * Wizard awal (Fase 10f) — /app/mulai. Empat langkah SKIPPABLE untuk pengguna
 * baru: profil perusahaan → tingkat keakraban akuntansi (set Mode Sederhana) →
 * produk pertama → kontak pertama. Semua memakai endpoint yang sudah ada;
 * tak ada API/migrasi baru. Selesai/lewati semua → dasbor.
 */

const WIZARD_DONE_KEY = "erpindo-wizard-done";

export function markWizardDone(): void {
  try {
    localStorage.setItem(WIZARD_DONE_KEY, "1");
  } catch {
    /* abaikan */
  }
}

const STEP_KEYS = ["wizardProfil", "wizardPengalaman", "wizardProduk", "wizardKontak"] as const satisfies readonly UiKey[];

export function MulaiPage() {
  const u = useUi();
  const { tenant } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);

  const finish = () => {
    markWizardDone();
    navigate({ to: "/app" });
  };
  const nextOrFinish = () => (step >= STEP_KEYS.length - 1 ? finish() : setStep((s) => s + 1));

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-2 text-brand-600 dark:text-brand-400">
        <Rocket className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Selamat datang! Ayo siapkan cepat.</h1>
      </div>

      {/* Indikator langkah */}
      <ol className="mb-6 flex items-center gap-2">
        {STEP_KEYS.map((kunci, i) => (
          <li key={kunci} className="flex flex-1 items-center gap-2">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                i < step
                  ? "bg-brand-600 text-white dark:bg-brand-400 dark:text-slate-900"
                  : i === step
                    ? "bg-brand-100 text-brand-700 ring-2 ring-brand-500 dark:bg-brand-900/60 dark:text-brand-300"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-800"
              }`}
            >
              {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={`hidden text-xs sm:block ${i === step ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-400"}`}>
              {u(kunci)}
            </span>
            {i < STEP_KEYS.length - 1 ? <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> : null}
          </li>
        ))}
      </ol>

      {step === 0 ? <ProfilStep tenantId={tenant.tenantId} onDone={nextOrFinish} onSkip={nextOrFinish} toast={toast} /> : null}
      {step === 1 ? <PengalamanStep onDone={nextOrFinish} /> : null}
      {step === 2 ? <ProdukStep tenantId={tenant.tenantId} onDone={nextOrFinish} onSkip={nextOrFinish} toast={toast} /> : null}
      {step === 3 ? <KontakStep tenantId={tenant.tenantId} onDone={finish} onSkip={finish} toast={toast} /> : null}

      <button onClick={finish} className="mt-6 flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
        <SkipForward className="size-3.5" aria-hidden /> {u("lewatiSemua")}
      </button>
    </div>
  );
}

type ToastFn = ReturnType<typeof useToast>;

function StepCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardBody>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
        <div className="mt-4">{children}</div>
      </CardBody>
    </Card>
  );
}

function ProfilStep({ tenantId, onDone, onSkip, toast }: { tenantId: string; onDone: () => void; onSkip: () => void; toast: ToastFn }) {
  const u = useUi();
  const [address, setAddress] = useState("");
  const [npwp, setNpwp] = useState("");
  const save = useMutation({
    mutationFn: () => api.updateSettings(tenantId, { address: address.trim(), npwp: npwp.trim() }),
    onSuccess: () => {
      toast("success", u("toastProfilTersimpan"));
      onDone();
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  return (
    <StepCard title={u("mlProfilPerusahaan")} description={u("descProfilPerusahaan")}>
      <div className="space-y-3">
        <div>
          <Label htmlFor="wz-address">Alamat usaha</Label>
          <Input id="wz-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={u("mlPhAlamat")} />
        </div>
        <div>
          <Label htmlFor="wz-npwp">NPWP (opsional)</Label>
          <Input id="wz-npwp" value={npwp} onChange={(e) => setNpwp(e.target.value)} placeholder="00.000.000.0-000.000" />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button onClick={onSkip} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          Lewati
        </button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || address.trim().length === 0}>
          {save.isPending ? <Spinner /> : null} {u("simpanLanjut")} <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </StepCard>
  );
}

function PengalamanStep({ onDone }: { onDone: () => void }) {
  const u = useUi();
  const pick = (simple: boolean) => {
    setSimpleMode(simple);
    onDone();
  };
  return (
    <StepCard title={u("seberapaAkrabAkuntansi")} description={u("descSesuaikanMenu")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => pick(true)}
          className="rounded-2xl border border-slate-200 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:hover:border-brand-700"
        >
          <Sparkles className="size-6 text-brand-600 dark:text-brand-400" aria-hidden />
          <h3 className="mt-2 font-semibold">{u("sayaPemula")}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{u("descModeSederhana")}</p>
        </button>
        <button
          onClick={() => pick(false)}
          className="rounded-2xl border border-slate-200 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:hover:border-brand-700"
        >
          <GraduationCap className="size-6 text-brand-600 dark:text-brand-400" aria-hidden />
          <h3 className="mt-2 font-semibold">{u("sayaSudahPaham")}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{u("descModeLengkap")}</p>
        </button>
      </div>
    </StepCard>
  );
}

function ProdukStep({ tenantId, onDone, onSkip, toast }: { tenantId: string; onDone: () => void; onSkip: () => void; toast: ToastFn }) {
  const u = useUi();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const parsed = productSchema.safeParse({ sku: sku.trim(), name: name.trim(), sellPrice: Number(sellPrice) || 0 });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? u("dataProdukTakValid"));
      return api.createItem(tenantId, "products", parsed.data);
    },
    onSuccess: () => {
      toast("success", u("toastProdukPertama"));
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <StepCard title={u("tambahProdukPertama")} description={u("descProdukPertama")}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="wz-sku">Kode (SKU)</Label>
          <Input id="wz-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="PRD-001" />
        </div>
        <div>
          <Label htmlFor="wz-price">Harga jual (Rp)</Label>
          <Input id="wz-price" type="number" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="25000" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="wz-pname">{u("namaProduk")}</Label>
          <Input id="wz-pname" value={name} onChange={(e) => setName(e.target.value)} placeholder={u("mlPhNamaProduk")} />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button onClick={onSkip} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          Lewati
        </button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || sku.trim().length === 0 || name.trim().length < 2}>
          {save.isPending ? <Spinner /> : null} {u("simpanLanjut")} <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </StepCard>
  );
}

function KontakStep({ tenantId, onDone, onSkip, toast }: { tenantId: string; onDone: () => void; onSkip: () => void; toast: ToastFn }) {
  const u = useUi();
  const [name, setName] = useState("");
  const [type, setType] = useState<"customer" | "supplier">("customer");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const parsed = contactSchema.safeParse({ type, name: name.trim() });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? u("dataKontakTakValid"));
      return api.createItem(tenantId, "contacts", parsed.data);
    },
    onSuccess: () => {
      toast("success", u("toastKontakPertama"));
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <StepCard title={u("tambahKontakPertama")} description={u("descKontakPertama")}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mt-2 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setType("customer")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${type === "customer" ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "border-slate-300 dark:border-slate-700"}`}
          >
            {u("pelanggan")}
          </button>
          <button
            onClick={() => setType("supplier")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${type === "supplier" ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "border-slate-300 dark:border-slate-700"}`}
          >
            {u("pemasok")}
          </button>
        </div>
        <div>
          <Label htmlFor="wz-cname">{u("nama")}</Label>
          <Input id="wz-cname" value={name} onChange={(e) => setName(e.target.value)} placeholder={u("contohNamaKontak")} />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button onClick={onSkip} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          Lewati
        </button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || name.trim().length < 2}>
          {save.isPending ? <Spinner /> : null} Selesai <Check className="size-4" aria-hidden />
        </Button>
      </div>
    </StepCard>
  );
}

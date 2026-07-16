import { contactSchema, productSchema } from "@erpindo/shared";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, GraduationCap, Rocket, SkipForward, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../api/client";
import { Alert, Button, Card, CardBody, Input, Label, Spinner, useToast } from "../components/ui";
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

const STEPS = ["Profil", "Pengalaman", "Produk", "Kontak"] as const;

export function MulaiPage() {
  const { tenant } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);

  const finish = () => {
    markWizardDone();
    navigate({ to: "/app" });
  };
  const nextOrFinish = () => (step >= STEPS.length - 1 ? finish() : setStep((s) => s + 1));

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-2 text-brand-600 dark:text-brand-400">
        <Rocket className="size-5" aria-hidden />
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Selamat datang! Ayo siapkan cepat.</h1>
      </div>

      {/* Indikator langkah */}
      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
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
              {label}
            </span>
            {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> : null}
          </li>
        ))}
      </ol>

      {step === 0 ? <ProfilStep tenantId={tenant.tenantId} onDone={nextOrFinish} onSkip={nextOrFinish} toast={toast} /> : null}
      {step === 1 ? <PengalamanStep onDone={nextOrFinish} /> : null}
      {step === 2 ? <ProdukStep tenantId={tenant.tenantId} onDone={nextOrFinish} onSkip={nextOrFinish} toast={toast} /> : null}
      {step === 3 ? <KontakStep tenantId={tenant.tenantId} onDone={finish} onSkip={finish} toast={toast} /> : null}

      <button onClick={finish} className="mt-6 flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
        <SkipForward className="size-3.5" aria-hidden /> Lewati semua dan langsung ke dasbor
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
  const [address, setAddress] = useState("");
  const [npwp, setNpwp] = useState("");
  const save = useMutation({
    mutationFn: () => api.updateSettings(tenantId, { address: address.trim(), npwp: npwp.trim() }),
    onSuccess: () => {
      toast("success", "Profil perusahaan tersimpan.");
      onDone();
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  return (
    <StepCard title="Profil perusahaan" description="Alamat & NPWP muncul di kop faktur dan dokumen resmi. Bisa dilengkapi nanti di Pengaturan.">
      <div className="space-y-3">
        <div>
          <Label htmlFor="wz-address">Alamat usaha</Label>
          <Input id="wz-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jl. Merdeka No. 1, Jakarta" />
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
          {save.isPending ? <Spinner /> : null} Simpan & lanjut <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </StepCard>
  );
}

function PengalamanStep({ onDone }: { onDone: () => void }) {
  const pick = (simple: boolean) => {
    setSimpleMode(simple);
    onDone();
  };
  return (
    <StepCard title="Seberapa akrab Anda dengan akuntansi?" description="Kami sesuaikan tampilan menu. Bisa diubah kapan saja di Pengaturan.">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => pick(true)}
          className="rounded-2xl border border-slate-200 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:hover:border-brand-700"
        >
          <Sparkles className="size-6 text-brand-600 dark:text-brand-400" aria-hidden />
          <h3 className="mt-2 font-semibold">Saya pemula</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Sembunyikan menu akuntansi teknis (jurnal, buku besar). Fokus catat uang masuk/keluar.</p>
        </button>
        <button
          onClick={() => pick(false)}
          className="rounded-2xl border border-slate-200 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-slate-700 dark:hover:border-brand-700"
        >
          <GraduationCap className="size-6 text-brand-600 dark:text-brand-400" aria-hidden />
          <h3 className="mt-2 font-semibold">Saya sudah paham</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Tampilkan semua fitur akuntansi: jurnal umum, buku besar, neraca saldo, tutup buku.</p>
        </button>
      </div>
    </StepCard>
  );
}

function ProdukStep({ tenantId, onDone, onSkip, toast }: { tenantId: string; onDone: () => void; onSkip: () => void; toast: ToastFn }) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const parsed = productSchema.safeParse({ sku: sku.trim(), name: name.trim(), sellPrice: Number(sellPrice) || 0 });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Data produk tidak valid");
      return api.createItem(tenantId, "products", parsed.data);
    },
    onSuccess: () => {
      toast("success", "Produk pertama ditambahkan.");
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <StepCard title="Tambah produk/jasa pertama" description="Barang atau jasa yang Anda jual. Nanti dipakai di faktur & kasir.">
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
          <Label htmlFor="wz-pname">Nama produk</Label>
          <Input id="wz-pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kopi Susu Gula Aren" />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button onClick={onSkip} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          Lewati
        </button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || sku.trim().length === 0 || name.trim().length < 2}>
          {save.isPending ? <Spinner /> : null} Simpan & lanjut <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </StepCard>
  );
}

function KontakStep({ tenantId, onDone, onSkip, toast }: { tenantId: string; onDone: () => void; onSkip: () => void; toast: ToastFn }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"customer" | "supplier">("customer");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const parsed = contactSchema.safeParse({ type, name: name.trim() });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Data kontak tidak valid");
      return api.createItem(tenantId, "contacts", parsed.data);
    },
    onSuccess: () => {
      toast("success", "Kontak pertama ditambahkan. Anda siap!");
      onDone();
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <StepCard title="Tambah pelanggan/pemasok pertama" description="Pihak yang bertransaksi dengan Anda — pelanggan (menjual) atau pemasok (membeli).">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="mt-2 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setType("customer")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${type === "customer" ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "border-slate-300 dark:border-slate-700"}`}
          >
            Pelanggan
          </button>
          <button
            onClick={() => setType("supplier")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${type === "supplier" ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300" : "border-slate-300 dark:border-slate-700"}`}
          >
            Pemasok
          </button>
        </div>
        <div>
          <Label htmlFor="wz-cname">Nama</Label>
          <Input id="wz-cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Toko Berkah / PT Sumber Rezeki" />
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

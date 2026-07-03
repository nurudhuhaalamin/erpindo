import { registerSchema } from "@erpindo/shared";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  Check,
  MonitorSmartphone,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiRequestError } from "../api/client";
import { Alert, Button, Card, CardBody, FieldError, Input, Label, Spinner } from "../components/ui";

function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-6 text-2xl font-bold tracking-tight text-brand-700 dark:text-brand-400">
        erpindo
      </Link>
      <Card className="w-full max-w-md">
        <CardBody className="py-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          <div className="mt-5">{children}</div>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: BookOpenCheck, title: "Pembukuan otomatis", desc: "Faktur jual-beli langsung menjadi jurnal akuntansi double-entry — tanpa input dua kali." },
  { icon: Boxes, title: "Stok selalu akurat", desc: "Stok bergerak otomatis dengan harga pokok rata-rata; kartu stok lengkap per barang." },
  { icon: BarChart3, title: "Laporan siap pakai", desc: "Laba rugi, neraca, arus kas, neraca saldo, dan umur piutang — ekspor ke Excel sekali klik." },
  { icon: ReceiptText, title: "Faktur profesional", desc: "PPN otomatis, cetak/PDF berkop perusahaan, catat pembayaran sampai lunas." },
  { icon: MonitorSmartphone, title: "Semua perangkat", desc: "Install di HP, tablet, dan komputer; tetap terbuka saat offline." },
  { icon: ShieldCheck, title: "Aman berlapis", desc: "Data tiap perusahaan di database terpisah, peran & hak akses, 2FA, audit log, tutup buku." },
];

const PRICING = [
  { name: "Starter", price: "Rp 149rb", per: "/bulan", desc: "Untuk usaha kecil yang mulai rapi", features: ["3 pengguna", "Semua modul inti", "Laporan lengkap + ekspor"] },
  { name: "Business", price: "Rp 599rb", per: "/bulan", desc: "Untuk tim yang bertumbuh", features: ["15 pengguna", "Semua fitur Starter", "Prioritas dukungan"], highlight: true },
  { name: "Enterprise", price: "Hubungi kami", per: "", desc: "Kebutuhan khusus & skala besar", features: ["Pengguna tak terbatas", "Onboarding khusus", "SLA"] },
] as const;

export function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-bold tracking-tight text-brand-700 dark:text-brand-400">erpindo</span>
        <nav className="flex items-center gap-2">
          <Link to="/masuk">
            <Button variant="ghost">Masuk</Button>
          </Link>
          <Link to="/daftar">
            <Button>Coba Gratis</Button>
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-6 pb-16 pt-14 text-center sm:pt-20">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
            <Sparkles className="size-3.5" aria-hidden /> Kasir, stok, dan pembukuan dalam satu aplikasi
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            ERP modern untuk <span className="text-brand-600 dark:text-brand-400">UMKM Indonesia</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300">
            Keuangan, penjualan, pembelian, dan stok dalam satu aplikasi ringan. Catat transaksi sekali — pembukuan,
            stok, dan laporan beres sendiri.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/daftar">
              <Button className="h-11 px-6">Coba Gratis 14 Hari</Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-400">Tanpa kartu kredit · siap dipakai dalam 1 menit</p>
        </section>

        {/* Fitur */}
        <section className="border-y border-slate-200 bg-white py-14 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto grid max-w-5xl gap-6 px-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Harga */}
        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-center text-2xl font-bold">Harga sederhana, tanpa kejutan</h2>
          <p className="mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
            Mulai gratis 14 hari dengan semua fitur — pilih paket saat siap.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {PRICING.map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl border p-6 ${
                  "highlight" in p && p.highlight
                    ? "border-brand-500 shadow-lg shadow-brand-500/10 dark:border-brand-500"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                {"highlight" in p && p.highlight ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-0.5 text-xs font-semibold text-white">
                    Terpopuler
                  </span>
                ) : null}
                <h3 className="font-semibold">{p.name}</h3>
                <div className="mt-2 text-3xl font-bold">
                  {p.price}
                  <span className="text-sm font-normal text-slate-400">{p.per}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{p.desc}</p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>
                <Link to="/daftar" className="mt-6 block">
                  <Button variant={"highlight" in p && p.highlight ? "primary" : "secondary"} className="w-full">
                    Mulai Gratis
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 px-6 py-6 text-center text-xs text-slate-400 dark:border-slate-800">
        © {new Date().getFullYear()} erpindo — ERP untuk UMKM Indonesia
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RegisterPage() {
  const navigate = useNavigate();
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const mutation = useMutation({
    mutationFn: api.register,
    onSuccess: () => navigate({ to: "/app" }),
    onError: (err) => {
      if (err instanceof ApiRequestError && err.issues) setIssues(err.issues);
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIssues({});
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      setIssues(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <AuthLayout
      title="Buat akun perusahaan"
      subtitle={
        <>
          Sudah punya akun?{" "}
          <Link to="/masuk" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Masuk
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {mutation.isError && !(mutation.error instanceof ApiRequestError && mutation.error.issues) ? (
          <Alert tone="error">{(mutation.error as Error).message}</Alert>
        ) : null}
        <div>
          <Label htmlFor="companyName">Nama perusahaan</Label>
          <Input id="companyName" name="companyName" placeholder="PT Maju Jaya" required />
          <FieldError messages={issues.companyName} />
        </div>
        <div>
          <Label htmlFor="name">Nama Anda</Label>
          <Input id="name" name="name" placeholder="Budi Santoso" required />
          <FieldError messages={issues.name} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="anda@perusahaan.co.id" required />
          <FieldError messages={issues.email} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" placeholder="Minimal 8 karakter" required />
          <FieldError messages={issues.password} />
        </div>
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null} Daftar & Mulai Trial 14 Hari
        </Button>
      </form>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------

export function LoginPage() {
  const navigate = useNavigate();
  const [needsTotp, setNeedsTotp] = useState(false);
  const mutation = useMutation({
    mutationFn: api.login,
    onSuccess: () => navigate({ to: "/app" }),
    onError: (err) => {
      if (err instanceof ApiRequestError && err.twoFactorRequired) setNeedsTotp(true);
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as {
      email: string;
      password: string;
      totpCode?: string;
    };
    mutation.mutate({ ...data, totpCode: data.totpCode || undefined });
  }

  return (
    <AuthLayout
      title="Masuk ke erpindo"
      subtitle={
        <>
          Belum punya akun?{" "}
          <Link to="/daftar" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Daftar gratis
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {mutation.isError ? <Alert tone="error">{(mutation.error as Error).message}</Alert> : null}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        {needsTotp ? (
          <div>
            <Label htmlFor="totpCode">Kode authenticator (2FA)</Label>
            <Input
              id="totpCode"
              name="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 digit"
              maxLength={6}
              autoFocus
            />
          </div>
        ) : null}
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null} Masuk
        </Button>
        <p className="text-center text-sm">
          <Link to="/lupa-password" className="text-slate-500 hover:underline dark:text-slate-400">
            Lupa password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------

function useUrlToken(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export function VerifyPage() {
  const token = useUrlToken();
  const [state, setState] = useState<"loading" | "ok" | "error">(token ? "loading" : "error");

  useEffect(() => {
    if (!token) return;
    api
      .verifyEmail(token)
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, [token]);

  return (
    <AuthLayout title="Verifikasi email">
      {state === "loading" ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : state === "ok" ? (
        <div className="space-y-4">
          <Alert tone="success">Email Anda berhasil diverifikasi. Selamat menggunakan erpindo!</Alert>
          <Link to="/app">
            <Button className="w-full">Buka Dashboard</Button>
          </Link>
        </div>
      ) : (
        <Alert tone="error">Tautan verifikasi tidak valid atau sudah kedaluwarsa.</Alert>
      )}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const mutation = useMutation({ mutationFn: api.forgotPassword });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(String(new FormData(e.currentTarget).get("email")));
  }

  return (
    <AuthLayout title="Lupa password" subtitle="Kami akan mengirim tautan reset ke email Anda.">
      {mutation.isSuccess ? (
        <Alert tone="success">Bila email terdaftar, tautan reset password sudah dikirim. Periksa kotak masuk Anda.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : null} Kirim Tautan Reset
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const token = useUrlToken();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (password: string) => api.resetPassword(token, password),
    onSuccess: () => navigate({ to: "/masuk" }),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(String(new FormData(e.currentTarget).get("password")));
  }

  return (
    <AuthLayout title="Atur ulang password">
      <form onSubmit={onSubmit} className="space-y-4">
        {mutation.isError ? <Alert tone="error">{(mutation.error as Error).message}</Alert> : null}
        <div>
          <Label htmlFor="password">Password baru</Label>
          <Input id="password" name="password" type="password" placeholder="Minimal 8 karakter" required />
        </div>
        <Button type="submit" className="w-full" disabled={mutation.isPending || !token}>
          {mutation.isPending ? <Spinner /> : null} Simpan Password Baru
        </Button>
      </form>
    </AuthLayout>
  );
}

export function InvitePage() {
  const token = useUrlToken();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: () => navigate({ to: "/app" }),
  });

  return (
    <AuthLayout title="Undangan tim" subtitle="Anda diundang bergabung ke sebuah perusahaan di erpindo.">
      <div className="space-y-4">
        {mutation.isError ? (
          <Alert tone="error">
            {(mutation.error as Error).message}{" "}
            {mutation.error instanceof ApiRequestError && mutation.error.status === 401 ? (
              <>
                Silakan{" "}
                <Link to="/masuk" className="font-medium underline">
                  masuk
                </Link>{" "}
                atau{" "}
                <Link to="/daftar" className="font-medium underline">
                  daftar
                </Link>{" "}
                dengan email yang diundang terlebih dahulu, lalu buka tautan ini lagi.
              </>
            ) : null}
          </Alert>
        ) : null}
        <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending || !token}>
          {mutation.isPending ? <Spinner /> : null} Terima Undangan
        </Button>
      </div>
    </AuthLayout>
  );
}

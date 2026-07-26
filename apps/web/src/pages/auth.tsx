import { registerSchema, TRIAL_DAYS } from "@erpindo/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiRequestError } from "../api/client";
import { BrandWordmark, Alert, Button, Card, CardBody, FieldError, Input, Label, Spinner } from "../components/ui";

const AUTH_BENEFITS = [
  "Pembukuan double-entry otomatis dari faktur, kasir, sampai penggajian",
  "Siap pajak Indonesia: PPN 11/12%, PPh 21 TER, dan ekspor e-Faktur",
  "Database terpisah untuk tiap perusahaan — data Anda benar-benar terisolasi",
  // Angka diperbarui Fase 17f: klaim "890+" sudah lama tertinggal. Hitungan
  // nyata per hari ini = 861 smoke + 244 unit test + 220 cek simulasi UI.
  "1.300+ uji otomatis menjaga setiap rilis; angka pembukuan selalu seimbang",
];

/** Pesan hasil alur Google (?google=… di URL, diset callback server). */
const GOOGLE_MESSAGES: Record<string, string> = {
  dibatalkan: "Masuk via Google dibatalkan.",
  "gagal-tukar-token": "Masuk via Google gagal — coba lagi atau pakai email & password.",
  "tidak-diizinkan": "Akun tersebut tidak bisa dipakai masuk via Google.",
  "belum-dikonfigurasi": "Masuk via Google belum tersedia saat ini.",
};

/**
 * Tombol "Lanjutkan dengan Google" (Fase 10d) — hanya tampil bila server
 * dikonfigurasi (GET /api/auth/google/available). Navigasi keras: alur OAuth
 * terjadi penuh di server.
 */
function GoogleButton() {
  const q = useQuery({ queryKey: ["google-available"], queryFn: api.googleAvailable, staleTime: 60_000 });
  if (!q.data?.available) return null;
  return (
    <>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        atau
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <a
        href="/api/auth/google"
        className="flex h-8 w-full items-center justify-center gap-2 rounded border border-slate-300 text-[13px] font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3a7.24 7.24 0 0 1-10.8-3.8H1.27v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.26 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l3.99-3.1Z" />
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.97 11.97 0 0 0 1.27 6.62l3.99 3.1A7.17 7.17 0 0 1 12 4.75Z" />
        </svg>
        Lanjutkan dengan Google
      </a>
    </>
  );
}

/**
 * Layout auth belah dua — dirombak Fase 17f.
 *
 * Panel kirinya dulu bergradien tiga-warna (`from-brand-700 via-brand-800
 * to-brand-950`), pola yang sama persis dengan ribuan halaman masuk SaaS.
 * Sekarang: bidang pekat datar + kisi garis tipis yang sama seperti hero
 * landing, sehingga halaman masuk terasa satu keluarga dengan aplikasinya.
 *
 * KONTRAK UJI — jangan diubah tanpa memperbarui `scripts/ui-sim.mjs`:
 * `#email`, `#password`, dan `button[type=submit]` adalah GERBANG seluruh
 * suite. Setiap cek F0–F22 melewati form ini lebih dulu; mengganti id atau
 * mengubah tombol kirim mematikan 200-an asersi sekaligus.
 */
function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden border-r border-slate-800 bg-slate-950 p-8 text-slate-100 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
          aria-hidden
        />
        <Link to="/" className="relative">
          <BrandWordmark className="h-8" />
        </Link>
        <div className="relative">
          <h2 className="max-w-md text-xl font-semibold leading-snug">
            Satu aplikasi untuk seluruh operasional UMKM Anda.
          </h2>
          <ul className="mt-5 divide-y divide-white/10 border-y border-white/10">
            {AUTH_BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2 py-2.5 text-[13px] leading-relaxed text-slate-300">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-400" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative font-mono text-[11px] text-slate-500">
          Gratis {TRIAL_DAYS} hari · tanpa kartu kredit · berhenti kapan saja
        </p>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <Link to="/" className="mb-5 lg:hidden">
          <BrandWordmark className="h-7" />
        </Link>
        <Card className="w-full max-w-sm">
          <CardBody className="py-5">
            <h1 className="text-lg font-semibold">{title}</h1>
            {subtitle ? <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
            <div className="mt-4">{children}</div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Langkah lanjutan setelah masuk via Google (Fase 10d): akun sudah ada &
 * terverifikasi, tinggal menanyakan nama perusahaan (memakai endpoint
 * multi-perusahaan yang sudah ada).
 */
function GoogleCompanyStep() {
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (companyName: string) => api.createCompany({ companyName }),
    onSuccess: () => navigate({ to: "/app/mulai" }),
  });
  return (
    <AuthLayout
      title="Satu langkah lagi"
      subtitle="Akun Google Anda sudah tersambung. Beri nama perusahaan Anda untuk mulai."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(String(new FormData(e.currentTarget).get("companyName") ?? ""));
        }}
        className="space-y-3"
      >
        {mutation.isError ? (
          <Alert tone="error">
            {(mutation.error as Error).message}
            {mutation.error instanceof ApiRequestError && mutation.error.status === 401 ? (
              <>
                {" "}
                Sesi Anda berakhir —{" "}
                <a href="/api/auth/google" className="font-medium underline">
                  masuk lagi dengan Google
                </a>
                .
              </>
            ) : null}
          </Alert>
        ) : null}
        <div>
          <Label htmlFor="companyName">Nama perusahaan</Label>
          <Input id="companyName" name="companyName" placeholder="PT Maju Jaya" required autoFocus />
        </div>
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null} Buat Perusahaan & Mulai Gratis {TRIAL_DAYS} Hari
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const viaGoogle = new URLSearchParams(window.location.search).get("via") === "google";
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const mutation = useMutation({
    mutationFn: api.register,
    onSuccess: () => navigate({ to: "/app/mulai" }),
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

  if (viaGoogle) return <GoogleCompanyStep />;

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
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
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
          {mutation.isPending ? <Spinner /> : null} Daftar & Mulai Gratis {TRIAL_DAYS} Hari
        </Button>
        <GoogleButton />
      </form>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------

export function LoginPage() {
  const navigate = useNavigate();
  const [needsTotp, setNeedsTotp] = useState(false);
  const googleMsg = GOOGLE_MESSAGES[new URLSearchParams(window.location.search).get("google") ?? ""];
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
      title="Selamat datang kembali"
      subtitle={
        <>
          Masuk untuk melanjutkan pekerjaan Anda. Belum punya akun?{" "}
          <Link to="/daftar" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Daftar gratis
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {googleMsg && !mutation.isError ? <Alert tone="error">{googleMsg}</Alert> : null}
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
        <GoogleButton />
        <p className="text-center text-[13px]">
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
        <div className="space-y-3">
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
        <form onSubmit={onSubmit} className="space-y-3">
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
      <form onSubmit={onSubmit} className="space-y-3">
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
      <div className="space-y-3">
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

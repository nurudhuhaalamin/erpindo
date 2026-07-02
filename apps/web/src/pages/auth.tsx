import { registerSchema } from "@erpindo/shared";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
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
      <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          ERP modern untuk <span className="text-brand-600 dark:text-brand-400">UMKM Indonesia</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300">
          Keuangan, penjualan, pembelian, dan stok dalam satu aplikasi ringan yang berjalan di semua perangkat.
          Gratis 14 hari, tanpa kartu kredit.
        </p>
        <div className="mt-8 flex gap-3">
          <Link to="/daftar">
            <Button className="h-11 px-6">Mulai Sekarang</Button>
          </Link>
        </div>
        <p className="mt-10 text-xs text-slate-400">Sedang dalam pengembangan — Fase 0: fondasi platform.</p>
      </main>
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
  const mutation = useMutation({
    mutationFn: api.login,
    onSuccess: () => navigate({ to: "/app" }),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as { email: string; password: string };
    mutation.mutate(data);
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

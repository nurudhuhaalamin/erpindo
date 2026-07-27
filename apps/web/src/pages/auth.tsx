import { registerSchema, TRIAL_DAYS } from "@erpindo/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiRequestError } from "../api/client";
import { BrandWordmark, Alert, Button, Card, CardBody, FieldError, Input, Label, Spinner } from "../components/ui";
import { LangSwitcher } from "../i18n/LangSwitcher";
import { useUi, type UiKey } from "../i18n/ui";

// Angka pada manfaat ke-4 diperbarui Fase 17f: klaim "890+" sudah lama
// tertinggal. Hitungan nyata per hari ini = 863 smoke + 249 unit test +
// 250 cek simulasi UI.
const AUTH_BENEFITS = [
  "authManfaat1",
  "authManfaat2",
  "authManfaat3",
  "authManfaat4",
] satisfies UiKey[];

/**
 * Pesan hasil alur Google (?google=… di URL, diset callback server).
 * Kuncinya adalah nilai parameter URL — JANGAN diterjemahkan; yang
 * diterjemahkan adalah pesan yang ditunjuknya (pola 19d).
 */
const GOOGLE_MESSAGES = {
  dibatalkan: "authGoogleDibatalkan",
  "gagal-tukar-token": "authGoogleGagalToken",
  "tidak-diizinkan": "authGoogleTidakDiizinkan",
  "belum-dikonfigurasi": "authGoogleBelumDikonfigurasi",
} satisfies Record<string, UiKey>;

/**
 * Tombol "Lanjutkan dengan Google" (Fase 10d) — hanya tampil bila server
 * dikonfigurasi (GET /api/auth/google/available). Navigasi keras: alur OAuth
 * terjadi penuh di server.
 */
function GoogleButton() {
  const u = useUi();
  const q = useQuery({ queryKey: ["google-available"], queryFn: api.googleAvailable, staleTime: 60_000 });
  if (!q.data?.available) return null;
  return (
    <>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        {u("authAtau")}
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
        {u("authLanjutkanGoogle")}
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
  const u = useUi();
  return (
    <div className="flex min-h-full">
      {/* Fase 18g: panel kiri tidak lagi bidang pekat. Pada arah terang-lapang,
          slab hitam di sebelah form putih terbaca seperti dua halaman berbeda
          yang ditempel — dan chip putih di balik logo jadi menonjol lagi.
          Diganti bidang bernuansa merek yang lembut. */}
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden border-r border-slate-200 bg-brand-50 p-10 text-slate-900 lg:flex dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
        <div
          className="pointer-events-none absolute inset-0 text-brand-600 opacity-[0.10] dark:text-slate-100 dark:opacity-[0.07]"
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
          <h2 className="max-w-md text-2xl font-semibold leading-snug">{u("authTagline")}</h2>
          <ul className="mt-6 divide-y divide-brand-200/70 border-y border-brand-200/70 dark:divide-white/10 dark:border-white/10">
            {AUTH_BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2.5 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
                {u(b)}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500 dark:text-slate-400">
          {u("authGratisPrefix")} {TRIAL_DAYS} {u("authGratisSuffix")}
        </p>
      </aside>

      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-10">
        {/* Fase 19q: halaman ini tadinya satu-satunya layar publik tanpa tombol
            bahasa — pengunjung yang tiba langsung di /masuk (mis. dari tautan
            undangan) tidak punya cara mengganti bahasa sama sekali. */}
        <LangSwitcher className="absolute right-4 top-4" />
        <Link to="/" className="mb-5 lg:hidden">
          <BrandWordmark className="h-7" />
        </Link>
        <Card className="w-full max-w-md">
          <CardBody className="py-6">
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
            <div className="mt-5">{children}</div>
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
  const u = useUi();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: (companyName: string) => api.createCompany({ companyName }),
    onSuccess: () => navigate({ to: "/app/mulai" }),
  });
  return (
    <AuthLayout title={u("authSatuLangkahLagi")} subtitle={u("authDescGoogleLangkah")}>
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
                {u("authSesiBerakhir")}{" "}
                <a href="/api/auth/google" className="font-medium underline">
                  {u("authMasukLagiGoogle")}
                </a>
                .
              </>
            ) : null}
          </Alert>
        ) : null}
        <div>
          <Label htmlFor="companyName">{u("authNamaPerusahaan")}</Label>
          <Input id="companyName" name="companyName" placeholder="PT Maju Jaya" required autoFocus />
        </div>
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null} {u("authBuatPerusahaanPrefix")} {TRIAL_DAYS}{" "}
          {u("authHariSuffix")}
        </Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const u = useUi();
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
      title={u("authBuatAkun")}
      subtitle={
        <>
          {u("authSudahPunyaAkun")}{" "}
          <Link to="/masuk" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            {u("authMasuk")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        {mutation.isError && !(mutation.error instanceof ApiRequestError && mutation.error.issues) ? (
          <Alert tone="error">{(mutation.error as Error).message}</Alert>
        ) : null}
        <div>
          <Label htmlFor="companyName">{u("authNamaPerusahaan")}</Label>
          <Input id="companyName" name="companyName" placeholder="PT Maju Jaya" required />
          <FieldError messages={issues.companyName} />
        </div>
        <div>
          <Label htmlFor="name">{u("authNamaAnda")}</Label>
          <Input id="name" name="name" placeholder="Budi Santoso" required />
          <FieldError messages={issues.name} />
        </div>
        <div>
          <Label htmlFor="email">{u("email")}</Label>
          <Input id="email" name="email" type="email" placeholder={u("authPlaceholderEmail")} required />
          <FieldError messages={issues.email} />
        </div>
        <div>
          <Label htmlFor="password">{u("authPassword")}</Label>
          <Input id="password" name="password" type="password" placeholder={u("authPlaceholderPassword")} required />
          <FieldError messages={issues.password} />
        </div>
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null} {u("authDaftarPrefix")} {TRIAL_DAYS}{" "}
          {u("authHariSuffix")}
        </Button>
        <GoogleButton />
      </form>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------

export function LoginPage() {
  const u = useUi();
  const navigate = useNavigate();
  const [needsTotp, setNeedsTotp] = useState(false);
  // `satisfies` membuat kuncinya literal, jadi parameter URL yang sembarang
  // perlu dilebarkan dulu — hasilnya bisa `undefined` dan itu memang diharapkan.
  const googleParam = new URLSearchParams(window.location.search).get("google") ?? "";
  const googleKey: UiKey | undefined = (GOOGLE_MESSAGES as Record<string, UiKey>)[googleParam];
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
      title={u("authSelamatDatang")}
      subtitle={
        <>
          {u("authDescMasuk")}{" "}
          <Link to="/daftar" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            {u("authDaftarGratis")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        {googleKey && !mutation.isError ? <Alert tone="error">{u(googleKey)}</Alert> : null}
        {mutation.isError ? <Alert tone="error">{(mutation.error as Error).message}</Alert> : null}
        <div>
          <Label htmlFor="email">{u("email")}</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="password">{u("authPassword")}</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        {needsTotp ? (
          <div>
            <Label htmlFor="totpCode">{u("authKodeTotp")}</Label>
            <Input
              id="totpCode"
              name="totpCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={u("authPlaceholder6Digit")}
              maxLength={6}
              autoFocus
            />
          </div>
        ) : null}
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? <Spinner /> : null} {u("authMasuk")}
        </Button>
        <GoogleButton />
        <p className="text-center text-[13px]">
          <Link to="/lupa-password" className="text-slate-500 hover:underline dark:text-slate-400">
            {u("authLupaPassword")}
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
  const u = useUi();
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
    <AuthLayout title={u("authVerifikasiEmail")}>
      {state === "loading" ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : state === "ok" ? (
        <div className="space-y-3">
          <Alert tone="success">{u("authVerifikasiBerhasil")}</Alert>
          <Link to="/app">
            <Button className="w-full">{u("authBukaDashboard")}</Button>
          </Link>
        </div>
      ) : (
        <Alert tone="error">{u("authTautanTidakValid")}</Alert>
      )}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const u = useUi();
  const mutation = useMutation({ mutationFn: api.forgotPassword });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mutation.mutate(String(new FormData(e.currentTarget).get("email")));
  }

  return (
    <AuthLayout title={u("authLupaPasswordJudul")} subtitle={u("authDescLupaPassword")}>
      {mutation.isSuccess ? (
        <Alert tone="success">{u("authResetTerkirim")}</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="email">{u("email")}</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner /> : null} {u("authKirimTautanReset")}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const u = useUi();
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
    <AuthLayout title={u("authAturUlangPassword")}>
      <form onSubmit={onSubmit} className="space-y-3">
        {mutation.isError ? <Alert tone="error">{(mutation.error as Error).message}</Alert> : null}
        <div>
          <Label htmlFor="password">{u("authPasswordBaru")}</Label>
          <Input id="password" name="password" type="password" placeholder={u("authPlaceholderPassword")} required />
        </div>
        <Button type="submit" className="w-full" disabled={mutation.isPending || !token}>
          {mutation.isPending ? <Spinner /> : null} {u("authSimpanPasswordBaru")}
        </Button>
      </form>
    </AuthLayout>
  );
}

export function InvitePage() {
  const u = useUi();
  const token = useUrlToken();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: () => navigate({ to: "/app" }),
  });

  return (
    <AuthLayout title={u("authUndanganTim")} subtitle={u("authDescUndangan")}>
      <div className="space-y-3">
        {mutation.isError ? (
          <Alert tone="error">
            {(mutation.error as Error).message}{" "}
            {mutation.error instanceof ApiRequestError && mutation.error.status === 401 ? (
              <>
                {u("authSilakan")}{" "}
                <Link to="/masuk" className="font-medium underline">
                  {u("authMasukKecil")}
                </Link>{" "}
                {u("authAtau")}{" "}
                <Link to="/daftar" className="font-medium underline">
                  {u("authDaftarKecil")}
                </Link>{" "}
                {u("authUndanganLanjutan")}
              </>
            ) : null}
          </Alert>
        ) : null}
        <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending || !token}>
          {mutation.isPending ? <Spinner /> : null} {u("authTerimaUndangan")}
        </Button>
      </div>
    </AuthLayout>
  );
}

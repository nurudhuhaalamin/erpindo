import { PLAN_LABELS, PLAN_LIMITS, type ApiMembership, type MeResponse } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { createContext, useContext, useState, type FormEvent } from "react";
import { api, ApiRequestError } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  Select,
  Spinner,
  useDarkMode,
  useToast,
} from "../components/ui";

// ---------------------------------------------------------------------------
// Konteks workspace: user + tenant aktif (tenant pertama untuk Fase 0)
// ---------------------------------------------------------------------------

type Workspace = { me: MeResponse; tenant: ApiMembership };
const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error("WorkspaceContext belum tersedia");
  return ws;
}

// ---------------------------------------------------------------------------
// Shell aplikasi: sidebar (desktop) / menu atas (mobile)
// ---------------------------------------------------------------------------

const NAV_ITEMS: { to: string; label: string; exact: boolean; section?: string }[] = [
  { to: "/app", label: "Dashboard", exact: true },
  { to: "/app/pos", label: "Kasir (POS)", exact: false, section: "Transaksi" },
  { to: "/app/penjualan", label: "Penjualan", exact: false, section: "Transaksi" },
  { to: "/app/pembelian", label: "Pembelian", exact: false, section: "Transaksi" },
  { to: "/app/stok", label: "Stok", exact: false, section: "Transaksi" },
  { to: "/app/keuangan/akun", label: "Bagan Akun", exact: false, section: "Keuangan" },
  { to: "/app/keuangan/jurnal", label: "Jurnal Umum", exact: false, section: "Keuangan" },
  { to: "/app/keuangan/buku-besar", label: "Buku Besar", exact: false, section: "Keuangan" },
  { to: "/app/keuangan/neraca-saldo", label: "Neraca Saldo", exact: false, section: "Keuangan" },
  { to: "/app/keuangan/laba-rugi", label: "Laba Rugi", exact: false, section: "Keuangan" },
  { to: "/app/keuangan/neraca", label: "Neraca", exact: false, section: "Keuangan" },
  { to: "/app/keuangan/arus-kas", label: "Arus Kas", exact: false, section: "Keuangan" },
  { to: "/app/keuangan/umur-tagihan", label: "Umur Piutang/Hutang", exact: false, section: "Keuangan" },
  { to: "/app/master/produk", label: "Produk", exact: false, section: "Master Data" },
  { to: "/app/master/kontak", label: "Kontak", exact: false, section: "Master Data" },
  { to: "/app/master/gudang", label: "Gudang", exact: false, section: "Master Data" },
  { to: "/app/persetujuan", label: "Persetujuan", exact: false, section: "Lainnya" },
  { to: "/app/pengaturan", label: "Pengaturan", exact: false, section: "Lainnya" },
];

export function AppShell() {
  const navigate = useNavigate();
  const { dark, toggle } = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => navigate({ to: "/masuk" }),
  });

  if (meQuery.isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (meQuery.isError || !meQuery.data) {
    if (meQuery.error instanceof ApiRequestError && meQuery.error.status === 401) {
      navigate({ to: "/masuk" });
      return null;
    }
    return (
      <div className="p-6">
        <Alert tone="error">Gagal memuat data. Muat ulang halaman.</Alert>
      </div>
    );
  }

  const me = meQuery.data;
  const storedTenantId = localStorage.getItem("erpindo-tenant");
  const tenant = me.memberships.find((m) => m.tenantId === storedTenantId) ?? me.memberships[0];
  if (!tenant) {
    return (
      <div className="p-6">
        <Alert tone="error">Akun Anda belum tergabung ke perusahaan mana pun.</Alert>
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item, i) => (
        <div key={item.to}>
          {item.section && NAV_ITEMS[i - 1]?.section !== item.section ? (
            <div className="mb-1 mt-3 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {item.section}
            </div>
          ) : null}
          <Link
            to={item.to}
            activeOptions={{ exact: item.exact }}
            activeProps={{
              className: "bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200",
            }}
            inactiveProps={{
              className: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            }}
            className="block rounded-lg px-3 py-2 text-sm"
            onClick={() => setMenuOpen(false)}
          >
            {item.label}
          </Link>
        </div>
      ))}
    </nav>
  );

  return (
    <WorkspaceContext.Provider value={{ me, tenant }}>
      <div className="flex min-h-full">
        {/* Sidebar desktop */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <div className="text-lg font-bold tracking-tight text-brand-700 dark:text-brand-400">erpindo</div>
            {me.memberships.length > 1 ? (
              <select
                aria-label="Pilih perusahaan"
                className="mt-1 w-full rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300"
                value={tenant.tenantId}
                onChange={(e) => {
                  localStorage.setItem("erpindo-tenant", e.target.value);
                  window.location.href = "/app";
                }}
              >
                {me.memberships.map((m) => (
                  <option key={m.tenantId} value={m.tenantId}>
                    {m.tenantName}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{tenant.tenantName}</div>
            )}
          </div>
          {nav}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 md:hidden">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
                aria-label="Menu"
              >
                ☰
              </button>
              <span className="font-bold text-brand-700 dark:text-brand-400">erpindo</span>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              {tenant.tenantStatus === "trial" ? <Badge tone="amber">Masa uji coba</Badge> : null}
              <Badge tone="brand">{tenant.role}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggle}
                className="rounded-lg px-2.5 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Ganti tema"
                title="Ganti tema terang/gelap"
              >
                {dark ? "☀️" : "🌙"}
              </button>
              <span className="hidden text-sm text-slate-600 sm:block dark:text-slate-300">{me.user.name}</span>
              <Button variant="secondary" className="h-9" onClick={() => logout.mutate()}>
                Keluar
              </Button>
            </div>
          </header>

          {/* Menu mobile */}
          {menuOpen ? (
            <div className="border-b border-slate-200 bg-white md:hidden dark:border-slate-800 dark:bg-slate-900">{nav}</div>
          ) : null}

          {!me.user.emailVerified ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Email Anda belum diverifikasi. Periksa kotak masuk untuk tautan verifikasi.
            </div>
          ) : null}

          {tenant.tenantStatus === "past_due" ? (
            <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              Masa trial/langganan berakhir — akun dalam <strong>mode baca-saja</strong>. Aktifkan langganan di{" "}
              <Link to="/app/pengaturan" className="font-medium underline">
                Pengaturan
              </Link>
              .
            </div>
          ) : tenant.tenantStatus === "trial" && tenant.trialEndsAt ? (
            (() => {
              const daysLeft = Math.ceil((Date.parse(tenant.trialEndsAt) - Date.now()) / 86_400_000);
              return daysLeft <= 7 ? (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Masa trial tersisa <strong>{Math.max(daysLeft, 0)} hari</strong>.
                </div>
              ) : null;
            })()
          ) : null}

          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Dashboard (Fase 0: kartu ringkasan placeholder menunggu modul Fase 1)
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { me, tenant } = useWorkspace();
  const dash = useQuery({
    queryKey: ["dashboard", tenant.tenantId],
    queryFn: () => api.dashboard(tenant.tenantId),
  });

  const fmt = (n: number | undefined) =>
    n === undefined ? "…" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  const stats = [
    { label: "Kas & Bank", value: fmt(dash.data?.cashAndBank) },
    {
      label: "Penjualan Bulan Ini",
      value: fmt(dash.data?.salesThisMonth),
      hint: dash.data ? `${dash.data.salesCountThisMonth} faktur` : undefined,
    },
    { label: "Piutang Belum Lunas", value: fmt(dash.data?.receivableOutstanding) },
    { label: "Hutang Belum Lunas", value: fmt(dash.data?.payableOutstanding) },
    { label: "Nilai Persediaan", value: fmt(dash.data?.inventoryValue) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Selamat datang, {me.user.name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Ringkasan <span className="font-medium">{tenant.tenantName}</span> hari ini.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardBody>
              <div className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{stat.value}</div>
              {stat.hint ? <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{stat.hint}</div> : null}
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Mulai dari sini" description="Alur kerja harian yang umum." />
        <CardBody>
          <ul className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-300">
            <li>
              🛒 Catat <Link to="/app/pembelian" className="font-medium text-brand-700 hover:underline dark:text-brand-400">pembelian</Link> untuk mengisi stok
            </li>
            <li>
              🧾 Buat <Link to="/app/penjualan" className="font-medium text-brand-700 hover:underline dark:text-brand-400">faktur penjualan</Link> — jurnal & stok otomatis
            </li>
            <li>
              📊 Lihat <Link to="/app/keuangan/laba-rugi" className="font-medium text-brand-700 hover:underline dark:text-brand-400">Laba Rugi</Link> dan <Link to="/app/keuangan/neraca" className="font-medium text-brand-700 hover:underline dark:text-brand-400">Neraca</Link>
            </li>
            <li>
              👥 Undang tim di <Link to="/app/pengaturan" className="font-medium text-brand-700 hover:underline dark:text-brand-400">Pengaturan</Link>
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pengaturan: profil perusahaan (DB tenant) + anggota tim (RBAC)
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role === "owner" || tenant.role === "admin";
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Pengaturan</h1>
      <SubscriptionCard />
      <ProfileCard />
      <SecurityCard />
      <CompanySettingsCard tenantId={tenant.tenantId} readOnly={!isAdmin} />
      {isAdmin ? <MembersCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <ApprovalThresholdCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <CloseBooksCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <AuditLogCard tenantId={tenant.tenantId} /> : null}
    </div>
  );
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.register": "Registrasi perusahaan",
  "auth.login": "Login",
  "auth.login_failed": "Login gagal",
  "auth.email_verified": "Email diverifikasi",
  "auth.password_reset": "Password direset",
  "auth.totp_enabled": "2FA diaktifkan",
  "auth.totp_disabled": "2FA dinonaktifkan",
  "tenant.invite_sent": "Undangan dikirim",
  "tenant.invite_accepted": "Undangan diterima",
  "tenant.settings_updated": "Pengaturan diubah",
  "accounting.account_created": "Akun COA dibuat",
  "accounting.account_archived": "Akun COA diarsipkan",
  "accounting.journal_posted": "Jurnal diposting",
  "accounting.books_closed": "Tutup buku",
  "sales.invoice_posted": "Faktur penjualan",
  "purchase.posted": "Faktur pembelian",
  "payment.recorded": "Pembayaran dicatat",
  "inventory.adjusted": "Penyesuaian stok",
  "billing.trial_expired": "Trial berakhir",
};

function AuditLogCard({ tenantId }: { tenantId: string }) {
  const query = useQuery({ queryKey: ["audit-logs", tenantId], queryFn: () => api.auditLogs(tenantId) });

  return (
    <Card>
      <CardHeader
        title="Riwayat aktivitas (audit log)"
        description="100 aktivitas terakhir di perusahaan ini — siapa melakukan apa dan kapan."
      />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {(query.data?.logs ?? []).map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="whitespace-nowrap py-2 pr-4 text-xs text-slate-500 dark:text-slate-400">
                      {log.createdAt.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="py-2 pr-4">{AUDIT_ACTION_LABELS[log.action] ?? log.action}</td>
                    <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">{log.userName ?? "sistem"}</td>
                    <td className="max-w-64 truncate py-2 font-mono text-xs text-slate-400" title={log.detail ?? ""}>
                      {log.detail ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function SubscriptionCard() {
  const { tenant } = useWorkspace();
  const limits = PLAN_LIMITS[tenant.plan];
  const daysLeft = tenant.trialEndsAt
    ? Math.max(Math.ceil((Date.parse(tenant.trialEndsAt) - Date.now()) / 86_400_000), 0)
    : null;

  return (
    <Card>
      <CardHeader title="Langganan" description="Paket dan status akun perusahaan Anda." />
      <CardBody className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">Paket:</span>
          <Badge tone="brand">{PLAN_LABELS[tenant.plan]}</Badge>
          {tenant.tenantStatus === "past_due" ? (
            <Badge tone="amber">baca-saja — langganan berakhir</Badge>
          ) : tenant.tenantStatus === "trial" && daysLeft !== null ? (
            <Badge tone="amber">trial, sisa {daysLeft} hari</Badge>
          ) : (
            <Badge>aktif</Badge>
          )}
        </div>
        <p className="text-slate-500 dark:text-slate-400">
          Batas pengguna paket ini:{" "}
          {limits.maxUsers === Number.MAX_SAFE_INTEGER ? "tak terbatas" : `${limits.maxUsers} pengguna`}.
        </p>
        <p className="text-slate-500 dark:text-slate-400">
          Pembayaran langganan online (QRIS/transfer/e-wallet) sedang disiapkan — untuk saat ini hubungi kami untuk
          aktivasi paket.
        </p>
      </CardBody>
    </Card>
  );
}

function ProfileCard() {
  const { me } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const saveName = useMutation({
    mutationFn: () => api.updateProfile(name),
    onSuccess: () => {
      toast("success", "Nama diperbarui.");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const savePassword = useMutation({
    mutationFn: () => api.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast("success", "Password diganti. Sesi di perangkat lain telah dikeluarkan.");
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <Card>
      <CardHeader title="Profil saya" description={me.user.email} />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 sm:max-w-xs">
            <Label htmlFor="prof-name">Nama</Label>
            <Input id="prof-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={() => saveName.mutate()} disabled={saveName.isPending || name.trim().length < 2}>
            {saveName.isPending ? <Spinner /> : null} Simpan Nama
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="sm:w-56">
            <Label htmlFor="prof-cur">Password saat ini</Label>
            <Input id="prof-cur" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="sm:w-56">
            <Label htmlFor="prof-new">Password baru</Label>
            <Input
              id="prof-new"
              type="password"
              placeholder="Minimal 8 karakter"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => savePassword.mutate()}
            disabled={savePassword.isPending || !currentPassword || newPassword.length < 8}
          >
            {savePassword.isPending ? <Spinner /> : null} Ganti Password
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function SecurityCard() {
  const { me } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");

  const setup = useMutation({
    mutationFn: api.totpSetup,
    onSuccess: (res) => setSetupData(res),
    onError: (err) => toast("error", (err as Error).message),
  });
  const enable = useMutation({
    mutationFn: () => api.totpEnable(code),
    onSuccess: () => {
      toast("success", "2FA aktif. Kode authenticator kini diminta setiap login.");
      setSetupData(null);
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const disable = useMutation({
    mutationFn: () => api.totpDisable(code),
    onSuccess: () => {
      toast("success", "2FA dinonaktifkan.");
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <Card>
      <CardHeader
        title="Keamanan — verifikasi dua langkah (2FA)"
        description="Lapisan perlindungan ekstra: selain password, login membutuhkan kode 6 digit dari aplikasi authenticator (Google Authenticator, Authy, dsb.)."
      />
      <CardBody className="space-y-3 text-sm">
        {me.user.totpEnabled ? (
          <>
            <div className="flex items-center gap-2">
              <Badge tone="brand">2FA aktif ✓</Badge>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="totp-off">Kode authenticator untuk menonaktifkan</Label>
                <Input
                  id="totp-off"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 digit"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button variant="danger" disabled={code.length !== 6 || disable.isPending} onClick={() => disable.mutate()}>
                {disable.isPending ? <Spinner /> : null} Nonaktifkan 2FA
              </Button>
            </div>
          </>
        ) : setupData ? (
          <>
            <p>
              1. Buka aplikasi authenticator → tambah akun → <strong>masukkan kunci manual</strong> berikut (atau buka
              tautan di perangkat yang sama):
            </p>
            <p className="break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs dark:bg-slate-800">
              {setupData.secret}
            </p>
            <p>
              <a href={setupData.otpauthUrl} className="text-brand-700 underline dark:text-brand-400">
                Buka langsung di aplikasi authenticator
              </a>
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="totp-code">2. Masukkan kode 6 digit yang muncul</Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button disabled={code.length !== 6 || enable.isPending} onClick={() => enable.mutate()}>
                {enable.isPending ? <Spinner /> : null} Konfirmasi & Aktifkan
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">2FA belum aktif.</span>
            <Button variant="secondary" onClick={() => setup.mutate()} disabled={setup.isPending}>
              {setup.isPending ? <Spinner /> : null} Aktifkan 2FA
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ApprovalThresholdCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings", tenantId], queryFn: () => api.settings(tenantId) });
  const current = Number(settingsQuery.data?.settings.approval_threshold_purchase ?? 0);
  const [amount, setAmount] = useState("");

  const save = useMutation({
    mutationFn: () => api.setApprovalThreshold(tenantId, Number(amount) || 0),
    onSuccess: (res) => {
      toast("success", res.amount > 0 ? `Ambang persetujuan: ${res.amount.toLocaleString("id-ID")}.` : "Persetujuan dinonaktifkan.");
      queryClient.invalidateQueries({ queryKey: ["settings", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <Card>
      <CardHeader
        title="Persetujuan pembelian"
        description="Pembelian oleh Admin dengan nilai ≥ ambang ini harus Anda setujui dulu sebelum diproses. Isi 0 untuk menonaktifkan."
      />
      <CardBody className="flex flex-wrap items-end gap-3">
        <div className="sm:w-64">
          <Label htmlFor="apr-amount">Ambang (Rp)</Label>
          <Input
            id="apr-amount"
            type="number"
            min={0}
            placeholder={current > 0 ? String(current) : "mis. 5000000"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending || amount === ""}>
          {save.isPending ? <Spinner /> : null} Simpan
        </Button>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Saat ini: {current > 0 ? `Rp ${current.toLocaleString("id-ID")}` : "nonaktif"}
        </span>
      </CardBody>
    </Card>
  );
}

function CloseBooksCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings", tenantId], queryFn: () => api.settings(tenantId) });
  const lockedBefore = settingsQuery.data?.settings.locked_before;

  const [date, setDate] = useState("");
  const close = useMutation({
    mutationFn: () => api.closeBooks(tenantId, date),
    onSuccess: (res) => {
      toast("success", `Pembukuan dikunci sampai ${res.lockedBefore}.`);
      queryClient.invalidateQueries({ queryKey: ["settings", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
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
          <Button
            variant="danger"
            disabled={!date || close.isPending}
            onClick={() => {
              if (window.confirm(`Kunci semua transaksi sampai ${date}? Tindakan ini tidak bisa dimundurkan.`)) {
                close.mutate();
              }
            }}
          >
            {close.isPending ? <Spinner /> : null} Tutup Buku
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function CompanySettingsCard({ tenantId, readOnly }: { tenantId: string; readOnly: boolean }) {
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

function MembersCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["members", tenantId], queryFn: () => api.members(tenantId) });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: (input: { email: string; role: "admin" | "viewer" }) => api.invite(tenantId, input),
    onSuccess: (res) => {
      toast("success", "Undangan dikirim.");
      setInviteUrl(res.inviteUrl);
      queryClient.invalidateQueries({ queryKey: ["members", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as { email: string; role: "admin" | "viewer" };
    invite.mutate(data, { onSuccess: () => form.reset() });
  }

  return (
    <Card>
      <CardHeader title="Anggota tim" description="Undang rekan kerja dan atur peran mereka." />
      <CardBody className="space-y-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="pb-2 pr-4 font-medium">Nama</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 font-medium">Peran</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.members ?? []).map((m) => (
                <tr key={m.userId} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="py-2.5 pr-4">{m.name}</td>
                  <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400">{m.email}</td>
                  <td className="py-2.5">
                    <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.role}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" name="email" type="email" placeholder="rekan@perusahaan.co.id" required />
          </div>
          <div className="sm:w-36">
            <Label htmlFor="invite-role">Peran</Label>
            <Select id="invite-role" name="role" defaultValue="viewer">
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </Select>
          </div>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? <Spinner /> : null} Undang
          </Button>
        </form>

        {inviteUrl ? (
          <Alert tone="info">
            Tautan undangan (bagikan bila email belum terkirim):{" "}
            <span className="break-all font-mono text-xs">{inviteUrl}</span>
          </Alert>
        ) : null}
      </CardBody>
    </Card>
  );
}

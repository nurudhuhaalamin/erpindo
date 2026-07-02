import type { ApiMembership, MeResponse } from "@erpindo/shared";
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

function useWorkspace(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error("WorkspaceContext belum tersedia");
  return ws;
}

// ---------------------------------------------------------------------------
// Shell aplikasi: sidebar (desktop) / menu atas (mobile)
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", exact: true },
  { to: "/app/pengaturan", label: "Pengaturan", exact: false },
] as const;

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
  const tenant = me.memberships[0];
  if (!tenant) {
    return (
      <div className="p-6">
        <Alert tone="error">Akun Anda belum tergabung ke perusahaan mana pun.</Alert>
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.exact }}
          activeProps={{ className: "bg-brand-50 font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-200" }}
          inactiveProps={{ className: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" }}
          className="rounded-lg px-3 py-2 text-sm"
          onClick={() => setMenuOpen(false)}
        >
          {item.label}
        </Link>
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
            <div className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{tenant.tenantName}</div>
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
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Selamat datang, {me.user.name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Workspace <span className="font-medium">{tenant.tenantName}</span> siap digunakan.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Kas & Bank", value: "—" },
          { label: "Penjualan Bulan Ini", value: "—" },
          { label: "Piutang Jatuh Tempo", value: "—" },
          { label: "Nilai Persediaan", value: "—" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardBody>
              <div className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</div>
              <div className="mt-1 text-2xl font-semibold">{stat.value}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Modul sedang disiapkan" description="Fase 1 menghadirkan modul inti ERP." />
        <CardBody>
          <ul className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 dark:text-slate-300">
            <li>📒 Keuangan & Akuntansi — bagan akun, jurnal, laporan keuangan</li>
            <li>🧾 Penjualan — pelanggan, faktur, piutang</li>
            <li>🛒 Pembelian — pemasok, pesanan pembelian, hutang</li>
            <li>📦 Inventori — produk, stok multi-gudang</li>
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
      <CompanySettingsCard tenantId={tenant.tenantId} readOnly={!isAdmin} />
      {isAdmin ? <MembersCard tenantId={tenant.tenantId} /> : null}
    </div>
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

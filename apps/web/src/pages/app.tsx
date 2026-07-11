import { PERMISSIONS, PLAN_LABELS, PLAN_LIMITS, type ApiCustomRole, type ApiMembership, type MeResponse, type PermissionKey } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  CircleHelp,
  BookOpen,
  BookText,
  Boxes,
  Building2,
  CalendarCheck,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Contact,
  Factory,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Coins,
  Hourglass,
  Landmark,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  ListTree,
  LogOut,
  Menu,
  Moon,
  Package,
  PenLine,
  Percent,
  PiggyBank,
  Receipt,
  Scale,
  Settings,
  ShoppingCart,
  Store,
  Sun,
  Target,
  Wrench,
  UsersRound,
  Users,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiRequestError, formatDate, formatIDR } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Input,
  Label,
  Select,
  Skeleton,
  Spinner,
  useDarkMode,
  useToast,
} from "../components/ui";
import { Asisten } from "../components/asisten";

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

const NAV_ITEMS: { to: string; label: string; exact: boolean; section?: string; icon: LucideIcon; module?: PermissionKey }[] = [
  { to: "/app", label: "Dashboard", exact: true, icon: LayoutDashboard },
  { to: "/app/pos", label: "Kasir (POS)", exact: false, section: "Transaksi", icon: Store, module: "kasir" },
  { to: "/app/penjualan", label: "Penjualan", exact: false, section: "Transaksi", icon: Receipt, module: "penjualan" },
  { to: "/app/pesanan-penjualan", label: "Pesanan Penjualan", exact: false, section: "Transaksi", icon: ClipboardList, module: "penjualan" },
  { to: "/app/pembelian", label: "Pembelian", exact: false, section: "Transaksi", icon: ShoppingCart, module: "pembelian" },
  { to: "/app/pengadaan", label: "Pengadaan", exact: false, section: "Transaksi", icon: ClipboardList, module: "pembelian" },
  { to: "/app/stok", label: "Stok", exact: false, section: "Transaksi", icon: Boxes, module: "stok" },
  { to: "/app/manufaktur", label: "Manufaktur", exact: false, section: "Transaksi", icon: Factory, module: "proyek" },
  { to: "/app/crm/leads", label: "Pipeline", exact: false, section: "CRM", icon: Target, module: "crm" },
  { to: "/app/crm/penawaran", label: "Penawaran", exact: false, section: "CRM", icon: FileText, module: "crm" },
  { to: "/app/helpdesk", label: "Helpdesk", exact: false, section: "CRM", icon: LifeBuoy, module: "crm" },
  { to: "/app/keuangan/catat", label: "Catat Transaksi", exact: false, section: "Keuangan", icon: PenLine, module: "keuangan" },
  { to: "/app/keuangan/kas-bank", label: "Kas & Bank", exact: false, section: "Keuangan", icon: Wallet, module: "keuangan" },
  { to: "/app/keuangan/akun", label: "Bagan Akun", exact: false, section: "Keuangan", icon: ListTree, module: "keuangan" },
  { to: "/app/keuangan/jurnal", label: "Jurnal Umum", exact: false, section: "Keuangan", icon: BookText, module: "keuangan" },
  { to: "/app/keuangan/buku-besar", label: "Buku Besar", exact: false, section: "Keuangan", icon: BookOpen, module: "keuangan" },
  { to: "/app/keuangan/neraca-saldo", label: "Neraca Saldo", exact: false, section: "Keuangan", icon: Scale, module: "keuangan" },
  { to: "/app/keuangan/laba-rugi", label: "Laba Rugi", exact: false, section: "Keuangan", icon: LineChart, module: "laporan" },
  { to: "/app/keuangan/neraca", label: "Neraca", exact: false, section: "Keuangan", icon: Scale, module: "laporan" },
  { to: "/app/keuangan/arus-kas", label: "Arus Kas", exact: false, section: "Keuangan", icon: Wallet, module: "laporan" },
  { to: "/app/keuangan/anggaran", label: "Anggaran", exact: false, section: "Keuangan", icon: PiggyBank, module: "keuangan" },
  { to: "/app/keuangan/dimensi", label: "Dimensi & Rekon", exact: false, section: "Keuangan", icon: Layers, module: "keuangan" },
  { to: "/app/keuangan/aset", label: "Aset Tetap", exact: false, section: "Keuangan", icon: Landmark, module: "keuangan" },
  { to: "/app/maintenance", label: "Pemeliharaan", exact: false, section: "Keuangan", icon: Wrench, module: "proyek" },
  { to: "/app/keuangan/kurs", label: "Mata Uang", exact: false, section: "Keuangan", icon: Coins, module: "keuangan" },
  { to: "/app/keuangan/umur-tagihan", label: "Umur Piutang/Hutang", exact: false, section: "Keuangan", icon: Hourglass, module: "laporan" },
  { to: "/app/keuangan/e-faktur", label: "Ekspor e-Faktur", exact: false, section: "Keuangan", icon: FileSpreadsheet, module: "pajak" },
  { to: "/app/keuangan/pajak", label: "Pajak", exact: false, section: "Keuangan", icon: Percent, module: "pajak" },
  { to: "/app/laporan/penjualan", label: "Laporan Penjualan", exact: false, section: "Keuangan", icon: LineChart, module: "laporan" },
  { to: "/app/master/produk", label: "Produk", exact: false, section: "Master Data", icon: Package, module: "stok" },
  { to: "/app/master/kontak", label: "Kontak", exact: false, section: "Master Data", icon: Contact, module: "penjualan" },
  { to: "/app/master/gudang", label: "Gudang", exact: false, section: "Master Data", icon: Warehouse, module: "stok" },
  { to: "/app/hr/penggajian", label: "Penggajian", exact: false, section: "HR", icon: UsersRound, module: "hr" },
  { to: "/app/hr/absensi", label: "Absensi", exact: false, section: "HR", icon: CalendarCheck, module: "hr" },
  { to: "/app/proyek", label: "Proyek", exact: false, section: "Lainnya", icon: FolderKanban, module: "proyek" },
  { to: "/app/kontrak", label: "Kontrak Berulang", exact: false, section: "Lainnya", icon: CalendarClock, module: "proyek" },
  { to: "/app/konsolidasi", label: "Konsolidasi", exact: false, section: "Lainnya", icon: Layers, module: "keuangan" },
  { to: "/app/persetujuan", label: "Persetujuan", exact: false, section: "Lainnya", icon: CheckSquare, module: "persetujuan" },
  { to: "/app/pengaturan", label: "Pengaturan", exact: false, section: "Lainnya", icon: Settings },
];

/** Avatar inisial (maks 2 huruf) dengan warna brand — ala aplikasi SaaS. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
      {initials || "?"}
    </span>
  );
}

/**
 * Lonceng notifikasi topbar: stok menipis, faktur lewat jatuh tempo, tiket
 * terbuka, dan pembelian menunggu persetujuan — dihitung server on-demand,
 * disegarkan tiap menit.
 */
/** Pemetaan rute aplikasi → slug modul panduan (untuk tombol bantuan topbar). */
/** Mode Sederhana: sembunyikan menu akuntansi teknis (per pengguna, localStorage). */
const SIMPLE_MODE_KEY = "erpindo-simple-mode";
const SIMPLE_MODE_EVENT = "erpindo-simple-mode-change";
const SIMPLE_HIDDEN = new Set([
  "/app/keuangan/akun",
  "/app/keuangan/jurnal",
  "/app/keuangan/buku-besar",
  "/app/keuangan/neraca-saldo",
]);

export function isSimpleMode(): boolean {
  return localStorage.getItem(SIMPLE_MODE_KEY) === "1";
}

export function setSimpleMode(on: boolean): void {
  localStorage.setItem(SIMPLE_MODE_KEY, on ? "1" : "0");
  window.dispatchEvent(new Event(SIMPLE_MODE_EVENT));
}

const GUIDE_SLUG_BY_PREFIX: [prefix: string, slug: string][] = [
  ["/app/pos", "pos"],
  ["/app/penjualan", "penjualan"],
  ["/app/pembelian", "pembelian"],
  ["/app/stok", "stok"],
  ["/app/persetujuan", "persetujuan"],
  ["/app/crm", "crm"],
  ["/app/master/produk", "produk"],
  ["/app/master/kontak", "kontak"],
  ["/app/master", "produk"],
  ["/app/hr", "penggajian"],
  ["/app/keuangan/catat", "akuntansi-pemula"],
  ["/app/keuangan/e-faktur", "pajak"],
  ["/app/keuangan/anggaran", "anggaran"],
  ["/app/keuangan/aset", "aset"],
  ["/app/keuangan/kurs", "kurs"],
  ["/app/keuangan/laba-rugi", "laporan"],
  ["/app/keuangan/neraca", "laporan"],
  ["/app/keuangan/arus-kas", "laporan"],
  ["/app/keuangan/umur-tagihan", "laporan"],
  ["/app/keuangan", "akuntansi"],
  ["/app/proyek", "proyek"],
  ["/app/kontrak", "kontrak"],
  ["/app/konsolidasi", "konsolidasi"],
  ["/app/manufaktur", "manufaktur"],
  ["/app/maintenance", "maintenance"],
  ["/app/helpdesk", "helpdesk"],
  ["/app/pengaturan", "pengaturan"],
];

/** Tombol "?" — membuka panduan modul yang sedang dibuka (tab baru). */
function HelpLink() {
  const { location } = useRouterState();
  const slug = GUIDE_SLUG_BY_PREFIX.find(([p]) => location.pathname.startsWith(p))?.[1] ?? "mulai";
  return (
    <a
      href={`/panduan/${slug}`}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      aria-label="Buka panduan halaman ini"
      title="Panduan halaman ini"
    >
      <CircleHelp className="size-4" aria-hidden />
    </a>
  );
}

function NotificationBell({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ["notifications", tenantId],
    queryFn: () => api.notifications(tenantId),
    refetchInterval: 60_000,
  });
  const items = query.data?.notifications ?? [];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toneByType: Record<string, string> = {
    low_stock: "bg-amber-500",
    overdue_invoice: "bg-red-500",
    open_ticket: "bg-sky-500",
    pending_approval: "bg-brand-500",
    crm_followup_due: "bg-violet-500",
    crm_stale_lead: "bg-slate-400",
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label={`Notifikasi${items.length > 0 ? ` (${items.length})` : ""}`}
        title="Notifikasi"
      >
        <Bell className="size-4" aria-hidden />
        {items.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {items.length > 9 ? "9+" : items.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="fixed right-2 top-16 z-50 w-[calc(100vw-1rem)] max-w-sm overflow-hidden rounded-card border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
          <div className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold dark:border-slate-800">
            Notifikasi
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Tidak ada yang perlu perhatian. 👍
              </p>
            ) : (
              items.map((n, i) => (
                <Link
                  key={i}
                  to={n.href}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 border-b border-slate-100 px-4 py-3 text-sm hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/50"
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${toneByType[n.type] ?? "bg-slate-400"}`} aria-hidden />
                  <span>
                    <span className="block font-medium text-slate-800 dark:text-slate-100">{n.title}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{n.detail}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const { dark, toggle } = useDarkMode();
  const [menuOpen, setMenuOpen] = useState(false);

  const meQuery = useQuery({ queryKey: ["me"], queryFn: api.me, retry: false });

  // Izin modul efektif (RBAC granular Fase 7e) — untuk menyaring menu sidebar.
  const activeTenantId = meQuery.data
    ? (meQuery.data.memberships.find((m) => m.tenantId === localStorage.getItem("erpindo-tenant"))?.tenantId ?? meQuery.data.memberships[0]?.tenantId)
    : undefined;
  const permQuery = useQuery({
    queryKey: ["my-permissions", activeTenantId],
    queryFn: () => api.myPermissions(activeTenantId as string),
    enabled: Boolean(activeTenantId),
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => navigate({ to: "/masuk" }),
  });

  // Mode Sederhana: ikuti perubahan toggle dari halaman Pengaturan.
  const [simpleMode, setSimpleModeState] = useState(isSimpleMode);
  useEffect(() => {
    const onChange = () => setSimpleModeState(isSimpleMode());
    window.addEventListener(SIMPLE_MODE_EVENT, onChange);
    return () => window.removeEventListener(SIMPLE_MODE_EVENT, onChange);
  }, []);

  // Drawer mobile: tutup dengan Escape + kunci scroll body saat terbuka.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

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

  // Sembunyikan menu modul yang tak diizinkan peran (default tampil saat izin belum termuat).
  const allowedModules = permQuery.data?.permissions;
  const permitted = (item: (typeof NAV_ITEMS)[number]) => !item.module || !allowedModules || allowedModules.includes(item.module);
  const navItems = (simpleMode ? NAV_ITEMS.filter((item) => !SIMPLE_HIDDEN.has(item.to)) : NAV_ITEMS).filter(permitted);
  const nav = (
    <nav className="flex flex-col gap-0.5 p-3">
      {navItems.map((item, i) => (
        <div key={item.to}>
          {item.section && navItems[i - 1]?.section !== item.section ? (
            <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {item.section}
            </div>
          ) : null}
          <Link
            to={item.to}
            activeOptions={{ exact: item.exact }}
            activeProps={{
              className:
                "bg-brand-50 font-medium text-brand-700 ring-1 ring-inset ring-brand-200/70 dark:bg-brand-500/15 dark:text-brand-100 dark:ring-brand-400/20",
            }}
            inactiveProps={{
              className:
                "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100",
            }}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        </div>
      ))}
      <a
        href="/panduan"
        target="_blank"
        rel="noreferrer"
        className="mt-4 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
      >
        <CircleHelp className="size-4 shrink-0" aria-hidden />
        Panduan
      </a>
    </nav>
  );

  const workspacePicker =
    me.memberships.length > 1 ? (
      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1.5 dark:bg-white/5">
        <Building2 className="size-4 shrink-0 text-slate-400" aria-hidden />
        <select
          aria-label="Pilih perusahaan"
          className="w-full bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200 [&>option]:text-slate-900"
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
      </div>
    ) : (
      <div className="mt-2 flex items-center gap-1.5 truncate px-1 text-sm text-slate-500 dark:text-slate-400">
        <Building2 className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{tenant.tenantName}</span>
      </div>
    );

  // Isi sidebar dipakai bersama desktop (aside) & mobile (drawer) agar tak duplikat.
  const sidebarContent = (
    <>
      <div className="border-b border-slate-200 px-4 py-4 dark:border-white/10">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
            e
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">erpindo</span>
        </div>
        {workspacePicker}
      </div>
      <div className="flex-1 overflow-y-auto">{nav}</div>
      <div className="border-t border-slate-200 p-3 dark:border-white/10">
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name={me.user.name} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{me.user.name}</div>
            <div className="truncate text-xs text-slate-500">{me.user.email}</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <WorkspaceContext.Provider value={{ me, tenant }}>
      <div className="flex min-h-full">
        {/* Sidebar desktop — theme-aware (putih di terang, gelap di gelap) */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-white/10 dark:bg-slate-950">
          {sidebarContent}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 md:hidden">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="rounded-lg border border-slate-300 p-2 dark:border-slate-700"
                aria-label="Menu"
              >
                <Menu className="size-4" aria-hidden />
              </button>
              <span className="font-bold text-brand-700 dark:text-brand-400">erpindo</span>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              {tenant.tenantStatus === "trial" ? <Badge tone="amber">Masa uji coba</Badge> : null}
              <Badge tone="brand">{tenant.role}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell tenantId={tenant.tenantId} />
              <HelpLink />
              <button
                onClick={toggle}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Ganti tema"
                title="Ganti tema terang/gelap"
              >
                {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
              </button>
              <span className="hidden sm:block">
                <Avatar name={me.user.name} />
              </span>
              <Button variant="secondary" className="h-9" onClick={() => logout.mutate()}>
                <LogOut className="size-4" aria-hidden /> Keluar
              </Button>
            </div>
          </header>

          {/* Menu mobile — off-canvas drawer geser dari kiri + backdrop */}
          <div
            className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
              menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[82vw] flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 md:hidden dark:border-white/10 dark:bg-slate-950 ${
              menuOpen ? "translate-x-0" : "-translate-x-full"
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi"
          >
            <button
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
              aria-label="Tutup menu"
            >
              <X className="size-5" aria-hidden />
            </button>
            {sidebarContent}
          </aside>

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
      <Asisten tenantId={tenant.tenantId} isAdmin={tenant.role !== "viewer"} />
    </WorkspaceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Dashboard: angka nyata + grafik tren + widget operasional + onboarding
// ---------------------------------------------------------------------------

/** Angka ringkas untuk tick sumbu: 1500000 → "1,5 jt", 250000 → "250 rb". */
function compactNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return String(n);
}

/** Batas atas sumbu yang "bulat": naikkan ke 1/2/5 × 10^n terdekat. */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 5, 10]) if (m * pow >= n) return m * pow;
  return 10 * pow;
}

/**
 * Grafik batang tren penjualan 30 hari (SVG ringan, tanpa pustaka chart).
 * Mengikuti pedoman dataviz: batang tipis ujung membulat dari baseline, grid
 * hairline recessive, tick sumbu angka bulat, satu seri = tanpa legend
 * (judul kartu yang menamai), tooltip per batang dengan hit-target penuh,
 * teks memakai token teks — bukan warna seri.
 */
function SalesTrendChart({ tenantId }: { tenantId: string }) {
  const query = useQuery({
    queryKey: ["sales-daily", tenantId],
    queryFn: () => api.salesDaily(tenantId, 30),
  });
  const [hover, setHover] = useState<number | null>(null);

  // Isi hari kosong dengan 0 agar sumbu waktu kontinu.
  const days = useMemo(() => {
    const byDate = new Map((query.data?.rows ?? []).map((r) => [r.date, r]));
    const out: { date: string; total: number; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const row = byDate.get(date);
      out.push({ date, total: row?.total ?? 0, count: row?.count ?? 0 });
    }
    return out;
  }, [query.data]);

  const W = 600;
  const H = 190;
  const PAD_L = 44;
  const PAD_B = 20;
  const PAD_T = 8;
  const plotW = W - PAD_L - 6;
  const plotH = H - PAD_T - PAD_B;
  const yMax = niceCeil(Math.max(...days.map((d) => d.total), 1));
  const slot = plotW / days.length;
  const barW = Math.min(24, Math.max(4, slot - 2)); // ≤24px + gap 2px antar batang
  const y = (v: number) => PAD_T + plotH - (v / yMax) * plotH;
  const ticks = [0, yMax / 2, yMax];
  const hovered = hover !== null ? days[hover] : null;

  return (
    <Card>
      <CardHeader
        title="Penjualan 30 hari terakhir"
        description="Total faktur penjualan per hari (dokumen dibatalkan tidak dihitung)."
      />
      <CardBody>
        {query.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Grafik penjualan harian 30 hari">
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={PAD_L}
                    x2={W - 6}
                    y1={y(t)}
                    y2={y(t)}
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD_L - 6}
                    y={y(t) + 3.5}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-slate-500"
                    fontSize={10}
                  >
                    {compactNumber(t)}
                  </text>
                </g>
              ))}
              {days.map((d, i) => {
                const cx = PAD_L + i * slot + slot / 2;
                const barH = Math.max(d.total > 0 ? 2 : 0, ((d.total / yMax) * plotH));
                const top = PAD_T + plotH - barH;
                return (
                  <g key={d.date}>
                    {d.total > 0 ? (
                      // Ujung atas membulat 4px, siku di baseline (path clip sederhana).
                      <rect
                        x={cx - barW / 2}
                        y={top}
                        width={barW}
                        height={barH}
                        rx={Math.min(4, barW / 2)}
                        className={
                          hover === i
                            ? "fill-brand-500 dark:fill-brand-300"
                            : "fill-brand-600 dark:fill-brand-400"
                        }
                      />
                    ) : null}
                    {/* Hit target lebih besar dari mark (selebar slot, setinggi plot). */}
                    <rect
                      x={PAD_L + i * slot}
                      y={PAD_T}
                      width={slot}
                      height={plotH}
                      fill="transparent"
                      onPointerEnter={() => setHover(i)}
                      onPointerLeave={() => setHover(null)}
                    />
                    {i % 7 === 1 ? (
                      <text
                        x={cx}
                        y={H - 6}
                        textAnchor="middle"
                        className="fill-slate-400 dark:fill-slate-500"
                        fontSize={10}
                      >
                        {formatDate(d.date).replace(/ \d{4}$/, "")}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
            {hovered ? (
              <div
                className="pointer-events-none absolute -top-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900"
                style={{
                  left: `${Math.min(92, Math.max(2, ((PAD_L + (hover ?? 0) * slot + slot / 2) / W) * 100))}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <span className="block font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {formatIDR(hovered.total)}
                </span>
                <span className="block text-slate-500 dark:text-slate-400">
                  {formatDate(hovered.date)} · {hovered.count} faktur
                </span>
              </div>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Widget faktur lewat jatuh tempo — diambil dari mesin notifikasi. */
function DueInvoicesWidget({ tenantId }: { tenantId: string }) {
  const query = useQuery({
    queryKey: ["notifications", tenantId],
    queryFn: () => api.notifications(tenantId),
  });
  const overdue = (query.data?.notifications ?? []).filter((n) => n.type === "overdue_invoice").slice(0, 5);

  return (
    <Card>
      <CardHeader title="Faktur lewat jatuh tempo" description="Tagih segera agar arus kas tetap sehat." />
      <CardBody>
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : overdue.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
            Tidak ada faktur yang lewat jatuh tempo. 👍
          </p>
        ) : (
          <ul className="space-y-2.5">
            {overdue.map((n, i) => (
              <li key={i}>
                <Link to="/app/penjualan" className="group block text-sm">
                  <span className="block font-medium text-slate-800 group-hover:text-brand-700 dark:text-slate-100 dark:group-hover:text-brand-300">
                    {n.title.replace("Faktur ", "").replace(" lewat jatuh tempo", "")}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{n.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Feed aktivitas terakhir (Owner) — cuplikan audit log. */
function ActivityFeed({ tenantId }: { tenantId: string }) {
  const query = useQuery({
    queryKey: ["audit-logs", tenantId],
    queryFn: () => api.auditLogs(tenantId),
  });
  const logs = (query.data?.logs ?? []).slice(0, 6);
  return (
    <Card>
      <CardHeader title="Aktivitas terakhir" description="Siapa melakukan apa — cuplikan riwayat audit." />
      <CardBody>
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : logs.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">Belum ada aktivitas.</p>
        ) : (
          <ul className="space-y-2.5">
            {logs.map((l) => (
              <li key={l.id} className="flex items-baseline gap-2 text-sm">
                <span className="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-brand-500" aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {AUDIT_ACTION_LABELS[l.action] ?? l.action}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {" "}
                    — {l.userName ?? "sistem"} · {new Date(l.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/** Checklist onboarding: dihitung dari data nyata, hilang otomatis saat lengkap. */
function OnboardingChecklist({ tenantId }: { tenantId: string }) {
  const settings = useQuery({ queryKey: ["settings", tenantId], queryFn: () => api.settings(tenantId) });
  const products = useQuery({
    queryKey: ["products", tenantId, "", 1],
    queryFn: () => api.listItems(tenantId, "products", { limit: 1 }),
  });
  const contacts = useQuery({
    queryKey: ["contacts", tenantId, "", 1],
    queryFn: () => api.listItems(tenantId, "contacts", { limit: 1 }),
  });
  const invoices = useQuery({
    queryKey: ["invoices", tenantId, "", 1],
    queryFn: () => api.invoices(tenantId, { limit: 1 }),
  });
  const members = useQuery({ queryKey: ["members", tenantId], queryFn: () => api.members(tenantId) });

  if (settings.isLoading || products.isLoading || contacts.isLoading || invoices.isLoading || members.isLoading) {
    return null;
  }
  const steps: { label: string; done: boolean; to: string }[] = [
    { label: "Lengkapi profil perusahaan (alamat & NPWP)", done: Boolean(settings.data?.settings.address), to: "/app/pengaturan" },
    { label: "Tambah produk pertama", done: (products.data?.total ?? 0) > 0, to: "/app/master/produk" },
    { label: "Tambah pelanggan / pemasok", done: (contacts.data?.total ?? 0) > 0, to: "/app/master/kontak" },
    { label: "Posting faktur pertama", done: (invoices.data?.total ?? 0) > 0, to: "/app/penjualan" },
    { label: "Undang anggota tim", done: (members.data?.members.length ?? 0) > 1, to: "/app/pengaturan" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card>
      <CardHeader
        title={`Mulai cepat — ${doneCount}/${steps.length} selesai`}
        description="Lima langkah agar pembukuan Anda langsung berjalan."
      />
      <CardBody>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-600 transition-all dark:bg-brand-400"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.label}>
              <Link to={s.to} className="group flex items-center gap-2.5 text-sm">
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    s.done
                      ? "border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-400 dark:text-slate-900"
                      : "border-slate-300 text-transparent dark:border-slate-600"
                  }`}
                  aria-hidden
                >
                  ✓
                </span>
                <span
                  className={
                    s.done
                      ? "text-slate-400 line-through dark:text-slate-500"
                      : "text-slate-700 group-hover:text-brand-700 dark:text-slate-200 dark:group-hover:text-brand-300"
                  }
                >
                  {s.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function DashboardPage() {
  const { me, tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const dash = useQuery({
    queryKey: ["dashboard", tenant.tenantId],
    queryFn: () => api.dashboard(tenant.tenantId),
  });

  const fmt = formatIDR;

  const salesDelta =
    dash.data && dash.data.salesLastMonth > 0
      ? Math.round(((dash.data.salesThisMonth - dash.data.salesLastMonth) / dash.data.salesLastMonth) * 100)
      : null;

  const stats: { label: string; value?: number; hint?: string; delta?: number | null; icon: LucideIcon; chip: string; currency?: boolean }[] = [
    {
      label: "Kas & Bank",
      value: dash.data?.cashAndBank,
      icon: Wallet,
      chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    },
    {
      label: "Penjualan Bulan Ini",
      value: dash.data?.salesThisMonth,
      hint: dash.data ? `${dash.data.salesCountThisMonth} faktur` : undefined,
      delta: salesDelta,
      icon: LineChart,
      chip: "bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300",
    },
    {
      label: "Piutang Belum Lunas",
      value: dash.data?.receivableOutstanding,
      icon: ArrowDownToLine,
      chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    },
    {
      label: "Hutang Belum Lunas",
      value: dash.data?.payableOutstanding,
      icon: ArrowUpFromLine,
      chip: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
    },
    {
      label: "Nilai Persediaan",
      value: dash.data?.inventoryValue,
      icon: Boxes,
      chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
    },
    {
      label: "Lead Terbuka",
      value: dash.data?.openLeadsCount,
      currency: false,
      icon: Target,
      chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
    },
  ];

  const quickLinks: { to: string; icon: LucideIcon; text: string; label: string }[] = [
    { to: "/app/pembelian", icon: ShoppingCart, label: "Pembelian", text: "Catat pembelian untuk mengisi stok" },
    { to: "/app/penjualan", icon: Receipt, label: "Penjualan", text: "Buat faktur — jurnal & stok otomatis" },
    { to: "/app/keuangan/laba-rugi", icon: LineChart, label: "Laba Rugi", text: "Lihat laba rugi & neraca kapan saja" },
    { to: "/app/pengaturan", icon: Users, label: "Pengaturan", text: "Undang tim dengan peran berbeda" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Selamat datang, {me.user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Ringkasan <span className="font-medium">{tenant.tenantName}</span> hari ini.
        </p>
      </div>

      {isAdmin ? <OnboardingChecklist tenantId={tenant.tenantId} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardBody>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</div>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${stat.chip}`}>
                  <stat.icon className="size-4" aria-hidden />
                </span>
              </div>
              {stat.value === undefined ? (
                <Skeleton className="mt-2 h-6 w-28" />
              ) : (
                <div className="mt-1 text-xl font-semibold">
                  {stat.currency === false ? stat.value.toLocaleString("id-ID") : fmt(stat.value)}
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                {stat.hint ? <span className="text-slate-400 dark:text-slate-500">{stat.hint}</span> : null}
                {stat.delta !== undefined && stat.delta !== null ? (
                  <span className={stat.delta >= 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-red-600 dark:text-red-400"}>
                    {stat.delta >= 0 ? "▲" : "▼"} {Math.abs(stat.delta)}% vs bulan lalu
                  </span>
                ) : null}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <SalesTrendChart tenantId={tenant.tenantId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <DueInvoicesWidget tenantId={tenant.tenantId} />
        {tenant.role === "owner" ? (
          <ActivityFeed tenantId={tenant.tenantId} />
        ) : (
          <Card>
            <CardHeader title="Mulai dari sini" description="Alur kerja harian yang umum." />
            <CardBody>
              <div className="grid gap-3">
                {quickLinks.map((q) => (
                  <Link
                    key={q.to}
                    to={q.to}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-800 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-brand-900/60 dark:group-hover:text-brand-300">
                      <q.icon className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{q.label}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{q.text}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {tenant.role === "owner" ? (
        <Card>
          <CardHeader title="Mulai dari sini" description="Alur kerja harian yang umum." />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quickLinks.map((q) => (
                <Link
                  key={q.to}
                  to={q.to}
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-800 dark:hover:border-brand-800 dark:hover:bg-brand-950/30"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-brand-100 group-hover:text-brand-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-brand-900/60 dark:group-hover:text-brand-300">
                    <q.icon className="size-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{q.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{q.text}</span>
                  </span>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}
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
      <div>
        <h1 className="text-2xl font-semibold">Pengaturan</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Langganan, profil & keamanan akun, identitas perusahaan, tim, dan kendali pembukuan.
        </p>
      </div>
      <SubscriptionCard />
      <ProfileCard />
      <DisplayModeCard />
      <SecurityCard />
      <CompanySettingsCard tenantId={tenant.tenantId} readOnly={!isAdmin} />
      {tenant.role === "owner" ? <NewCompanyCard /> : null}
      {isAdmin ? <MembersCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <RolesCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <ApprovalThresholdCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <CloseBooksCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <AuditLogCard tenantId={tenant.tenantId} /> : null}
    </div>
  );
}

/** Toggle Mode Sederhana — untuk pengguna yang tidak akrab dengan istilah akuntansi. */
function DisplayModeCard() {
  const [simple, setSimple] = useState(isSimpleMode);
  return (
    <Card>
      <CardHeader
        title="Tampilan"
        description="Sesuaikan menu dengan tingkat kenyamanan Anda terhadap istilah akuntansi."
      />
      <CardBody>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            id="simpleMode"
            type="checkbox"
            checked={simple}
            onChange={(e) => {
              setSimple(e.target.checked);
              setSimpleMode(e.target.checked);
            }}
            className="mt-1 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="font-medium">Mode Sederhana</span>
            <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">
              Sembunyikan menu akuntansi teknis (Jurnal Umum, Buku Besar, Neraca Saldo, Bagan Akun). Catat
              transaksi lewat halaman "Catat Transaksi" berbahasa sehari-hari; laporan tetap tersedia. Bisa
              dinyalakan/dimatikan kapan saja — hanya memengaruhi tampilan Anda, bukan data.
            </span>
          </span>
        </label>
      </CardBody>
    </Card>
  );
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Autentikasi & akun
  "auth.register": "Registrasi perusahaan",
  "auth.login": "Login",
  "auth.login_failed": "Login gagal",
  "auth.totp_failed": "Kode 2FA salah",
  "auth.email_verified": "Email diverifikasi",
  "auth.password_reset": "Password direset",
  "auth.password_changed": "Password diganti",
  "auth.profile_updated": "Profil diperbarui",
  "auth.totp_enabled": "2FA diaktifkan",
  "auth.totp_disabled": "2FA dinonaktifkan",
  // Perusahaan & tim
  "tenant.company_created": "Perusahaan dibuat",
  "tenant.invite_sent": "Undangan dikirim",
  "tenant.invite_accepted": "Undangan diterima",
  "tenant.settings_updated": "Pengaturan diubah",
  "tenant.member_role_changed": "Peran anggota diubah",
  "tenant.role_created": "Peran kustom dibuat",
  "tenant.role_updated": "Peran kustom diperbarui",
  "tenant.role_deleted": "Peran kustom dihapus",
  // Akuntansi dimensi + rekonsiliasi v2
  "dimension.cost_center.created": "Cost center dibuat",
  "dimension.cost_center.archived": "Cost center diarsipkan",
  "dimension.bank_rule.created": "Aturan auto-match bank dibuat",
  "dimension.bank_rule.deleted": "Aturan auto-match bank dihapus",
  // Manufaktur routing (Fase 7g)
  "manufacturing.work_center.created": "Work center dibuat",
  "manufacturing.work_center.archived": "Work center diarsipkan",
  "manufacturing.routing.added": "Tahap routing ditambahkan",
  "manufacturing.routing.completed": "Tahap routing diselesaikan",
  "tenant.member_removed": "Anggota dikeluarkan",
  // Akuntansi
  "accounting.account_created": "Akun COA dibuat",
  "accounting.account_renamed": "Akun COA diubah nama",
  "accounting.account_archived": "Akun COA diarsipkan",
  "accounting.journal_posted": "Jurnal diposting",
  "accounting.books_closed": "Tutup buku",
  "accounting.template_created": "Template jurnal dibuat",
  "accounting.bank_imported": "Impor mutasi bank",
  "accounting.closing_entry": "Jurnal penutup",
  // Penjualan, pembelian, pembayaran, stok
  "sales.invoice_posted": "Faktur penjualan",
  "sales.invoice_voided": "Faktur penjualan dibatalkan",
  "purchase.posted": "Faktur pembelian",
  "purchase.voided": "Faktur pembelian dibatalkan",
  "payment.recorded": "Pembayaran dicatat",
  "inventory.adjusted": "Penyesuaian stok",
  "inventory.transferred": "Transfer stok antar gudang",
  // Persetujuan
  "approval.requested": "Persetujuan diminta",
  "approval.threshold_set": "Ambang persetujuan diatur",
  "approval.approved": "Pembelian disetujui",
  "approval.rejected": "Pembelian ditolak",
  "approval.rule.created": "Aturan persetujuan dibuat",
  "approval.rule.updated": "Aturan persetujuan diperbarui",
  "approval.rule.deleted": "Aturan persetujuan dihapus",
  "approval.flow.submitted": "Alur persetujuan diajukan",
  "approval.flow.decided": "Alur persetujuan diputuskan",
  // Pengadaan
  "procurement.requisition.created": "Permintaan pembelian dibuat",
  "procurement.requisition.decided": "Permintaan pembelian diputuskan",
  "procurement.po.created": "Pesanan pembelian dibuat",
  "procurement.po.cancelled": "Pesanan pembelian dibatalkan",
  "procurement.goods_received": "Barang diterima (GRN)",
  // Penjualan bertahap
  "sales.so.created": "Pesanan penjualan dibuat",
  "sales.so.cancelled": "Pesanan penjualan dibatalkan",
  "sales.so.down_payment": "Uang muka diterima",
  "sales.so.delivered": "Surat jalan dibuat (barang keluar)",
  "sales.so.invoiced": "Pesanan difakturkan",
  // Stok lanjut (nomor seri)
  "stock.serial.added": "Nomor seri ditambahkan",
  "stock.serial.status": "Status nomor seri diubah",
  // Pajak UMKM
  "tax.pph_final.paid": "Setoran PPh Final dicatat",
  "tax.pph23.withheld": "Bukti potong PPh 23 dibuat",
  "tax.pph23.deposited": "PPh 23 disetor",
  // POS
  "pos.shift_opened": "Shift kasir dibuka",
  "pos.sale": "Penjualan kasir (POS)",
  "pos.shift_closed": "Shift kasir ditutup",
  // CRM
  "crm.lead.created": "Lead dibuat",
  "crm.lead.updated": "Lead diperbarui",
  "crm.activity.logged": "Aktivitas lead dicatat",
  "crm.lead.converted": "Lead jadi pelanggan",
  "crm.quotation.created": "Penawaran dibuat",
  "crm.quotation.status": "Status penawaran diubah",
  "crm.quotation.converted": "Penawaran jadi faktur",
  // HR
  "hr.employee.created": "Karyawan ditambahkan",
  "hr.employee.updated": "Karyawan diperbarui",
  "hr.payroll.run": "Penggajian dijalankan",
  "hr.adjustment.created": "Komponen gaji ditambahkan",
  "hr.adjustment.deleted": "Komponen gaji dihapus",
  "hr.loan.created": "Kasbon dicairkan",
  "hr.leave.requested": "Cuti/izin diajukan",
  "hr.leave.decided": "Cuti/izin diputuskan",
  "hr.attendance.recorded": "Kehadiran dicatat",
  "hr.attendance.deleted": "Kehadiran dihapus",
  // Proyek
  "project.created": "Proyek dibuat",
  "project.status": "Status proyek diubah",
  "project.milestone.invoiced": "Termin proyek difakturkan",
  // Aset, kontrak, mata uang, anggaran
  "asset.registered": "Aset didaftarkan",
  "asset.depreciated": "Penyusutan aset",
  "asset.disposed": "Aset dilepas",
  "contract.created": "Kontrak dibuat",
  "contract.status": "Status kontrak diubah",
  "contract.billed": "Kontrak ditagih",
  "currency.set": "Kurs ditetapkan",
  "budget.set": "Anggaran ditetapkan",
  // Manufaktur, maintenance, helpdesk
  "manufacturing.bom_saved": "BoM disimpan",
  "manufacturing.order_created": "Perintah produksi dibuat",
  "manufacturing.produced": "Produksi selesai",
  "manufacturing.qc_inspected": "Inspeksi QC",
  "maintenance.schedule_created": "Jadwal servis dibuat",
  "maintenance.generated": "Work order otomatis dibuat",
  "maintenance.work_order_created": "Work order dibuat",
  "maintenance.work_order_completed": "Work order selesai",
  "helpdesk.ticket_created": "Tiket dukungan dibuat",
  "helpdesk.ticket_replied": "Tiket dibalas",
  "helpdesk.ticket_updated": "Tiket diperbarui",
  // Sistem
  "billing.trial_expired": "Trial berakhir",
};

/** Kunci detail JSON → label ramah untuk ringkasan audit log. */
const AUDIT_DETAIL_LABELS: Record<string, string> = {
  docNo: "No", invoiceNo: "No", entryNo: "Jurnal", runNo: "No", shiftNo: "Shift",
  requestNo: "No", quoteNo: "Penawaran", ticketNo: "Tiket", code: "Kode", name: "Nama",
  total: "Total", amount: "Nominal", netProfit: "Laba bersih", totalGross: "Bruto",
  totalNet: "Netto", period: "Periode", role: "Peran", email: "Email", status: "Status",
  employees: "Karyawan", type: "Jenis", days: "Hari", principal: "Pokok",
  count: "Jumlah baris", autoMatched: "Cocok otomatis", targetUserId: "Anggota", stage: "Tahap",
};

const AUDIT_RUPIAH_KEYS = new Set(["total", "amount", "netProfit", "totalGross", "totalNet", "principal", "outstanding", "value"]);

/** Ubah detail JSON mentah audit menjadi teks ramah, mis. "No INV-00031 · Total Rp832.500". */
function friendlyAuditDetail(raw: string | null): string {
  if (!raw) return "";
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw;
  }
  const parts: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined || typeof val === "object") continue;
    if (key === "id" || key === "ip") continue;
    const label = AUDIT_DETAIL_LABELS[key] ?? key;
    const value = typeof val === "number" && AUDIT_RUPIAH_KEYS.has(key) ? formatIDR(val) : String(val);
    parts.push(`${label} ${value}`);
    if (parts.length >= 3) break;
  }
  return parts.join(" · ");
}

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
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/60">
            {(query.data?.logs ?? []).map((log) => {
              const detail = friendlyAuditDetail(log.detail);
              return (
                <div key={log.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="order-2 shrink-0 text-xs text-slate-400 dark:text-slate-500 sm:order-1 sm:w-28">
                    {log.createdAt.slice(0, 16).replace("T", " ")}
                  </span>
                  <div className="order-1 min-w-0 flex-1 sm:order-2">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{AUDIT_ACTION_LABELS[log.action] ?? log.action}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">oleh {log.userName ?? "sistem"}</span>
                    </div>
                    {detail ? <div className="text-xs text-slate-500 dark:text-slate-400">{detail}</div> : null}
                  </div>
                </div>
              );
            })}
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
  const [disableOpen, setDisableOpen] = useState(false);

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
      setDisableOpen(false);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setDisableOpen(false);
    },
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
              <Button variant="danger" disabled={code.length !== 6 || disable.isPending} onClick={() => setDisableOpen(true)}>
                Nonaktifkan 2FA
              </Button>
            </div>
            <ConfirmDialog
              open={disableOpen}
              title="Nonaktifkan verifikasi dua langkah?"
              description="Akun Anda kembali hanya dilindungi password. Anda bisa mengaktifkan 2FA lagi kapan saja."
              confirmLabel="Ya, nonaktifkan"
              danger
              busy={disable.isPending}
              onConfirm={() => disable.mutate()}
              onCancel={() => setDisableOpen(false)}
            />
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closingOpen, setClosingOpen] = useState(false);
  const closing = useMutation({
    mutationFn: () => api.closingEntry(tenantId, date),
    onSuccess: (res) => {
      toast("success", `Jurnal penutup ${res.entryNo} diposting — laba/rugi bersih dipindahkan ke Laba Ditahan.`);
      setClosingOpen(false);
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setClosingOpen(false);
    },
  });
  const close = useMutation({
    mutationFn: () => api.closeBooks(tenantId, date),
    onSuccess: (res) => {
      toast("success", `Pembukuan dikunci sampai ${res.lockedBefore}.`);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["settings", tenantId] });
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setConfirmOpen(false);
    },
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
          <Button variant="danger" disabled={!date || close.isPending} onClick={() => setConfirmOpen(true)}>
            Tutup Buku
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title={`Tutup buku sampai ${date}?`}
          description="Semua transaksi bertanggal pada atau sebelum tanggal ini akan terkunci permanen — jurnal, faktur, pembayaran, dan retur tidak bisa lagi ditambahkan. Tanggal kunci tidak bisa dimundurkan."
          confirmLabel="Ya, kunci pembukuan"
          danger
          busy={close.isPending}
          onConfirm={() => close.mutate()}
          onCancel={() => setConfirmOpen(false)}
        />

        <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Jurnal penutup tahunan: pindahkan laba/rugi berjalan sampai tanggal di atas ke akun Laba Ditahan —
            biasanya dilakukan sekali di akhir tahun buku, sebelum mengunci periode.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={!date || closing.isPending} onClick={() => setClosingOpen(true)}>
              Posting Jurnal Penutup
            </Button>
          </div>
          <ConfirmDialog
            open={closingOpen}
            title={`Posting jurnal penutup per ${date}?`}
            description="Semua saldo pendapatan dan beban sampai tanggal itu dinolkan; laba/rugi bersihnya dipindahkan ke Laba Ditahan. Ini jurnal biasa (bisa dilihat di Jurnal Umum), tapi sebaiknya hanya dilakukan di akhir tahun buku."
            confirmLabel="Ya, posting jurnal penutup"
            busy={closing.isPending}
            onConfirm={() => closing.mutate()}
            onCancel={() => setClosingOpen(false)}
          />
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

function NewCompanyCard() {
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

const ROLE_LABELS: Record<string, string> = { owner: "Pemilik", admin: "Admin", viewer: "Viewer" };

/** Kelola peran kustom (Fase 7e): nama + peran dasar + centang modul yang diizinkan. */
function RolesCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["roles", tenantId], queryFn: () => api.roles(tenantId) });
  const [editing, setEditing] = useState<ApiCustomRole | null>(null);
  const [name, setName] = useState("");
  const [baseRole, setBaseRole] = useState<"admin" | "viewer">("admin");
  const [perms, setPerms] = useState<PermissionKey[]>([]);
  const [toDelete, setToDelete] = useState<ApiCustomRole | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["roles", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["members", tenantId] });
  };
  const reset = () => { setEditing(null); setName(""); setBaseRole("admin"); setPerms([]); };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.updateRole(tenantId, editing.id, { name, baseRole, permissions: perms })
        : api.createRole(tenantId, { name, baseRole, permissions: perms }),
    onSuccess: () => { toast("success", editing ? "Peran diperbarui." : "Peran kustom dibuat."); reset(); invalidate(); },
    onError: (e: Error) => toast("error", e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteRole(tenantId, id),
    onSuccess: () => { toast("success", "Peran dihapus."); setToDelete(null); invalidate(); },
    onError: (e: Error) => toast("error", e.message),
  });

  function startEdit(r: ApiCustomRole) {
    setEditing(r); setName(r.name); setBaseRole(r.baseRole); setPerms(r.permissions);
  }
  function togglePerm(key: PermissionKey) {
    setPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }

  const roles = query.data?.roles ?? [];
  return (
    <Card>
      <CardHeader title="Peran kustom" description="Buat peran dengan akses modul terbatas — mis. Kasir (hanya POS & Penjualan). Peran dasar menentukan hak baca/tulis." />
      <CardBody className="space-y-5">
        {roles.length > 0 ? (
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div>
                  <span className="font-medium">{r.name}</span>
                  <Badge tone="neutral" >{r.baseRole === "admin" ? "Dasar: Admin" : "Dasar: Viewer"}</Badge>
                  <span className="ml-1 text-xs text-slate-400">{r.permissions.length} modul · {r.memberCount} anggota</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" className="h-8" onClick={() => startEdit(r)}>Ubah</Button>
                  <Button variant="ghost" className="h-8 text-red-600 dark:text-red-400" onClick={() => setToDelete(r)}>Hapus</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada peran kustom. Buat di bawah.</p>
        )}

        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h4 className="text-sm font-semibold">{editing ? `Ubah peran — ${editing.name}` : "Buat peran kustom"}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="role-name">Nama peran</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Kasir Toko" />
            </div>
            <div>
              <Label htmlFor="role-base">Peran dasar (hak baca/tulis)</Label>
              <Select id="role-base" value={baseRole} onChange={(e) => setBaseRole(e.target.value as "admin" | "viewer")}>
                <option value="admin">Admin (boleh menulis)</option>
                <option value="viewer">Viewer (baca-saja)</option>
              </Select>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Modul yang boleh diakses</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={perms.includes(p.key)} onChange={() => togglePerm(p.key)} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || name.trim().length < 2 || perms.length === 0}>
              {save.isPending ? <Spinner /> : null} {editing ? "Simpan" : "Buat peran"}
            </Button>
            {editing ? <Button variant="secondary" onClick={reset}>Batal</Button> : null}
          </div>
        </div>

        <ConfirmDialog
          open={toDelete !== null}
          title="Hapus peran kustom?"
          description={toDelete ? `Peran "${toDelete.name}" akan dihapus. Pastikan tidak ada anggota yang memakainya.` : undefined}
          confirmLabel="Hapus"
          danger
          busy={del.isPending}
          onConfirm={() => toDelete && del.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      </CardBody>
    </Card>
  );
}

function MembersCard({ tenantId }: { tenantId: string }) {
  const { me, tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["members", tenantId], queryFn: () => api.members(tenantId) });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);
  const isOwner = tenant.role === "owner";

  const rolesQuery = useQuery({ queryKey: ["roles", tenantId], queryFn: () => api.roles(tenantId), enabled: tenant.role === "owner" });
  const customRoles = rolesQuery.data?.roles ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["members", tenantId] });

  const invite = useMutation({
    mutationFn: (input: { email: string; role: "admin" | "viewer" }) => api.invite(tenantId, input),
    onSuccess: (res) => {
      toast("success", "Undangan dikirim.");
      setInviteUrl(res.inviteUrl);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  // Nilai select: "preset:owner|admin|viewer" atau "custom:<id>".
  const assign = useMutation({
    mutationFn: (v: { userId: string; value: string }) => {
      const [kind, val] = v.value.split(":");
      return kind === "custom"
        ? api.assignMemberRole(tenantId, v.userId, { customRoleId: val })
        : api.assignMemberRole(tenantId, v.userId, { preset: val as "owner" | "admin" | "viewer" });
    },
    onSuccess: () => {
      toast("success", "Peran anggota diperbarui.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(tenantId, userId),
    onSuccess: () => {
      toast("success", "Anggota dikeluarkan.");
      setRemoving(null);
      invalidate();
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
      <CardHeader title="Anggota tim" description="Undang rekan kerja, atur peran, atau keluarkan anggota. Pemilik dapat mengubah peran." />
      <CardBody className="space-y-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="pb-2 pr-4 font-medium">Nama</th>
                <th className="hidden pb-2 pr-4 font-medium sm:table-cell">Email</th>
                <th className="pb-2 pr-4 font-medium">Peran</th>
                {isOwner ? <th className="pb-2 font-medium"></th> : null}
              </tr>
            </thead>
            <tbody>
              {(query.data?.members ?? []).map((m) => {
                const isSelf = m.userId === me.user.id;
                const canManage = isOwner && !isSelf;
                return (
                  <tr key={m.userId} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-2.5 pr-4">
                      {m.name}
                      {isSelf ? <span className="ml-1 text-xs text-slate-400">(Anda)</span> : null}
                      <div className="text-xs text-slate-400 sm:hidden">{m.email}</div>
                    </td>
                    <td className="hidden py-2.5 pr-4 text-slate-500 dark:text-slate-400 sm:table-cell">{m.email}</td>
                    <td className="py-2.5 pr-4">
                      {canManage ? (
                        <Select
                          aria-label={`Peran ${m.name}`}
                          className="h-8 w-40"
                          value={m.customRoleId ? `custom:${m.customRoleId}` : `preset:${m.role}`}
                          onChange={(e) => assign.mutate({ userId: m.userId, value: e.target.value })}
                          disabled={assign.isPending}
                        >
                          <option value="preset:owner">Pemilik</option>
                          <option value="preset:admin">Admin</option>
                          <option value="preset:viewer">Viewer</option>
                          {customRoles.length > 0 ? (
                            <optgroup label="Peran kustom">
                              {customRoles.map((r) => (
                                <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>
                              ))}
                            </optgroup>
                          ) : null}
                        </Select>
                      ) : (
                        <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.roleName ?? ROLE_LABELS[m.role] ?? m.role}</Badge>
                      )}
                    </td>
                    {isOwner ? (
                      <td className="py-2.5 text-right">
                        {canManage ? (
                          <button
                            onClick={() => setRemoving({ userId: m.userId, name: m.name })}
                            className="text-xs text-red-600 hover:underline dark:text-red-400"
                          >
                            Keluarkan
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ConfirmDialog
          open={removing !== null}
          title="Keluarkan anggota?"
          description={`${removing?.name ?? ""} akan kehilangan akses ke perusahaan ini. Tindakan ini bisa diulang dengan mengundang kembali.`}
          confirmLabel="Keluarkan"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={() => removing && remove.mutate(removing.userId)}
          busy={remove.isPending}
        />

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

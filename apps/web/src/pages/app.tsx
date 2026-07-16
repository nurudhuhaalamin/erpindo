import { type ApiMembership, type MeResponse, type PermissionKey } from "@erpindo/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  ChevronDown,
  CircleHelp,
  BookOpen,
  BookText,
  Boxes,
  Building2,
  CalendarCheck,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  Combine,
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
  PackageSearch,
  PenLine,
  Percent,
  PiggyBank,
  Receipt,
  Scale,
  Search,
  Settings,
  ShoppingCart,
  Sigma,
  Store,
  Sun,
  Target,
  Wrench,
  UsersRound,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState,  } from "react";
import { api, ApiRequestError,  } from "../api/client";
import {
  Alert,
  Badge,
  Button,
  Spinner,
  useDarkMode,
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

// Taksonomi menu (Fase 9c): grup Keuangan lama (18 item) dipecah menjadi
// Keuangan (pencatatan), Laporan (baca-saja), dan Aset & Pajak; dua item yang
// salah kelompok (Pemeliharaan, Laporan Penjualan) dipindah ke rumah barunya.
// Rute, label, dan izin TIDAK berubah — hanya pengelompokan & ikon.
const NAV_ITEMS: { to: string; label: string; exact: boolean; section?: string; icon: LucideIcon; module?: PermissionKey }[] = [
  { to: "/app", label: "Dashboard", exact: true, icon: LayoutDashboard },
  { to: "/app/pos", label: "Kasir (POS)", exact: false, section: "Transaksi", icon: Store, module: "kasir" },
  { to: "/app/penjualan", label: "Penjualan", exact: false, section: "Transaksi", icon: Receipt, module: "penjualan" },
  { to: "/app/pesanan-penjualan", label: "Pesanan Penjualan", exact: false, section: "Transaksi", icon: ClipboardList, module: "penjualan" },
  { to: "/app/pembelian", label: "Pembelian", exact: false, section: "Transaksi", icon: ShoppingCart, module: "pembelian" },
  { to: "/app/pengadaan", label: "Pengadaan", exact: false, section: "Transaksi", icon: PackageSearch, module: "pembelian" },
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
  { to: "/app/keuangan/anggaran", label: "Anggaran", exact: false, section: "Keuangan", icon: PiggyBank, module: "keuangan" },
  { to: "/app/keuangan/dimensi", label: "Dimensi & Rekon", exact: false, section: "Keuangan", icon: Layers, module: "keuangan" },
  { to: "/app/keuangan/kurs", label: "Mata Uang", exact: false, section: "Keuangan", icon: Coins, module: "keuangan" },
  { to: "/app/konsolidasi", label: "Konsolidasi", exact: false, section: "Keuangan", icon: Combine, module: "keuangan" },
  { to: "/app/keuangan/neraca-saldo", label: "Neraca Saldo", exact: false, section: "Laporan", icon: Sigma, module: "keuangan" },
  { to: "/app/keuangan/laba-rugi", label: "Laba Rugi", exact: false, section: "Laporan", icon: LineChart, module: "laporan" },
  { to: "/app/keuangan/neraca", label: "Neraca", exact: false, section: "Laporan", icon: Scale, module: "laporan" },
  { to: "/app/keuangan/arus-kas", label: "Arus Kas", exact: false, section: "Laporan", icon: ArrowLeftRight, module: "laporan" },
  { to: "/app/keuangan/umur-tagihan", label: "Umur Piutang/Hutang", exact: false, section: "Laporan", icon: Hourglass, module: "laporan" },
  { to: "/app/laporan/penjualan", label: "Laporan Penjualan", exact: false, section: "Laporan", icon: BarChart3, module: "laporan" },
  { to: "/app/keuangan/aset", label: "Aset Tetap", exact: false, section: "Aset & Pajak", icon: Landmark, module: "keuangan" },
  { to: "/app/maintenance", label: "Pemeliharaan", exact: false, section: "Aset & Pajak", icon: Wrench, module: "proyek" },
  { to: "/app/keuangan/pajak", label: "Pajak", exact: false, section: "Aset & Pajak", icon: Percent, module: "pajak" },
  { to: "/app/keuangan/e-faktur", label: "Ekspor e-Faktur", exact: false, section: "Aset & Pajak", icon: FileSpreadsheet, module: "pajak" },
  { to: "/app/master/produk", label: "Produk", exact: false, section: "Master Data", icon: Package, module: "stok" },
  { to: "/app/master/kontak", label: "Kontak", exact: false, section: "Master Data", icon: Contact, module: "penjualan" },
  { to: "/app/master/gudang", label: "Gudang", exact: false, section: "Master Data", icon: Warehouse, module: "stok" },
  { to: "/app/hr/penggajian", label: "Penggajian", exact: false, section: "HR", icon: UsersRound, module: "hr" },
  { to: "/app/hr/absensi", label: "Absensi", exact: false, section: "HR", icon: CalendarCheck, module: "hr" },
  { to: "/app/proyek", label: "Proyek", exact: false, section: "Lainnya", icon: FolderKanban, module: "proyek" },
  { to: "/app/kontrak", label: "Kontrak Berulang", exact: false, section: "Lainnya", icon: CalendarClock, module: "proyek" },
  { to: "/app/persetujuan", label: "Persetujuan", exact: false, section: "Lainnya", icon: CheckSquare, module: "persetujuan" },
  { to: "/app/pengaturan", label: "Pengaturan", exact: false, section: "Lainnya", icon: Settings },
];

// Seksi lipat (Fase 9c): daftar nama seksi yang dilipat, per pengguna.
// Tidak ada simpanan = semua terbuka (perilaku lama persis).
const NAV_COLLAPSE_KEY = "erpindo-nav-collapsed";

function getCollapsedSections(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(NAV_COLLAPSE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

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

  // Efisiensi navigasi (Fase 9c): pencarian menu + seksi lipat persisten.
  const [navQuery, setNavQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<string[]>(getCollapsedSections);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const toggleSection = (name: string) => {
    setCollapsedSections((prev) => {
      const next = prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name];
      localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify(next));
      return next;
    });
  };

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

  // Pencarian menu: saat mencari, lipat diabaikan & seksi kosong tak berjudul.
  const navFilter = navQuery.trim().toLowerCase();
  const visibleItems = navFilter ? navItems.filter((item) => item.label.toLowerCase().includes(navFilter)) : navItems;
  // Kelompokkan berurutan per seksi (butuh grup utuh untuk lipat/buka).
  const navGroups: { section?: string; items: typeof navItems }[] = [];
  for (const item of visibleItems) {
    const last = navGroups[navGroups.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else navGroups.push({ section: item.section, items: [item] });
  }
  // Seksi rute aktif selalu terbuka agar posisi pengguna tak pernah tersembunyi.
  const activeSection = navItems.find((item) => (item.exact ? pathname === item.to : pathname.startsWith(item.to)))?.section;

  const navLink = (item: (typeof NAV_ITEMS)[number]) => (
    <Link
      key={item.to}
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
  );

  const nav = (
    <nav className="flex flex-col gap-0.5 p-3">
      <div className="relative mb-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          value={navQuery}
          onChange={(e) => setNavQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setNavQuery("");
          }}
          placeholder="Cari menu…"
          aria-label="Cari menu"
          className="w-full rounded-lg border border-slate-200 bg-transparent py-1.5 pl-8 pr-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-brand-400 dark:border-slate-700 dark:text-slate-200 dark:focus:border-brand-500"
        />
      </div>
      {navGroups.map((group) => {
        const isCollapsed =
          !navFilter && Boolean(group.section) && group.section !== activeSection && collapsedSections.includes(group.section!);
        return (
          <div key={group.section ?? "utama"}>
            {group.section ? (
              <button
                type="button"
                onClick={() => toggleSection(group.section!)}
                aria-expanded={!isCollapsed}
                className="mb-1 mt-4 flex w-full items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                {group.section}
                <ChevronDown className={`size-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} aria-hidden />
              </button>
            ) : null}
            {isCollapsed ? null : group.items.map(navLink)}
          </div>
        );
      })}
      {visibleItems.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-400 dark:text-slate-500">Tidak ada menu cocok.</p>
      ) : null}
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
// Halaman Dashboard & Pengaturan dipisah ke berkas sendiri (Fase 9d).
// Re-export menjaga nama ekspor lama agar main.tsx & pemakai lain tak berubah.
// ---------------------------------------------------------------------------
export { DashboardPage } from "./dashboard";
export { SettingsPage } from "./settings";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "./components/ui";
import { AppShell, DashboardPage, SettingsPage } from "./pages/app";
import { PurchasesPage, SalesPage, StockPage } from "./pages/commerce";
import { ProcurementPage } from "./pages/procurement";
import { SalesOrdersPage } from "./pages/salesorders";
import { LeadsPage, QuotationsPage } from "./pages/crm";
import { BudgetPage } from "./pages/budget";
import { AttendancePage } from "./pages/attendance";
import { PayrollPage } from "./pages/payroll";
import { AssetsPage } from "./pages/assets";
import { ProjectsPage } from "./pages/projects";
import { CurrenciesPage } from "./pages/currencies";
import { ContractsPage } from "./pages/contracts";
import { ConsolidationPage } from "./pages/consolidation";
import { ManufacturingPage } from "./pages/manufacturing";
import { MaintenancePage } from "./pages/maintenance";
import { HelpdeskPage } from "./pages/helpdesk";
import { CatatPage } from "./pages/catat";
import { KasBankPage } from "./pages/kasbank";
import { AccountsPage, JournalPage, LedgerPage, TrialBalancePage } from "./pages/finance";
import { AgingPage, BalanceSheetPage, CashFlowPage, EfakturPage, IncomeStatementPage, SalesReportPage } from "./pages/reports";
import { ContactsPage, ProductsPage, WarehousesPage } from "./pages/masterdata";
import { ApprovalsPage } from "./pages/approvals";
import { PosPage } from "./pages/pos";
import { Form1721A1PrintPage, InvoicePrintPage, PayslipPrintPage, QuotationPrintPage } from "./pages/print";
import {
  ForgotPasswordPage,
  InvitePage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyPage,
} from "./pages/auth";
import { LandingPage } from "./pages/landing";
import "./styles.css";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: LandingPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/daftar", component: RegisterPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/masuk", component: LoginPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/verifikasi", component: VerifyPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/lupa-password", component: ForgotPasswordPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/reset-password", component: ResetPasswordPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/undangan", component: InvitePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/cetak/faktur", component: InvoicePrintPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/cetak/penawaran", component: QuotationPrintPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/cetak/slip-gaji", component: PayslipPrintPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/cetak/1721a1", component: Form1721A1PrintPage }),
  // Panduan pengguna: publik & code-split — kontennya tidak membebani bundle utama.
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/panduan",
    component: lazyRouteComponent(() => import("./pages/panduan"), "PanduanIndexPage"),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/panduan/$modul",
    component: lazyRouteComponent(() => import("./pages/panduan"), "PanduanModulePage"),
  }),
];

const appRoute = createRoute({ getParentRoute: () => rootRoute, path: "/app", component: AppShell });
const appChildren = [
  createRoute({ getParentRoute: () => appRoute, path: "/", component: DashboardPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/pengaturan", component: SettingsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/pos", component: PosPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/persetujuan", component: ApprovalsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/penjualan", component: SalesPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/pesanan-penjualan", component: SalesOrdersPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/pembelian", component: PurchasesPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/pengadaan", component: ProcurementPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/stok", component: StockPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/crm/leads", component: LeadsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/crm/penawaran", component: QuotationsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/catat", component: CatatPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/kas-bank", component: KasBankPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/akun", component: AccountsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/jurnal", component: JournalPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/buku-besar", component: LedgerPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/neraca-saldo", component: TrialBalancePage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/laba-rugi", component: IncomeStatementPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/neraca", component: BalanceSheetPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/umur-tagihan", component: AgingPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/arus-kas", component: CashFlowPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/e-faktur", component: EfakturPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/laporan/penjualan", component: SalesReportPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/anggaran", component: BudgetPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/master/produk", component: ProductsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/master/kontak", component: ContactsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/master/gudang", component: WarehousesPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/hr/penggajian", component: PayrollPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/hr/absensi", component: AttendancePage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/aset", component: AssetsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/kurs", component: CurrenciesPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/proyek", component: ProjectsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/kontrak", component: ContractsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/konsolidasi", component: ConsolidationPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/manufaktur", component: ManufacturingPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/maintenance", component: MaintenancePage }),
  createRoute({ getParentRoute: () => appRoute, path: "/helpdesk", component: HelpdeskPage }),
];

const routeTree = rootRoute.addChildren([...routes, appRoute.addChildren(appChildren)]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

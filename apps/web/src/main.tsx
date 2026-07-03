import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "./components/ui";
import { AppShell, DashboardPage, SettingsPage } from "./pages/app";
import { PurchasesPage, SalesPage, StockPage } from "./pages/commerce";
import { AccountsPage, JournalPage, LedgerPage, TrialBalancePage } from "./pages/finance";
import { AgingPage, BalanceSheetPage, CashFlowPage, IncomeStatementPage } from "./pages/reports";
import { ContactsPage, ProductsPage, WarehousesPage } from "./pages/masterdata";
import { ApprovalsPage } from "./pages/approvals";
import { PosPage } from "./pages/pos";
import { InvoicePrintPage } from "./pages/print";
import {
  ForgotPasswordPage,
  InvitePage,
  LandingPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyPage,
} from "./pages/auth";
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
];

const appRoute = createRoute({ getParentRoute: () => rootRoute, path: "/app", component: AppShell });
const appChildren = [
  createRoute({ getParentRoute: () => appRoute, path: "/", component: DashboardPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/pengaturan", component: SettingsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/pos", component: PosPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/persetujuan", component: ApprovalsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/penjualan", component: SalesPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/pembelian", component: PurchasesPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/stok", component: StockPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/akun", component: AccountsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/jurnal", component: JournalPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/buku-besar", component: LedgerPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/neraca-saldo", component: TrialBalancePage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/laba-rugi", component: IncomeStatementPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/neraca", component: BalanceSheetPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/umur-tagihan", component: AgingPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/keuangan/arus-kas", component: CashFlowPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/master/produk", component: ProductsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/master/kontak", component: ContactsPage }),
  createRoute({ getParentRoute: () => appRoute, path: "/master/gudang", component: WarehousesPage }),
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

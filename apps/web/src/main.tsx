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
];

const appRoute = createRoute({ getParentRoute: () => rootRoute, path: "/app", component: AppShell });
const appIndexRoute = createRoute({ getParentRoute: () => appRoute, path: "/", component: DashboardPage });
const appSettingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/pengaturan", component: SettingsPage });

const routeTree = rootRoute.addChildren([...routes, appRoute.addChildren([appIndexRoute, appSettingsRoute])]);

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

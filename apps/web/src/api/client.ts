import type {
  ApiAccount,
  ApiAgingRow,
  ApiBalanceSheet,
  ApiCashFlow,
  ApiCommerceDoc,
  ApiDashboard,
  ApiIncomeStatement,
  ApiStockCardRow,
  ApiJournalEntry,
  ApiMember,
  ApiStockLevel,
  ApiTrialBalanceRow,
  ContactInput,
  CreateAccountInput,
  CreateInvoiceInput,
  CreateJournalEntryInput,
  CreatePaymentInput,
  MeResponse,
  ProductInput,
  WarehouseInput,
} from "@erpindo/shared";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: Record<string, string[]>,
    public twoFactorRequired?: boolean,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: string; issues?: Record<string, string[]>; twoFactorRequired?: boolean })
    | null;
  if (!res.ok) {
    throw new ApiRequestError(res.status, json?.error ?? "Terjadi kesalahan.", json?.issues, json?.twoFactorRequired);
  }
  return json as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("GET", "/api/health"),

  register: (input: { companyName: string; name: string; email: string; password: string }) =>
    request<{ ok: true; tenantId: string; slug: string }>("POST", "/api/auth/register", input),
  login: (input: { email: string; password: string; totpCode?: string }) =>
    request<{ ok: true }>("POST", "/api/auth/login", input),
  totpSetup: () => request<{ secret: string; otpauthUrl: string }>("POST", "/api/auth/2fa/setup"),
  totpEnable: (code: string) => request<{ ok: true }>("POST", "/api/auth/2fa/enable", { code }),
  totpDisable: (code: string) => request<{ ok: true }>("POST", "/api/auth/2fa/disable", { code }),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout"),
  me: () => request<MeResponse>("GET", "/api/auth/me"),
  verifyEmail: (token: string) => request<{ ok: true }>("POST", "/api/auth/verify", { token }),
  forgotPassword: (email: string) => request<{ ok: true }>("POST", "/api/auth/forgot-password", { email }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("POST", "/api/auth/reset-password", { token, password }),

  members: (tenantId: string) => request<{ members: ApiMember[] }>("GET", `/api/tenants/${tenantId}/members`),
  invite: (tenantId: string, input: { email: string; role: "admin" | "viewer" }) =>
    request<{ ok: true; inviteUrl: string }>("POST", `/api/tenants/${tenantId}/invites`, input),
  acceptInvite: (token: string) => request<{ ok: true; tenantId: string }>("POST", "/api/invites/accept", { token }),
  settings: (tenantId: string) =>
    request<{ settings: Record<string, string> }>("GET", `/api/tenants/${tenantId}/settings`),
  updateSettings: (tenantId: string, input: { displayName?: string; address?: string; npwp?: string }) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/settings`, input),

  // --- Keuangan --------------------------------------------------------------
  accounts: (tenantId: string) => request<{ accounts: ApiAccount[] }>("GET", `/api/tenants/${tenantId}/accounts`),
  createAccount: (tenantId: string, input: CreateAccountInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/accounts`, input),
  archiveAccount: (tenantId: string, accountId: string) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/accounts/${accountId}/archive`),
  journalEntries: (tenantId: string) =>
    request<{ entries: ApiJournalEntry[] }>("GET", `/api/tenants/${tenantId}/journal-entries`),
  createJournalEntry: (tenantId: string, input: CreateJournalEntryInput) =>
    request<{ ok: true; id: string; entryNo: string }>("POST", `/api/tenants/${tenantId}/journal-entries`, input),
  ledger: (tenantId: string, accountId: string) =>
    request<{
      account: ApiAccount;
      entries: {
        entryNo: string;
        entryDate: string;
        description: string | null;
        debit: number;
        credit: number;
        balance: number;
      }[];
      balance: number;
    }>("GET", `/api/tenants/${tenantId}/ledger/${accountId}`),
  trialBalance: (tenantId: string) =>
    request<{ rows: ApiTrialBalanceRow[]; totalDebit: number; totalCredit: number; balanced: boolean }>(
      "GET",
      `/api/tenants/${tenantId}/trial-balance`,
    ),

  // --- Laporan & dashboard --------------------------------------------------------
  incomeStatement: (tenantId: string, from: string, to: string) =>
    request<ApiIncomeStatement>("GET", `/api/tenants/${tenantId}/reports/income-statement?from=${from}&to=${to}`),
  balanceSheet: (tenantId: string, asOf: string) =>
    request<ApiBalanceSheet>("GET", `/api/tenants/${tenantId}/reports/balance-sheet?asOf=${asOf}`),
  dashboard: (tenantId: string) => request<ApiDashboard>("GET", `/api/tenants/${tenantId}/dashboard`),
  cashFlow: (tenantId: string, from: string, to: string) =>
    request<ApiCashFlow>("GET", `/api/tenants/${tenantId}/reports/cash-flow?from=${from}&to=${to}`),
  aging: (tenantId: string, type: "receivable" | "payable") =>
    request<{ rows: ApiAgingRow[]; grandTotal: number }>("GET", `/api/tenants/${tenantId}/reports/aging?type=${type}`),
  stockCard: (tenantId: string, productId: string, warehouseId: string) =>
    request<{ rows: ApiStockCardRow[]; balance: number }>(
      "GET",
      `/api/tenants/${tenantId}/stock-card/${productId}?warehouseId=${warehouseId}`,
    ),
  closeBooks: (tenantId: string, date: string) =>
    request<{ ok: true; lockedBefore: string }>("POST", `/api/tenants/${tenantId}/close-books`, { date }),

  // --- Penjualan & Pembelian -----------------------------------------------------
  invoices: (tenantId: string) => request<{ docs: ApiCommerceDoc[] }>("GET", `/api/tenants/${tenantId}/invoices`),
  createInvoice: (tenantId: string, input: CreateInvoiceInput) =>
    request<{ ok: true; id: string; docNo: string; total: number }>(
      "POST",
      `/api/tenants/${tenantId}/invoices`,
      input,
    ),
  purchases: (tenantId: string) => request<{ docs: ApiCommerceDoc[] }>("GET", `/api/tenants/${tenantId}/purchases`),
  createPurchase: (tenantId: string, input: CreateInvoiceInput) =>
    request<{ ok: true; id: string; docNo: string; total: number }>(
      "POST",
      `/api/tenants/${tenantId}/purchases`,
      input,
    ),
  createPayment: (tenantId: string, input: CreatePaymentInput) =>
    request<{ ok: true; paymentNo: string; paidAmount: number; settled: boolean }>(
      "POST",
      `/api/tenants/${tenantId}/payments`,
      input,
    ),
  stock: (tenantId: string) =>
    request<{ levels: ApiStockLevel[]; totalValue: number }>("GET", `/api/tenants/${tenantId}/stock`),

  // --- Master data --------------------------------------------------------------
  listItems: <T = Record<string, unknown>>(tenantId: string, entity: "products" | "contacts" | "warehouses") =>
    request<{ items: T[] }>("GET", `/api/tenants/${tenantId}/${entity}`),
  createItem: (
    tenantId: string,
    entity: "products" | "contacts" | "warehouses",
    input: ProductInput | ContactInput | WarehouseInput,
  ) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/${entity}`, input),
  archiveItem: (tenantId: string, entity: "products" | "contacts" | "warehouses", id: string) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/${entity}/${id}/archive`),
};

/** Unduh data sebagai CSV (dibuka langsung oleh Excel). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(escape).join(";")).join("\r\n");
  // BOM agar Excel mengenali UTF-8; pemisah ';' sesuai locale Indonesia.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Format rupiah tanpa desimal: 1500000 → "Rp 1.500.000" */
export function formatIDR(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    value,
  );
}

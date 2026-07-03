import type {
  ApiAccount,
  ApiCommerceDoc,
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
    | (Record<string, unknown> & { error?: string; issues?: Record<string, string[]> })
    | null;
  if (!res.ok) {
    throw new ApiRequestError(res.status, json?.error ?? "Terjadi kesalahan.", json?.issues);
  }
  return json as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("GET", "/api/health"),

  register: (input: { companyName: string; name: string; email: string; password: string }) =>
    request<{ ok: true; tenantId: string; slug: string }>("POST", "/api/auth/register", input),
  login: (input: { email: string; password: string }) => request<{ ok: true }>("POST", "/api/auth/login", input),
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

/** Format rupiah tanpa desimal: 1500000 → "Rp 1.500.000" */
export function formatIDR(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    value,
  );
}

import type {
  ApiAccount,
  ApiAgingRow,
  ApiApprovalFlow,
  ApiApprovalRule,
  ApiAttendance,
  ApiAttendanceRecap,
  ApiGoodsReceipt,
  ApiPurchaseOrder,
  ApiRequisition,
  ApiSalesOrder,
  ApprovalRuleInput,
  DecideStepInput,
  DeliverOrderInput,
  InvoiceFromSoInput,
  PurchaseOrderInput,
  ReceiveGoodsInput,
  RequisitionInput,
  SalesOrderInput,
  SoDownPaymentInput,
  ApiReorderSuggestion,
  ApiProductSerial,
  SerialInput,
  ApiPphFinal,
  ApiPphFinalPreview,
  ApiPph23,
  ApiSptPpn,
  PphFinalInput,
  Pph23Input,
  Pph23DepositInput,
  ApiMyPermissions,
  ApiCustomRole,
  CustomRoleInput,
  AssignRoleInput,
  ApiCostCenter,
  CostCenterInput,
  ApiDimensionReport,
  ApiBankMatchRule,
  BankMatchRuleInput,
  ApiWorkCenter,
  WorkCenterInput,
  ApiRoutingStep,
  RoutingStepInput,
  RoutingActualInput,
  SubmitApprovalInput,
  ApiBankStatementItem,
  ApiCrmSourceRow,
  ApiJournalTemplate,
  BankImportInput,
  JournalTemplateInput,
  ApiAuditLog,
  ApiBudgetReport,
  ApiEmployee,
  ApiEmployeeLoan,
  ApiFixedAsset,
  ApiLeaveRequest,
  ApiPayrollAdjustment,
  ApiPayrollRun,
  ApiProject,
  ApiProjectDetail,
  ApiPosShift,
  ApiPosReceipt,
  ApiPayment,
  ApiHeldSale,
  HoldSaleInput,
  PosPaymentMethod,
  PosRefundInput,
  ApiBalanceSheet,
  ApiBom,
  ApiCashFlow,
  ApiCommerceDoc,
  ApiConsolidatedBalanceSheet,
  ApiConsolidatedIncomeStatement,
  ApiConsolidationCompany,
  ApiContract,
  ApiCurrency,
  ApiDashboard,
  ApiSalesAnalytics,
  ApiSalesMonthlyRow,
  ApiReportSnapshot,
  ApiDriveStatus,
  ApiDepartment,
  ApiOrgNode,
  DepartmentInput,
  ApiAiJournalDraft,
  ApiEfakturReport,
  ApiIncomeStatement,
  ApiLead,
  ApiLeadActivity,
  ApiMaintenanceSchedule,
  ApiNotification,
  ApiProductionOrder,
  ApiWorkOrder,
  ApiQuotation,
  ApiStockCardRow,
  ApiStockLot,
  ApiTicket,
  ApiTicketDetail,
  ApiJournalEntry,
  ApiMember,
  ApiStockLevel,
  ApiTrialBalanceRow,
  ContactInput,
  ConvertQuotationInput,
  CreateAccountInput,
  CreateInvoiceInput,
  CreateJournalEntryInput,
  CreatePaymentInput,
  CreateQuotationInput,
  EmployeeLoanInput,
  InvoiceMilestoneInput,
  LeadActivityInput,
  LeaveRequestInput,
  AttendanceInput,
  PayrollAdjustmentInput,
  ProjectBudgetInput,
  ProjectMilestoneInput,
  ProjectTaskInput,
  ProjectTaskUpdateInput,
  TimeEntryInput,
  LeadInput,
  MeResponse,
  ApiFeedback,
  ApiBlogPost,
  BillingStatus,
  ApiPaymentLink,
  MarketplaceImportInput,
  ApiMarketplaceOrder,
  FeedbackInput,
  BlogPostInput,
  ProductInput,
  QuotationStatusInput,
  UpdateLeadInput,
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

async function request<T>(method: string, path: string, body?: unknown, opts?: { timeoutMs?: number }): Promise<T> {
  // Timeout klien opsional (mis. panggilan AI yang bisa lambat/menggantung di
  // server) — tanpa ini UI bisa "menggantung" selamanya bila server tak merespons.
  const controller = opts?.timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), opts!.timeoutMs) : undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller?.signal,
    });
  } catch (err) {
    if (controller?.signal.aborted) {
      throw new ApiRequestError(408, "Permintaan terlalu lama — coba lagi.");
    }
    throw new ApiRequestError(0, err instanceof Error ? err.message : "Gagal terhubung ke server.");
  } finally {
    if (timer) clearTimeout(timer);
  }
  const json = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: string; issues?: Record<string, string[]>; twoFactorRequired?: boolean })
    | null;
  if (!res.ok) {
    throw new ApiRequestError(res.status, json?.error ?? "Terjadi kesalahan.", json?.issues, json?.twoFactorRequired);
  }
  return json as T;
}

/** GET yang mengembalikan teks mentah (mis. XML) — error tetap dibaca sebagai JSON. */
async function requestText(path: string): Promise<string> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiRequestError(res.status, json?.error ?? "Terjadi kesalahan.");
  }
  return res.text();
}

/** Opsi list berhalaman: pencarian + limit/offset. */
export type ListOpts = { q?: string; limit?: number; offset?: number };

function listQs(opts?: ListOpts): string {
  if (!opts) return "";
  const p = new URLSearchParams();
  if (opts.q) p.set("q", opts.q);
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.offset) p.set("offset", String(opts.offset));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<{ ok: boolean }>("GET", "/api/health"),

  register: (input: { companyName: string; name: string; email: string; password: string }) =>
    request<{ ok: true; tenantId: string; slug: string }>("POST", "/api/auth/register", input),
  createCompany: (input: { companyName: string }) =>
    request<{ ok: true; tenantId: string; slug: string }>("POST", "/api/auth/companies", input),
  login: (input: { email: string; password: string; totpCode?: string }) =>
    request<{ ok: true }>("POST", "/api/auth/login", input),
  demoLogin: () => request<{ ok: true }>("POST", "/api/auth/demo"),
  googleAvailable: () => request<{ available: boolean }>("GET", "/api/auth/google/available"),

  // --- Dukungan/masukan + admin platform + blog (Fase 10e) -------------------
  // Billing langganan Midtrans (Fase 11b).
  billing: (tenantId: string) => request<BillingStatus>("GET", `/api/tenants/${tenantId}/billing`),
  billingCheckout: (tenantId: string) =>
    request<{ orderId: string; redirectUrl: string }>("POST", `/api/tenants/${tenantId}/billing/checkout`),

  submitFeedback: (input: FeedbackInput) => request<{ ok: true; id: string }>("POST", "/api/feedback", input),
  myFeedback: () => request<{ feedback: ApiFeedback[] }>("GET", "/api/feedback/mine"),
  adminOverview: () =>
    request<{
      totals: { users: number; tenants: number; feedbackBaru: number };
      byStatus: Record<string, number>;
      byPlan: Record<string, number>;
      recentSignups: {
        id: string;
        name: string;
        slug: string;
        status: string;
        plan: string;
        createdAt: string;
        ownerEmail: string | null;
      }[];
      growth: { month: string; n: number }[];
    }>("GET", "/api/admin/overview"),
  adminTenants: (opts?: { q?: string; status?: string; limit?: number; offset?: number }) => {
    const p = new URLSearchParams();
    if (opts?.q) p.set("q", opts.q);
    if (opts?.status) p.set("status", opts.status);
    if (opts?.limit) p.set("limit", String(opts.limit));
    if (opts?.offset) p.set("offset", String(opts.offset));
    const qs = p.toString();
    return request<{
      tenants: {
        id: string;
        name: string;
        slug: string;
        status: string;
        plan: string;
        trialEndsAt: string | null;
        createdAt: string;
        members: number;
        ownerEmail: string | null;
      }[];
      total: number;
    }>("GET", `/api/admin/tenants${qs ? `?${qs}` : ""}`);
  },
  // Infra & kapasitas (Fase 11a): mode DB tenant, versi skema & sebaran migrasi.
  adminInfra: () =>
    request<{
      dbMode: string;
      schemaVersion: number;
      totalTenants: number;
      tenantsBehind: number;
      versionDistribution: { v: number; n: number }[];
      refKinds: Record<string, number>;
      behind: { id: string; name: string; slug: string; schemaVersion: number }[];
    }>("GET", "/api/admin/infra"),
  adminMigrateTenants: () =>
    request<{ schemaVersion: number; total: number; migrated: number; failed: number }>(
      "POST",
      "/api/admin/migrate-tenants",
    ),
  adminFeedback: (status?: string) =>
    request<{ feedback: ApiFeedback[] }>("GET", `/api/admin/feedback${status ? `?status=${status}` : ""}`),
  adminUpdateFeedback: (id: string, input: { status?: string; adminNote?: string }) =>
    request<{ ok: true }>("PATCH", `/api/admin/feedback/${id}`, input),
  adminBlogPosts: () => request<{ posts: ApiBlogPost[] }>("GET", "/api/admin/blog-posts"),
  adminCreateBlogPost: (input: BlogPostInput) =>
    request<{ ok: true; id: string }>("POST", "/api/admin/blog-posts", input),
  adminUpdateBlogPost: (id: string, input: BlogPostInput | { published: boolean }) =>
    request<{ ok: true }>("PATCH", `/api/admin/blog-posts/${id}`, input),
  adminDeleteBlogPost: (id: string) => request<{ ok: true }>("DELETE", `/api/admin/blog-posts/${id}`),
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
  updateMemberRole: (tenantId: string, userId: string, role: "owner" | "admin" | "viewer") =>
    request<{ ok: true; role: string }>("PATCH", `/api/tenants/${tenantId}/members/${userId}`, { role }),
  removeMember: (tenantId: string, userId: string) =>
    request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/members/${userId}`),
  acceptInvite: (token: string) => request<{ ok: true; tenantId: string }>("POST", "/api/invites/accept", { token }),

  // --- RBAC granular (izin per modul + peran kustom) -----------------------------
  myPermissions: (tenantId: string) => request<ApiMyPermissions>("GET", `/api/tenants/${tenantId}/my-permissions`),
  roles: (tenantId: string) => request<{ roles: ApiCustomRole[] }>("GET", `/api/tenants/${tenantId}/roles`),
  createRole: (tenantId: string, input: CustomRoleInput) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/roles`, input),
  updateRole: (tenantId: string, roleId: string, input: CustomRoleInput) => request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/roles/${roleId}`, input),
  deleteRole: (tenantId: string, roleId: string) => request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/roles/${roleId}`),
  assignMemberRole: (tenantId: string, userId: string, input: AssignRoleInput) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/members/${userId}/assign`, input),
  settings: (tenantId: string) =>
    request<{ settings: Record<string, string> }>("GET", `/api/tenants/${tenantId}/settings`),
  updateSettings: (
    tenantId: string,
    input: { displayName?: string; address?: string; npwp?: string; logoDataUrl?: string },
  ) => request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/settings`, input),
  notifications: (tenantId: string) =>
    request<{ notifications: ApiNotification[]; count: number }>("GET", `/api/tenants/${tenantId}/notifications`),

  // --- Keuangan --------------------------------------------------------------
  accounts: (tenantId: string) => request<{ accounts: ApiAccount[] }>("GET", `/api/tenants/${tenantId}/accounts`),
  createAccount: (tenantId: string, input: CreateAccountInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/accounts`, input),
  renameAccount: (tenantId: string, accountId: string, name: string) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/accounts/${accountId}`, { name }),
  archiveAccount: (tenantId: string, accountId: string) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/accounts/${accountId}/archive`),
  journalEntries: (tenantId: string, opts?: ListOpts) =>
    request<{ entries: ApiJournalEntry[]; total: number }>(
      "GET",
      `/api/tenants/${tenantId}/journal-entries${listQs(opts)}`,
    ),
  createJournalEntry: (tenantId: string, input: CreateJournalEntryInput) =>
    request<{ ok: true; id: string; entryNo: string }>("POST", `/api/tenants/${tenantId}/journal-entries`, input),
  reverseJournalEntry: (tenantId: string, id: string, date?: string) =>
    request<{ ok: true; entryNo: string; reversalEntryNo: string }>(
      "POST",
      `/api/tenants/${tenantId}/journal-entries/${id}/reverse`,
      date ? { date } : {},
    ),
  ledger: (tenantId: string, accountId: string, opts?: { before?: string; limit?: number }) =>
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
      openingBalance: number;
      nextCursor: string | null;
    }>(
      "GET",
      `/api/tenants/${tenantId}/ledger/${accountId}${
        opts?.before || opts?.limit
          ? `?${new URLSearchParams({
              ...(opts.before ? { before: opts.before } : {}),
              ...(opts.limit ? { limit: String(opts.limit) } : {}),
            }).toString()}`
          : ""
      }`,
    ),
  crmReport: (tenantId: string) =>
    request<{ rows: ApiCrmSourceRow[] }>("GET", `/api/tenants/${tenantId}/crm/report`),
  journalTemplates: (tenantId: string) =>
    request<{ templates: ApiJournalTemplate[] }>("GET", `/api/tenants/${tenantId}/journal-templates`),
  createJournalTemplate: (tenantId: string, input: JournalTemplateInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/journal-templates`, input),
  deleteJournalTemplate: (tenantId: string, id: string) =>
    request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/journal-templates/${id}`),
  postJournalTemplate: (tenantId: string, id: string) =>
    request<{ ok: true; entryNo: string }>("POST", `/api/tenants/${tenantId}/journal-templates/${id}/post`),
  bankReconImport: (tenantId: string, input: BankImportInput) =>
    request<{ ok: true; imported: number; autoMatched: number }>("POST", `/api/tenants/${tenantId}/bank-recon/import`, input),
  bankRecon: (tenantId: string, accountId: string) =>
    request<{
      items: ApiBankStatementItem[];
      unmatchedLines: { id: string; entryNo: string; entryDate: string; description: string; amount: number }[];
      summary: { total: number; matched: number; unmatched: number };
    }>("GET", `/api/tenants/${tenantId}/bank-recon?accountId=${accountId}`),
  bankReconMatch: (tenantId: string, itemId: string, journalLineId: string) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/bank-recon/${itemId}/match`, { journalLineId }),
  bankReconUnmatch: (tenantId: string, itemId: string) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/bank-recon/${itemId}/unmatch`, {}),
  closingEntry: (tenantId: string, asOf: string) =>
    request<{ ok: true; entryNo: string; netProfit: number }>("POST", `/api/tenants/${tenantId}/closing-entry`, { asOf }),
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
  salesDaily: (tenantId: string, days = 30) =>
    request<{ from: string; days: number; rows: { date: string; total: number; count: number }[] }>(
      "GET",
      `/api/tenants/${tenantId}/reports/sales-daily?days=${days}`,
    ),
  salesMonthly: (tenantId: string, months = 6) =>
    request<{ from: string; months: number; rows: ApiSalesMonthlyRow[] }>(
      "GET",
      `/api/tenants/${tenantId}/reports/sales-monthly?months=${months}`,
    ),
  salesAnalytics: (tenantId: string, from: string, to: string) =>
    request<ApiSalesAnalytics>("GET", `/api/tenants/${tenantId}/reports/sales-analytics?from=${from}&to=${to}`),
  reportSnapshots: (tenantId: string) =>
    request<{ snapshots: ApiReportSnapshot[] }>("GET", `/api/tenants/${tenantId}/report-snapshots`),
  /** URL unduhan ekspor penuh (dipakai sebagai href — sesi cookie ikut terkirim). */
  exportFullUrl: (tenantId: string) => `/api/tenants/${tenantId}/export/full`,
  driveStatus: (tenantId: string) =>
    request<ApiDriveStatus>("GET", `/api/tenants/${tenantId}/drive/status`),
  driveConnectUrl: (tenantId: string) => `/api/tenants/${tenantId}/drive/connect`,
  driveBackupNow: (tenantId: string) =>
    request<{ ok: boolean; fileName: string }>("POST", `/api/tenants/${tenantId}/drive/backup-now`),
  driveDisconnect: (tenantId: string) =>
    request<{ ok: boolean }>("DELETE", `/api/tenants/${tenantId}/drive/disconnect`),
  departments: (tenantId: string) =>
    request<{ departments: ApiDepartment[] }>("GET", `/api/tenants/${tenantId}/departments`),
  createDepartment: (tenantId: string, body: DepartmentInput) =>
    request<{ ok: boolean; id: string }>("POST", `/api/tenants/${tenantId}/departments`, body),
  updateDepartment: (tenantId: string, id: string, body: DepartmentInput) =>
    request<{ ok: boolean }>("PATCH", `/api/tenants/${tenantId}/departments/${id}`, body),
  archiveDepartment: (tenantId: string, id: string) =>
    request<{ ok: boolean }>("DELETE", `/api/tenants/${tenantId}/departments/${id}`),
  orgChart: (tenantId: string) =>
    request<{ tree: ApiOrgNode[]; unassigned: ApiOrgNode["employees"] }>(
      "GET",
      `/api/tenants/${tenantId}/org-chart`,
    ),
  runReportSnapshot: (tenantId: string, period: string) =>
    request<{ ok: boolean; period: string; summary: ApiReportSnapshot["summary"] }>(
      "POST",
      `/api/tenants/${tenantId}/report-snapshots/run`,
      { period },
    ),
  cashFlow: (tenantId: string, from: string, to: string) =>
    request<ApiCashFlow>("GET", `/api/tenants/${tenantId}/reports/cash-flow?from=${from}&to=${to}`),
  aging: (tenantId: string, type: "receivable" | "payable") =>
    request<{ rows: ApiAgingRow[]; grandTotal: number }>("GET", `/api/tenants/${tenantId}/reports/aging?type=${type}`),
  efaktur: (tenantId: string, from: string, to: string) =>
    request<ApiEfakturReport>("GET", `/api/tenants/${tenantId}/reports/efaktur?from=${from}&to=${to}`),
  efakturXml: (tenantId: string, from: string, to: string) =>
    requestText(`/api/tenants/${tenantId}/reports/efaktur-xml?from=${from}&to=${to}`),

  aiChat: (tenantId: string, messages: { role: "user" | "assistant"; content: string }[]) =>
    request<{ reply: string; quotaRemaining?: number }>("POST", `/api/tenants/${tenantId}/ai/chat`, { messages }, { timeoutMs: 35_000 }),
  aiJurnal: (tenantId: string, prompt: string) =>
    request<{ draft: ApiAiJournalDraft; quotaRemaining?: number }>("POST", `/api/tenants/${tenantId}/ai/jurnal`, { prompt }, { timeoutMs: 35_000 }),
  aiLaporan: (tenantId: string, question: string) =>
    request<{ reply: string; quotaRemaining?: number }>("POST", `/api/tenants/${tenantId}/ai/laporan`, { question }, { timeoutMs: 35_000 }),
  invoicePaymentLink: (tenantId: string, invoiceId: string) =>
    request<{ link: ApiPaymentLink | null; configured: boolean }>("GET", `/api/tenants/${tenantId}/invoices/${invoiceId}/payment-link`),
  marketplaceImport: (tenantId: string, input: MarketplaceImportInput) =>
    request<{
      imported: { externalOrderNo: string; invoiceNo: string }[];
      skipped: { externalOrderNo: string; reason: string }[];
      failed: { externalOrderNo: string; reason: string }[];
    }>("POST", `/api/tenants/${tenantId}/marketplace/import`, input),
  marketplaceOrders: (tenantId: string) =>
    request<{ orders: ApiMarketplaceOrder[] }>("GET", `/api/tenants/${tenantId}/marketplace/orders`),
  createInvoicePaymentLink: (tenantId: string, invoiceId: string) =>
    request<{ orderId: string; redirectUrl: string; amount: number }>("POST", `/api/tenants/${tenantId}/invoices/${invoiceId}/payment-link`),
  stockCard: (tenantId: string, productId: string, warehouseId: string) =>
    request<{ rows: ApiStockCardRow[]; balance: number }>(
      "GET",
      `/api/tenants/${tenantId}/stock-card/${productId}?warehouseId=${warehouseId}`,
    ),
  closeBooks: (tenantId: string, date: string) =>
    request<{ ok: true; lockedBefore: string }>("POST", `/api/tenants/${tenantId}/close-books`, { date }),
  budgets: (tenantId: string, period: string) =>
    request<ApiBudgetReport>("GET", `/api/tenants/${tenantId}/budgets/${period}`),
  setBudget: (tenantId: string, input: { accountId: string; period: string; amount: number }) =>
    request<{ ok: true }>("PUT", `/api/tenants/${tenantId}/budgets`, input),

  // --- Konsolidasi multi-perusahaan ----------------------------------------
  consolidationCompanies: () =>
    request<{ companies: ApiConsolidationCompany[] }>("GET", "/api/consolidation/companies"),
  consolidatedIncomeStatement: (from: string, to: string, companyIds?: string[]) =>
    request<ApiConsolidatedIncomeStatement>(
      "GET",
      `/api/consolidation/income-statement?from=${from}&to=${to}${
        companyIds && companyIds.length ? `&companies=${companyIds.join(",")}` : ""
      }`,
    ),
  consolidatedBalanceSheet: (asOf: string, companyIds?: string[]) =>
    request<ApiConsolidatedBalanceSheet>(
      "GET",
      `/api/consolidation/balance-sheet?asOf=${asOf}${
        companyIds && companyIds.length ? `&companies=${companyIds.join(",")}` : ""
      }`,
    ),

  // --- HR & Payroll --------------------------------------------------------------
  employees: (tenantId: string) => request<{ employees: ApiEmployee[] }>("GET", `/api/tenants/${tenantId}/employees`),
  createEmployee: (
    tenantId: string,
    input: {
      name: string;
      position?: string;
      ptkpStatus: string;
      baseSalary: number;
      allowances: number;
      bankAccount?: string;
      joinDate?: string;
      departmentId?: string;
      managerId?: string;
    },
  ) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/employees`, input),
  updateEmployee: (tenantId: string, id: string, input: Record<string, unknown>) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/employees/${id}`, input),
  payrollRuns: (tenantId: string) =>
    request<{ runs: ApiPayrollRun[] }>("GET", `/api/tenants/${tenantId}/payroll-runs`),
  runPayroll: (tenantId: string, input: { period: string; cashAccountId: string; paymentDate: string }) =>
    request<{ ok: true; runNo: string; totalGross: number; totalNet: number; employees: number }>(
      "POST",
      `/api/tenants/${tenantId}/payroll-runs`,
      input,
    ),
  voidPayrollRun: (tenantId: string, id: string, date?: string) =>
    request<{ ok: true; runNo: string; reversalEntryNo: string }>(
      "POST",
      `/api/tenants/${tenantId}/payroll-runs/${id}/void`,
      date ? { date } : {},
    ),
  payrollAdjustments: (tenantId: string, period?: string) =>
    request<{ adjustments: ApiPayrollAdjustment[] }>(
      "GET",
      `/api/tenants/${tenantId}/payroll-adjustments${period ? `?period=${period}` : ""}`,
    ),
  createPayrollAdjustment: (tenantId: string, input: PayrollAdjustmentInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/payroll-adjustments`, input),
  deletePayrollAdjustment: (tenantId: string, id: string) =>
    request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/payroll-adjustments/${id}`),
  employeeLoans: (tenantId: string) =>
    request<{ loans: ApiEmployeeLoan[] }>("GET", `/api/tenants/${tenantId}/employee-loans`),
  createEmployeeLoan: (tenantId: string, input: EmployeeLoanInput) =>
    request<{ ok: true; id: string; journalNo: string }>("POST", `/api/tenants/${tenantId}/employee-loans`, input),
  leaveRequests: (tenantId: string) =>
    request<{ requests: ApiLeaveRequest[] }>("GET", `/api/tenants/${tenantId}/leave-requests`),
  createLeaveRequest: (tenantId: string, input: LeaveRequestInput) =>
    request<{ ok: true; id: string; days: number }>("POST", `/api/tenants/${tenantId}/leave-requests`, input),
  decideLeaveRequest: (tenantId: string, id: string, input: { status: "approved" | "rejected" }) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/leave-requests/${id}`, input),

  // --- Absensi/kehadiran ---------------------------------------------------------
  attendance: (tenantId: string, month: string) =>
    request<{ month: string; records: ApiAttendance[]; recap: ApiAttendanceRecap[] }>(
      "GET",
      `/api/tenants/${tenantId}/attendance?month=${encodeURIComponent(month)}`,
    ),
  recordAttendance: (tenantId: string, input: AttendanceInput) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/attendance`, input),
  deleteAttendance: (tenantId: string, id: string) =>
    request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/attendance/${id}`),

  // --- Aset Tetap ----------------------------------------------------------------
  assets: (tenantId: string) => request<{ assets: ApiFixedAsset[] }>("GET", `/api/tenants/${tenantId}/assets`),
  createAsset: (
    tenantId: string,
    input: {
      name: string;
      category?: string;
      acquisitionDate: string;
      acquisitionCost: number;
      usefulLifeMonths: number;
      residualValue: number;
      cashAccountId: string;
    },
  ) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/assets`, input),
  runDepreciation: (tenantId: string, input: { period: string; date: string }) =>
    request<{ ok: true; count: number; total: number }>("POST", `/api/tenants/${tenantId}/assets/depreciation`, input),
  disposeAsset: (tenantId: string, id: string, input: { disposalDate: string; proceeds: number; cashAccountId: string }) =>
    request<{ ok: true; bookValue: number; gain: number; journalNo: string }>(
      "POST",
      `/api/tenants/${tenantId}/assets/${id}/dispose`,
      input,
    ),

  // --- Proyek --------------------------------------------------------------------
  projects: (tenantId: string) => request<{ projects: ApiProject[] }>("GET", `/api/tenants/${tenantId}/projects`),
  project: (tenantId: string, id: string) => request<ApiProjectDetail>("GET", `/api/tenants/${tenantId}/projects/${id}`),
  createProject: (
    tenantId: string,
    input: { code: string; name: string; contactId?: string; budget: number; startDate?: string; endDate?: string; notes?: string },
  ) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/projects`, input),
  setProjectStatus: (tenantId: string, id: string, status: string) =>
    request<{ ok: true; status: string }>("PATCH", `/api/tenants/${tenantId}/projects/${id}/status`, { status }),
  addProjectTask: (tenantId: string, id: string, input: ProjectTaskInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/projects/${id}/tasks`, input),
  setTaskStatus: (tenantId: string, id: string, taskId: string, status: string) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/projects/${id}/tasks/${taskId}`, { status }),
  updateProjectTask: (tenantId: string, id: string, taskId: string, input: ProjectTaskUpdateInput) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/projects/${id}/tasks/${taskId}`, input),
  addMilestone: (tenantId: string, id: string, input: ProjectMilestoneInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/projects/${id}/milestones`, input),
  invoiceMilestone: (tenantId: string, id: string, mid: string, input: InvoiceMilestoneInput) =>
    request<{ ok: true; invoiceId: string; docNo: string; total: number }>(
      "POST",
      `/api/tenants/${tenantId}/projects/${id}/milestones/${mid}/invoice`,
      input,
    ),
  deleteMilestone: (tenantId: string, id: string, mid: string) =>
    request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/projects/${id}/milestones/${mid}`),
  addProjectBudget: (tenantId: string, id: string, input: ProjectBudgetInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/projects/${id}/budgets`, input),
  deleteProjectBudget: (tenantId: string, id: string, bid: string) =>
    request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/projects/${id}/budgets/${bid}`),
  addTimeEntry: (tenantId: string, id: string, input: TimeEntryInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/projects/${id}/time-entries`, input),
  deleteTimeEntry: (tenantId: string, id: string, eid: string) =>
    request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/projects/${id}/time-entries/${eid}`),

  // --- Procurement (PR → PO → penerimaan) ----------------------------------------
  requisitions: (tenantId: string) =>
    request<{ requisitions: ApiRequisition[] }>("GET", `/api/tenants/${tenantId}/requisitions`),
  createRequisition: (tenantId: string, input: RequisitionInput) =>
    request<{ ok: true; id: string; reqNo: string }>("POST", `/api/tenants/${tenantId}/requisitions`, input),
  decideRequisition: (tenantId: string, id: string, status: "approved" | "rejected") =>
    request<{ ok: true; status: string }>("PATCH", `/api/tenants/${tenantId}/requisitions/${id}`, { status }),
  purchaseOrders: (tenantId: string) =>
    request<{ orders: ApiPurchaseOrder[] }>("GET", `/api/tenants/${tenantId}/purchase-orders`),
  createPurchaseOrder: (tenantId: string, input: PurchaseOrderInput) =>
    request<{ ok: true; id: string; poNo: string }>("POST", `/api/tenants/${tenantId}/purchase-orders`, input),
  cancelPurchaseOrder: (tenantId: string, id: string) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/purchase-orders/${id}/cancel`),
  receiveGoods: (tenantId: string, id: string, input: ReceiveGoodsInput) =>
    request<{ ok: true; grnNo: string; purchaseNo: string; total: number }>("POST", `/api/tenants/${tenantId}/purchase-orders/${id}/receive`, input),
  goodsReceipts: (tenantId: string) =>
    request<{ receipts: ApiGoodsReceipt[] }>("GET", `/api/tenants/${tenantId}/goods-receipts`),

  // --- Penjualan bertahap (SO → Surat Jalan → Faktur) ----------------------------
  salesOrders: (tenantId: string) =>
    request<{ orders: ApiSalesOrder[] }>("GET", `/api/tenants/${tenantId}/sales-orders`),
  createSalesOrder: (tenantId: string, input: SalesOrderInput) =>
    request<{ ok: true; id: string; soNo: string }>("POST", `/api/tenants/${tenantId}/sales-orders`, input),
  cancelSalesOrder: (tenantId: string, id: string) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/sales-orders/${id}/cancel`),
  soDownPayment: (tenantId: string, id: string, input: SoDownPaymentInput) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/sales-orders/${id}/down-payment`, input),
  deliverSalesOrder: (tenantId: string, id: string, input: DeliverOrderInput) =>
    request<{ ok: true; doNo: string }>("POST", `/api/tenants/${tenantId}/sales-orders/${id}/deliver`, input),
  invoiceSalesOrder: (tenantId: string, id: string, input: InvoiceFromSoInput) =>
    request<{ ok: true; invoiceNo: string; total: number }>("POST", `/api/tenants/${tenantId}/sales-orders/${id}/invoice`, input),

  // --- Stok lanjut (titik pesan, barcode, nomor seri) ----------------------------
  reorderSuggestions: (tenantId: string) =>
    request<{ suggestions: ApiReorderSuggestion[] }>("GET", `/api/tenants/${tenantId}/reorder-suggestions`),
  lookupBarcode: (tenantId: string, barcode: string) =>
    request<{ product: { id: string; sku: string; name: string; unit: string; sellPrice: number; buyPrice: number } }>("GET", `/api/tenants/${tenantId}/products/lookup?barcode=${encodeURIComponent(barcode)}`),
  productSerials: (tenantId: string, productId: string) =>
    request<{ serials: ApiProductSerial[] }>("GET", `/api/tenants/${tenantId}/products/${productId}/serials`),
  addProductSerial: (tenantId: string, productId: string, input: SerialInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/products/${productId}/serials`, input),
  setSerialStatus: (tenantId: string, productId: string, serialId: string, status: "in_stock" | "sold") =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/products/${productId}/serials/${serialId}`, { status }),

  // --- Pajak UMKM (PPh Final, PPh 23, SPT Masa PPN) ------------------------------
  pphFinalPreview: (tenantId: string, period: string) =>
    request<ApiPphFinalPreview>("GET", `/api/tenants/${tenantId}/tax/pph-final/preview?period=${period}`),
  pphFinalList: (tenantId: string) =>
    request<{ records: ApiPphFinal[] }>("GET", `/api/tenants/${tenantId}/tax/pph-final`),
  payPphFinal: (tenantId: string, input: PphFinalInput) =>
    request<{ ok: true; id: string; amount: number }>("POST", `/api/tenants/${tenantId}/tax/pph-final`, input),
  pph23List: (tenantId: string) =>
    request<{ records: ApiPph23[] }>("GET", `/api/tenants/${tenantId}/tax/pph23`),
  createPph23: (tenantId: string, input: Pph23Input) =>
    request<{ ok: true; id: string; docNo: string; amount: number }>("POST", `/api/tenants/${tenantId}/tax/pph23`, input),
  depositPph23: (tenantId: string, id: string, input: Pph23DepositInput) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/tax/pph23/${id}/deposit`, input),
  sptPpn: (tenantId: string, period: string) =>
    request<ApiSptPpn>("GET", `/api/tenants/${tenantId}/tax/spt-ppn?period=${period}`),

  // --- Akuntansi dimensi + rekonsiliasi v2 ---------------------------------------
  costCenters: (tenantId: string) => request<{ items: ApiCostCenter[] }>("GET", `/api/tenants/${tenantId}/cost-centers`),
  createCostCenter: (tenantId: string, input: CostCenterInput) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/cost-centers`, input),
  archiveCostCenter: (tenantId: string, id: string) => request<{ ok: true }>("POST", `/api/tenants/${tenantId}/cost-centers/${id}/archive`),
  dimensionReport: (tenantId: string, from: string, to: string) => request<ApiDimensionReport>("GET", `/api/tenants/${tenantId}/reports/dimension?from=${from}&to=${to}`),
  bankMatchRules: (tenantId: string) => request<{ rules: ApiBankMatchRule[] }>("GET", `/api/tenants/${tenantId}/bank-match-rules`),
  createBankMatchRule: (tenantId: string, input: BankMatchRuleInput) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/bank-match-rules`, input),
  deleteBankMatchRule: (tenantId: string, id: string) => request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/bank-match-rules/${id}`),

  // --- Manufaktur routing (work center + tahapan) --------------------------------
  workCenters: (tenantId: string) => request<{ items: ApiWorkCenter[] }>("GET", `/api/tenants/${tenantId}/work-centers`),
  createWorkCenter: (tenantId: string, input: WorkCenterInput) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/work-centers`, input),
  archiveWorkCenter: (tenantId: string, id: string) => request<{ ok: true }>("POST", `/api/tenants/${tenantId}/work-centers/${id}/archive`),
  productionRouting: (tenantId: string, productionId: string) =>
    request<{ steps: ApiRoutingStep[]; totalStandard: number; totalActual: number; variance: number }>("GET", `/api/tenants/${tenantId}/production-orders/${productionId}/routing`),
  addRoutingStep: (tenantId: string, productionId: string, input: RoutingStepInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/production-orders/${productionId}/routing`, input),
  completeRoutingStep: (tenantId: string, productionId: string, stepId: string, input: RoutingActualInput) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/production-orders/${productionId}/routing/${stepId}/complete`, input),

  // --- Approval workflow engine --------------------------------------------------
  approvalRules: (tenantId: string) =>
    request<{ rules: ApiApprovalRule[] }>("GET", `/api/tenants/${tenantId}/approval-rules`),
  createApprovalRule: (tenantId: string, input: ApprovalRuleInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/approval-rules`, input),
  updateApprovalRule: (tenantId: string, id: string, input: Partial<ApprovalRuleInput> & { active?: boolean }) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/approval-rules/${id}`, input),
  deleteApprovalRule: (tenantId: string, id: string) =>
    request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/approval-rules/${id}`),
  approvalFlows: (tenantId: string, queueMe = false) =>
    request<{ flows: ApiApprovalFlow[] }>("GET", `/api/tenants/${tenantId}/approval-flows${queueMe ? "?queue=me" : ""}`),
  submitApproval: (tenantId: string, input: SubmitApprovalInput) =>
    request<{ ok: true; flowNo: string; status: string; autoApproved?: boolean }>("POST", `/api/tenants/${tenantId}/approval-flows`, input),
  decideApprovalStep: (tenantId: string, id: string, input: DecideStepInput) =>
    request<{ ok: true; status: string }>("POST", `/api/tenants/${tenantId}/approval-flows/${id}/steps/decide`, input),

  // --- Penjualan & Pembelian -----------------------------------------------------
  invoices: (tenantId: string, opts?: ListOpts) =>
    request<{ docs: ApiCommerceDoc[]; total: number }>("GET", `/api/tenants/${tenantId}/invoices${listQs(opts)}`),
  createInvoice: (tenantId: string, input: CreateInvoiceInput) =>
    request<{ ok: true; id: string; docNo: string; total: number }>(
      "POST",
      `/api/tenants/${tenantId}/invoices`,
      input,
    ),
  voidInvoice: (tenantId: string, id: string) =>
    request<{ ok: true; docNo: string; reversalEntryNo: string }>(
      "POST",
      `/api/tenants/${tenantId}/invoices/${id}/void`,
    ),
  purchases: (tenantId: string, opts?: ListOpts) =>
    request<{ docs: ApiCommerceDoc[]; total: number }>("GET", `/api/tenants/${tenantId}/purchases${listQs(opts)}`),
  voidPurchase: (tenantId: string, id: string) =>
    request<{ ok: true; docNo: string; reversalEntryNo: string }>(
      "POST",
      `/api/tenants/${tenantId}/purchases/${id}/void`,
    ),
  createPurchase: (tenantId: string, input: CreateInvoiceInput) =>
    request<{ ok: true; id?: string; docNo?: string; total: number; pendingApproval?: boolean; requestNo?: string }>(
      "POST",
      `/api/tenants/${tenantId}/purchases`,
      input,
    ),
  approvals: (tenantId: string) =>
    request<{
      requests: {
        id: string;
        request_no: string;
        type: string;
        summary: string | null;
        total: number;
        status: "pending" | "approved" | "rejected";
        requested_at: string;
        decision_note: string | null;
      }[];
    }>("GET", `/api/tenants/${tenantId}/approvals`),
  approveRequest: (tenantId: string, id: string) =>
    request<{ ok: true; docNo: string; total: number }>("POST", `/api/tenants/${tenantId}/approvals/${id}/approve`),
  rejectRequest: (tenantId: string, id: string, note?: string) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/approvals/${id}/reject`, { note }),
  setApprovalThreshold: (tenantId: string, amount: number) =>
    request<{ ok: true; amount: number }>("POST", `/api/tenants/${tenantId}/approval-threshold`, { amount }),
  createReturn: (
    tenantId: string,
    input: {
      refType: "invoice" | "purchase";
      refId: string;
      warehouseId: string;
      returnDate: string;
      memo?: string;
      lines: { productId: string; qty: number }[];
    },
  ) =>
    request<{ ok: true; returnNo: string; total: number; journalNo: string }>(
      "POST",
      `/api/tenants/${tenantId}/returns`,
      input,
    ),
  createPayment: (tenantId: string, input: CreatePaymentInput) =>
    request<{ ok: true; paymentNo: string; paidAmount: number; settled: boolean; forexGain: number }>(
      "POST",
      `/api/tenants/${tenantId}/payments`,
      input,
    ),
  payments: (tenantId: string, filter?: { refType: "invoice" | "purchase"; refId: string }) =>
    request<{ payments: ApiPayment[] }>(
      "GET",
      `/api/tenants/${tenantId}/payments${filter ? `?refType=${filter.refType}&refId=${filter.refId}` : ""}`,
    ),
  voidPayment: (tenantId: string, id: string, date?: string) =>
    request<{ ok: true; paymentNo: string; reversalEntryNo: string; paidAmount: number }>(
      "POST",
      `/api/tenants/${tenantId}/payments/${id}/void`,
      date ? { date } : {},
    ),
  currencies: (tenantId: string) => request<{ currencies: ApiCurrency[] }>("GET", `/api/tenants/${tenantId}/currencies`),
  setCurrency: (tenantId: string, input: { code: string; name: string; rate: number }) =>
    request<{ ok: true }>("PUT", `/api/tenants/${tenantId}/currencies`, input),

  // --- Kontrak & tagihan berulang ------------------------------------------------
  contracts: (tenantId: string) => request<{ contracts: ApiContract[] }>("GET", `/api/tenants/${tenantId}/contracts`),
  createContract: (
    tenantId: string,
    input: {
      code: string;
      contactId: string;
      name: string;
      frequency: string;
      taxRate: number;
      warehouseId: string;
      startDate: string;
      endDate?: string;
      lines: { productId: string; qty: number; unitPrice: number; description?: string }[];
    },
  ) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/contracts`, input),
  setContractStatus: (tenantId: string, id: string, status: string) =>
    request<{ ok: true; status: string }>("PATCH", `/api/tenants/${tenantId}/contracts/${id}/status`, { status }),
  runBilling: (tenantId: string) =>
    request<{ ok: true; issued: number; total: number }>("POST", `/api/tenants/${tenantId}/contracts/run-billing`),

  // --- Manufaktur + QC -----------------------------------------------------------
  boms: (tenantId: string) => request<{ boms: ApiBom[] }>("GET", `/api/tenants/${tenantId}/boms`),
  setBom: (
    tenantId: string,
    input: { productId: string; outputQty: number; notes?: string; lines: { componentId: string; qty: number }[] },
  ) => request<{ ok: true; id: string }>("PUT", `/api/tenants/${tenantId}/boms`, input),
  productionOrders: (tenantId: string) =>
    request<{ orders: ApiProductionOrder[] }>("GET", `/api/tenants/${tenantId}/production-orders`),
  createProductionOrder: (tenantId: string, input: { productId: string; warehouseId: string; qty: number }) =>
    request<{ ok: true; id: string; orderNo: string }>("POST", `/api/tenants/${tenantId}/production-orders`, input),
  completeProduction: (tenantId: string, id: string) =>
    request<{ ok: true; qty: number; unitCost: number; totalCost: number }>(
      "POST",
      `/api/tenants/${tenantId}/production-orders/${id}/complete`,
    ),
  qcInspect: (tenantId: string, id: string, input: { result: "passed" | "quarantined"; warehouseId?: string }) =>
    request<{ ok: true; result: string }>("POST", `/api/tenants/${tenantId}/production-orders/${id}/qc`, input),

  // --- Maintenance / servis aset -------------------------------------------------
  maintenanceSchedules: (tenantId: string) =>
    request<{ schedules: ApiMaintenanceSchedule[] }>("GET", `/api/tenants/${tenantId}/maintenance/schedules`),
  createMaintenanceSchedule: (
    tenantId: string,
    input: { assetId: string; name: string; intervalMonths: number; startDate: string },
  ) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/maintenance/schedules`, input),
  setScheduleStatus: (tenantId: string, id: string, active: boolean) =>
    request<{ ok: true; active: boolean }>("PATCH", `/api/tenants/${tenantId}/maintenance/schedules/${id}/status`, {
      active,
    }),
  runMaintenance: (tenantId: string) =>
    request<{ ok: true; generated: number }>("POST", `/api/tenants/${tenantId}/maintenance/run`),
  workOrders: (tenantId: string) =>
    request<{ workOrders: ApiWorkOrder[] }>("GET", `/api/tenants/${tenantId}/maintenance/work-orders`),
  createWorkOrder: (tenantId: string, input: { assetId: string; title: string; scheduledDate: string }) =>
    request<{ ok: true; id: string; orderNo: string }>(
      "POST",
      `/api/tenants/${tenantId}/maintenance/work-orders`,
      input,
    ),
  completeWorkOrder: (
    tenantId: string,
    id: string,
    input: { completedDate: string; cost: number; cashAccountId?: string; notes?: string },
  ) =>
    request<{ ok: true; cost: number }>(
      "POST",
      `/api/tenants/${tenantId}/maintenance/work-orders/${id}/complete`,
      input,
    ),

  // --- Helpdesk / tiket ----------------------------------------------------------
  tickets: (tenantId: string) => request<{ tickets: ApiTicket[] }>("GET", `/api/tenants/${tenantId}/tickets`),
  ticket: (tenantId: string, id: string) => request<ApiTicketDetail>("GET", `/api/tenants/${tenantId}/tickets/${id}`),
  createTicket: (
    tenantId: string,
    input: { contactId: string; subject: string; description?: string; priority: string },
  ) => request<{ ok: true; id: string; ticketNo: string }>("POST", `/api/tenants/${tenantId}/tickets`, input),
  replyTicket: (tenantId: string, id: string, input: { body: string; internal: boolean }) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/tickets/${id}/replies`, input),
  updateTicket: (tenantId: string, id: string, input: { status?: string; assignedTo?: string | null }) =>
    request<{ ok: true; ticket: ApiTicket | null }>("PATCH", `/api/tenants/${tenantId}/tickets/${id}`, input),

  stock: (tenantId: string) =>
    request<{ levels: ApiStockLevel[]; totalValue: number }>("GET", `/api/tenants/${tenantId}/stock`),
  stockLots: (tenantId: string) =>
    request<{ lots: ApiStockLot[]; expiringSoon: number }>("GET", `/api/tenants/${tenantId}/stock-lots`),
  adjustStock: (tenantId: string, input: { productId: string; warehouseId: string; physicalQty: number; note?: string }) =>
    request<{ ok: true; delta: number; value: number; entryNo: string | null }>(
      "POST",
      `/api/tenants/${tenantId}/stock-adjustments`,
      input,
    ),
  auditLogs: (tenantId: string, before?: string) =>
    request<{ logs: ApiAuditLog[]; nextCursor: string | null }>(
      "GET",
      `/api/tenants/${tenantId}/audit-logs${before ? `?before=${encodeURIComponent(before)}` : ""}`,
    ),
  transferStock: (
    tenantId: string,
    input: { productId: string; fromWarehouseId: string; toWarehouseId: string; qty: number },
  ) => request<{ ok: true; qty: number; value: number }>("POST", `/api/tenants/${tenantId}/stock-transfers`, input),
  updateProfile: (name: string) => request<{ ok: true }>("PATCH", "/api/auth/profile", { name }),
  posShift: (tenantId: string) => request<{ shift: ApiPosShift | null }>("GET", `/api/tenants/${tenantId}/pos/shift`),
  posOpenShift: (tenantId: string, input: { warehouseId: string; openingCash: number }) =>
    request<{ ok: true; id: string; shiftNo: string }>("POST", `/api/tenants/${tenantId}/pos/shift/open`, input),
  posSale: (
    tenantId: string,
    input: {
      shiftId: string;
      taxRate: number;
      cashReceived?: number;
      payments?: { method: PosPaymentMethod; amount: number }[];
      lines: { productId: string; qty: number; unitPrice: number; discountPct?: number }[];
    },
  ) =>
    request<{ ok: true; invoiceNo: string; total: number; change: number }>(
      "POST",
      `/api/tenants/${tenantId}/pos/sales`,
      input,
    ),
  posHeld: (tenantId: string, shiftId: string) =>
    request<{ held: ApiHeldSale[] }>("GET", `/api/tenants/${tenantId}/pos/held?shiftId=${encodeURIComponent(shiftId)}`),
  posHold: (tenantId: string, input: HoldSaleInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/pos/held`, input),
  posDeleteHeld: (tenantId: string, id: string) =>
    request<{ ok: true }>("DELETE", `/api/tenants/${tenantId}/pos/held/${id}`),
  posCloseShift: (tenantId: string, shiftId: string, closingCash: number) =>
    request<{ ok: true; expected: number; closingCash: number; difference: number; salesCount: number }>(
      "POST",
      `/api/tenants/${tenantId}/pos/shift/${shiftId}/close`,
      { closingCash },
    ),
  posReceipts: (tenantId: string, q?: string) =>
    request<{ receipts: ApiPosReceipt[] }>(
      "GET",
      `/api/tenants/${tenantId}/pos/receipts${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  posRefund: (tenantId: string, input: PosRefundInput) =>
    request<{ ok: true; returnNo: string; total: number; journalNo: string }>(
      "POST",
      `/api/tenants/${tenantId}/pos/refunds`,
      input,
    ),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>("POST", "/api/auth/change-password", { currentPassword, newPassword }),

  // --- Master data --------------------------------------------------------------
  listItems: <T = Record<string, unknown>>(
    tenantId: string,
    entity: "products" | "contacts" | "warehouses",
    opts?: ListOpts,
  ) => request<{ items: T[]; total: number }>("GET", `/api/tenants/${tenantId}/${entity}${listQs(opts)}`),
  createItem: (
    tenantId: string,
    entity: "products" | "contacts" | "warehouses",
    input: ProductInput | ContactInput | WarehouseInput,
  ) => request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/${entity}`, input),
  updateItem: (
    tenantId: string,
    entity: "products" | "contacts" | "warehouses",
    id: string,
    input: ProductInput | ContactInput | WarehouseInput,
  ) => request<{ ok: true }>("PUT", `/api/tenants/${tenantId}/${entity}/${id}`, input),
  archiveItem: (tenantId: string, entity: "products" | "contacts" | "warehouses", id: string) =>
    request<{ ok: true }>("POST", `/api/tenants/${tenantId}/${entity}/${id}/archive`),
  importItems: (tenantId: string, entity: "products" | "contacts", rows: unknown[]) =>
    request<{ ok: true; inserted: number; failed: number; errors: { row: number; message: string }[] }>(
      "POST",
      `/api/tenants/${tenantId}/${entity}/import`,
      { rows },
    ),

  // --- CRM Pipeline --------------------------------------------------------------
  leads: (tenantId: string, stage?: string) =>
    request<{ leads: ApiLead[] }>(
      "GET",
      `/api/tenants/${tenantId}/leads${stage ? `?stage=${stage}` : ""}`,
    ),
  createLead: (tenantId: string, input: LeadInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/leads`, input),
  updateLead: (tenantId: string, id: string, input: UpdateLeadInput) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/leads/${id}`, input),
  convertLead: (tenantId: string, id: string) =>
    request<{ ok: true; contactId: string }>("POST", `/api/tenants/${tenantId}/leads/${id}/convert`),
  leadActivities: (tenantId: string, id: string) =>
    request<{ activities: ApiLeadActivity[] }>("GET", `/api/tenants/${tenantId}/leads/${id}/activities`),
  addLeadActivity: (tenantId: string, id: string, input: LeadActivityInput) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/leads/${id}/activities`, input),
  quotations: (tenantId: string) =>
    request<{ quotations: ApiQuotation[] }>("GET", `/api/tenants/${tenantId}/quotations`),
  createQuotation: (tenantId: string, input: CreateQuotationInput) =>
    request<{ ok: true; id: string; quoteNo: string; total: number }>(
      "POST",
      `/api/tenants/${tenantId}/quotations`,
      input,
    ),
  setQuotationStatus: (tenantId: string, id: string, input: QuotationStatusInput) =>
    request<{ ok: true; status: string }>("PATCH", `/api/tenants/${tenantId}/quotations/${id}/status`, input),
  convertQuotation: (tenantId: string, id: string, input: ConvertQuotationInput) =>
    request<{ ok: true; invoiceId: string; docNo: string; total: number }>(
      "POST",
      `/api/tenants/${tenantId}/quotations/${id}/convert`,
      input,
    ),
};

/**
 * Parser CSV kecil: mendukung kutipan ganda, pemisah ; atau , (deteksi otomatis
 * dari baris header). Mengembalikan array objek berdasarkan header.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);

  const [header, ...data] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

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

/** Unduh teks XML sebagai berkas (dipakai ekspor Coretax). */
export function downloadXml(filename: string, xml: string): void {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Ekspor Excel (.xlsx) — penulis OOXML SpreadsheetML mandiri (Fase 7h).
// Tanpa dependency: bangun ZIP (metode "store"/tanpa kompresi) + parts XML
// minimal. Excel/LibreOffice menerima entri ZIP tak-terkompresi selama CRC32
// & ukuran benar. Nilai number ditulis sebagai sel numerik, lainnya inline
// string. Berdampingan dengan downloadCsv — bukan pengganti.
// ---------------------------------------------------------------------------

export type XlsxSheet = { name: string; headers: string[]; rows: (string | number)[][] };

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!)! & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Referensi sel A1 dari kolom (0-based) & baris (1-based). */
function cellRef(col: number, row: number): string {
  let s = "";
  let c = col + 1;
  while (c > 0) {
    const rem = (c - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    c = Math.floor((c - 1) / 26);
  }
  return `${s}${row}`;
}

function sheetXml(sheet: XlsxSheet): string {
  const rowsXml: string[] = [];
  const all = [sheet.headers, ...sheet.rows];
  all.forEach((cells, r) => {
    const rowNum = r + 1;
    const cellsXml = cells
      .map((v, c) => {
        const ref = cellRef(c, rowNum);
        if (typeof v === "number" && Number.isFinite(v)) {
          return `<c r="${ref}"><v>${v}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
      })
      .join("");
    rowsXml.push(`<row r="${rowNum}">${cellsXml}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml.join("")}</sheetData></worksheet>`;
}

/** Unduh beberapa sheet sebagai berkas .xlsx (dibuka Excel/LibreOffice/Sheets). */
export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const enc = new TextEncoder();
  const list = sheets.length > 0 ? sheets : [{ name: "Sheet1", headers: [], rows: [] }];
  // Nama sheet aman & unik (Excel: ≤31 char, tanpa []:*?/\).
  const safeNames = list.map((s, i) => {
    const clean = (s.name || `Sheet${i + 1}`).replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || `Sheet${i + 1}`;
    return clean;
  });

  const parts: { path: string; data: Uint8Array }[] = [];
  parts.push({
    path: "[Content_Types].xml",
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        list
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    ),
  });
  parts.push({
    path: "_rels/.rels",
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
  });
  parts.push({
    path: "xl/workbook.xml",
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
        safeNames
          .map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("") +
        `</sheets></workbook>`,
    ),
  });
  parts.push({
    path: "xl/_rels/workbook.xml.rels",
    data: enc.encode(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        list
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `</Relationships>`,
    ),
  });
  list.forEach((sheet, i) => {
    parts.push({ path: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(sheet)) });
  });

  // Bangun ZIP: local headers + central directory + EOCD. Metode 0 (store).
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  const concat = (arrs: Uint8Array[]) => {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const a of arrs) {
      out.set(a, p);
      p += a.length;
    }
    return out;
  };

  for (const part of parts) {
    const nameBytes = enc.encode(part.path);
    const crc = crc32(part.data);
    const size = part.data.length;
    const local = concat([
      u32(0x04034b50), // local file header signature
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method: store
      u16(0), // mod time
      u16(0x21), // mod date (arbitrary valid)
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0), // extra len
      nameBytes,
      part.data,
    ]);
    chunks.push(local);

    central.push(
      concat([
        u32(0x02014b50), // central dir header signature
        u16(20), // version made by
        u16(20), // version needed
        u16(0),
        u16(0),
        u16(0),
        u16(0x21),
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    offset += local.length;
  }

  const centralBytes = concat(central);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(parts.length),
    u16(parts.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0),
  ]);

  const blob = new Blob([concat(chunks), centralBytes, eocd], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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

const DATE_FMT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

/** Format tanggal ISO untuk tampilan: "2026-07-08" → "8 Jul 2026". Nilai bukan tanggal dikembalikan apa adanya. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d);
}

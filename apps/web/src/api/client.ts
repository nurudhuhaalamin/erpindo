import type {
  ApiAccount,
  ApiAgingRow,
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
  LeadActivityInput,
  LeaveRequestInput,
  PayrollAdjustmentInput,
  LeadInput,
  MeResponse,
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
  cashFlow: (tenantId: string, from: string, to: string) =>
    request<ApiCashFlow>("GET", `/api/tenants/${tenantId}/reports/cash-flow?from=${from}&to=${to}`),
  aging: (tenantId: string, type: "receivable" | "payable") =>
    request<{ rows: ApiAgingRow[]; grandTotal: number }>("GET", `/api/tenants/${tenantId}/reports/aging?type=${type}`),
  efaktur: (tenantId: string, from: string, to: string) =>
    request<ApiEfakturReport>("GET", `/api/tenants/${tenantId}/reports/efaktur?from=${from}&to=${to}`),
  efakturXml: (tenantId: string, from: string, to: string) =>
    requestText(`/api/tenants/${tenantId}/reports/efaktur-xml?from=${from}&to=${to}`),

  aiChat: (tenantId: string, messages: { role: "user" | "assistant"; content: string }[]) =>
    request<{ reply: string }>("POST", `/api/tenants/${tenantId}/ai/chat`, { messages }),
  aiJurnal: (tenantId: string, prompt: string) =>
    request<{ draft: ApiAiJournalDraft }>("POST", `/api/tenants/${tenantId}/ai/jurnal`, { prompt }),
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
  addProjectTask: (tenantId: string, id: string, input: { name: string; dueDate?: string }) =>
    request<{ ok: true; id: string }>("POST", `/api/tenants/${tenantId}/projects/${id}/tasks`, input),
  setTaskStatus: (tenantId: string, id: string, taskId: string, status: string) =>
    request<{ ok: true; status: string }>("PATCH", `/api/tenants/${tenantId}/projects/${id}/tasks/${taskId}`, { status }),

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
  auditLogs: (tenantId: string) => request<{ logs: ApiAuditLog[] }>("GET", `/api/tenants/${tenantId}/audit-logs`),
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
      cashReceived: number;
      lines: { productId: string; qty: number; unitPrice: number; discountPct?: number }[];
    },
  ) =>
    request<{ ok: true; invoiceNo: string; total: number; change: number }>(
      "POST",
      `/api/tenants/${tenantId}/pos/sales`,
      input,
    ),
  posCloseShift: (tenantId: string, shiftId: string, closingCash: number) =>
    request<{ ok: true; expected: number; closingCash: number; difference: number; salesCount: number }>(
      "POST",
      `/api/tenants/${tenantId}/pos/shift/${shiftId}/close`,
      { closingCash },
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
  const src = text.replace(/^﻿/, "");
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

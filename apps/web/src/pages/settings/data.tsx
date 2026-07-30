// Bagian Pengaturan (dipecah dari settings.tsx pada Fase 14b — nama ekspor
// tak berubah; settings/index.tsx merakit ulang tab).
import { type ApiAuditLog } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiRequestError, formatDate, formatIDR } from "../../api/client";
import { useLang } from "../../i18n";
import { useUi } from "../../i18n/ui";
import { Alert, Button, Card, CardBody, CardHeader, Label, Skeleton, Spinner, useToast } from "../../components/ui";

export function ExportBackupCard({ tenantId }: { tenantId: string }) {
  const u = useUi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["drive-status", tenantId],
    queryFn: () => api.driveStatus(tenantId),
  });

  const backupNow = useMutation({
    mutationFn: () => api.driveBackupNow(tenantId),
    onSuccess: (res) => {
      toast("success", `Cadangan terkirim ke Google Drive: ${res.fileName}`);
      queryClient.invalidateQueries({ queryKey: ["drive-status", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const disconnect = useMutation({
    mutationFn: () => api.driveDisconnect(tenantId),
    onSuccess: () => {
      toast("success", "Sambungan Google Drive diputus.");
      queryClient.invalidateQueries({ queryKey: ["drive-status", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const drive = status.data;

  return (
    <Card>
      <CardHeader
        title={u("eksporCadangan")}
        description={u("descEksporCadangan")}
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{u("unduhSemuaZip")}</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {u("descUnduhSemua")}
            </p>
          </div>
          <a
            href={api.exportFullUrl(tenantId)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 dark:text-slate-900"
            download
          >
            {u("unduhSemuaData")}
          </a>
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="text-sm font-medium">{u("backupDrive")}</div>
          {status.isLoading ? (
            <Skeleton className="mt-2 h-10 w-full" />
          ) : !drive?.configured ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {u("descDriveBelumSiap")}
            </p>
          ) : !drive.connected ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {u("descSambungkanDrive")}
              </p>
              <a
                href={api.driveConnectUrl(tenantId)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {u("sambungkanDrive")}
              </a>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {u("tersambung")}{drive.accountEmail ? ` ${u("sebagaiAkun")} ${drive.accountEmail}` : ""}.{" "}
                {drive.lastBackupAt
                  ? `${u("cadanganTerakhir")} ${formatDate(drive.lastBackupAt.slice(0, 10))} (${drive.lastBackupStatus ?? "ok"}).`
                  : u("belumAdaCadangan")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>
                  {backupNow.isPending ? u("mencadangkanEllipsis") : u("cadangkanSekarang")}
                </Button>
                <Button variant="secondary" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                  {u("putuskanSambungan")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** Toggle Mode Sederhana — untuk pengguna yang tidak akrab dengan istilah akuntansi. */

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Autentikasi & akun
  "auth.register": "Registrasi perusahaan",
  "auth.login": "Login",
  "auth.demo_login": "Masuk mode demo",
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
  "tenant.security_updated": "Kebijakan keamanan diubah",
  "tenant.audit_exported": "Audit log diekspor",
  "tenant.doc_numbering_updated": "Format nomor dokumen diubah",
  "api.key_created": "API key dibuat",
  "api.key_revoked": "API key dicabut",
  "api.webhook_created": "Webhook ditambahkan",
  "api.webhook_deleted": "Webhook dihapus",
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

/**
 * Padanan Inggris label audit (Fase 20m).
 *
 * Tabel terpisah, bukan ~130 kunci di kamus utama: isinya adalah PETA KODE →
 * label, bukan kalimat layar, dan `AUDIT_ACTION_LABELS` sendiri masih
 * di-re-export untuk dashboard.tsx. Dua tabel berdampingan membuat entri yang
 * tertinggal langsung terlihat saat dibaca.
 */
export const AUDIT_ACTION_LABELS_EN: Record<string, string> = {
  "auth.register": "Company registered",
  "auth.login": "Sign-in",
  "auth.demo_login": "Demo mode sign-in",
  "auth.login_failed": "Sign-in failed",
  "auth.totp_failed": "Wrong 2FA code",
  "auth.email_verified": "Email verified",
  "auth.password_reset": "Password reset",
  "auth.password_changed": "Password changed",
  "auth.profile_updated": "Profile updated",
  "auth.totp_enabled": "2FA enabled",
  "auth.totp_disabled": "2FA disabled",
  "tenant.company_created": "Company created",
  "tenant.invite_sent": "Invitation sent",
  "tenant.invite_accepted": "Invitation accepted",
  "tenant.settings_updated": "Settings changed",
  "tenant.member_role_changed": "Member role changed",
  "tenant.role_created": "Custom role created",
  "tenant.role_updated": "Custom role updated",
  "tenant.role_deleted": "Custom role deleted",
  "tenant.security_updated": "Security policy changed",
  "tenant.audit_exported": "Audit log exported",
  "tenant.doc_numbering_updated": "Document number format changed",
  "api.key_created": "API key created",
  "api.key_revoked": "API key revoked",
  "api.webhook_created": "Webhook added",
  "api.webhook_deleted": "Webhook deleted",
  "dimension.cost_center.created": "Cost centre created",
  "dimension.cost_center.archived": "Cost centre archived",
  "dimension.bank_rule.created": "Bank auto-match rule created",
  "dimension.bank_rule.deleted": "Bank auto-match rule deleted",
  "manufacturing.work_center.created": "Work centre created",
  "manufacturing.work_center.archived": "Work centre archived",
  "manufacturing.routing.added": "Routing step added",
  "manufacturing.routing.completed": "Routing step completed",
  "tenant.member_removed": "Member removed",
  "accounting.account_created": "COA account created",
  "accounting.account_renamed": "COA account renamed",
  "accounting.account_archived": "COA account archived",
  "accounting.journal_posted": "Journal posted",
  "accounting.books_closed": "Books closed",
  "accounting.template_created": "Journal template created",
  "accounting.bank_imported": "Bank statement imported",
  "accounting.closing_entry": "Closing entry",
  "sales.invoice_posted": "Sales invoice",
  "sales.invoice_voided": "Sales invoice voided",
  "purchase.posted": "Purchase invoice",
  "purchase.voided": "Purchase invoice voided",
  "payment.recorded": "Payment recorded",
  "inventory.adjusted": "Stock adjustment",
  "inventory.transferred": "Inter-warehouse stock transfer",
  "approval.requested": "Approval requested",
  "approval.threshold_set": "Approval threshold set",
  "approval.approved": "Purchase approved",
  "approval.rejected": "Purchase rejected",
  "approval.rule.created": "Approval rule created",
  "approval.rule.updated": "Approval rule updated",
  "approval.rule.deleted": "Approval rule deleted",
  "approval.flow.submitted": "Approval flow submitted",
  "approval.flow.decided": "Approval flow decided",
  "procurement.requisition.created": "Purchase requisition created",
  "procurement.requisition.decided": "Purchase requisition decided",
  "procurement.po.created": "Purchase order created",
  "procurement.po.cancelled": "Purchase order cancelled",
  "procurement.goods_received": "Goods received (GRN)",
  "sales.so.created": "Sales order created",
  "sales.so.cancelled": "Sales order cancelled",
  "sales.so.down_payment": "Down payment received",
  "sales.so.delivered": "Delivery note issued (goods out)",
  "sales.so.invoiced": "Order invoiced",
  "stock.serial.added": "Serial number added",
  "stock.serial.status": "Serial number status changed",
  "tax.pph_final.paid": "Final income tax payment recorded",
  "tax.pph23.withheld": "PPh 23 withholding slip created",
  "tax.pph23.deposited": "PPh 23 deposited",
  "pos.shift_opened": "Cashier shift opened",
  "pos.sale": "Cashier sale (POS)",
  "pos.shift_closed": "Cashier shift closed",
  "crm.lead.created": "Lead created",
  "crm.lead.updated": "Lead updated",
  "crm.activity.logged": "Lead activity logged",
  "crm.lead.converted": "Lead converted to customer",
  "crm.quotation.created": "Quotation created",
  "crm.quotation.status": "Quotation status changed",
  "crm.quotation.converted": "Quotation converted to invoice",
  "hr.employee.created": "Employee added",
  "hr.employee.updated": "Employee updated",
  "hr.payroll.run": "Payroll run",
  "hr.adjustment.created": "Payroll component added",
  "hr.adjustment.deleted": "Payroll component deleted",
  "hr.loan.created": "Salary advance disbursed",
  "hr.leave.requested": "Leave requested",
  "hr.leave.decided": "Leave decided",
  "hr.attendance.recorded": "Attendance recorded",
  "hr.attendance.deleted": "Attendance deleted",
  "project.created": "Project created",
  "project.status": "Project status changed",
  "project.milestone.invoiced": "Project milestone invoiced",
  "asset.registered": "Asset registered",
  "asset.depreciated": "Asset depreciation",
  "asset.disposed": "Asset disposed",
  "contract.created": "Contract created",
  "contract.status": "Contract status changed",
  "contract.billed": "Contract billed",
  "currency.set": "Exchange rate set",
  "budget.set": "Budget set",
  "manufacturing.bom_saved": "BoM saved",
  "manufacturing.order_created": "Production order created",
  "manufacturing.produced": "Production completed",
  "manufacturing.qc_inspected": "QC inspection",
  "maintenance.schedule_created": "Service schedule created",
  "maintenance.generated": "Work order auto-created",
  "maintenance.work_order_created": "Work order created",
  "maintenance.work_order_completed": "Work order completed",
  "helpdesk.ticket_created": "Support ticket created",
  "helpdesk.ticket_replied": "Ticket replied",
  "helpdesk.ticket_updated": "Ticket updated",
  "billing.trial_expired": "Trial ended",
};

/** Label audit menurut bahasa aktif; jatuh balik ke kode bila tak dikenal. */
export function labelAudit(action: string, lang: "id" | "en"): string {
  const peta = lang === "en" ? AUDIT_ACTION_LABELS_EN : AUDIT_ACTION_LABELS;
  return peta[action] ?? AUDIT_ACTION_LABELS[action] ?? action;
}

/** Kunci detail JSON → label ramah untuk ringkasan audit log. */
const AUDIT_DETAIL_LABELS: Record<string, string> = {
  docNo: "No", invoiceNo: "No", entryNo: "Jurnal", runNo: "No", shiftNo: "Shift",
  requestNo: "No", quoteNo: "Penawaran", ticketNo: "Tiket", code: "Kode", name: "Nama",
  total: "Total", amount: "Nominal", netProfit: "Laba bersih", totalGross: "Bruto",
  totalNet: "Netto", period: "Periode", role: "Peran", email: "Email", status: "Status",
  employees: "Karyawan", type: "Jenis", days: "Hari", principal: "Pokok",
  count: "Jumlah baris", autoMatched: "Cocok otomatis", targetUserId: "Anggota", stage: "Tahap",
};

/** Padanan Inggris label detail audit (Fase 20m). */
const AUDIT_DETAIL_LABELS_EN: Record<string, string> = {
  docNo: "No", invoiceNo: "No", entryNo: "Journal", runNo: "No", shiftNo: "Shift",
  requestNo: "No", quoteNo: "Quotation", ticketNo: "Ticket", code: "Code", name: "Name",
  total: "Total", amount: "Amount", netProfit: "Net profit", totalGross: "Gross",
  totalNet: "Net", period: "Period", role: "Role", email: "Email", status: "Status",
  employees: "Employees", type: "Type", days: "Days", principal: "Principal",
  count: "Rows", autoMatched: "Auto-matched", targetUserId: "Member", stage: "Stage",
};

const AUDIT_RUPIAH_KEYS = new Set(["total", "amount", "netProfit", "totalGross", "totalNet", "principal", "outstanding", "value"]);

/** Ubah detail JSON mentah audit menjadi teks ramah, mis. "No INV-00031 · Total Rp832.500". */
export function friendlyAuditDetail(raw: string | null, lang: "id" | "en" = "id"): string {
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
    const peta = lang === "en" ? AUDIT_DETAIL_LABELS_EN : AUDIT_DETAIL_LABELS;
    const label = peta[key] ?? AUDIT_DETAIL_LABELS[key] ?? key;
    const value = typeof val === "number" && AUDIT_RUPIAH_KEYS.has(key) ? formatIDR(val) : String(val);
    parts.push(`${label} ${value}`);
    if (parts.length >= 3) break;
  }
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Keamanan enterprise (Fase 13g): 2FA wajib + pembatasan IP + ekspor audit CSV.
// Hanya paket Enterprise (server menolak 403 plan-upgrade-required di bawahnya —
// UI menampilkan kartu upsell alih-alih error).
// ---------------------------------------------------------------------------

export function TenantSecurityCard({ tenantId }: { tenantId: string }) {
  const u = useUi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["tenant-security", tenantId],
    queryFn: () => api.getSecurity(tenantId),
    retry: false,
  });
  const [require2fa, setRequire2fa] = useState(false);
  const [ipsText, setIpsText] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Sinkronkan state form saat data pertama tiba.
  if (query.data && !loaded) {
    setRequire2fa(query.data.require2fa);
    setIpsText(query.data.allowedIps.join("\n"));
    setLoaded(true);
  }

  const save = useMutation({
    mutationFn: () => {
      const allowedIps = ipsText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      return api.updateSecurity(tenantId, { require2fa, allowedIps });
    },
    onSuccess: () => {
      toast("success", "Kebijakan keamanan disimpan.");
      queryClient.invalidateQueries({ queryKey: ["tenant-security", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  // Paket di bawah Enterprise → server balas 403 plan-upgrade-required.
  const err = query.error as ApiRequestError | undefined;
  if (err && err.status === 403) {
    return (
      <Card>
        <CardHeader title={u("keamananLanjutan")} description={u("descKeamananUpsellSingkat")} />
        <CardBody>
          <Alert tone="info">
            <div className="font-medium">{u("tersediaEnterprise")}</div>
            <p className="mt-1 text-sm">
              {u("descKeamananUpsell")}{u("tingkatkanEnterprise")}
            </p>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={u("keamananLanjutan")}
        description={u("descKeamananLanjutan")}
      />
      <CardBody className="space-y-5">
        {query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={require2fa}
                onChange={(e) => setRequire2fa(e.target.checked)}
              />
              <span>
                <span className="text-sm font-medium">{u("wajibkan2fa")}</span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {u("descWajibkan2fa")}
                </p>
              </span>
            </label>

            <div>
              <Label>{u("pembatasanIp")}</Label>
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
                rows={4}
                placeholder={"203.0.113.0/24\n198.51.100.7"}
                value={ipsText}
                onChange={(e) => setIpsText(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {u("descPembatasanIp")}
                {query.data?.currentIp ? ` ${u("ipAndaSaatIni")} ${query.data.currentIp}.` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? u("menyimpanEllipsis") : u("simpanKebijakan")}
              </Button>
              <a
                href={api.securityAuditCsvUrl(tenantId)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                download
              >
                Ekspor audit log (CSV)
              </a>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Penomoran dokumen kustom (Fase 13i) — pola nomor faktur/pembelian/pembayaran.
// Kosong = penomoran bawaan (INV-00001). Pratinjau langsung memakai tanggal ini.
// ---------------------------------------------------------------------------

export function AuditLogCard({ tenantId }: { tenantId: string }) {
  const u = useUi();
  const lang = useLang();
  const query = useQuery({ queryKey: ["audit-logs", tenantId], queryFn: () => api.auditLogs(tenantId) });
  // Halaman lebih lama via kursor (Fase 9a) — sebelumnya hanya 100 terakhir.
  const [older, setOlder] = useState<{ logs: ApiAuditLog[]; nextCursor: string | null } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderCursor = older ? older.nextCursor : (query.data?.nextCursor ?? null);
  const loadOlder = async () => {
    if (!olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await api.auditLogs(tenantId, olderCursor);
      setOlder((prev) => ({ logs: [...(prev?.logs ?? []), ...res.logs], nextCursor: res.nextCursor }));
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={u("riwayatAktivitas")}
        description={u("descRiwayatAktivitas")}
      />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : (
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/60">
            {[...(query.data?.logs ?? []), ...(older?.logs ?? [])].map((log) => {
              const detail = friendlyAuditDetail(log.detail, lang);
              return (
                <div key={log.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="order-2 shrink-0 text-xs text-slate-400 dark:text-slate-500 sm:order-1 sm:w-28">
                    {log.createdAt.slice(0, 16).replace("T", " ")}
                  </span>
                  <div className="order-1 min-w-0 flex-1 sm:order-2">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{labelAudit(log.action, lang)}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">oleh {log.userName ?? "sistem"}</span>
                    </div>
                    {detail ? <div className="text-xs text-slate-500 dark:text-slate-400">{detail}</div> : null}
                  </div>
                </div>
              );
            })}
            {olderCursor ? (
              <div className="pt-3">
                <Button variant="secondary" className="h-8" onClick={() => void loadOlder()} disabled={loadingOlder}>
                  {loadingOlder ? "Memuat…" : "Muat lebih"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}


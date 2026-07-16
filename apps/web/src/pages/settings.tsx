// ---------------------------------------------------------------------------
// Pengaturan (dipisah dari app.tsx pada Fase 9d — nama ekspor tak berubah:
// app.tsx me-re-export SettingsPage sehingga import lama tetap jalan).
// ---------------------------------------------------------------------------
import { PERMISSIONS, PLAN_LABELS, PLAN_LIMITS, SINGLE_PLAN, type ApiAuditLog, type ApiCustomRole, type PermissionKey } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, formatDate, formatIDR } from "../api/client";
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, Input, Label, Select, Skeleton, Spinner, useToast } from "../components/ui";
import { useWorkspace, isSimpleMode, setSimpleMode } from "./app";

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
      {tenant.role === "owner" ? <ExportBackupCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <ApprovalThresholdCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <CloseBooksCard tenantId={tenant.tenantId} /> : null}
      {tenant.role === "owner" ? <AuditLogCard tenantId={tenant.tenantId} /> : null}
    </div>
  );
}

/**
 * Ekspor & cadangan (Fase 8b): unduh seluruh data sebagai ZIP (selalu bisa,
 * termasuk saat langganan berakhir) + backup otomatis ke Google Drive.
 */
function ExportBackupCard({ tenantId }: { tenantId: string }) {
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
        title="Ekspor & Cadangan"
        description="Data Anda milik Anda — unduh kapan pun, termasuk setelah langganan berakhir."
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Unduh semua data (ZIP)</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Seluruh tabel diekspor sebagai CSV standar + manifest — siap dibuka di Excel atau dipindahkan ke
              aplikasi lain.
            </p>
          </div>
          <a
            href={api.exportFullUrl(tenantId)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 dark:text-slate-900"
            download
          >
            Unduh Semua Data
          </a>
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="text-sm font-medium">Backup otomatis ke Google Drive</div>
          {status.isLoading ? (
            <Skeleton className="mt-2 h-10 w-full" />
          ) : !drive?.configured ? (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Integrasi Google Drive belum dikonfigurasi oleh operator (butuh OAuth Client ID/Secret Google
              Cloud). Fitur unduh di atas tetap berfungsi penuh.
            </p>
          ) : !drive.connected ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sambungkan akun Google Anda — cadangan bulanan otomatis tersimpan di Drive Anda sendiri.
              </p>
              <a
                href={api.driveConnectUrl(tenantId)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Sambungkan Google Drive
              </a>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tersambung{drive.accountEmail ? ` sebagai ${drive.accountEmail}` : ""}.{" "}
                {drive.lastBackupAt
                  ? `Cadangan terakhir: ${formatDate(drive.lastBackupAt.slice(0, 10))} (${drive.lastBackupStatus ?? "ok"}).`
                  : "Belum ada cadangan — Cron mencadangkan otomatis tiap awal bulan."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>
                  {backupNow.isPending ? "Mencadangkan…" : "Cadangkan sekarang"}
                </Button>
                <Button variant="secondary" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                  Putuskan sambungan
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
export function friendlyAuditDetail(raw: string | null): string {
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
        title="Riwayat aktivitas (audit log)"
        description="Aktivitas di perusahaan ini — siapa melakukan apa dan kapan."
      />
      <CardBody>
        {query.isLoading ? (
          <Spinner />
        ) : (
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800/60">
            {[...(query.data?.logs ?? []), ...(older?.logs ?? [])].map((log) => {
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
          Satu harga untuk semua: paket {SINGLE_PLAN.label}{" "}
          {`Rp ${SINGLE_PLAN.pricePerMonth.toLocaleString("id-ID")}`}/bulan — seluruh modul & pengguna tak terbatas.
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
  const costCentersQuery = useQuery({ queryKey: ["cost-centers", tenantId], queryFn: () => api.costCenters(tenantId) });
  const costCenters = costCentersQuery.data?.items ?? [];
  const [editing, setEditing] = useState<ApiCustomRole | null>(null);
  const [name, setName] = useState("");
  const [baseRole, setBaseRole] = useState<"admin" | "viewer">("admin");
  const [perms, setPerms] = useState<PermissionKey[]>([]);
  const [scopeCcIds, setScopeCcIds] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<ApiCustomRole | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["roles", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["members", tenantId] });
  };
  const reset = () => { setEditing(null); setName(""); setBaseRole("admin"); setPerms([]); setScopeCcIds([]); };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.updateRole(tenantId, editing.id, { name, baseRole, permissions: perms, scopeCostCenterIds: scopeCcIds.length ? scopeCcIds : undefined })
        : api.createRole(tenantId, { name, baseRole, permissions: perms, scopeCostCenterIds: scopeCcIds.length ? scopeCcIds : undefined }),
    onSuccess: () => { toast("success", editing ? "Peran diperbarui." : "Peran kustom dibuat."); reset(); invalidate(); },
    onError: (e: Error) => toast("error", e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteRole(tenantId, id),
    onSuccess: () => { toast("success", "Peran dihapus."); setToDelete(null); invalidate(); },
    onError: (e: Error) => toast("error", e.message),
  });

  function startEdit(r: ApiCustomRole) {
    setEditing(r); setName(r.name); setBaseRole(r.baseRole); setPerms(r.permissions); setScopeCcIds(r.scopeCostCenterIds ?? []);
  }
  function togglePerm(key: PermissionKey) {
    setPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }
  function toggleScopeCc(id: string) {
    setScopeCcIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
                  {r.scopeCostCenterIds ? (
                    <Badge tone="amber">terbatas {r.scopeCostCenterIds.length} cost center</Badge>
                  ) : null}
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
          {costCenters.length > 0 ? (
            <div>
              <p className="mb-1 text-sm font-medium">Batasi data ke cost center (opsional)</p>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Bila dipilih, peran ini hanya melihat & membukukan ke cost center tersebut (daftar dimensi,
                laporan per dimensi, dan jurnal). Kosongkan untuk akses semua.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {costCenters.map((cc) => (
                  <label key={cc.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={scopeCcIds.includes(cc.id)} onChange={() => toggleScopeCc(cc.id)} />
                    {cc.code} · {cc.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
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

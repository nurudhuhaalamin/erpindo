// Bagian Pengaturan (dipecah dari settings.tsx pada Fase 14b — nama ekspor
// tak berubah; settings/index.tsx merakit ulang tab).
import { type ApiAuditLog } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiRequestError, formatDate, formatIDR } from "../../api/client";
import { Alert, Button, Card, CardBody, CardHeader, Label, Skeleton, Spinner, useToast } from "../../components/ui";

export function ExportBackupCard({ tenantId }: { tenantId: string }) {
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

// ---------------------------------------------------------------------------
// Keamanan enterprise (Fase 13g): 2FA wajib + pembatasan IP + ekspor audit CSV.
// Hanya paket Enterprise (server menolak 403 plan-upgrade-required di bawahnya —
// UI menampilkan kartu upsell alih-alih error).
// ---------------------------------------------------------------------------

export function TenantSecurityCard({ tenantId }: { tenantId: string }) {
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
        <CardHeader title="Keamanan lanjutan" description="Kontrol keamanan tingkat perusahaan." />
        <CardBody>
          <Alert tone="info">
            <div className="font-medium">Tersedia di paket Enterprise</div>
            <p className="mt-1 text-sm">
              Wajibkan verifikasi 2 langkah (2FA) untuk semua anggota, batasi akses ke rentang IP kantor, dan
              ekspor audit log ke CSV. Tingkatkan ke Enterprise untuk mengaktifkannya.
            </p>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Keamanan lanjutan"
        description="Wajibkan 2FA, batasi akses per IP, dan ekspor audit log — kontrol keamanan tingkat perusahaan."
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
                <span className="text-sm font-medium">Wajibkan verifikasi 2 langkah (2FA)</span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Anggota tanpa 2FA aktif diminta menyiapkannya di Profil sebelum bisa mengakses perusahaan ini.
                </p>
              </span>
            </label>

            <div>
              <Label>Pembatasan IP (CIDR/IP, satu per baris)</Label>
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
                rows={4}
                placeholder={"203.0.113.0/24\n198.51.100.7"}
                value={ipsText}
                onChange={(e) => setIpsText(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Kosongkan untuk mengizinkan semua IP. Hati-hati: hanya IP dalam daftar yang bisa mengakses.
                {query.data?.currentIp ? ` IP Anda saat ini: ${query.data.currentIp}.` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Menyimpan…" : "Simpan kebijakan"}
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


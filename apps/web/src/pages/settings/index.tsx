// ---------------------------------------------------------------------------
// Pengaturan — shell bertab. Kartu per-tab dipecah ke modul (Fase 14b): akun,
// perusahaan, tim, data, integrasi. Nama ekspor tak berubah — app.tsx tetap
// me-re-export SettingsPage, dashboard.tsx tetap mengimpor AUDIT_ACTION_LABELS.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { Tabs } from "../../components/ui";
import { useWorkspace } from "../app";
import { ProfileCard, DisplayModeCard, SecurityCard } from "./account";
import { SubscriptionCard, CompanySettingsCard, DocNumberingCard, NewCompanyCard } from "./company";
import { MembersCard, RolesCard, ApprovalThresholdCard } from "./team";
import { ExportBackupCard, TenantSecurityCard, AuditLogCard } from "./data";
import { ApiIntegrationCard, CloseBooksCard } from "./integrations";

// Re-ekspor helper audit agar konsumen lama (dashboard.tsx) tak berubah.
export { AUDIT_ACTION_LABELS, friendlyAuditDetail } from "./data";

type SettingsTab = "akun" | "perusahaan" | "tim" | "data" | "lainnya";

export function SettingsPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role === "owner" || tenant.role === "admin";
  const isOwner = tenant.role === "owner";
  const [tab, setTab] = useState<SettingsTab>("akun");

  // Kartu tetap sama & id tak berubah (Fase 10g) — hanya dikelompokkan ke tab.
  const tabs: { key: SettingsTab; label: string }[] = [
    { key: "akun", label: "Akun & Tampilan" },
    { key: "perusahaan", label: "Perusahaan" },
    { key: "tim", label: "Tim & Peran" },
    { key: "data", label: "Data & Keamanan" },
    { key: "lainnya", label: "Lainnya" },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pengaturan</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Langganan, profil & keamanan akun, identitas perusahaan, tim, dan kendali pembukuan.
        </p>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === "akun" ? (
        <div className="space-y-6">
          <ProfileCard />
          <DisplayModeCard />
          <SecurityCard />
        </div>
      ) : null}

      {tab === "perusahaan" ? (
        <div className="space-y-6">
          <SubscriptionCard />
          <CompanySettingsCard tenantId={tenant.tenantId} readOnly={!isAdmin} />
          {isOwner ? <DocNumberingCard tenantId={tenant.tenantId} /> : null}
          {isOwner ? <NewCompanyCard /> : null}
        </div>
      ) : null}

      {tab === "tim" ? (
        <div className="space-y-6">
          {isAdmin ? <MembersCard tenantId={tenant.tenantId} /> : null}
          {isOwner ? <RolesCard tenantId={tenant.tenantId} /> : null}
          {isOwner ? <ApprovalThresholdCard tenantId={tenant.tenantId} /> : null}
          {!isAdmin ? <p className="text-sm text-slate-500">Hanya admin/pemilik yang dapat mengelola tim & peran.</p> : null}
        </div>
      ) : null}

      {tab === "data" ? (
        <div className="space-y-6">
          {isOwner ? <ExportBackupCard tenantId={tenant.tenantId} /> : null}
          {isOwner ? <TenantSecurityCard tenantId={tenant.tenantId} /> : null}
          {isOwner ? <AuditLogCard tenantId={tenant.tenantId} /> : null}
          {!isOwner ? <p className="text-sm text-slate-500">Hanya pemilik yang dapat mengelola cadangan & audit.</p> : null}
        </div>
      ) : null}

      {tab === "lainnya" ? (
        <div className="space-y-6">
          {isOwner ? <ApiIntegrationCard tenantId={tenant.tenantId} /> : null}
          {isOwner ? <CloseBooksCard tenantId={tenant.tenantId} /> : null}
          {!isOwner ? <p className="text-sm text-slate-500">Belum ada pengaturan lain untuk peran Anda.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

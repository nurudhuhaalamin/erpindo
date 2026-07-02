import type { Env } from "../env";

/**
 * Catat aksi penting ke audit_logs (control-plane). Kegagalan menulis log
 * tidak boleh menggagalkan request utama — cukup tercatat di console.
 */
export async function audit(
  env: Env,
  entry: {
    action: string;
    userId?: string | null;
    tenantId?: string | null;
    detail?: Record<string, unknown>;
    ip?: string | null;
  },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        entry.tenantId ?? null,
        entry.userId ?? null,
        entry.action,
        entry.detail ? JSON.stringify(entry.detail) : null,
        entry.ip ?? null,
        new Date().toISOString(),
      )
      .run();
  } catch (err) {
    console.error("[audit] gagal mencatat:", err);
  }
}

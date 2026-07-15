import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { buildZip, type ZipEntry } from "../lib/zip";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Ekspor data penuh (Fase 8b — portabilitas & anti lock-in).
 * Seluruh tabel database tenant diekspor sebagai ZIP berisi CSV per tabel +
 * manifest.json. Endpoint GET sehingga TETAP BISA diakses saat langganan
 * berakhir (mode baca-saja hanya memblokir metode tulis) — data milik
 * pengguna, bukan sandera langganan.
 */

const PAGE = 2000;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Susun ZIP ekspor penuh sebuah database tenant. Dipakai unduhan & backup Drive. */
export async function buildTenantExportZip(
  db: SqlExecutor,
  meta: { tenantName: string; tenantSlug: string },
): Promise<{ zip: Uint8Array; tables: { name: string; rows: number }[] }> {
  const enc = new TextEncoder();
  const { results: tableRows } = await db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf%' ESCAPE '\\'
       ORDER BY name`,
    )
    .all<{ name: string }>();

  const entries: ZipEntry[] = [];
  const tables: { name: string; rows: number }[] = [];

  for (const t of tableRows) {
    const { results: cols } = await db
      .prepare(`PRAGMA table_info("${t.name}")`)
      .all<{ name: string }>();
    const header = cols.map((c) => c.name);

    const lines: string[] = [header.map(csvEscape).join(",")];
    let offset = 0;
    for (;;) {
      const { results } = await db
        .prepare(`SELECT * FROM "${t.name}" LIMIT ${PAGE} OFFSET ${offset}`)
        .all<Record<string, unknown>>();
      for (const row of results) {
        lines.push(header.map((h) => csvEscape(row[h])).join(","));
      }
      if (results.length < PAGE) break;
      offset += PAGE;
    }

    tables.push({ name: t.name, rows: lines.length - 1 });
    entries.push({ path: `data/${t.name}.csv`, data: enc.encode(lines.join("\r\n")) });
  }

  const manifest = {
    app: "erpindo",
    format: "csv (koma, kutip ganda, UTF-8)",
    tenantName: meta.tenantName,
    tenantSlug: meta.tenantSlug,
    exportedAt: new Date().toISOString(),
    tableCount: tables.length,
    tables,
  };
  entries.unshift({ path: "manifest.json", data: enc.encode(JSON.stringify(manifest, null, 2)) });
  return { zip: buildZip(entries), tables };
}

export const exportRoutes = new Hono<AppEnv>()
  // Unduh seluruh data tenant sebagai ZIP. Owner-only; tetap tersedia saat
  // status past_due (baca-saja) — inilah jaminan portabilitas data.
  .get("/:tenantId/export/full", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const { zip, tables } = await buildTenantExportZip(db, {
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
    });

    await audit(c.env, {
      action: "tenant.exported",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { tables: tables.length, bytes: zip.length },
      ip: clientIp(c),
    });

    const date = new Date().toISOString().slice(0, 10);
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="erpindo-export-${tenant.slug}-${date}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  });

import {
  customFieldDefSchema,
  CUSTOM_FIELD_MODULES,
  type CustomFieldModule,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { definisiKustom } from "../lib/customFields";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Definisi field kustom per modul (Fase 20j).
 *
 * Membaca boleh viewer — form dan cetakan perlu tahu kolomnya. Mengubah hanya
 * admin: menambah field wajib pada modul yang ramai berarti mengunci pekerjaan
 * semua orang sampai kolomnya diisi.
 */

function modulValid(v: string | undefined): v is CustomFieldModule {
  return (CUSTOM_FIELD_MODULES as readonly string[]).includes(v ?? "");
}

export const customFieldRoutes = new Hono<AppEnv>()
  .get("/:tenantId/custom-fields", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const modul = c.req.query("module");

    // Tanpa parameter: seluruh modul sekaligus, supaya layar pengaturan tidak
    // perlu tiga permintaan terpisah.
    if (!modul) {
      const semua: Record<string, unknown> = {};
      for (const m of CUSTOM_FIELD_MODULES) semua[m] = await definisiKustom(db, m);
      return c.json({ byModule: semua });
    }
    if (!modulValid(modul)) return c.json({ error: "Modul tidak dikenal." }, 400);
    return c.json({ defs: await definisiKustom(db, modul) });
  })

  .post("/:tenantId/custom-fields", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = customFieldDefSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const dupe = await db
      .prepare(`SELECT id FROM custom_field_defs WHERE module = ? AND field_key = ?`)
      .bind(input.module, input.fieldKey)
      .all<{ id: string }>();
    if (dupe.results[0]) {
      return c.json({ error: `Kunci '${input.fieldKey}' sudah dipakai di modul ini.` }, 409);
    }

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO custom_field_defs (id, module, field_key, label, type, options, required, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.module,
        input.fieldKey,
        input.label,
        input.type,
        input.options ? JSON.stringify(input.options) : null,
        input.required ? 1 : 0,
        input.sortOrder,
      )
      .run();
    await audit(c.env, {
      action: "customfield.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { module: input.module, fieldKey: input.fieldKey, type: input.type },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  // Diarsipkan, BUKAN dihapus. Menghapus definisi ikut menghapus seluruh
  // nilainya (ON DELETE CASCADE) — data yang sudah dicatat pemilik pada ratusan
  // dokumen lenyap karena satu klik di layar pengaturan.
  .delete("/:tenantId/custom-fields/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const ada = await db
      .prepare(`SELECT id FROM custom_field_defs WHERE id = ? AND is_archived = 0`)
      .bind(id)
      .all<{ id: string }>();
    if (!ada.results[0]) return c.json({ error: "Field kustom tidak ditemukan." }, 404);

    await db.prepare(`UPDATE custom_field_defs SET is_archived = 1 WHERE id = ?`).bind(id).run();
    await audit(c.env, {
      action: "customfield.archived",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

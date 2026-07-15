import { contactSchema, importRowsSchema, productSchema, warehouseSchema } from "@erpindo/shared";
import { Hono } from "hono";
import type { z } from "zod";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * CRUD master data (produk, kontak, gudang) dengan pola seragam:
 * viewer boleh membaca, admin+ boleh menulis; hapus = arsip (soft delete)
 * agar riwayat transaksi tetap utuh.
 */

type EntityConfig<S extends z.ZodTypeAny> = {
  table: string;
  auditPrefix: string;
  schema: S;
  uniqueField?: { column: string; input: string };
  /** Kolom yang dicari saat parameter ?q= diisi (LIKE, case-insensitive). */
  searchColumns: string[];
  toRow: (input: z.infer<S>) => Record<string, string | number | null>;
};

function crudRoutes<S extends z.ZodTypeAny>(path: string, cfg: EntityConfig<S>) {
  return new Hono<AppEnv>()
    .get(`/:tenantId/${path}`, requireAuth, requireTenantRole("viewer"), async (c) => {
      const db = getTenantDb(c.env, c.get("tenant").dbRef);
      const includeArchived = c.req.query("arsip") === "1";
      const q = (c.req.query("q") ?? "").trim();
      const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 500);
      const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

      const where: string[] = [];
      const binds: (string | number)[] = [];
      if (!includeArchived) where.push("is_archived = 0");
      if (q) {
        // Escape wildcard LIKE agar '%'/'_' pada input dicari sebagai literal.
        const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
        where.push(`(${cfg.searchColumns.map((col) => `${col} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
        for (const _ of cfg.searchColumns) binds.push(like);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [{ results }, { results: countRows }] = await Promise.all([
        db
          .prepare(`SELECT * FROM ${cfg.table} ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
          .bind(...binds, limit, offset)
          .all<Record<string, unknown>>(),
        db
          .prepare(`SELECT COUNT(*) AS n FROM ${cfg.table} ${whereSql}`)
          .bind(...binds)
          .all<{ n: number }>(),
      ]);
      return c.json({ items: results, total: countRows[0]?.n ?? results.length, limit, offset });
    })

    .post(`/:tenantId/${path}`, requireAuth, requireTenantRole("admin"), async (c) => {
      const parsed = cfg.schema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
      }
      const tenant = c.get("tenant");
      const db = getTenantDb(c.env, tenant.dbRef);
      const row = cfg.toRow(parsed.data);

      if (cfg.uniqueField) {
        const value = row[cfg.uniqueField.column];
        const { results } = await db
          .prepare(`SELECT id FROM ${cfg.table} WHERE ${cfg.uniqueField.column} = ?`)
          .bind(value)
          .all();
        if (results.length > 0) return c.json({ error: `${cfg.uniqueField.input} '${value}' sudah dipakai.` }, 409);
      }

      const id = crypto.randomUUID();
      const columns = Object.keys(row);
      await db
        .prepare(
          `INSERT INTO ${cfg.table} (id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`,
        )
        .bind(id, ...columns.map((k) => row[k]))
        .run();

      await audit(c.env, {
        action: `${cfg.auditPrefix}.created`,
        userId: c.get("user").id,
        tenantId: tenant.id,
        detail: { id },
        ip: clientIp(c),
      });
      return c.json({ ok: true, id }, 201);
    })

    .put(`/:tenantId/${path}/:id`, requireAuth, requireTenantRole("admin"), async (c) => {
      const parsed = cfg.schema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
      }
      const tenant = c.get("tenant");
      const db = getTenantDb(c.env, tenant.dbRef);
      const id = c.req.param("id");
      const row = cfg.toRow(parsed.data);
      const columns = Object.keys(row);

      const { results } = await db.prepare(`SELECT id FROM ${cfg.table} WHERE id = ?`).bind(id).all();
      if (results.length === 0) return c.json({ error: "Data tidak ditemukan." }, 404);

      // Kolom unik (SKU/kode) tidak boleh menabrak baris lain.
      if (cfg.uniqueField) {
        const value = row[cfg.uniqueField.column];
        const { results: dupes } = await db
          .prepare(`SELECT id FROM ${cfg.table} WHERE ${cfg.uniqueField.column} = ? AND id != ?`)
          .bind(value, id)
          .all();
        if (dupes.length > 0) return c.json({ error: `${cfg.uniqueField.input} '${value}' sudah dipakai.` }, 409);
      }

      await db
        .prepare(`UPDATE ${cfg.table} SET ${columns.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
        .bind(...columns.map((k) => row[k]), id)
        .run();

      await audit(c.env, {
        action: `${cfg.auditPrefix}.updated`,
        userId: c.get("user").id,
        tenantId: tenant.id,
        detail: { id },
        ip: clientIp(c),
      });
      return c.json({ ok: true });
    })

    // Impor batch: validasi per baris, lewati duplikat, laporkan hasil rinci.
    .post(`/:tenantId/${path}/import`, requireAuth, requireTenantRole("admin"), async (c) => {
      const parsedEnvelope = importRowsSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsedEnvelope.success) {
        const issue = parsedEnvelope.error.issues[0];
        return c.json({ error: issue?.message ?? "Data impor tidak valid." }, 400);
      }
      const body = parsedEnvelope.data;

      const tenant = c.get("tenant");
      const db = getTenantDb(c.env, tenant.dbRef);

      let inserted = 0;
      const errors: { row: number; message: string }[] = [];

      for (const [index, raw] of body.rows.entries()) {
        const rowNo = index + 1;
        const parsed = cfg.schema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          errors.push({ row: rowNo, message: `${String(first?.path?.[0] ?? "")}: ${first?.message ?? "tidak valid"}` });
          continue;
        }
        const row = cfg.toRow(parsed.data);

        if (cfg.uniqueField) {
          const { results } = await db
            .prepare(`SELECT id FROM ${cfg.table} WHERE ${cfg.uniqueField.column} = ?`)
            .bind(row[cfg.uniqueField.column])
            .all();
          if (results.length > 0) {
            errors.push({ row: rowNo, message: `${cfg.uniqueField.input} '${row[cfg.uniqueField.column]}' sudah ada — dilewati` });
            continue;
          }
        }

        const columns = Object.keys(row);
        await db
          .prepare(
            `INSERT INTO ${cfg.table} (id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`,
          )
          .bind(crypto.randomUUID(), ...columns.map((k) => row[k]))
          .run();
        inserted++;
      }

      await audit(c.env, {
        action: `${cfg.auditPrefix}.imported`,
        userId: c.get("user").id,
        tenantId: tenant.id,
        detail: { inserted, failed: errors.length },
        ip: clientIp(c),
      });
      return c.json({ ok: true, inserted, failed: errors.length, errors: errors.slice(0, 50) });
    })

    .post(`/:tenantId/${path}/:id/archive`, requireAuth, requireTenantRole("admin"), async (c) => {
      const tenant = c.get("tenant");
      const db = getTenantDb(c.env, tenant.dbRef);
      const id = c.req.param("id");
      await db.prepare(`UPDATE ${cfg.table} SET is_archived = 1 WHERE id = ?`).bind(id).run();
      await audit(c.env, {
        action: `${cfg.auditPrefix}.archived`,
        userId: c.get("user").id,
        tenantId: tenant.id,
        detail: { id },
        ip: clientIp(c),
      });
      return c.json({ ok: true });
    });
}

export const masterDataRoutes = new Hono<AppEnv>()
  .route(
    "/",
    crudRoutes("products", {
      table: "products",
      auditPrefix: "masterdata.product",
      schema: productSchema,
      uniqueField: { column: "sku", input: "SKU" },
      searchColumns: ["sku", "name"],
      toRow: (p) => ({
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        sell_price: p.sellPrice,
        buy_price: p.buyPrice,
        track_expiry: p.trackExpiry ? 1 : 0,
        is_service: p.isService ? 1 : 0,
        min_stock: p.minStock,
        barcode: p.barcode ? p.barcode : null,
        uom_secondary: p.uomSecondary ? p.uomSecondary : null,
        uom_factor: p.uomFactor,
        track_serial: p.trackSerial ? 1 : 0,
      }),
    }),
  )
  .route(
    "/",
    crudRoutes("contacts", {
      table: "contacts",
      auditPrefix: "masterdata.contact",
      schema: contactSchema,
      searchColumns: ["name", "email", "phone"],
      toRow: (k) => ({
        type: k.type,
        name: k.name,
        email: k.email || null,
        phone: k.phone || null,
        address: k.address || null,
        npwp: k.npwp || null,
      }),
    }),
  )
  .route(
    "/",
    crudRoutes("warehouses", {
      table: "warehouses",
      auditPrefix: "masterdata.warehouse",
      schema: warehouseSchema,
      uniqueField: { column: "code", input: "Kode" },
      searchColumns: ["code", "name"],
      toRow: (w) => ({ code: w.code, name: w.name, address: w.address || null }),
    }),
  );

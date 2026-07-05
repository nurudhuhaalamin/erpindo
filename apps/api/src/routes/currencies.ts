import { currencySchema, type ApiCurrency } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Master mata uang & kurs (Fase 2r). IDR adalah mata uang basis (kurs 1, tak
 * bisa diubah). Kurs valas dipakai saat memposting faktur — nilai buku selalu
 * dikonversi ke IDR; selisih kurs saat pelunasan dijurnal otomatis.
 */

export const currencyRoutes = new Hono<AppEnv>()

  .get("/:tenantId/currencies", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(`SELECT code, name, rate, is_base FROM currencies ORDER BY is_base DESC, code`)
      .all<{ code: string; name: string; rate: number; is_base: number }>();
    const currencies: ApiCurrency[] = results.map((r) => ({
      code: r.code,
      name: r.name,
      rate: r.rate,
      isBase: r.is_base === 1,
    }));
    return c.json({ currencies });
  })

  .put("/:tenantId/currencies", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = currencySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;
    if (input.code === "IDR") return c.json({ error: "IDR adalah mata uang basis dan tidak dapat diubah." }, 400);

    await db
      .prepare(
        `INSERT INTO currencies (code, name, rate, is_base, updated_at) VALUES (?, ?, ?, 0, datetime('now'))
         ON CONFLICT(code) DO UPDATE SET name = excluded.name, rate = excluded.rate, updated_at = excluded.updated_at`,
      )
      .bind(input.code, input.name, input.rate)
      .run();

    await audit(c.env, {
      action: "currency.set",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { code: input.code, rate: input.rate },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });

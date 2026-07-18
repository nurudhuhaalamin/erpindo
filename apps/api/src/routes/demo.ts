import { demoRequestSchema, type ApiDemoRequest } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getMailer } from "../lib/mailer";
import { rateLimit } from "../middleware/rateLimit";

/**
 * Permintaan demo/kontak dari landing (Fase 13c) — motion sales-assisted untuk
 * pembeli menengah/besar. PUBLIK (calon pelanggan belum punya akun); diamankan
 * lewat rate-limit per IP, bukan sesi. Notifikasi email ke admin platform bila
 * Resend + PLATFORM_ADMIN_EMAILS terpasang (degradasi anggun bila tidak).
 */

export type DemoRow = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  employees: string | null;
  message: string | null;
  status: string;
  created_at: string;
};

export function toApiDemo(r: DemoRow): ApiDemoRequest {
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    email: r.email,
    phone: r.phone,
    employees: r.employees,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
  };
}

export const demoRoutes = new Hono<AppEnv>().post(
  "/",
  rateLimit({ key: "demo-request", limit: 5, windowSeconds: 600 }),
  async (c) => {
    const parsed = demoRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const d = parsed.data;
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO demo_requests (id, name, company, email, phone, employees, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, d.name, d.company, d.email, d.phone ?? null, d.employees ?? null, d.message ?? null)
      .run();

    const adminTo = (c.env.PLATFORM_ADMIN_EMAILS ?? "").split(",")[0]?.trim();
    if (adminTo) {
      await getMailer(c.env).send({
        to: adminTo,
        subject: `Permintaan demo ERPindo: ${d.company}`,
        text: `Permintaan demo/kontak baru:\n\nNama: ${d.name}\nPerusahaan: ${d.company}\nEmail: ${d.email}\nTelepon: ${d.phone ?? "-"}\nJumlah karyawan: ${d.employees ?? "-"}\n\nPesan:\n${d.message ?? "-"}\n`,
      });
    }
    return c.json({ ok: true, id }, 201);
  },
);

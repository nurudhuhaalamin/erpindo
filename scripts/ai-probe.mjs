#!/usr/bin/env node
/**
 * Probe Asisten AI di produksi — mendiagnosa kenapa /ai/chat mengembalikan 503.
 *
 * Mendaftarkan akun scratch dengan kredensial acak (dibuat di proses ini,
 * tidak pernah dicetak), memanggil POST /ai/chat satu kali, lalu mencetak
 * status + body (field `detail` berisi alasan: binding-absent / pesan error
 * model). Tanpa secret — aman dijalankan dari runner CI di repo publik.
 *
 * Pemakaian: BASE_URL=https://erpindo.<sub>.workers.dev node scripts/ai-probe.mjs
 */

import { randomBytes } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "").replace(/\/$/, "");
if (!BASE) {
  console.error("Set BASE_URL.");
  process.exit(1);
}

let cookie = "";
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* bukan JSON */
  }
  return { status: res.status, json };
}

const email = `ai-probe-${Date.now()}@demo-seed.example.com`;
const reg = await api("POST", "/api/auth/register", {
  companyName: "Probe AI",
  name: "Probe Otomatis",
  email,
  password: randomBytes(24).toString("base64url"),
});
if (reg.status !== 201) {
  console.error(`Registrasi probe gagal (HTTP ${reg.status}): ${JSON.stringify(reg.json)}`);
  process.exit(1);
}
console.log(`✓ akun probe terdaftar (${email})`);

const me = await api("GET", "/api/auth/me");
const tenantId = me.json?.memberships?.[0]?.tenantId;
if (!tenantId) {
  console.error(`Tidak menemukan tenantId: ${JSON.stringify(me.json)}`);
  process.exit(1);
}

/** Panggil endpoint AI + ukur latensi (kunci diagnosa "berpikir… abadi"). */
async function timed(label, path, body, method = "POST") {
  const t0 = Date.now();
  const res = await api(method, path, body);
  const ms = Date.now() - t0;
  console.log(`\n=== HASIL PROBE ${label} ===`);
  console.log(`HTTP ${res.status} · ${ms} ms`);
  console.log(JSON.stringify(res.json, null, 2));
  if (res.status === 200) {
    console.log(`✅ ${label} AKTIF (${ms} ms)${ms > 20_000 ? " — TAPI LAMBAT (>20 dtk)! Ini penyebab UI 'berpikir…' lama." : ""}`);
  } else if (res.status === 503) {
    console.log(`❌ ${label} 503 — alasan: ${res.json?.detail ?? "(tanpa detail)"}`);
    process.exitCode = 1;
  } else {
    console.log(`⚠ ${label} status tak terduga (${res.status}).`);
    process.exitCode = 1;
  }
  return { ms, status: res.status };
}

await timed("/ai/chat", `/api/tenants/${tenantId}/ai/chat`, {
  messages: [{ role: "user", content: "Bagaimana cara membuat faktur penjualan?" }],
});
await timed("/ai/jurnal", `/api/tenants/${tenantId}/ai/jurnal`, {
  prompt: "bayar listrik 500 ribu dari kas",
});
// Fase 12f: ringkasan mingguan dashboard (GET; panggilan kedua seharusnya cache).
await timed("/ai/ringkasan-mingguan", `/api/tenants/${tenantId}/ai/ringkasan-mingguan`, undefined, "GET");

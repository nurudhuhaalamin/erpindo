#!/usr/bin/env node
/**
 * Smoke test end-to-end: menjalankan `wrangler dev` (D1 & KV lokal) lalu
 * menguji alur nyata lewat HTTP:
 *   register → verifikasi email → login → RBAC → tulis/baca DB tenant →
 *   undang anggota → terima undangan → viewer ditolak di endpoint admin.
 *
 * Gagal = exit code 1. Dipakai lokal dan di CI sebagai gerbang merge.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const persistDir = mkdtempSync(join(tmpdir(), "erpindo-smoke-"));
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

const logs = [];
const child = spawn(
  "pnpm",
  ["exec", "wrangler", "dev", "--port", String(PORT), "--persist-to", persistDir, "--show-interactive-dev-session=false"],
  { cwd: apiDir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } },
);
child.stdout.on("data", (d) => logs.push(d.toString()));
child.stderr.on("data", (d) => logs.push(d.toString()));

function findInLogs(regex) {
  for (const chunk of logs.join("").split("\n")) {
    const m = chunk.match(regex);
    if (m) return m;
  }
  return null;
}

async function waitForReady(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev tidak siap dalam ${timeoutMs / 1000}s.\nLog:\n${logs.join("")}`);
}

/** Klien fetch mini dengan cookie jar per pengguna. */
function makeClient() {
  let cookie = "";
  return async function request(method, path, body) {
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
      /* respons bukan JSON */
    }
    return { status: res.status, json };
  };
}

try {
  console.log("Menunggu wrangler dev siap...");
  await waitForReady();
  console.log("Server siap. Menjalankan skenario:\n");

  // --- Registrasi pemilik + provisioning tenant -----------------------------
  console.log("1. Registrasi perusahaan baru");
  const owner = makeClient();
  const reg = await owner("POST", "/api/auth/register", {
    companyName: "PT Maju Jaya",
    name: "Budi Santoso",
    email: "budi@majujaya.co.id",
    password: "rahasia-kuat-123",
  });
  check("register 201", reg.status === 201, `→ ${reg.status} ${JSON.stringify(reg.json)}`);
  const tenantId = reg.json?.tenantId;
  check("tenantId & slug diberikan", Boolean(tenantId && reg.json?.slug === "pt-maju-jaya"));

  const dup = await owner("POST", "/api/auth/register", {
    companyName: "PT Lain",
    name: "Budi",
    email: "budi@majujaya.co.id",
    password: "rahasia-kuat-123",
  });
  check("email ganda ditolak 409", dup.status === 409);

  // --- Verifikasi email dari link di log ------------------------------------
  console.log("2. Verifikasi email (link diambil dari log mailer)");
  await new Promise((r) => setTimeout(r, 300));
  const verifyMatch = findInLogs(/verifikasi\?token=([0-9a-f]{64})/);
  check("email verifikasi terkirim ke log", Boolean(verifyMatch));
  if (verifyMatch) {
    const ver = await owner("POST", "/api/auth/verify", { token: verifyMatch[1] });
    check("verifikasi 200", ver.status === 200);
    const reuse = await owner("POST", "/api/auth/verify", { token: verifyMatch[1] });
    check("token verifikasi sekali pakai", reuse.status === 400);
  }

  // --- Sesi & login ----------------------------------------------------------
  console.log("3. Sesi & login");
  const me = await owner("GET", "/api/auth/me");
  check("me 200 + emailVerified", me.status === 200 && me.json?.user?.emailVerified === true);
  check("membership owner", me.json?.memberships?.[0]?.role === "owner");

  const anon = makeClient();
  const meAnon = await anon("GET", "/api/auth/me");
  check("tanpa sesi ditolak 401", meAnon.status === 401);

  const badLogin = await anon("POST", "/api/auth/login", {
    email: "budi@majujaya.co.id",
    password: "password-salah",
  });
  check("login password salah 401", badLogin.status === 401);

  // --- Tulis & baca DATABASE TENANT ------------------------------------------
  console.log("4. Pengaturan perusahaan (database tenant)");
  const patch = await owner("PATCH", `/api/tenants/${tenantId}/settings`, {
    address: "Jl. Sudirman No. 1, Jakarta",
    npwp: "01.234.567.8-901.000",
  });
  check("update settings 200", patch.status === 200);
  const settings = await owner("GET", `/api/tenants/${tenantId}/settings`);
  check(
    "settings tersimpan di DB tenant",
    settings.json?.settings?.display_name === "PT Maju Jaya" &&
      settings.json?.settings?.npwp === "01.234.567.8-901.000",
    `→ ${JSON.stringify(settings.json)}`,
  );

  // --- Undangan anggota + RBAC ------------------------------------------------
  console.log("5. Undangan anggota & RBAC");
  const invite = await owner("POST", `/api/tenants/${tenantId}/invites`, {
    email: "sari@majujaya.co.id",
    role: "viewer",
  });
  check("undangan terkirim 201", invite.status === 201 && /undangan\?token=/.test(invite.json?.inviteUrl ?? ""));

  const viewer = makeClient();
  const regViewer = await viewer("POST", "/api/auth/register", {
    companyName: "Toko Sari",
    name: "Sari Dewi",
    email: "sari@majujaya.co.id",
    password: "rahasia-sari-456",
  });
  check("registrasi user kedua 201 (tenant kedua terprovisi)", regViewer.status === 201);

  const inviteToken = invite.json.inviteUrl.split("token=")[1];
  const accept = await viewer("POST", "/api/invites/accept", { token: inviteToken });
  check("terima undangan 200", accept.status === 200 && accept.json?.tenantId === tenantId);

  const viewerRead = await viewer("GET", `/api/tenants/${tenantId}/settings`);
  check("viewer boleh membaca settings", viewerRead.status === 200);
  const viewerWrite = await viewer("PATCH", `/api/tenants/${tenantId}/settings`, { address: "coba tulis" });
  check("viewer DITOLAK menulis settings (403)", viewerWrite.status === 403);
  const viewerMembers = await viewer("GET", `/api/tenants/${tenantId}/members`);
  check("viewer DITOLAK melihat anggota (403)", viewerMembers.status === 403);

  const members = await owner("GET", `/api/tenants/${tenantId}/members`);
  check("owner melihat 2 anggota", members.status === 200 && members.json?.members?.length === 2);

  const outsider = makeClient();
  await outsider("POST", "/api/auth/register", {
    companyName: "CV Pihak Luar",
    name: "Orang Luar",
    email: "luar@contoh.com",
    password: "rahasia-luar-789",
  });
  const crossTenant = await outsider("GET", `/api/tenants/${tenantId}/settings`);
  check("NON-anggota DITOLAK akses tenant lain (403) — isolasi tenant", crossTenant.status === 403);

  // --- Logout -----------------------------------------------------------------
  console.log("6. Logout");
  const out = await owner("POST", "/api/auth/logout");
  check("logout 200", out.status === 200);
  const afterLogout = await owner("GET", "/api/auth/me");
  check("sesi dicabut setelah logout", afterLogout.status === 401);

  console.log(`\n${failures === 0 ? "SEMUA SMOKE TEST LULUS ✅" : `${failures} PEMERIKSAAN GAGAL ❌`}`);
} catch (err) {
  failures++;
  console.error("Smoke test error:", err);
} finally {
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1000));
  child.kill("SIGKILL");
}

process.exit(failures === 0 ? 0 : 1);

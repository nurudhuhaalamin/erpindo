import type { ApiMember, MeResponse } from "@erpindo/shared";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: Record<string, string[]>,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: string; issues?: Record<string, string[]> })
    | null;
  if (!res.ok) {
    throw new ApiRequestError(res.status, json?.error ?? "Terjadi kesalahan.", json?.issues);
  }
  return json as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("GET", "/api/health"),

  register: (input: { companyName: string; name: string; email: string; password: string }) =>
    request<{ ok: true; tenantId: string; slug: string }>("POST", "/api/auth/register", input),
  login: (input: { email: string; password: string }) => request<{ ok: true }>("POST", "/api/auth/login", input),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout"),
  me: () => request<MeResponse>("GET", "/api/auth/me"),
  verifyEmail: (token: string) => request<{ ok: true }>("POST", "/api/auth/verify", { token }),
  forgotPassword: (email: string) => request<{ ok: true }>("POST", "/api/auth/forgot-password", { email }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true }>("POST", "/api/auth/reset-password", { token, password }),

  members: (tenantId: string) => request<{ members: ApiMember[] }>("GET", `/api/tenants/${tenantId}/members`),
  invite: (tenantId: string, input: { email: string; role: "admin" | "viewer" }) =>
    request<{ ok: true; inviteUrl: string }>("POST", `/api/tenants/${tenantId}/invites`, input),
  acceptInvite: (token: string) => request<{ ok: true; tenantId: string }>("POST", "/api/invites/accept", { token }),
  settings: (tenantId: string) =>
    request<{ settings: Record<string, string> }>("GET", `/api/tenants/${tenantId}/settings`),
  updateSettings: (tenantId: string, input: { displayName?: string; address?: string; npwp?: string }) =>
    request<{ ok: true }>("PATCH", `/api/tenants/${tenantId}/settings`, input),
};

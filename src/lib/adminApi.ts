// src/lib/adminApi.ts
import { supabase } from "./supabaseClient";

export type AdminMe = { ok: boolean; isAdmin: boolean; email?: string; userId?: string; message?: string };

export type Credits = { balance: number; expiresAt: string | null };

export type MegaCustomer = {
  passId: string;
  email: string | null;
  userId: string | null;
  shopifyCustomerId: string | null;
  displayName: string | null;
  credits: Credits;
  verifiedAny: boolean;
  disabled: boolean;
  lastActive: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw?: any;
};

export type MegaLedgerRow = {
  id: string;
  recordType: "generation" | "session" | "feedback" | "credit_transaction" | string;
  passId: string;
  createdAt: string | null;
  title: string | null;
  platform: string | null;
  type: string | null;
  provider: string | null;
  model: string | null;
  status: string | null;
  error: string | null;
  outputUrl: string | null;
  meta: any;
  raw?: any;
};

export type AdminLogRow = {
  id: string;
  recordType: string;
  at: string | null;
  level: string;
  source: string;
  message: string;
  detail: any;
  raw?: any;
};

function readApiBase(): string {
  try {
    // Dedicated admin API base (recommended)
    const v = window.localStorage.getItem("MINA_ADMIN_API_BASE") || "";
    if (v.trim()) return v.trim().replace(/\/+$/, "");
  } catch {}
  try {
    // Fallback to your existing setting
    const v = window.localStorage.getItem("MINA_API_BASE") || "";
    if (v.trim()) return v.trim().replace(/\/+$/, "");
  } catch {}
  // Default: same origin
  return "";
}

export function setAdminApiBase(next: string) {
  try {
    window.localStorage.setItem("MINA_ADMIN_API_BASE", (next || "").trim());
  } catch {}
}

export function getAdminApiBase(): string {
  return readApiBase();
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = readApiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const res = await fetch(url, { ...init, headers });

  const txt = await res.text().catch(() => "");
  let json: any = {};
  try {
    json = txt ? JSON.parse(txt) : {};
  } catch {
    json = { ok: false, message: txt || `HTTP ${res.status}` };
  }

  if (!res.ok) {
    const msg = json?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return json as T;
}

/* ---------------------------
   Admin auth
---------------------------- */

export async function adminMe(): Promise<AdminMe> {
  // Preferred endpoint
  try {
    return await requestJson<AdminMe>("/admin/me");
  } catch {
    // Fallback: if /admin/config works, you're admin
    try {
      await requestJson<any>("/admin/config");
      return { ok: true, isAdmin: true };
    } catch (e: any) {
      return { ok: false, isAdmin: false, message: e?.message || "Not admin" };
    }
  }
}

/* ---------------------------
   Config
---------------------------- */

export async function getAdminConfig(): Promise<{ ok: boolean; config: any }> {
  return await requestJson<{ ok: boolean; config: any }>("/admin/config");
}

export async function saveAdminConfig(config: any): Promise<{ ok: boolean; config: any }> {
  return await requestJson<{ ok: boolean; config: any }>("/admin/config", {
    method: "PUT",
    body: JSON.stringify({ config }),
  });
}

export async function storeProviderSecret(provider: string, secret: string): Promise<{ ok: boolean; masked: string; config?: any }> {
  return await requestJson<{ ok: boolean; masked: string; config?: any }>("/admin/provider-secret", {
    method: "POST",
    body: JSON.stringify({ provider, secret }),
  });
}

/* ---------------------------
   Customers (MEGA)
---------------------------- */

export async function listCustomers(opts: { q?: string; limit?: number; offset?: number } = {}) {
  const q = encodeURIComponent((opts.q || "").trim());
  const limit = Number(opts.limit ?? 200);
  const offset = Number(opts.offset ?? 0);
  const qs = `?q=${q}&limit=${limit}&offset=${offset}`;
  return await requestJson<{ ok: boolean; rows: MegaCustomer[]; count?: number }>(`/admin/customers${qs}`);
}

export async function getCustomer(passId: string) {
  return await requestJson<{ ok: boolean; customer: MegaCustomer }>(`/admin/customers/${encodeURIComponent(passId)}`);
}

export async function patchCustomer(passId: string, patch: Partial<{
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  creditsBalance: number;
  creditsExpiresAt: string | null;
  shopifyCustomerId: string | null;
}>) {
  return await requestJson<{ ok: boolean; customer: MegaCustomer }>(`/admin/customers/${encodeURIComponent(passId)}`, {
    method: "PATCH",
    body: JSON.stringify({ patch }),
  });
}

export async function topupCustomer(passId: string, delta: number, reason: string) {
  return await requestJson<{ ok: boolean; customer: MegaCustomer }>(`/admin/customers/${encodeURIComponent(passId)}/topup`, {
    method: "POST",
    body: JSON.stringify({ delta, reason }),
  });
}

/* ---------------------------
   Ledger / Activity (MEGA_GENERATIONS)
---------------------------- */

export async function listLedger(opts: {
  passId?: string;
  recordType?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const p = new URLSearchParams();
  if (opts.passId) p.set("passId", opts.passId);
  if (opts.recordType) p.set("recordType", opts.recordType);
  if (opts.status) p.set("status", opts.status);
  if (opts.q) p.set("q", opts.q);
  p.set("limit", String(opts.limit ?? 200));
  p.set("offset", String(opts.offset ?? 0));

  return await requestJson<{ ok: boolean; rows: MegaLedgerRow[]; count?: number }>(`/admin/ledger?${p.toString()}`);
}

export async function deleteLedgerRow(mgId: string) {
  return await requestJson<{ ok: boolean }>(`/admin/ledger/${encodeURIComponent(mgId)}`, { method: "DELETE" });
}

/* ---------------------------
   Logs / Errors (MEGA_ADMIN + MEGA_GENERATIONS errors)
---------------------------- */

export async function listLogs(opts: { source?: string; limit?: number; since?: string } = {}) {
  const p = new URLSearchParams();
  if (opts.source) p.set("source", opts.source);
  if (opts.since) p.set("since", opts.since);
  p.set("limit", String(opts.limit ?? 400));
  return await requestJson<{ ok: boolean; rows: AdminLogRow[] }>(`/admin/logs?${p.toString()}`);
}

export async function listErrors(opts: { limit?: number; since?: string } = {}) {
  const p = new URLSearchParams();
  if (opts.since) p.set("since", opts.since);
  p.set("limit", String(opts.limit ?? 250));
  return await requestJson<{ ok: boolean; rows: MegaLedgerRow[] }>(`/admin/errors?${p.toString()}`);
}

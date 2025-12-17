// src/components/AuthGate.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type AuthGateProps = {
  children: React.ReactNode;
};

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

// MEGA identity storage (single identity)
const PASS_ID_STORAGE_KEY = "minaPassId";

// baseline users label (optional)
const BASELINE_USERS = 0;

// --------------------
// PassId context
// --------------------
const PassIdContext = React.createContext<string | null>(null);

export function usePassId(): string | null {
  return React.useContext(PassIdContext);
}

// --------------------
// Local storage helpers
// --------------------
function lsGet(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(key);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function readStoredPassId(): string | null {
  return lsGet(PASS_ID_STORAGE_KEY);
}

function persistPassIdLocal(passId: string) {
  lsSet(PASS_ID_STORAGE_KEY, passId);
}

function normalizeEmail(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  return e || null;
}

// --------------------
// PassId generation fallback
// --------------------
function generateLocalPassId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `pass_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}${Math.random().toString(16).slice(2)}`;
}

// --------------------
// Supabase token helper
// --------------------
async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Ask backend to canonicalize/link passId.
 * Backend is the ONLY source of truth.
 */
async function ensurePassIdViaBackend(
  existingPassId?: string | null
): Promise<string | null> {
  const existing = existingPassId?.trim() || null;
  if (!API_BASE_URL) return existing;

  const token = await getSupabaseAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (existing) headers["X-Mina-Pass-Id"] = existing;

  try {
    const res = await fetch(`${API_BASE_URL}/me`, {
      method: "GET",
      headers,
      credentials: "omit",
    });

    if (!res.ok) return existing;

    const json = (await res.json().catch(() => ({} as any))) as any;
    const nextRaw =
      typeof json?.passId === "string"
        ? json.passId
        : typeof json?.pass_id === "string"
        ? json.pass_id
        : null;

    const next = nextRaw?.trim() || null;
    return next || existing;
  } catch {
    return existing;
  }
}

/**
 * Lead capture (non-blocking). Optional.
 */
async function syncShopifyWelcome(
  email: string | null | undefined,
  userId?: string,
  passId?: string | null,
  timeoutMs: number = 3500
): Promise<string | null> {
  const clean = normalizeEmail(email);
  if (!API_BASE_URL || !clean) return null;
  if (typeof window === "undefined") return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload: any = { email: clean };
    if (userId) payload.userId = userId;
    if (passId) payload.passId = passId;

    const res = await fetch(`${API_BASE_URL}/auth/shopify-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => ({} as any));
    if (!res.ok || json?.ok === false) return null;

    return null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

// --------------------
// UI helpers
// --------------------
function getInboxHref(email: string | null): string {
  if (!email) return "mailto:";
  const parts = email.split("@");
  if (parts.length !== 2) return "mailto:";
  const domain = parts[1].toLowerCase();

  if (domain === "gmail.com") return "https://mail.google.com/mail/u/0/#inbox";
  if (["outlook.com", "hotmail.com", "live.com"].includes(domain))
    return "https://outlook.live.com/mail/0/inbox";
  if (domain === "yahoo.com") return "https://mail.yahoo.com/d/folders/1";
  if (
    domain === "icloud.com" ||
    domain.endsWith(".me.com") ||
    domain.endsWith(".mac.com")
  )
    return "https://www.icloud.com/mail";

  return `mailto:${email}`;
}

function formatUserCount(n: number | null): string {
  if (!Number.isFinite(n as number) || n === null) return "";
  const value = Math.max(0, Math.round(n));
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

// --------------------
// AuthGate
// --------------------
export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [passId, setPassId] = useState<string | null>(() =>
    readStoredPassId()
  );

  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleOpening, setGoogleOpening] = useState(false);

  const [newUsers, setNewUsers] = useState<number | null>(null);
  const displayedUsers = BASELINE_USERS + (newUsers ?? 0);
  const displayedUsersLabel = `${formatUserCount(
    displayedUsers
  )} curators use Mina`;

  // ✅ SINGLE canonical passId resolver
  const refreshPassId = useCallback(async () => {
    let candidate = readStoredPassId();

    const canonical = await ensurePassIdViaBackend(candidate);
    candidate = canonical?.trim() || candidate;

    const finalPid = candidate?.trim()
      ? candidate.trim()
      : generateLocalPassId();

    persistPassIdLocal(finalPid);
    setPassId((prev) => (prev === finalPid ? prev : finalPid));

    return finalPid;
  }, []);

  const gatedChildren = useMemo(
    () => (
      <PassIdContext.Provider value={passId}>
        {children}
      </PassIdContext.Provider>
    ),
    [children, passId]
  );

  const hasUserId = !!session?.user?.id;
  const hasPassId = typeof passId === "string" && passId.length > 0;
  const isAuthed = hasUserId && hasPassId;

  // Init + auth listener
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(data.session ?? null);
        await refreshPassId();
      } finally {
        if (mounted) setInitializing(false);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession ?? null);
      await refreshPassId();

      if (event === "SIGNED_IN" && newSession?.user?.email) {
        void syncShopifyWelcome(
          newSession.user.email,
          newSession.user.id,
          readStoredPassId()
        );
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshPassId]);

  if (initializing) {
    return <div className="mina-auth-shell">Loading…</div>;
  }

  if (isAuthed) {
    return gatedChildren;
  }

  // Login UI (unchanged)
  return <div className="mina-auth-shell">Login…</div>;
}

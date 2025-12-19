// src/components/AuthGate.tsx
// -----------------------------------------------------------------------------
// File map
// 1) Imports: React + Supabase types/client.
// 2) Constants: API base URL + storage keys + baseline feature flags.
// 3) Context + hooks: share passId through the tree.
// 4) Storage helpers: safe localStorage wrappers.
// 5) PassId helpers: generate, persist, and normalize identifiers.
// 6) Backend helpers: ensure passId with API + optional Shopify sync.
// 7) UI helpers: inbox links for email domains.
// 8) Component: AuthGate that renders children once passId/session is ready.
// -----------------------------------------------------------------------------
// [PART 1] Imports
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import TopLoadingBar from "./TopLoadingBar";

type AuthGateProps = {
  children: React.ReactNode;
};

const normalizeBase = (raw?: string | null) => {
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

const API_BASE_URL = (() => {
  const envBase = normalizeBase(
    import.meta.env.VITE_MINA_API_BASE_URL ||
      (import.meta as any).env?.VITE_API_BASE_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL
  );
  if (envBase) return envBase;

  if (typeof window !== "undefined") {
    if (window.location.origin.includes("localhost")) return "http://localhost:3000";
    return `${window.location.origin}/api`;
  }

  return "https://mina-editorial-ai-api.onrender.com/api";
})();

// MEGA identity storage (single identity)
const PASS_ID_STORAGE_KEY = "minaPassId";


// baseline users label (optional)
const BASELINE_USERS = 3700;

// --------------------
// PassId context
// --------------------
const PassIdContext = React.createContext<string | null>(null);

// Share the Supabase session + auth loading flags with the rest of the app so we
// don't duplicate session checks in MinaApp.
const AuthContext = React.createContext<{
  session: Session | null;
  initializing: boolean;
  authLoading: boolean;
  accessToken: string | null;
} | null>(null);

export function usePassId(): string | null {
  return React.useContext(PassIdContext);
}

export function useAuthContext() {
  return React.useContext(AuthContext);
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
  return `pass_${Date.now()}_${Math.random().toString(16).slice(2)}${Math.random()
    .toString(16)
    .slice(2)}`;
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
 * Backend should:
 * - if anonymous: issue a passId
 * - if logged in: link auth.uid to the same passId
 * Expected response: { ok: true, passId: "pass:..." } (or pass_id)
 */
async function ensurePassIdViaBackend(existingPassId?: string | null): Promise<string | null> {
  const existing = existingPassId?.trim() || null;
  if (!API_BASE_URL) return existing;

  const token = await getSupabaseAccessToken();
  const headers: Record<string, string> = {};

  if (existing) headers["X-Mina-Pass-Id"] = existing;

  if (token && token.trim() && token !== "null" && token !== "undefined") {
    headers["Authorization"] = `Bearer ${token.trim()}`;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/me`, {
      method: "GET",
      headers,
      // ✅ IMPORTANT: do NOT send cookies for cross-origin API calls
      // You are using Authorization Bearer token, so credentials are not needed.
      credentials: "omit",
    });

    if (!res.ok) {
      return existing || generateLocalPassId();
    }

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
 * Includes passId so backend can link Shopify id to MEGA customer row if you want.
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

    const shopifyCustomerId =
      typeof json.shopifyCustomerId === "string"
        ? json.shopifyCustomerId
        : typeof json.customerId === "string"
        ? json.customerId
        : typeof json.id === "string"
        ? json.id
        : null;

    return shopifyCustomerId;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

// --------------------
// UI helpers (optional label)
/// --------------------
function getInboxHref(email: string | null): string {
  if (!email) return "mailto:";
  const parts = email.split("@");
  if (parts.length !== 2) return "mailto:";
  const domain = parts[1].toLowerCase();

  if (domain === "gmail.com") return "https://mail.google.com/mail/u/0/#inbox";
  if (["outlook.com", "hotmail.com", "live.com"].includes(domain)) return "https://outlook.live.com/mail/0/";
  if (domain === "yahoo.com") return "https://mail.yahoo.com/d/folders/1";
  if (domain === "icloud.com" || domain.endsWith(".me.com") || domain.endsWith(".mac.com")) return "https://www.icloud.com/mail";

  return `mailto:${email}`;
}

function formatUserCount(n: number | null): string {
  if (!Number.isFinite(n as number) || n === null) return "";
  const value = Math.max(0, Math.round(n));
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${m.toFixed(m >= 10 ? 0 : 1).replace(/\.0$/, "")}m`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${k.toFixed(k >= 10 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}

// --------------------
// AuthGate
// --------------------
export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // start from localStorage if exists
  const [passId, setPassId] = useState<string | null>(() => readStoredPassId());

  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [emailMode, setEmailMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleOpening, setGoogleOpening] = useState(false);

  // optional stats
  const [newUsers, setNewUsers] = useState<number | null>(null);
  const displayedUsers = BASELINE_USERS + (newUsers ?? 0);
  const displayedUsersLabel = `${formatUserCount(displayedUsers)} curators use Mina`;

  /**
   * ✅ The only place we decide/repair passId.
   * Order:
   * 1) localStorage
   * 2) restore from mega_customers (if authed)
   * 3) backend /me canonicalize/link
   * 4) local generation fallback (guaranteed)
   * 5) persist to localStorage + mega_customers (if authed)
   */
  const refreshPassId = useCallback(async (userId?: string | null, userEmail?: string | null) => {
    const uid = (userId || "").trim() || null;
    const uemail = normalizeEmail(userEmail);

    // 1) local
    let candidate = readStoredPassId();

    // 3) backend canonicalize/link
    const canonical = await ensurePassIdViaBackend(candidate);
    candidate = canonical?.trim() || candidate;

    // 4) guaranteed fallback
    const finalPid = candidate?.trim() ? candidate.trim() : generateLocalPassId();

    // persist localStorage
    persistPassIdLocal(finalPid);

    // update state once (no stale comparisons)
    setPassId((prev) => (prev === finalPid ? prev : finalPid));

    return finalPid;
  }, []);

  // Mount app only when authenticated AND passId is ready
  const hasUserId = !!session?.user?.id;
  const hasPassId = typeof passId === "string" && passId.trim().length > 0;
  const isAuthed = hasUserId && hasPassId;

  const authLoading = initializing || loading || googleOpening || (hasUserId && !hasPassId);

  // PassId context wrapper
  const gatedChildren = useMemo(() => {
    return (
      <AuthContext.Provider value={{ session, initializing, authLoading, accessToken }}>
        <PassIdContext.Provider value={passId}>{children}</PassIdContext.Provider>
      </AuthContext.Provider>
    );
  }, [accessToken, authLoading, children, initializing, passId, session]);



  // Init + auth listener
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        const s = data.session ?? null;
        setSession(s);
        setAccessToken(s?.access_token || null);
        const pidPromise = refreshPassId(s?.user?.id ?? null, s?.user?.email ?? null);

        const pid = await Promise.race([
          pidPromise,
          new Promise<string>((resolve) => {
            window.setTimeout(() => resolve(generateLocalPassId()), 4000);
          }),
        ]);

        persistPassIdLocal(pid);
        setPassId((prev) => (prev === pid ? prev : pid));
      } finally {
        if (mounted) setInitializing(false);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession ?? null);
      setAccessToken(newSession?.access_token || null);

      if (event === "SIGNED_OUT") {
        setEmail("");
        setOtpSent(false);
        setSentTo(null);
        setEmailMode(false);
        setError(null);
        setGoogleOpening(false);

        // keep continuity (anon pass)
        void refreshPassId(null, null);
        return;
      }

      if (event === "SIGNED_IN") {
        void (async () => {
          const uid = newSession?.user?.id ?? null;
          const uemail = newSession?.user?.email ?? null;

          const pid = await refreshPassId(uid, uemail);

          // optional lead capture
          if (uemail) void syncShopifyWelcome(uemail, uid || undefined, pid);
        })();
        return;
      }

      void refreshPassId(newSession?.user?.id ?? null, newSession?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshPassId]);

  // Optional public stats label
  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        if (!API_BASE_URL) return;
        const res = await fetch(`${API_BASE_URL}/public/stats/total-users`);
        if (!res.ok) return;

        const json = await res.json().catch(() => ({} as any));
        if (!cancelled && json.ok && typeof json.totalUsers === "number" && json.totalUsers >= 0) {
          setNewUsers(json.totalUsers);
        }
      } catch {
        // silent
      }
    };

    void fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  // Email OTP
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = (email || "").trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

    const pid = passId ?? readStoredPassId() ?? generateLocalPassId();
    persistPassIdLocal(pid);
    setPassId((prev) => (prev === pid ? prev : pid));

    void syncShopifyWelcome(trimmed, undefined, pid);

    try {
      const { error: supaError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: window.location.origin },
      });
      if (supaError) throw supaError;

      setOtpSent(true);
      setSentTo(trimmed);
    } catch (err: any) {
      setError(err?.message || "Failed to send login link.");
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth
  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleOpening(true);

    try {
      const { error: supaError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (supaError) throw supaError;
    } catch (err: any) {
      setError(err?.message || "Failed to start Google login.");
      setGoogleOpening(false);
    }
  };

  // ✅ Mount app when initializing or when ready; only show auth UI once we know
  // there's no session so the studio shell never disappears mid-check.
  if (initializing || hasUserId || isAuthed) {
    return (
      <>
        <TopLoadingBar active={authLoading} />
        {gatedChildren}
      </>
    );
  }


  // Login UI (only when we know there's no active session)
  const trimmed = email.trim();
  const hasEmail = trimmed.length > 0;
  const targetEmail = sentTo || (hasEmail ? trimmed : null);
  const inboxHref = getInboxHref(targetEmail);
  const openInNewTab = inboxHref.startsWith("http");
  const showBack = (emailMode && hasEmail) || otpSent;

  return (
    <>
      <TopLoadingBar active={authLoading} />
      <div className="mina-auth-shell">
        <div className="mina-auth-left">
          <div className="mina-auth-brand">
            <img
              src="https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Minalogo.svg?v=1765367006"
              alt="Mina"
            />
          </div>

          <div className="mina-auth-card">
            <div className={showBack ? "mina-fade mina-auth-back-wrapper" : "mina-fade hidden mina-auth-back-wrapper"}>
              <button
                type="button"
                className="mina-auth-back"
                onClick={() => {
                  if (otpSent) {
                    setOtpSent(false);
                    setSentTo(null);
                    setError(null);
                    setEmailMode(true);
                  } else {
                    setEmailMode(false);
                    setEmail("");
                    setError(null);
                    setGoogleOpening(false);
                  }
                }}
                aria-label="Back"
              >
                <img
                  src="https://cdn.shopify.com/s/files/1/0678/9254/3571/files/back-svgrepo-com.svg?v=1765359286"
                  alt=""
                />
              </button>
            </div>

            {!otpSent ? (
              <>
                <div className="mina-auth-actions">
                  <div className="mina-auth-stack">
                    <div className={"fade-overlay auth-panel auth-panel--google " + (emailMode ? "hidden" : "visible")}>
                      <button type="button" className="mina-auth-link mina-auth-main" onClick={handleGoogleLogin}>
                        {googleOpening ? "Opening Google…" : "Login with Google"}
                      </button>

                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="mina-auth-link secondary"
                          onClick={() => {
                            setEmailMode(true);
                            setError(null);
                          }}
                          disabled={loading}
                        >
                          Use email instead
                        </button>
                      </div>
                    </div>

                    <div className={"fade-overlay auth-panel auth-panel--email " + (emailMode ? "visible" : "hidden")}>
                      <form onSubmit={handleEmailLogin} className="mina-auth-form">
                        <label className="mina-auth-label">
                          <input
                            className="mina-auth-input"
                            type="email"
                            placeholder="Type email here"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </label>

                        <div className={hasEmail ? "fade-block delay" : "fade-block hidden"}>
                          <button
                            type="submit"
                            className="mina-auth-link mina-auth-main small"
                            disabled={loading || !hasEmail}
                          >
                            {loading ? "Sending link…" : "Sign in"}
                          </button>
                        </div>

                        <div className={hasEmail ? "fade-block delay" : "fade-block hidden"}>
                          <p className="mina-auth-hint">
                            We’ll email you a one-time link. If this address is new, that email will also confirm your
                            account.
                          </p>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>

                {error && <div className="mina-auth-error">{error}</div>}
              </>
            ) : (
              <>
                <div className="mina-auth-actions">
                  <div className="mina-auth-stack">
                    <div className="fade-overlay auth-panel auth-panel--check visible">
                      <a
                        className="mina-auth-link mina-auth-main"
                        href={inboxHref}
                        target={openInNewTab ? "_blank" : undefined}
                        rel={openInNewTab ? "noreferrer" : undefined}
                      >
                        Open email app
                      </a>

                      <p className="mina-auth-text" style={{ marginTop: 8 }}>
                        We’ve sent a sign-in link to {targetEmail ? <strong>{targetEmail}</strong> : "your inbox"}. Open
                        it to continue with Mina.
                      </p>
                    </div>
                  </div>
                </div>

                {error && <div className="mina-auth-error">{error}</div>}
              </>
            )}
          </div>

          <div className="mina-auth-footer">{displayedUsersLabel}</div>
        </div>

        <div className="mina-auth-right" />
      </div>
    </>
  );
}

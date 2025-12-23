// src/components/AuthGate.tsx
// -----------------------------------------------------------------------------
// File map
// 1) Imports: React + Supabase types/client.
// 2) Constants: API base URL + storage keys + baseline feature flags.
// 3) Context + hooks: share passId through the tree.
// 4) Storage helpers: safe localStorage wrappers.
// 5) PassId helpers: generate, persist, and normalize identifiers.
// 6) Auth callback helpers: detect/clean OAuth callback params safely.
// 7) Backend helpers: verify token + ensure passId via MMA/MEGA endpoints (NO /me).
// 8) UI helpers: inbox links for email domains.
// 9) Component: AuthGate that renders children once passId/session is ready.
// -----------------------------------------------------------------------------

// [PART 1] Imports
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import TopLoadingBar from "./TopLoadingBar";

type AuthGateProps = {
  children: React.ReactNode;
};

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL || "https://mina-editorial-ai-api.onrender.com";

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

function normalizeEmail(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  return e || null;
}

// --------------------
// PassId generation fallback
// --------------------
function generateLocalPassId(): string {
  let id = "";
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      id = crypto.randomUUID();
    }
  } catch {}
  if (!id) {
    id = `${Date.now()}_${Math.random().toString(16).slice(2)}${Math.random()
      .toString(16)
      .slice(2)}`;
  }
  return `pass:anon:${id}`;
}

function normalizePassId(raw?: string | null): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  if (s.startsWith("pass:")) return s;
  return `pass:anon:${s}`;
}

function readStoredPassId(): string | null {
  return normalizePassId(lsGet(PASS_ID_STORAGE_KEY));
}

function persistPassIdLocal(passId: string) {
  const norm = normalizePassId(passId) || generateLocalPassId();
  lsSet(PASS_ID_STORAGE_KEY, norm);
}

// --------------------
// Auth callback helpers
// --------------------
type AuthCallbackParams = {
  code: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;

  // Supabase can also return implicit tokens in the hash (older flows)
  accessToken: string | null;
  refreshToken: string | null;

  hasCallbackParams: boolean;
};

/**
 * Supabase may append params in query OR hash.
 * We support:
 * - ?code=...
 * - ?error=...&error_code=...&error_description=...
 * - #access_token=...&refresh_token=... (older/implicit flows)
 * - #error=...&error_code=...&error_description=...
 */
function readAuthCallbackParams(): AuthCallbackParams {
  try {
    if (typeof window === "undefined") {
      return {
        code: null,
        error: null,
        errorCode: null,
        errorDescription: null,
        accessToken: null,
        refreshToken: null,
        hasCallbackParams: false,
      };
    }

    const url = new URL(window.location.href);

    // Query params
    const q = url.searchParams;

    // Hash params ONLY if it looks like key=value&key=value (not hash-router "#/route")
    const rawHash = url.hash?.startsWith("#") ? url.hash.slice(1) : "";
    const hashLooksLikeParams = rawHash.includes("=") && !rawHash.startsWith("/");
    const h = hashLooksLikeParams ? new URLSearchParams(rawHash) : null;

    const get = (k: string) => q.get(k) ?? h?.get(k) ?? null;

    const code = get("code");
    const error = get("error");
    const errorCode = get("error_code");
    const errorDescription = get("error_description");

    const accessToken = get("access_token");
    const refreshToken = get("refresh_token");

    const hasCallbackParams = !!(
      code ||
      error ||
      errorCode ||
      errorDescription ||
      accessToken ||
      refreshToken
    );

    return {
      code,
      error,
      errorCode,
      errorDescription,
      accessToken,
      refreshToken,
      hasCallbackParams,
    };
  } catch {
    return {
      code: null,
      error: null,
      errorCode: null,
      errorDescription: null,
      accessToken: null,
      refreshToken: null,
      hasCallbackParams: false,
    };
  }
}

/**
 * ✅ Why we clear callback params:
 * - If we keep them, Supabase + your app can re-process the callback on refresh,
 *   causing loops + confusing state.
 * - We DO NOT hide errors: we read + store them in state first (authCallbackError).
 */
function clearAuthCallbackParamsFromUrl() {
  try {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);

    // Remove from query + hash
    const keys = [
      "code",
      "error",
      "error_code",
      "error_description",

      // implicit tokens / extra supabase params that may appear
      "access_token",
      "refresh_token",
      "expires_in",
      "expires_at",
      "token_type",
      "provider_token",
      "provider_refresh_token",
      "type",
    ];

    // query
    keys.forEach((k) => url.searchParams.delete(k));

    // hash only if it looks like params (not "#/route")
    const rawHash = url.hash?.startsWith("#") ? url.hash.slice(1) : "";
    const hashLooksLikeParams = rawHash.includes("=") && !rawHash.startsWith("/");
    if (hashLooksLikeParams) {
      const hp = new URLSearchParams(rawHash);
      keys.forEach((k) => hp.delete(k));
      const rest = hp.toString();
      url.hash = rest ? `#${rest}` : "";
    }

    window.history.replaceState({}, document.title, url.toString());
  } catch {
    // ignore
  }
}

function formatAuthCallbackError(p: AuthCallbackParams): string {
  const desc = (p.errorDescription || "").replace(/\+/g, " ").trim();
  const code = (p.errorCode || "").trim();
  const err = (p.error || "").trim();

  // Nice special-case for your reported issue
  if (code === "flow_state_not_found") {
    return "Sign-in session expired (flow state not found). Please try logging in again.";
  }

  if (desc) return desc;
  if (code) return `Sign-in failed (${code}).`;
  if (err) return `Sign-in failed (${err}).`;
  return "Sign-in failed. Please try again.";
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
 * ✅ MMA/MEGA way (NO /me):
 * Use your existing endpoint:
 *   POST /auth/shopify-sync
 *
 * That endpoint verifies the Bearer token server-side via getAuthUser().
 * - If token valid -> returns { ok:true, loggedIn:true, passId: "pass:user:<uid>" }
 * - If token missing/invalid -> returns { ok:true, loggedIn:false }
 *
 * This is the actual verification, not /me.
 */
async function ensurePassIdViaBackend(existingPassId?: string | null): Promise<string | null> {
  const existing = existingPassId?.trim() || null;
  if (!API_BASE_URL) return existing;

  const token = await getSupabaseAccessToken();
  // No token => not logged in => nothing to verify. Use local passId.
  if (!token) return existing;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token.trim()}`,
  };

  if (existing) headers["X-Mina-Pass-Id"] = existing;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/shopify-sync`, {
      method: "POST",
      headers,
      body: JSON.stringify({}), // endpoint doesn't need body
      credentials: "omit",
    });

    const json = (await res.json().catch(() => ({} as any))) as any;

    // First: JSON passId
    const nextRaw =
      typeof json?.passId === "string"
        ? json.passId
        : typeof json?.pass_id === "string"
        ? json.pass_id
        : null;

    // Second: header (your server sets X-Mina-Pass-Id)
    const headerPid = res.headers.get("X-Mina-Pass-Id");

    const next = (nextRaw || headerPid || "").trim() || null;

    // If backend says not logged in, keep existing local id
    if (json?.loggedIn === false) return existing;

    return next || existing;
  } catch {
    return existing;
  }
}

// --------------------
// UI helpers (optional label)
// --------------------
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

  // ✅ OAuth callback guard state (prevents churn during redirect handling)
  const [handlingAuthCallback, setHandlingAuthCallback] = useState<boolean>(() => {
    const p = readAuthCallbackParams();
    return p.hasCallbackParams;
  });
  const [authCallbackError, setAuthCallbackError] = useState<string | null>(null);

  // optional stats
  const [newUsers, setNewUsers] = useState<number | null>(null);
  const displayedUsers = BASELINE_USERS + (newUsers ?? 0);
  const displayedUsersLabel = `${formatUserCount(displayedUsers)} curators use Mina`;

  /**
   * ✅ The only place we decide/repair passId.
   * Order:
   * 1) localStorage
   * 2) backend canonicalize/link ONLY when logged-in (via /auth/shopify-sync)
   * 3) local generation fallback (guaranteed)
   * 4) persist to localStorage
   */
  const refreshPassId = useCallback(
    async (
      userId?: string | null,
      userEmail?: string | null,
      opts?: { skipBackend?: boolean }
    ) => {
      const uid = (userId || "").trim() || null;
      const uemail = normalizeEmail(userEmail);

      // 1) local
      let candidate = readStoredPassId();

      // 2) backend canonicalize/link ONLY if logged in and allowed
      const shouldCallBackend = !!uid && !opts?.skipBackend;
      if (shouldCallBackend) {
        const canonical = await ensurePassIdViaBackend(candidate);
        candidate = canonical?.trim() || candidate;
      }

      // 3) guaranteed fallback
      const finalPid = candidate?.trim() ? candidate.trim() : generateLocalPassId();

      // 4) persist localStorage
      persistPassIdLocal(finalPid);

      // update state once (no stale comparisons)
      setPassId((prev) => (prev === finalPid ? prev : finalPid));

      // silence unused vars (kept for future linking logic if needed)
      void uemail;

      return finalPid;
    },
    []
  );

  // Mount app only when authenticated AND passId is ready
  const hasUserId = !!session?.user?.id;
  const hasPassId = typeof passId === "string" && passId.trim().length > 0;
  const isAuthed = hasUserId && hasPassId;

  const authLoading =
    initializing || loading || googleOpening || handlingAuthCallback || (hasUserId && !hasPassId);

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
        // ✅ Handle auth callback FIRST and do not churn storage/network while it’s happening.
        const cb = readAuthCallbackParams();
        if (cb.hasCallbackParams && mounted) {
          setHandlingAuthCallback(true);
          setAuthCallbackError(
            cb.error || cb.errorCode || cb.errorDescription ? formatAuthCallbackError(cb) : null
          );
        }

        // If we have a code param, exchange it explicitly before calling getSession()
        if (cb.code) {
          try {
            await supabase.auth.exchangeCodeForSession(cb.code);
          } catch (e: any) {
            if (mounted) {
              setAuthCallbackError(e?.message || "Failed to finish sign-in. Please try again.");
            }
          }
        }

        // Now safely read the session
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        const s = data.session ?? null;
        setSession(s);
        setAccessToken(s?.access_token || null);

        // ✅ Ensure we always have a local passId quickly (NO backend call here).
        const pidLocal = (readStoredPassId() || generateLocalPassId()).trim();
        persistPassIdLocal(pidLocal);
        setPassId((prev) => (prev === pidLocal ? prev : pidLocal));

        // ✅ If logged in, link/canonicalize passId via backend (MMA/MEGA way)
        // but NEVER while callback params are present.
        if (s?.user?.id && !cb.hasCallbackParams) {
          void refreshPassId(s.user.id, s.user.email ?? null, { skipBackend: false });
        }

        // ✅ Clean callback params so refresh doesn't re-trigger the flow
        if (cb.hasCallbackParams) {
          clearAuthCallbackParamsFromUrl();
        }
      } finally {
        if (mounted) {
          setHandlingAuthCallback(false);
          setInitializing(false);
          setGoogleOpening(false);
        }
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // IMPORTANT:
      // - Ignore INITIAL_SESSION because init() already set state safely.
      if (event === "INITIAL_SESSION") return;

      setSession(newSession ?? null);
      setAccessToken(newSession?.access_token || null);

      if (event === "SIGNED_OUT") {
        setEmail("");
        setOtpSent(false);
        setSentTo(null);
        setEmailMode(false);
        setError(null);

        // keep continuity (anon pass) — local only
        void refreshPassId(null, null, { skipBackend: true });
        return;
      }

      if (event === "SIGNED_IN") {
        void (async () => {
          const uid = newSession?.user?.id ?? null;
          const uemail = newSession?.user?.email ?? null;

          // ✅ Verified linking happens here through /auth/shopify-sync (Bearer token)
          await refreshPassId(uid, uemail, { skipBackend: false });
        })();
        return;
      }

      // Other events: refresh local pass quickly; backend only if not in callback mode
      const cb = readAuthCallbackParams();
      void refreshPassId(newSession?.user?.id ?? null, newSession?.user?.email ?? null, {
        skipBackend: cb.hasCallbackParams,
      });
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

    // Always ensure local passId exists before sending OTP
    const pid = (passId ?? readStoredPassId() ?? generateLocalPassId()).trim();
    persistPassIdLocal(pid);
    setPassId((prev) => (prev === pid ? prev : pid));

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
    // ✅ prevent double-starts
    if (googleOpening || loading || initializing || handlingAuthCallback) return;

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

  // ✅ During auth callback, DO NOT mount the app (avoid churn while Supabase settles)
  if (handlingAuthCallback) {
    return (
      <>
        <TopLoadingBar active />
        <div className="mina-auth-shell">
          <div className="mina-auth-left">
            <div className="mina-auth-card">
              <div className="mina-auth-actions">
                <div className="mina-auth-stack">
                  <div className="fade-overlay auth-panel auth-panel--check visible">
                    <p className="mina-auth-text">
                      Finishing sign-in…
                      {authCallbackError ? (
                        <>
                          <br />
                          <span style={{ display: "inline-block", marginTop: 10 }}>
                            <strong>{authCallbackError}</strong>
                          </span>
                        </>
                      ) : null}
                    </p>

                    {authCallbackError ? (
                      <button
                        type="button"
                        className="mina-auth-link mina-auth-main"
                        style={{ marginTop: 12 }}
                        onClick={() => {
                          clearAuthCallbackParamsFromUrl();
                          setHandlingAuthCallback(false);
                          setAuthCallbackError(null);
                          setGoogleOpening(false);
                        }}
                      >
                        Back to login
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="mina-auth-footer">
              {displayedUsersLabel}
              <a className="mina-auth-help" href="https://wa.me/971522177594" target="_blank" rel="noreferrer">
                Need help?
              </a>
            </div>
          </div>

          <div className="mina-auth-right" />
        </div>
      </>
    );
  }

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
              src="https://assets.faltastudio.com/Website%20Assets/Black_Logo_mina.svg"
              alt="Mina_logotype"
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
                      <button
                        type="button"
                        className="mina-auth-link mina-auth-main"
                        onClick={handleGoogleLogin}
                        disabled={googleOpening || loading || initializing || handlingAuthCallback}
                      >
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
                          disabled={loading || googleOpening}
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

          <div className="mina-auth-footer">
            {displayedUsersLabel}
            <a className="mina-auth-help" href="https://wa.me/971522177594" target="_blank" rel="noreferrer">
              Need help?
            </a>
          </div>
        </div>

        <div className="mina-auth-right" />
      </div>
    </>
  );
}

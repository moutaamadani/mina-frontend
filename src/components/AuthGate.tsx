// src/components/AuthGate.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type AuthGateProps = {
  children: React.ReactNode;
};

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL || "https://mina-editorial-ai-api.onrender.com";

// ✅ MEGA identity storage (single identity)
const PASS_ID_STORAGE_KEY = "minaPassId";

// ✅ MEGA table where you want Pass ID persisted (frontend read/write)
// ⚠️ Adjust these to match your actual schema!
const MEGA_CUSTOMERS_TABLE = "mega_customers";
const MEGA_COL_USER_ID = "mg_user_id";
const MEGA_COL_PASS_ID = "mg_pass_id";
const MEGA_COL_EMAIL = "mg_email";

// ✅ baseline: your “3,7k” starting point (set to what you want)
const BASELINE_USERS = 0;

const PassIdContext = React.createContext<string | null>(null);

export function usePassId(): string | null {
  return React.useContext(PassIdContext);
}

// ----------------------------------------------------------------------------
// Storage helpers
// ----------------------------------------------------------------------------
function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(key);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function readStoredPassId(): string | null {
  return safeLocalStorageGet(PASS_ID_STORAGE_KEY);
}

function persistPassId(passId: string) {
  safeLocalStorageSet(PASS_ID_STORAGE_KEY, passId);
}

// ----------------------------------------------------------------------------
// ID generation fallback (if backend /me is unavailable)
// ----------------------------------------------------------------------------
function generateLocalPassId(): string {
  try {
    // modern browsers
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  // fallback
  return `pass_${Date.now()}_${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

// ----------------------------------------------------------------------------
// Auth token helper
// ----------------------------------------------------------------------------
async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * ✅ MEGA canonical identity resolution (backend)
 * - If anonymous: backend issues/returns passId
 * - If logged in (JWT): backend links that auth user to the SAME passId
 * - We persist passId locally to keep continuity across reloads
 */
async function ensurePassIdViaBackend(existingPassId?: string | null): Promise<string | null> {
  if (!API_BASE_URL) return existingPassId ?? null;

  const token = await getSupabaseAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (existingPassId) headers["X-Mina-Pass-Id"] = existingPassId;

  try {
    const res = await fetch(`${API_BASE_URL}/me`, {
      method: "GET",
      headers,
      credentials: "include",
    });

    if (!res.ok) return existingPassId ?? null;

    const json = (await res.json().catch(() => ({} as any))) as any;
    const nextRaw =
      typeof json?.passId === "string"
        ? json.passId
        : typeof json?.pass_id === "string"
          ? json.pass_id
          : null;

    const next = nextRaw?.trim() || null;
    return next || (existingPassId ?? null);
  } catch {
    return existingPassId ?? null;
  }
}

// ----------------------------------------------------------------------------
// MEGA customers helpers (frontend read/write)
// ----------------------------------------------------------------------------
async function tryRestorePassIdFromMegaCustomers(opts: {
  userId?: string | null;
  email?: string | null;
}): Promise<string | null> {
  const { userId, email } = opts;

  try {
    // 1) best: restore by auth user id
    if (userId) {
      const { data, error } = await supabase
        .from(MEGA_CUSTOMERS_TABLE)
        .select(`${MEGA_COL_PASS_ID}`)
        .eq(MEGA_COL_USER_ID, userId)
        .limit(1)
        .maybeSingle();

      if (!error) {
        const pid = (data as any)?.[MEGA_COL_PASS_ID];
        if (typeof pid === "string" && pid.trim()) return pid.trim();
      }
    }

    // 2) fallback: restore by email (for old users if you stored email before user id)
    const cleanEmail = (email || "").trim().toLowerCase();
    if (cleanEmail) {
      const { data, error } = await supabase
        .from(MEGA_CUSTOMERS_TABLE)
        .select(`${MEGA_COL_PASS_ID}`)
        .eq(MEGA_COL_EMAIL, cleanEmail)
        .limit(1)
        .maybeSingle();

      if (!error) {
        const pid = (data as any)?.[MEGA_COL_PASS_ID];
        if (typeof pid === "string" && pid.trim()) return pid.trim();
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Store passId into mega_customers.
 * Works even if you DON'T have a unique constraint, by doing select -> update/insert fallback.
 * (Still recommended: UNIQUE(mg_user_id) for clean upserts.)
 */
async function persistPassIdToMegaCustomers(opts: {
  userId: string;
  email?: string | null;
  passId: string;
}) {
  const { userId, email, passId } = opts;
  const cleanEmail = (email || "").trim().toLowerCase();

  try {
    // Try clean upsert first (best if UNIQUE exists on mg_user_id)
    const { error: upsertError } = await supabase
      .from(MEGA_CUSTOMERS_TABLE)
      .upsert(
        {
          [MEGA_COL_USER_ID]: userId,
          [MEGA_COL_PASS_ID]: passId,
          ...(cleanEmail ? { [MEGA_COL_EMAIL]: cleanEmail } : {}),
        } as any,
        { onConflict: MEGA_COL_USER_ID }
      );

    if (!upsertError) return;
  } catch {
    // ignore and fallback
  }

  try {
    // Fallback: check existence -> update/insert
    const { data: existing, error: selErr } = await supabase
      .from(MEGA_CUSTOMERS_TABLE)
      .select("id")
      .eq(MEGA_COL_USER_ID, userId)
      .limit(1)
      .maybeSingle();

    if (!selErr && existing?.id) {
      await supabase
        .from(MEGA_CUSTOMERS_TABLE)
        .update(
          {
            [MEGA_COL_PASS_ID]: passId,
            ...(cleanEmail ? { [MEGA_COL_EMAIL]: cleanEmail } : {}),
          } as any
        )
        .eq("id", existing.id);
      return;
    }

    // No existing row: insert
    await supabase.from(MEGA_CUSTOMERS_TABLE).insert(
      {
        [MEGA_COL_USER_ID]: userId,
        [MEGA_COL_PASS_ID]: passId,
        ...(cleanEmail ? { [MEGA_COL_EMAIL]: cleanEmail } : {}),
      } as any
    );
  } catch {
    // ignore
  }
}

/**
 * Create / upsert a Shopify customer (lead) for email marketing.
 * - Non-blocking by design (short timeout).
 * - ✅ IMPORTANT: does NOT set app identity
 * - Optional: includes passId so backend can link Shopify id to MEGA_CUSTOMERS row
 */
async function syncShopifyWelcome(
  email: string | null | undefined,
  userId?: string,
  passId?: string | null,
  timeoutMs: number = 3500
): Promise<string | null> {
  const clean = (email || "").trim().toLowerCase();
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
    return null; // non-blocking
  } finally {
    window.clearTimeout(timeout);
  }
}

function getInboxHref(email: string | null): string {
  if (!email) return "mailto:";

  const parts = email.split("@");
  if (parts.length !== 2) return "mailto:";

  const domain = parts[1].toLowerCase();

  if (domain === "gmail.com") return "https://mail.google.com/mail/u/0/#inbox";

  if (["outlook.com", "hotmail.com", "live.com"].includes(domain)) {
    return "https://outlook.live.com/mail/0/inbox";
  }

  if (domain === "yahoo.com") {
    return "https://mail.yahoo.com/d/folders/1";
  }

  if (domain === "icloud.com" || domain.endsWith(".me.com") || domain.endsWith(".mac.com")) {
    return "https://www.icloud.com/mail";
  }

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

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Start from localStorage if it exists
  const [passId, setPassId] = useState<string | null>(() => readStoredPassId());

  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [emailMode, setEmailMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleOpening, setGoogleOpening] = useState(false);

  // ✅ this holds “new users count” coming from your API
  const [newUsers, setNewUsers] = useState<number | null>(null);

  // Keep if you want emergency bypass (otherwise delete)
  const [bypassForNow] = useState(false);

  const displayedUsers = BASELINE_USERS + (newUsers ?? 0);
  const displayedUsersLabel = `${formatUserCount(displayedUsers)} curators use Mina`;

  /**
   * ✅ Single function that guarantees passId exists (new + old users)
   * Order:
   * 1) localStorage
   * 2) MEGA table restore (if authed)
   * 3) backend /me (canonical/link)
   * 4) local generation fallback
   * 5) persist to mega_customers (if authed)
   */
  const refreshPassId = useCallback(
    async (userId?: string | null, userEmail?: string | null) => {
      // 1) local first
      let local = readStoredPassId();
      if (local && local !== passId) setPassId(local);

      // 2) restore from MEGA customers if logged in and no local
      if (!local && userId) {
        const restored = await tryRestorePassIdFromMegaCustomers({ userId, email: userEmail ?? null });
        if (restored) {
          persistPassId(restored);
          local = restored;
          if (restored !== passId) setPassId(restored);
        }
      }

      // 3) ask backend /me to canonicalize/link (may return same or new)
      const fromBackend = await ensurePassIdViaBackend(local);
      let finalPid = fromBackend || local;

      // 4) last fallback: generate locally (ensures EVERY user gets one at least once)
      if (!finalPid) {
        finalPid = generateLocalPassId();
      }

      // persist to local state/storage
      persistPassId(finalPid);
      if (finalPid !== passId) setPassId(finalPid);

      // 5) store in mega_customers (frontend write)
      if (userId) {
        void persistPassIdToMegaCustomers({
          userId,
          email: userEmail ?? null,
          passId: finalPid,
        });
      }

      return finalPid;
    },
    [passId]
  );

  // ✅ Children are always wrapped with passId context
  const gatedChildren = useMemo(
    () => <PassIdContext.Provider value={passId}>{children}</PassIdContext.Provider>,
    [children, passId]
  );

  // ✅ MEGA gating: ONLY mount children when we have a real supabase user id
  const hasUserId = !!session?.user?.id;
  const isAuthed = hasUserId || bypassForNow;

  // Session bootstrap + auth listener
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        const s = data.session ?? null;
        setSession(s);

        // Ensure passId exists (anon ok), and later links when JWT exists
        await refreshPassId(s?.user?.id ?? null, s?.user?.email ?? null);
      } finally {
        if (mounted) setInitializing(false);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession ?? null);

      if (event === "SIGNED_OUT") {
        setEmail("");
        setOtpSent(false);
        setSentTo(null);
        setEmailMode(false);
        setError(null);
        setGoogleOpening(false);

        // keep MEGA continuity: still ensure anon pass exists
        void refreshPassId(null, null);
        return;
      }

      if (event === "SIGNED_IN") {
        void (async () => {
          const uid = newSession?.user?.id ?? null;
          const uemail = newSession?.user?.email ?? null;

          const nextPassId = await refreshPassId(uid, uemail);

          // Optional: lead capture
          if (uemail) void syncShopifyWelcome(uemail, uid || undefined, nextPassId);
        })();
      } else {
        void refreshPassId(newSession?.user?.id ?? null, newSession?.user?.email ?? null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshPassId]);

  // Public stats (optional)
  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
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

  // ✅ Email OTP flow — lead capture WITHOUT setting identity
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

    // Ensure passId exists (anon), and sync lead
    const pid = await refreshPassId(null, trimmed);
    void syncShopifyWelcome(trimmed, undefined, pid);

    try {
      const { error: supaError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: window.location.origin,
        },
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

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleOpening(true);

    // Ensure passId exists before redirect
    void refreshPassId(session?.user?.id ?? null, session?.user?.email ?? null);

    try {
      const { error: supaError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (supaError) throw supaError;
    } catch (err: any) {
      setError(err?.message || "Failed to start Google login.");
      setGoogleOpening(false);
    }
  };

  // ✅ While we’re checking local session storage, don’t mount MinaApp yet
  if (initializing) {
    return (
      <div className="mina-auth-shell">
        <div className="mina-auth-left">
          <div className="mina-auth-brand">
            <img
              src="https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Minalogo.svg?v=1765367006"
              alt="Mina"
            />
          </div>
          <div className="mina-auth-card">
            <p className="mina-auth-text">Loading…</p>
          </div>

          <div className="mina-auth-footer">{displayedUsersLabel}</div>
        </div>
        <div className="mina-auth-right" />
      </div>
    );
  }

  // ✅ MinaApp (children) mounts ONLY when session.user.id exists
  if (isAuthed) {
    return gatedChildren;
  }

  const trimmed = email.trim();
  const hasEmail = trimmed.length > 0;
  const targetEmail = sentTo || (hasEmail ? trimmed : null);
  const inboxHref = getInboxHref(targetEmail);
  const openInNewTab = inboxHref.startsWith("http");

  const showBack = (emailMode && hasEmail) || otpSent;

  return (
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
  );
}

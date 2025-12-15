import React, { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type AuthGateProps = {
  children: React.ReactNode;
};

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

/**
 * Create / upsert a Shopify customer (lead) for email marketing.
 * - Non-blocking by design (short timeout).
 * - Returns shopifyCustomerId if backend provides it.
 */
async function syncShopifyWelcome(
  email: string | null | undefined,
  userId?: string,
  timeoutMs: number = 3500
): Promise<string | null> {
  const clean = (email || "").trim().toLowerCase();
  if (!API_BASE_URL || !clean) return null;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}/auth/shopify-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: clean, userId }),
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
async function syncSupabaseUserTables(params: {
  userId: string;
  email: string;
  shopifyCustomerId: string;
}) {
  const cleanEmail = (params.email || "").trim().toLowerCase();
  if (!cleanEmail || !params.userId || !params.shopifyCustomerId) return;

  const nowIso = new Date().toISOString();

  // 1) customers: PK appears to be shopify_customer_id (from your screenshot)
  await supabase
    .from("customers")
    .upsert(
      {
        shopify_customer_id: params.shopifyCustomerId,
        user_id: params.userId,     // uuid string is fine here
        email: cleanEmail,
        last_active: nowIso,
      },
      { onConflict: "shopify_customer_id" }
    );

  // 2) users_profile: PK appears to be id (text) = email (from your screenshot)
  await supabase
    .from("users_profile")
    .upsert(
      {
        id: cleanEmail,
        user_id: params.userId,     // NOTE: your column is text currently; better as uuid long-term
        email: cleanEmail,
        last_active: nowIso,
      },
      { onConflict: "id" }
    );
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

  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [emailMode, setEmailMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleOpening, setGoogleOpening] = useState(false);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);

  const [bypassForNow] = useState(false);

  // Session bootstrap + auth listener
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session ?? null);
      } finally {
        if (mounted) setInitializing(false);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);

      if (event === "SIGNED_OUT") {
        setEmail("");
        setOtpSent(false);
        setSentTo(null);
        setEmailMode(false);
        setError(null);
        setGoogleOpening(false);
        return;
      }

      // ✅ After successful auth, we can sync again with userId (better dedupe / linkage)
      if (event === "SIGNED_IN" && newSession?.user?.email) {
      const signedEmail = newSession.user.email;
      const userId = newSession.user.id;
    
      void (async () => {
        const shopifyCustomerId =
          (await syncShopifyWelcome(signedEmail, userId)) ||
          (() => {
            try {
              return window.localStorage.getItem("minaCustomerId") || signedEmail;
            } catch {
              return signedEmail;
            }
          })();
    
        // keep localStorage updated
        if (shopifyCustomerId && typeof window !== "undefined") {
          try {
            window.localStorage.setItem("minaCustomerId", shopifyCustomerId);
          } catch {
            // ignore
          }
        }
    
        // ✅ THIS is what fixes your NULL emails in Supabase tables
        await syncSupabaseUserTables({
          userId,
          email: signedEmail,
          shopifyCustomerId: shopifyCustomerId || signedEmail,
        });
      })();
    }

    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Public stats (optional)
  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/public/stats/total-users`);
        if (!res.ok) return;

        const json = await res.json().catch(() => ({} as any));
        if (!cancelled && json.ok && typeof json.totalUsers === "number" && json.totalUsers > 0) {
          setTotalUsers(json.totalUsers);
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

  // ✅ Email OTP flow — sync Shopify immediately on "Sign in" click (lead capture)
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

    // Fire-and-forget: create/upsert Shopify customer NOW (even if user never clicks magic link)
    void (async () => {
      const preShopifyId = await syncShopifyWelcome(trimmed, undefined);
      if (preShopifyId && typeof window !== "undefined") {
        try {
          window.localStorage.setItem("minaCustomerId", preShopifyId);
        } catch {
          // ignore
        }
      }
    })();

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

      // fallback (don’t overwrite a real Shopify id if it arrives)
      try {
        if (typeof window !== "undefined") {
          const existing = window.localStorage.getItem("minaCustomerId");
          if (!existing) window.localStorage.setItem("minaCustomerId", trimmed);
        }
      } catch {
        // ignore
      }
    } catch (err: any) {
      setError(err?.message || "Failed to send login link.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleOpening(true);
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
          <div className="mina-auth-footer">
            {totalUsers !== null
              ? `${formatUserCount(totalUsers)} creative using Mina`
              : "3,7k curators use Mina"}
          </div>
        </div>
        <div className="mina-auth-right" />
      </div>
    );
  }

  if (session || bypassForNow) {
    return <>{children}</>;
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
          <div
            className={
              showBack ? "mina-fade mina-auth-back-wrapper" : "mina-fade hidden mina-auth-back-wrapper"
            }
          >
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
                  <div
                    className={
                      "fade-overlay auth-panel auth-panel--google " + (emailMode ? "hidden" : "visible")
                    }
                  >
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

                  <div
                    className={
                      "fade-overlay auth-panel auth-panel--email " + (emailMode ? "visible" : "hidden")
                    }
                  >
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
                          We’ll email you a one-time link. If this address is new, that email will also confirm
                          your account.
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
                      We’ve sent a sign-in link to{" "}
                      {targetEmail ? <strong>{targetEmail}</strong> : "your inbox"}. Open it to continue with
                      Mina.
                    </p>
                  </div>
                </div>
              </div>

              {error && <div className="mina-auth-error">{error}</div>}
            </>
          )}
        </div>

        <div className="mina-auth-footer">
          {totalUsers !== null ? `${formatUserCount(totalUsers)} curators use Mina` : "curators use Mina"}
        </div>
      </div>
      <div className="mina-auth-right" />
    </div>
  );
}

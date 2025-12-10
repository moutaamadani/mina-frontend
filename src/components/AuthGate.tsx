// src/components/AuthGate.tsx
import React, { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type AuthGateProps = {
  children: React.ReactNode;
};

function openInboxFor(email: string | null) {
  if (typeof window === "undefined") return;

  if (!email) {
    window.open("https://mail.google.com", "_blank");
    return;
  }

  const parts = email.split("@");
  if (parts.length !== 2) {
    window.open("https://mail.google.com", "_blank");
    return;
  }

  const domain = parts[1].toLowerCase();

  if (domain === "gmail.com") {
    window.open("https://mail.google.com", "_blank");
    return;
  }

  if (["outlook.com", "hotmail.com", "live.com"].includes(domain)) {
    window.open("https://outlook.live.com", "_blank");
    return;
  }

  if (domain === "yahoo.com") {
    window.open("https://mail.yahoo.com", "_blank");
    return;
  }

  window.open(`mailto:${email}`, "_blank");
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const [emailMode, setEmailMode] = useState(false);

  // loading only for email flow
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bypassForNow] = useState(false);

  // load session
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setInitializing(false);
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
        setError(null);
        setEmailMode(false);
      }

      if (event === "SIGNED_IN" && newSession?.user?.email) {
        try {
          window.localStorage.setItem(
            "minaCustomerId",
            newSession.user.email
          );
        } catch {
          // ignore
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

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

      try {
        window.localStorage.setItem("minaCustomerId", trimmed);
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
    }
  };

  if (initializing) {
    return (
      <div className="mina-auth-shell">
        <div className="mina-auth-left">
          <div className="mina-auth-card">
            <p className="mina-auth-text">Loading…</p>
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

  // back appears when typing email or in check-email view
  const showBack = (emailMode && hasEmail) || otpSent;

  return (
    <div className="mina-auth-shell">
      <div className="mina-auth-left">
        <div className="mina-auth-card">
          {/* back icon – smooth fade, fixed vertical spacing */}
          <div
            className={
              showBack
                ? "fade-block mina-auth-back-wrapper"
                : "fade-block hidden mina-auth-back-wrapper"
            }
          >
            <button
              type="button"
              className="mina-auth-back"
              onClick={() => {
                if (otpSent) {
                  // back from check-email -> email form
                  setOtpSent(false);
                  setSentTo(null);
                  setError(null);
                  setEmailMode(true);
                } else {
                  // back from email form -> google hero
                  setEmailMode(false);
                  setEmail("");
                  setError(null);
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
              {/* main sign-in view */}
              <div className="mina-auth-actions">
                <div className="mina-auth-stack">
                  {/* Panel 1 – hero + use email (initial slide/fade in) */}
                  <div
                    className={
                      emailMode
                        ? "fade-overlay hidden initial"
                        : "fade-overlay initial"
                    }
                  >
                    <button
                      type="button"
                      className="mina-auth-link mina-auth-main"
                      onClick={handleGoogleLogin}
                    >
                      Login with Google
                    </button>

                    <div style={{ marginTop: "8px" }}>
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

                  {/* Panel 2 – email field + sign in + hint (slides from bottom) */}
                  <div
                    className={
                      emailMode
                        ? "fade-overlay email-panel"
                        : "fade-overlay email-panel hidden"
                    }
                  >
                    <form
                      onSubmit={handleEmailLogin}
                      className="mina-auth-form"
                    >
                      <label className="mina-auth-label">
                        <input
                          className="mina-auth-input"
                          type="email"
                          placeholder="Type email here"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </label>

                      {/* sign-in + hint appear together, just opacity (no movement) */}
                      <div
                        className={
                          hasEmail ? "fade-block delay" : "fade-block hidden"
                        }
                      >
                        <button
                          type="submit"
                          className="mina-auth-link mina-auth-main small"
                          disabled={loading || !hasEmail}
                        >
                          {loading ? "Sending link…" : "Sign in"}
                        </button>
                      </div>

                      <div
                        className={
                          hasEmail ? "fade-block delay" : "fade-block hidden"
                        }
                      >
                        <p className="mina-auth-hint">
                          We’ll email you a one-time link. If this address is
                          new, that email will also confirm your account.
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
              {/* check-email view: hero = Open email app */}
              <div className="mina-auth-actions">
                <div className="fade-block">
                  <button
                    type="button"
                    className="mina-auth-link mina-auth-main"
                    onClick={() => openInboxFor(targetEmail)}
                  >
                    Open email app
                  </button>
                </div>

                <div className="fade-block delay">
                  <p className="mina-auth-text">
                    We’ve sent a sign-in link to{" "}
                    {targetEmail ? <strong>{targetEmail}</strong> : "your inbox"}
                    . Open it to continue with Mina.
                  </p>
                </div>
              </div>

              {error && <div className="mina-auth-error">{error}</div>}
            </>
          )}
        </div>
      </div>
      <div className="mina-auth-right" />
    </div>
  );
}

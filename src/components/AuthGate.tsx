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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleOpening, setGoogleOpening] = useState(false);

  const [bypassForNow] = useState(false);

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
        setGoogleOpening(false);
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
    setGoogleOpening(true);
    try {
      const { error: supaError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (supaError) throw supaError;
      // on success browser redirects away
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
          <div className="mina-auth-footer">Total users: 0</div>
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

  // back appears in email mode (with text) and in check-email
  const showBack = (emailMode && hasEmail) || otpSent;

  return (
    <div className="mina-auth-shell">
      <div className="mina-auth-left">
        {/* logo top-left */}
        <div className="mina-auth-brand">
          <img
            src="https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Minalogo.svg?v=1765367006"
            alt="Mina"
          />
        </div>

        <div className="mina-auth-card">
          {/* back icon */}
          <div
            className={
              showBack
                ? "mina-fade mina-auth-back-wrapper"
                : "mina-fade hidden mina-auth-back-wrapper"
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
              {/* Google hero + email form share same baseline */}
              <div className="mina-auth-actions">
                <div className="mina-auth-stack">
                  {/* Google hero panel */}
                  <div
                    className={
                      "fade-overlay auth-panel auth-panel--google " +
                      (emailMode ? "hidden" : "visible")
                    }
                  >
                    <button
                      type="button"
                      className="mina-auth-link mina-auth-main"
                      onClick={handleGoogleLogin}
                    >
                      {googleOpening ? "Opening Google…" : "Login with Google"}
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

                  {/* Email panel – comes from bottom, same line */}
                  <div
                    className={
                      "fade-overlay auth-panel auth-panel--email " +
                      (emailMode ? "visible" : "hidden")
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
              {/* Check email state, same baseline */}
              <div className="mina-auth-actions">
                <div className="mina-auth-stack">
                  <div className="fade-overlay auth-panel auth-panel--check visible">
                    <button
                      type="button"
                      className="mina-auth-link mina-auth-main"
                      onClick={() => openInboxFor(targetEmail)}
                    >
                      Open email app
                    </button>
                    <p className="mina-auth-text" style={{ marginTop: 8 }}>
                      We’ve sent a sign-in link to{" "}
                      {targetEmail ? <strong>{targetEmail}</strong> : "your inbox"}
                      . Open it to continue with Mina.
                    </p>
                  </div>
                </div>
              </div>

              {error && <div className="mina-auth-error">{error}</div>}
            </>
          )}
        </div>

        {/* bottom-left copy */}
        <div className="mina-auth-footer">Total users: 0</div>
      </div>
      <div className="mina-auth-right" />
    </div>
  );
}

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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // kept for dev/admin if ever needed, but no button in UI now
  const [bypassForNow, setBypassForNow] = useState(false);

  // Load existing session
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
        setBypassForNow(false);
        setOtpSent(false);
        setSentTo(null);
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
    setLoading(true);
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
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <div className="mina-auth-shell">
        <div className="mina-auth-left">
          <div className="mina-auth-card">
            <div className="mina-auth-logo">MINA · Editorial AI</div>
            <h2 className="mina-auth-title">Preparing Mina</h2>
            <p className="mina-auth-text">Just a moment…</p>
          </div>
        </div>
        <div className="mina-auth-right" />
      </div>
    );
  }

  if (session || bypassForNow) {
    return <>{children}</>;
  }

  const targetEmail = sentTo || email.trim() || null;

  return (
    <div className="mina-auth-shell">
      <div className="mina-auth-left">
        <div className="mina-auth-card">
          <div className="mina-auth-logo">MINA · Editorial AI</div>

          {!otpSent ? (
            <>
              <h2 className="mina-auth-title">Sign in</h2>
              <p className="mina-auth-text">
                Use your Google account or email to work with Mina.
              </p>

              <div className="mina-auth-actions">
                <button
                  type="button"
                  className="mina-auth-btn primary"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                >
                  {loading ? "Opening Google…" : "Login with Google"}
                </button>
              </div>

              <p className="mina-auth-or">or sign in with email</p>

              <form onSubmit={handleEmailLogin} className="mina-auth-form">
                <label className="mina-auth-label">
                  <span>Email</span>
                  <input
                    className="mina-auth-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                <button
                  type="submit"
                  className="mina-auth-btn secondary"
                  disabled={loading || !email.trim()}
                >
                  {loading ? "Sending link…" : "Send login link"}
                </button>
              </form>

              {error && <div className="mina-auth-error">{error}</div>}

              <p className="mina-auth-hint">
                We’ll email you a one-time link. If this address is new, that
                email will also confirm your account.
              </p>
            </>
          ) : (
            <>
              <h2 className="mina-auth-title">Check your email</h2>
              <p className="mina-auth-text">
                We’ve sent a sign-in link to{" "}
                {targetEmail ? <strong>{targetEmail}</strong> : "your inbox"}.
                Open it to confirm your email and continue with Mina.
              </p>

              <div className="mina-auth-actions">
                <button
                  type="button"
                  className="mina-auth-btn primary"
                  onClick={() => openInboxFor(targetEmail)}
                >
                  Open email app
                </button>

                <button
                  type="button"
                  className="mina-auth-btn ghost"
                  onClick={() => {
                    setOtpSent(false);
                    setSentTo(null);
                    setError(null);
                  }}
                >
                  Use a different email
                </button>
              </div>

              {error && <div className="mina-auth-error">{error}</div>}

              <p className="mina-auth-hint">
                If you can’t see the message, check Spam or Promotions.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mina-auth-right" />
    </div>
  );
}

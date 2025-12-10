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
        <div className="mina-auth-card">
          <div className="mina-auth-title">Mina</div>
          <p className="mina-auth-text">Loading…</p>
        </div>
      </div>
    );
  }

  if (session || bypassForNow) {
    return <>{children}</>;
  }

  return (
    <div className="mina-auth-shell">
      <div className="mina-auth-card">
        <div className="mina-auth-logo">MINA · Editorial AI</div>

        {!otpSent ? (
          <>
            <h2 className="mina-auth-title">Welcome back</h2>
            <p className="mina-auth-text">
              Sign in with Google or email to start creating with Mina.
            </p>

            <div className="mina-auth-actions">
              <button
                type="button"
                className="mina-auth-btn primary wide"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                Continue with Google
              </button>
            </div>

            <div className="mina-auth-separator">
              <span />
              <span>or</span>
              <span />
            </div>

            <form onSubmit={handleEmailLogin} className="mina-auth-form">
              <label className="mina-auth-label">
                Email
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
                className="mina-auth-btn secondary wide"
                disabled={loading || !email.trim()}
              >
                {loading ? "Sending link…" : "Send magic link"}
              </button>
            </form>

            {error && <div className="mina-auth-error">{error}</div>}

            <p className="mina-auth-hint">
              You’ll receive a one-time link to sign in. No password needed.
            </p>
          </>
        ) : (
          <>
            <h2 className="mina-auth-title">Check your email ✨</h2>
            <p className="mina-auth-text">
              We sent a sign-in link to{" "}
              <strong>{sentTo || email.trim()}</strong>.
              <br />
              Open your inbox and click the link. If you don’t see it, check
              Spam or Promotions.
            </p>

            <div className="mina-auth-actions">
              <button
                type="button"
                className="mina-auth-btn primary wide"
                onClick={() => openInboxFor(sentTo || email.trim())}
              >
                Open email app
              </button>

              <button
                type="button"
                className="mina-auth-btn secondary wide"
                onClick={() => setBypassForNow(true)}
              >
                Continue to Mina now
              </button>

              <button
                type="button"
                className="mina-auth-btn ghost wide"
                onClick={() => {
                  setOtpSent(false);
                  setSentTo(null);
                }}
              >
                Use a different email
              </button>
            </div>

            {error && <div className="mina-auth-error">{error}</div>}

            <p className="mina-auth-hint">
              You can confirm your email later from the message we sent.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

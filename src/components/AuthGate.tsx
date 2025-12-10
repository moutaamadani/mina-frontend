import { useEffect, useState } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "../lib/supabaseClient";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) Load current session from localStorage
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    // 2) Listen for login / logout changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <span>Mina is loading…</span>
      </div>
    );
  }

  // Not logged in → show beautiful auth UI
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black px-4">
        <div className="w-full max-w-md rounded-3xl bg-zinc-950/80 border border-zinc-800 p-6 shadow-xl">
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-full bg-pink-500" />
            <h1 className="text-white text-xl font-semibold">Welcome to Mina</h1>
            <p className="text-zinc-400 text-sm text-center">
              Sign in with Google, Apple or email. We’ll keep you logged in for a smooth, Pinterest-style experience.
            </p>
          </div>

          <Auth
            supabaseClient={supabase}
            // email + password + passwordless + OTP, all handled by Supabase
            providers={["google"]}
            appearance={{
              theme: ThemeSupa,
              className: {
                container: "gap-3",
              },
            }}
            localization={{
              variables: {
                sign_in: {
                  email_label: "Work email",
                  password_label: "Password",
                },
                sign_up: {
                  email_label: "Work email",
                  password_label: "Set a password",
                },
              },
            }}
          />
          <p className="text-xs text-zinc-500 mt-4 text-center">
            By continuing, you agree to Mina’s terms and privacy policy.
          </p>
        </div>
      </div>
    );
  }

  // Logged in → show the actual app
  return <>{children}</>;
}

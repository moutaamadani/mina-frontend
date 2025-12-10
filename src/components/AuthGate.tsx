import React, { ReactNode, useEffect, useState } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./lib/supabaseClient";

interface AuthGateProps {
  children: ReactNode;
}

const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        setSession(data.session);
      }
      setLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Small loading state while we ask Supabase for the session
  if (loading) {
    return (
      <div className="mina-auth-shell">
        <div className="mina-auth-card">
          <div className="mina-auth-header">
            <h1>Mina</h1>
            <p>Loading your studio…</p>
          </div>
        </div>
      </div>
    );
  }

  // Not logged in → show pretty auth screen
  if (!session) {
    return (
      <div className="mina-auth-shell">
        <div className="mina-auth-card">
          <div className="mina-auth-header">
            <h1>Welcome to Mina</h1>
            <p>
              Sign in with Google or email. We&rsquo;ll keep you logged in for a
              smooth, Pinterest-style experience.
            </p>
          </div>

          <Auth
            supabaseClient={supabase}
            providers={["google"]}
            magicLink={false}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: "#00C37A",
                    brandAccent: "#00A366",
                    inputBorder: "#DDD7B8",
                    inputBackground: "#FCFAF0",
                    inputText: "#141307",
                    messageText: "#635C3A",
                  },
                  radii: {
                    borderRadiusButton: "999px",
                    borderRadiusInput: "999px",
                  },
                },
              },
            }}
            localization={{
              variables: {
                sign_in: {
                  email_label: "Work email",
                  password_label: "Password",
                  button_label: "Sign in",
                },
                sign_up: {
                  email_label: "Work email",
                  password_label: "Create a password",
                  button_label: "Create account",
                },
              },
            }}
          />

          <p className="mina-auth-footer">
            By continuing, you agree to Mina&rsquo;s terms and privacy policy.
          </p>
        </div>
      </div>
    );
  }

  // Logged in → show real Mina app
  return <>{children}</>;
};

export default AuthGate;

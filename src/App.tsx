import React, { useEffect, useState } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import MinaApp from "./MinaApp";

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get current session on first load
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    // Listen to login / logout changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080A00",
          color: "#EEEED2",
        }}
      >
        Checking your session…
      </div>
    );
  }

  // Not logged in → show Supabase Auth (Google + email)
  if (!session) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080A00",
          color: "#EEEED2",
          padding: 16,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#11130b",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 18px 45px rgba(0,0,0,0.6)",
          }}
        >
          <h1 style={{ marginBottom: 8, fontSize: 24 }}>
            MINA · Editorial AI
          </h1>
          <p
            style={{
              marginBottom: 16,
              fontSize: 14,
              opacity: 0.8,
            }}
          >
            Sign in with Google or email to start creating editorial stills
            and motion.
          </p>

          <Auth
            supabaseClient={supabase}
            providers={["google"]}
            magicLink={true}
            appearance={{ theme: ThemeSupa }}
          />
        </div>
      </div>
    );
  }

  // Logged in → figure out which customerId to use
  const user = session.user;

  // Prefer Shopify ?customerId= in URL if present, else Supabase user id
  let initialCustomerId = user.id;
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("customerId");
    if (fromUrl && fromUrl.trim().length > 0) {
      initialCustomerId = fromUrl.trim();
    }
  } catch {
    // ignore
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <MinaApp
      initialCustomerId={initialCustomerId}
      onSignOut={handleSignOut}
    />
  );
};

export default App;

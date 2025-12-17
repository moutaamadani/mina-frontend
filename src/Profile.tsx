import React from "react";
import { supabase } from "./lib/supabaseClient";

const PASS_ID_STORAGE_KEY = "minaPassId";

export default function Profile() {
  const handleLogout = async () => {
    try {
      // ✅ Proper Supabase logout
      await supabase.auth.signOut();
    } catch {
      // ignore
    }

    // Optional: clear your local passId too
    try {
      localStorage.removeItem(PASS_ID_STORAGE_KEY);
    } catch {}

    // Go back to AuthGate (login screen)
    window.location.href = "/";
  };

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>Profile</h1>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      <div style={{ marginTop: 16 }}>Profile coming soon.</div>
    </div>
  );
}

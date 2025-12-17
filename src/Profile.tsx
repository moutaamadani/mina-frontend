import React from "react";
import { supabase } from "../lib/supabaseClient"; // adjust path if needed

export default function Profile() {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      // clear your app-only state (optional)
      localStorage.removeItem("minaPassId"); // optional: remove pass id if you want a fresh identity
      window.location.href = "/"; // or wherever your AuthGate lives
    }
  };

  return (
    <div style={{ padding: 100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
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

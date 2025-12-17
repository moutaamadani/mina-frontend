import React from "react";

export default function Profile() {
  const handleLogout = async () => {
    try {
      // Best-effort server logout (safe to remove if you don't have this endpoint)
      const token =
        localStorage.getItem("token") || localStorage.getItem("accessToken");

      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }).catch(() => {});
      }
    } finally {
      // Client-side logout cleanup
      ["token", "accessToken", "refreshToken", "user", "auth"].forEach((k) =>
        localStorage.removeItem(k)
      );
      sessionStorage.clear();

      // Redirect to login (change if your route is different)
      window.location.href = "/login";
    }
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

import React, { useEffect, useState } from "react";

const API_BASE =
  import.meta.env.VITE_MINA_API_BASE ||
  "https://mina-editorial-ai-api.onrender.com";

export default function App() {
  const [status, setStatus] = useState("Checking Mina backend…");
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${API_BASE}/health`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        setHealth(json);
        setStatus("Mina backend is online ✅");
      } catch (err) {
        console.error("Health check failed:", err);
        setError(String(err.message || err));
        setStatus("Mina backend is unreachable ❌");
      }
    }

    checkHealth();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #262347 0, #05050a 55%, #000000 100%)",
        color: "#f5f5f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "720px",
          width: "100%",
          borderRadius: "24px",
          padding: "24px 24px 20px",
          border: "1px solid rgba(255,255,255,0.04)",
          background:
            "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.75))",
          boxShadow:
            "0 18px 60px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background:
                "conic-gradient(from 180deg, #ff9c6a, #f472b6, #4f46e5, #22c55e, #ff9c6a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 1,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                background: "#05050a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              M
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity: 0.9,
              }}
            >
              Mina Editorial AI
            </div>
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                opacity: 0.6,
              }}
            >
              Falta Studio
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 14, opacity: 0.85 }}>
          {status}
        </div>

        {health && (
          <pre
            style={{
              marginTop: 16,
              fontSize: 12,
              padding: 12,
              borderRadius: 12,
              background: "rgba(5,5,15,0.9)",
              border: "1px solid rgba(255,255,255,0.05)",
              overflowX: "auto",
            }}
          >
{JSON.stringify(health, null, 2)}
          </pre>
        )}

        {error && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "#f97373",
              opacity: 0.9,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: 24,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            opacity: 0.55,
          }}
        >
          Next: workspace UI, credits badge, login, admin.
        </div>
      </div>
    </div>
  );
}

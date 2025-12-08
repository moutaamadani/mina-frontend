import React, { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_MINA_API_BASE_URL || "https://mina-editorial-ai-api.onrender.com").replace(/\/$/, "");
const DEMO_CUSTOMER_ID = import.meta.env.VITE_MINA_DEMO_CUSTOMER_ID || "demo-customer-001";

export default function App() {
  const [healthStatus, setHealthStatus] = useState("Checking Mina backend…");
  const [healthError, setHealthError] = useState("");
  const [healthDetails, setHealthDetails] = useState(null);

  const [credits, setCredits] = useState(null);
  const [creditsStatus, setCreditsStatus] = useState("Fetching credits…");
  const [creditsError, setCreditsError] = useState("");

  const cardStyle = useMemo(
    () => ({
      maxWidth: "780px",
      width: "100%",
      borderRadius: "28px",
      padding: "28px 28px 24px",
      border: "1px solid rgba(255,255,255,0.04)",
      background:
        "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(0,0,0,0.72))",
      boxShadow:
        "0 20px 70px rgba(0,0,0,0.88), 0 0 0 1px rgba(255,255,255,0.02)",
    }),
    []
  );

  useEffect(() => {
    async function load() {
      await checkHealth();
      await fetchCredits();
    }
    load();
  }, []);

  async function checkHealth() {
    try {
      setHealthStatus("Checking Mina backend…");
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setHealthDetails(json);
      setHealthStatus("Mina backend is online ✅");
      setHealthError("");
    } catch (err) {
      console.error("Health check failed:", err);
      setHealthStatus("Mina backend is unreachable ❌");
      setHealthError(String(err.message || err));
    }
  }

  async function fetchCredits() {
    try {
      setCreditsStatus("Fetching credits…");
      setCreditsError("");
      const res = await fetch(
        `${API_BASE}/credits/balance?customerId=${encodeURIComponent(DEMO_CUSTOMER_ID)}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setCredits(json);
      setCreditsStatus("Credits loaded ✅");
    } catch (err) {
      console.error("Credits fetch failed:", err);
      setCreditsStatus("Could not load credits ❌");
      setCreditsError(String(err.message || err));
    }
  }

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
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: 40,
              height: 40,
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
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              M
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                opacity: 0.95,
              }}
            >
              Mina Editorial AI
            </div>
            <div
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                opacity: 0.65,
              }}
            >
              Falta Studio
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                opacity: 0.6,
              }}
            >
              Demo customer
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 12,
              }}
            >
              <span style={{ opacity: 0.7 }}>ID:</span>
              <code style={{ fontSize: 12 }}>{DEMO_CUSTOMER_ID}</code>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, display: "grid", gap: 18 }}>
          <div
            style={{
              padding: "16px 14px",
              borderRadius: 16,
              background: "rgba(5,5,15,0.9)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: "0.12em", opacity: 0.65 }}>
              Backend status
            </div>
            <div style={{ marginTop: 6, fontSize: 15 }}>{healthStatus}</div>
            {healthDetails && (
              <pre
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(healthDetails, null, 2)}
              </pre>
            )}
            {healthError && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#f97373" }}>
                {healthError}
              </div>
            )}
          </div>

          <div
            style={{
              padding: "16px 14px",
              borderRadius: 16,
              background: "rgba(5,5,15,0.9)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    opacity: 0.65,
                  }}
                >
                  Credits
                </div>
                <div style={{ marginTop: 6, fontSize: 15 }}>{creditsStatus}</div>
              </div>
              <div
                style={{
                  minWidth: 120,
                  display: "inline-flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: 999,
                  background: "rgba(76,175,80,0.14)",
                  border: "1px solid rgba(76,175,80,0.4)",
                  color: "#b9f6ca",
                  fontWeight: 600,
                }}
              >
                <span style={{ opacity: 0.8 }}>Balance</span>
                <span style={{ fontSize: 18 }}>
                  {credits?.balance ?? "—"}
                </span>
              </div>
            </div>

            {credits && (
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                <span>
                  Image cost: <strong>{credits?.meta?.imageCost ?? "?"}</strong>
                </span>
                <span>
                  Motion cost: <strong>{credits?.meta?.motionCost ?? "?"}</strong>
                </span>
                <span>
                  History entries: <strong>{credits?.historyLength ?? "0"}</strong>
                </span>
              </div>
            )}
            {creditsError && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#f97373" }}>
                {creditsError}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              opacity: 0.55,
              lineHeight: 1.6,
            }}
          >
            Next: workspace UI, credits badge, login, admin.
          </div>
          <div style={{ fontSize: 11, opacity: 0.5 }}>
            API base: <code>{API_BASE}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

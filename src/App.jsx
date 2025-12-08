import React, { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_MINA_API_BASE_URL || "https://mina-editorial-ai-api.onrender.com").replace(/\/$/, "");
const DEMO_CUSTOMER_ID = import.meta.env.VITE_MINA_DEMO_CUSTOMER_ID || "demo-customer-001";
const STYLE_PRESETS = [
  "soft-desert-editorial",
  "chrome-neon-night",
  "bathroom-ritual",
  "future-lab-sterile",
  "earthy-atelier",
  "minimal-studio",
];

const SECTION_CARD_STYLE = {
  padding: "16px 14px",
  borderRadius: 16,
  background: "rgba(5,5,15,0.9)",
  border: "1px solid rgba(255,255,255,0.05)",
};

export default function App() {
  const [healthStatus, setHealthStatus] = useState("Checking Mina backend…");
  const [healthError, setHealthError] = useState("");
  const [healthDetails, setHealthDetails] = useState(null);

  const [credits, setCredits] = useState(null);
  const [creditsStatus, setCreditsStatus] = useState("Fetching credits…");
  const [creditsError, setCreditsError] = useState("");

  const [customerIdInput, setCustomerIdInput] = useState(
    localStorage.getItem("mina-customer-id") || DEMO_CUSTOMER_ID
  );
  const [customerId, setCustomerId] = useState(
    localStorage.getItem("mina-customer-id") || DEMO_CUSTOMER_ID
  );
  const [sessionId, setSessionId] = useState("");

  const [form, setForm] = useState({
    productImageUrl: "",
    styleImageUrls: ["", "", ""],
    brief: "", 
    tone: "luxury, calm", 
    platform: "tiktok", 
    stylePresetKey: STYLE_PRESETS[0],
    minaVisionEnabled: true,
  });

  const [generationStatus, setGenerationStatus] = useState("");
  const [generationError, setGenerationError] = useState("");
  const [latestImages, setLatestImages] = useState([]);
  const [latestPrompt, setLatestPrompt] = useState("");
  const [latestGenerationId, setLatestGenerationId] = useState("");

  const [feedbackComment, setFeedbackComment] = useState("");

  const [motionIdea, setMotionIdea] = useState("");
  const [motionStatus, setMotionStatus] = useState("");
  const [motionError, setMotionError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [motionFeedbackComment, setMotionFeedbackComment] = useState("");

  const cardStyle = useMemo(
    () => ({
      maxWidth: "1200px",
      width: "100%",
      borderRadius: "28px",
      padding: "24px",
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
      await fetchCredits(customerId);
    }
    load();
  }, [customerId]);

  useEffect(() => {
    localStorage.setItem("mina-customer-id", customerId);
  }, [customerId]);

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

  async function fetchCredits(id) {
    if (!id) return;
    try {
      setCreditsStatus("Fetching credits…");
      setCreditsError("");
      const res = await fetch(
        `${API_BASE}/credits/balance?customerId=${encodeURIComponent(id)}`
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

  const creditsInsufficient = useMemo(() => {
    if (!credits?.balance || !credits?.meta) return false;
    return credits.balance < credits.meta.imageCost;
  }, [credits]);

  function updateStyleImageUrl(index, value) {
    const copy = [...form.styleImageUrls];
    copy[index] = value;
    setForm({ ...form, styleImageUrls: copy });
  }

  async function ensureSession() {
    if (sessionId) return sessionId;
    const body = {
      customerId,
      platform: form.platform,
      title: `Session ${new Date().toLocaleString()}`,
    };
    const res = await fetch(`${API_BASE}/sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Session HTTP ${res.status}`);
    }
    const json = await res.json();
    setSessionId(json.sessionId);
    return json.sessionId;
  }

  async function handleGenerateStill(e) {
    e.preventDefault();
    setGenerationError("");
    setGenerationStatus("Starting…");

    if (!form.productImageUrl && !form.brief) {
      setGenerationError("Add a product image URL or a brief to guide Mina.");
      setGenerationStatus("");
      return;
    }
    if (!customerId) {
      setGenerationError("Enter your customer ID first.");
      setGenerationStatus("");
      return;
    }

    try {
      const activeSessionId = await ensureSession();
      setGenerationStatus("Mina is styling your product…");

      const payload = {
        productImageUrl: form.productImageUrl || undefined,
        styleImageUrls: form.styleImageUrls.filter(Boolean),
        brief: form.brief,
        tone: form.tone,
        platform: form.platform,
        minaVisionEnabled: form.minaVisionEnabled,
        stylePresetKey: form.stylePresetKey,
        customerId,
        sessionId: activeSessionId,
      };

      const res = await fetch(`${API_BASE}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Generate HTTP ${res.status}`);
      }
      const json = await res.json();
      const newImages = json.imageUrls?.length ? json.imageUrls : json.imageUrl ? [json.imageUrl] : [];
      setLatestImages((prev) => [...newImages, ...prev].slice(0, 5));
      setLatestPrompt(json.prompt || "");
      setLatestGenerationId(json.generationId || "");
      setSessionId(json.sessionId || activeSessionId);
      setGenerationStatus("Done ✅");
      setFeedbackComment("");
      await fetchCredits(customerId);
    } catch (err) {
      console.error("Generate failed:", err);
      setGenerationError(String(err.message || err));
      setGenerationStatus("Failed ❌");
    }
  }

  async function sendImageFeedback() {
    if (!latestImages[0]) return;
    try {
      setGenerationStatus("Saving feedback…");
      const res = await fetch(`${API_BASE}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          resultType: "image",
          platform: form.platform,
          prompt: latestPrompt,
          comment: feedbackComment,
          imageUrl: latestImages[0],
          sessionId,
          generationId: latestGenerationId,
        }),
      });
      if (!res.ok) throw new Error(`Feedback HTTP ${res.status}`);
      setGenerationStatus("Feedback saved ❤️");
      setFeedbackComment("");
    } catch (err) {
      console.error("Feedback failed:", err);
      setGenerationStatus(`Feedback error: ${String(err.message || err)}`);
    }
  }

  async function suggestMotion() {
    if (!latestImages[0]) {
      setMotionError("Generate a still first so Mina can suggest a motion.");
      return;
    }
    try {
      setMotionStatus("Thinking about motion…");
      setMotionError("");
      const res = await fetch(`${API_BASE}/motion/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceImageUrl: latestImages[0],
          tone: form.tone,
          platform: form.platform,
          minaVisionEnabled: form.minaVisionEnabled,
          stylePresetKey: form.stylePresetKey,
          customerId,
        }),
      });
      if (!res.ok) throw new Error(`Suggest HTTP ${res.status}`);
      const json = await res.json();
      setMotionIdea(json.suggestion || "");
      setMotionStatus("Motion idea ready ✅");
    } catch (err) {
      console.error("Motion suggest failed:", err);
      setMotionError(String(err.message || err));
      setMotionStatus("Failed ❌");
    }
  }

  async function generateMotion() {
    if (!latestImages[0]) {
      setMotionError("Generate a still first.");
      return;
    }
    if (!motionIdea) {
      setMotionError("Add a motion idea first.");
      return;
    }
    try {
      const activeSessionId = await ensureSession();
      setMotionStatus("Generating motion…");
      setMotionError("");
      const res = await fetch(`${API_BASE}/motion/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastImageUrl: latestImages[0],
          motionDescription: motionIdea,
          tone: form.tone,
          platform: form.platform,
          minaVisionEnabled: form.minaVisionEnabled,
          stylePresetKey: form.stylePresetKey,
          customerId,
          sessionId: activeSessionId,
        }),
      });
      if (!res.ok) throw new Error(`Motion HTTP ${res.status}`);
      const json = await res.json();
      setVideoUrl(json.videoUrl || "");
      setSessionId(json.sessionId || activeSessionId);
      setMotionStatus("Motion ready ✅");
      await fetchCredits(customerId);
    } catch (err) {
      console.error("Motion generate failed:", err);
      setMotionError(String(err.message || err));
      setMotionStatus("Failed ❌");
    }
  }

  async function sendMotionFeedback() {
    if (!videoUrl) return;
    try {
      setMotionStatus("Saving feedback…");
      const res = await fetch(`${API_BASE}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          resultType: "motion",
          platform: form.platform,
          prompt: motionIdea,
          comment: motionFeedbackComment,
          videoUrl,
          sessionId,
          generationId: latestGenerationId,
        }),
      });
      if (!res.ok) throw new Error(`Feedback HTTP ${res.status}`);
      setMotionStatus("Feedback saved ❤️");
      setMotionFeedbackComment("");
    } catch (err) {
      console.error("Motion feedback failed:", err);
      setMotionStatus(`Feedback error: ${String(err.message || err)}`);
    }
  }

  const mainImage = latestImages[0];

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
        <header
          style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: 16 }}
        >
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
              Workspace beta
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
              Customer ID
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <input
                value={customerIdInput}
                onChange={(e) => setCustomerIdInput(e.target.value)}
                placeholder="Paste customer id"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  color: "white",
                  width: 180,
                }}
              />
              <button
                onClick={() => {
                  setCustomerId(customerIdInput.trim());
                  setSessionId("");
                }}
                style={{
                  background: "#4ade80",
                  color: "#0f172a",
                  border: "none",
                  borderRadius: 10,
                  padding: "9px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <StatusPanel
              healthStatus={healthStatus}
              healthError={healthError}
              healthDetails={healthDetails}
              credits={credits}
              creditsStatus={creditsStatus}
              creditsError={creditsError}
            />

            <form onSubmit={handleGenerateStill} style={{ ...SECTION_CARD_STYLE, display: "grid", gap: 12 }}>
              <SectionLabel title="Product & references" />
              <label style={{ display: "grid", gap: 6 }}>
                <span style={labelStyle}>Product image URL</span>
                <input
                  value={form.productImageUrl}
                  onChange={(e) => setForm({ ...form, productImageUrl: e.target.value })}
                  placeholder="https://…"
                  style={inputStyle}
                />
              </label>
              <div style={{ display: "grid", gap: 8 }}>
                <span style={labelStyle}>Style reference URLs (up to 3)</span>
                {form.styleImageUrls.map((url, idx) => (
                  <input
                    key={idx}
                    value={url}
                    onChange={(e) => updateStyleImageUrl(idx, e.target.value)}
                    placeholder="https://…"
                    style={inputStyle}
                  />
                ))}
              </div>

              <SectionLabel title="Briefing" />
              <label style={{ display: "grid", gap: 6 }}>
                <span style={labelStyle}>Tell Mina what you want to create</span>
                <textarea
                  value={form.brief}
                  onChange={(e) => setForm({ ...form, brief: e.target.value })}
                  placeholder="e.g., create a cinematic product portrait…"
                  rows={4}
                  style={textareaStyle}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={labelStyle}>Tone</span>
                  <input
                    value={form.tone}
                    onChange={(e) => setForm({ ...form, tone: e.target.value })}
                    placeholder="calm, luxury"
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={labelStyle}>Platform</span>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="tiktok">TikTok / Reels (9:16)</option>
                    <option value="instagram">Instagram Post (4:5)</option>
                    <option value="youtube">YouTube Horizontal (16:9)</option>
                  </select>
                </label>
              </div>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={labelStyle}>Style preset</span>
                <select
                  value={form.stylePresetKey}
                  onChange={(e) => setForm({ ...form, stylePresetKey: e.target.value })}
                  style={inputStyle}
                >
                  {STYLE_PRESETS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={form.minaVisionEnabled}
                  onChange={(e) => setForm({ ...form, minaVisionEnabled: e.target.checked })}
                />
                <span style={labelStyle}>Enable Mina Vision Intelligence</span>
              </label>

              <button
                type="submit"
                disabled={creditsInsufficient}
                style={{
                  marginTop: 6,
                  background: creditsInsufficient ? "#4b5563" : "#4ade80",
                  color: creditsInsufficient ? "#e5e7eb" : "#0f172a",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontWeight: 800,
                  cursor: creditsInsufficient ? "not-allowed" : "pointer",
                }}
              >
                {creditsInsufficient
                  ? "Not enough credits"
                  : generationStatus || "Generate still"}
              </button>
              {generationError && (
                <div style={{ color: "#f97373", fontSize: 12 }}>{generationError}</div>
              )}
            </form>

            <div style={SECTION_CARD_STYLE}>
              <SectionLabel title="Motion" />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={suggestMotion}
                  style={secondaryButtonStyle}
                >
                  Suggest motion from last still
                </button>
                <button onClick={generateMotion} style={primaryButtonStyle}>
                  Generate motion
                </button>
              </div>
              <textarea
                value={motionIdea}
                onChange={(e) => setMotionIdea(e.target.value)}
                placeholder="Mina will suggest a short motion idea here…"
                rows={3}
                style={{ ...textareaStyle, marginTop: 8 }}
              />
              {motionStatus && (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
                  {motionStatus}
                </div>
              )}
              {motionError && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#f97373" }}>
                  {motionError}
                </div>
              )}
              {videoUrl && (
                <div style={{ marginTop: 12 }}>
                  <video src={videoUrl} controls style={{ width: "100%", borderRadius: 12 }} />
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    <textarea
                      value={motionFeedbackComment}
                      onChange={(e) => setMotionFeedbackComment(e.target.value)}
                      placeholder="Tell Mina what you like/dislike about this motion"
                      rows={2}
                      style={textareaStyle}
                    />
                    <button onClick={sendMotionFeedback} style={secondaryButtonStyle}>
                      ❤️ More like this motion
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={SECTION_CARD_STYLE}>
              <SectionLabel title="Latest still" />
              {mainImage ? (
                <>
                  <img
                    src={mainImage}
                    alt="Latest still"
                    style={{ width: "100%", borderRadius: 14, objectFit: "cover" }}
                  />
                  {latestPrompt && (
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                      Prompt used: {latestPrompt}
                    </div>
                  )}
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    <textarea
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      placeholder="Tell Mina what you like/dislike about this image"
                      rows={2}
                      style={textareaStyle}
                    />
                    <button onClick={sendImageFeedback} style={secondaryButtonStyle}>
                      ❤️ More like this
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ opacity: 0.7, fontSize: 13 }}>
                  Your latest still will appear here after you generate.
                </div>
              )}
            </div>

            <div style={SECTION_CARD_STYLE}>
              <SectionLabel title="History (last 5 images)" />
              {latestImages.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                  {latestImages.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`history-${idx}`}
                      style={{ width: "100%", borderRadius: 12, objectFit: "cover" }}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ opacity: 0.7, fontSize: 12 }}>No images yet.</div>
              )}
            </div>

            <div style={SECTION_CARD_STYLE}>
              <SectionLabel title="Support" />
              <div style={{ fontSize: 12, opacity: 0.75, display: "grid", gap: 4 }}>
                <div>API base: {API_BASE}</div>
                <div>Session: {sessionId || "not started"}</div>
                <a
                  href="https://falta.studio"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#a5b4fc" }}
                >
                  Need help? Message Falta Studio
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPanel({
  healthStatus,
  healthError,
  healthDetails,
  credits,
  creditsStatus,
  creditsError,
}) {
  return (
    <div style={{ display: "grid", gap: 10, ...SECTION_CARD_STYLE }}>
      <div>
        <div style={miniLabelStyle}>Backend status</div>
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

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={miniLabelStyle}>Credits</div>
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
            <span style={{ fontSize: 18 }}>{credits?.balance ?? "—"}</span>
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
    </div>
  );
}

function SectionLabel({ title }) {
  return (
    <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.65 }}>
      {title}
    </div>
  );
}

const labelStyle = {
  fontSize: 13,
  opacity: 0.8,
};

const miniLabelStyle = {
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  opacity: 0.65,
};

const inputStyle = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 10,
  padding: "10px 12px",
  color: "white",
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 60,
};

const primaryButtonStyle = {
  background: "#4ade80",
  color: "#0f172a",
  border: "none",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  background: "rgba(255,255,255,0.08)",
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

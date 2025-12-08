import React, { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

const ADMIN_KEY = import.meta.env.VITE_MINA_ADMIN_KEY || "";

type HealthPayload = {
  ok: boolean;
  service: string;
  time: string;
};

type CreditsMeta = {
  imageCost: number;
  motionCost: number;
};

type CreditsBalance = {
  ok: boolean;
  requestId: string;
  customerId: string;
  balance: number;
  historyLength: number;
  meta: CreditsMeta;
};

type EditorialResponse = {
  ok: boolean;
  message: string;
  requestId: string;
  prompt: string;
  imageUrl: string | null;
  imageUrls?: string[];
  generationId: string;
  sessionId: string;
  credits: {
    balance: number;
    cost: number;
  };
  gpt?: any;
};

type MotionSuggestResponse = {
  ok: boolean;
  requestId: string;
  suggestion: string;
  gpt?: any;
};

type MotionResponse = {
  ok: boolean;
  message: string;
  requestId: string;
  prompt: string;
  videoUrl: string | null;
  generationId: string;
  sessionId: string;
  credits: {
    balance: number;
    cost: number;
  };
  gpt?: any;
};

type LikePayload = {
  ok: boolean;
  message: string;
  requestId: string;
  totals: {
    likesForCustomer: number;
  };
};

type ApiGeneration = {
  id: string;
  type: "image" | "motion";
  sessionId: string;
  customerId: string;
  platform: string;
  prompt: string;
  outputUrl: string;
  createdAt: string;
  meta?: Record<string, any>;
};

type CreditsHistoryEntry = {
  delta: number;
  reason: string;
  source: string;
  at: string;
};

type CustomerHistory = {
  ok: boolean;
  customerId: string;
  credits: {
    balance: number;
    history: CreditsHistoryEntry[];
  };
  generations: ApiGeneration[];
  feedbacks: any[];
};

type AdminOverview = {
  ok: boolean;
  totals: {
    customersWithCredits: number;
    generations: number;
    feedbacks: number;
  };
  generations: ApiGeneration[];
  feedbacks: any[];
  credits: {
    customerId: string;
    balance: number;
    history: CreditsHistoryEntry[];
  }[];
};

type StillItem = {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
};

type MotionItem = {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
};

const devCustomerId = "8766256447571";

function getInitialCustomerId(): string {
  try {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("customerId");
      if (fromUrl && fromUrl.trim().length > 0) {
        return fromUrl.trim();
      }
      const stored = window.localStorage.getItem("minaCustomerId");
      if (stored && stored.trim().length > 0) {
        return stored.trim();
      }
    }
  } catch {
    // ignore client storage errors
  }
  return devCustomerId;
}

function formatTime(ts?: string) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function App() {
  const [activeTab, setActiveTab] = useState<"playground" | "profile" | "admin">(
    "playground"
  );

  const [customerId, setCustomerId] = useState<string>(getInitialCustomerId);

  const isAdmin = Boolean(ADMIN_KEY && customerId === devCustomerId);

  // Health
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Credits
  const [credits, setCredits] = useState<CreditsBalance | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  // Session
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Still inputs
  const [productImageUrl, setProductImageUrl] = useState("");
  const [styleImageUrlsRaw, setStyleImageUrlsRaw] = useState("");
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("Poetic");
  const [platform, setPlatform] = useState("tiktok");
  const [stylePresetKey, setStylePresetKey] = useState("soft-desert-editorial");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);

  // Still generation
  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [lastStillPrompt, setLastStillPrompt] = useState<string | null>(null);
  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);

  // Motion inputs / suggestion
  const [motionDescription, setMotionDescription] = useState("");
  const [motionSuggestLoading, setMotionSuggestLoading] = useState(false);
  const [motionSuggestError, setMotionSuggestError] = useState<string | null>(
    null
  );

  // Motion generation
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);
  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);

  // Profile / auto-topup (UI only)
  const [autoTopupEnabled, setAutoTopupEnabled] = useState(false);
  const [autoTopupLimit, setAutoTopupLimit] = useState("200");
  const [autoTopupPack, setAutoTopupPack] = useState("MINA-50");

  // History from backend
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Admin overview
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(
    null
  );
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Persist customerId for future visits
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("minaCustomerId", customerId);
      }
    } catch {
      // ignore
    }
  }, [customerId]);

  // --- Step dots (Notion-like) ---
  const step1Done = Boolean(health?.ok && sessionId);
  const step2Done = Boolean(
    productImageUrl.trim().length || styleImageUrlsRaw.trim().length
  );
  const step3Done = Boolean(brief.trim().length);
  const step4Done = stillItems.length > 0;
  const step5Done = motionItems.length > 0;

  // --- API helpers ---

  const handleCheckHealth = async () => {
    try {
      setCheckingHealth(true);
      setHealthError(null);
      const res = await fetch(`${API_BASE_URL}/health`);
      if (!res.ok) {
        throw new Error(`Health error: ${res.status}`);
      }
      const data = (await res.json()) as HealthPayload;
      setHealth(data);
    } catch (err: any) {
      setHealthError(err?.message || "Failed to reach Mina API.");
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleFetchCredits = async () => {
    try {
      setCreditsLoading(true);
      setCreditsError(null);
      const res = await fetch(
        `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(
          customerId
        )}`
      );
      if (!res.ok) {
        throw new Error(`Credits error: ${res.status}`);
      }
      const data = (await res.json()) as CreditsBalance;
      setCredits(data);
    } catch (err: any) {
      setCreditsError(err?.message || "Failed to load credits.");
    } finally {
      setCreditsLoading(false);
    }
  };

  const handleStartSession = async () => {
    try {
      setSessionStarting(true);
      setSessionError(null);
      const res = await fetch(`${API_BASE_URL}/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          platform,
          title: "Mina Editorial Session",
        }),
      });
      if (!res.ok) {
        throw new Error(`Session error: ${res.status}`);
      }
      const data = await res.json();
      if (data?.session?.id) {
        setSessionId(data.session.id);
      } else {
        throw new Error("Missing session id in response.");
      }
    } catch (err: any) {
      setSessionError(err?.message || "Failed to start session.");
    } finally {
      setSessionStarting(false);
    }
  };

  const fetchHistory = async (cid: string) => {
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const res = await fetch(
        `${API_BASE_URL}/history/customer/${encodeURIComponent(cid)}`
      );
      if (!res.ok) {
        throw new Error(`History error: ${res.status}`);
      }
      const data = (await res.json()) as CustomerHistory;
      setHistory(data);
    } catch (err: any) {
      setHistoryError(err?.message || "Failed to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchAdminOverview = async () => {
    if (!isAdmin || !ADMIN_KEY) return;
    try {
      setAdminLoading(true);
      setAdminError(null);
      const res = await fetch(
        `${API_BASE_URL}/history/admin/overview?key=${encodeURIComponent(
          ADMIN_KEY
        )}`
      );
      if (!res.ok) {
        throw new Error(`Admin error: ${res.status}`);
      }
      const data = (await res.json()) as AdminOverview;
      setAdminOverview(data);
    } catch (err: any) {
      setAdminError(err?.message || "Failed to load admin overview.");
    } finally {
      setAdminLoading(false);
    }
  };

  // --- Bootstrap once on load ---
  useEffect(() => {
    const bootstrap = async () => {
      await handleCheckHealth();
      await handleFetchCredits();
      await handleStartSession();
      await fetchHistory(customerId);
      if (isAdmin) {
        await fetchAdminOverview();
      }
    };
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerateStill = async () => {
    try {
      setStillGenerating(true);
      setStillError(null);

      const styleImageUrls = styleImageUrlsRaw
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean);

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sessionId,
          productImageUrl: productImageUrl.trim() || null,
          styleImageUrls,
          brief,
          tone,
          platform,
          minaVisionEnabled,
          stylePresetKey,
          maxImages: 1,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: Failed to generate editorial still.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as EditorialResponse;
      const url = data.imageUrl || data.imageUrls?.[0];
      if (!url) {
        throw new Error("No image URL in Mina response.");
      }

      setLastStillPrompt(data.prompt);
      if (data.credits) {
        setCredits((prev) =>
          prev
            ? {
                ...prev,
                balance: data.credits.balance,
              }
            : prev
        );
      }

      const newItem: StillItem = {
        id: data.generationId,
        url,
        prompt: data.prompt,
        createdAt: new Date().toISOString(),
      };

      setStillItems((prev) => {
        const next = [newItem, ...prev];
        setStillIndex(0);
        return next;
      });

      void fetchHistory(customerId);
      if (isAdmin) {
        void fetchAdminOverview();
      }
    } catch (err: any) {
      setStillError(err?.message || "Unexpected error generating still.");
    } finally {
      setStillGenerating(false);
    }
  };

  const handleSuggestMotion = async () => {
    if (!stillItems.length) return;
    const currentStill = stillItems[stillIndex] || stillItems[0];
    if (!currentStill) return;

    try {
      setMotionSuggestLoading(true);
      setMotionSuggestError(null);
      const res = await fetch(`${API_BASE_URL}/motion/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          referenceImageUrl: currentStill.url,
          tone,
          platform,
          minaVisionEnabled,
          stylePresetKey,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: Failed to suggest motion idea.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as MotionSuggestResponse;
      setMotionDescription(data.suggestion);
    } catch (err: any) {
      setMotionSuggestError(
        err?.message || "Unexpected error suggesting motion."
      );
    } finally {
      setMotionSuggestLoading(false);
    }
  };

  const handleGenerateMotion = async () => {
    if (!stillItems.length) {
      setMotionError("Generate at least one still image first.");
      return;
    }

    const currentStill = stillItems[stillIndex] || stillItems[0];
    if (!currentStill) {
      setMotionError("No still selected.");
      return;
    }

    if (!motionDescription.trim()) {
      setMotionError("Describe the motion first (or use Mina’s suggestion).");
      return;
    }

    try {
      setMotionGenerating(true);
      setMotionError(null);

      const res = await fetch(`${API_BASE_URL}/motion/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sessionId,
          lastImageUrl: currentStill.url,
          motionDescription: motionDescription.trim(),
          tone,
          platform,
          minaVisionEnabled,
          stylePresetKey,
          durationSeconds: 5,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const msg =
          errJson?.message ||
          `Error ${res.status}: Failed to generate motion.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as MotionResponse;
      const url = data.videoUrl;
      if (!url) {
        throw new Error("No video URL in Mina response.");
      }

      if (data.credits) {
        setCredits((prev) =>
          prev
            ? {
                ...prev,
                balance: data.credits.balance,
              }
            : prev
        );
      }

      const newItem: MotionItem = {
        id: data.generationId,
        url,
        prompt: data.prompt,
        createdAt: new Date().toISOString(),
      };

      setMotionItems((prev) => {
        const next = [newItem, ...prev];
        setMotionIndex(0);
        return next;
      });

      void fetchHistory(customerId);
      if (isAdmin) {
        void fetchAdminOverview();
      }
    } catch (err: any) {
      setMotionError(err?.message || "Unexpected error generating motion.");
    } finally {
      setMotionGenerating(false);
    }
  };

  const handleLike = async (type: "image" | "motion") => {
    try {
      const isImage = type === "image";
      const item = isImage
        ? stillItems[stillIndex] || stillItems[0]
        : motionItems[motionIndex] || motionItems[0];

      if (!item) return;

      const res = await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sessionId,
          generationId: item.id,
          platform,
          resultType: type,
          prompt: item.prompt,
          comment: "",
          imageUrl: isImage ? item.url : "",
          videoUrl: !isImage ? item.url : "",
        }),
      });

      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as LikePayload;
      console.log("Like stored. Total likes:", data.totals.likesForCustomer);
    } catch {
      // ignore like errors
    }
  };

  // --- Derived values ---

  const currentStill = stillItems[stillIndex] || null;
  const currentMotion = motionItems[motionIndex] || null;

  const imageCost = credits?.meta?.imageCost ?? 1;
  const motionCost = credits?.meta?.motionCost ?? 5;

  const canGenerateStill =
    !stillGenerating &&
    !!sessionId &&
    !!productImageUrl.trim() &&
    !!brief.trim();

  const canGenerateMotion =
    !motionGenerating &&
    !!sessionId &&
    !!currentStill &&
    !!motionDescription.trim();

  const creditsLabel = (() => {
    if (creditsLoading) return "Loading credits…";
    if (creditsError) return "Credits error";
    if (!credits) return "Credits —";
    return `Credits ${credits.balance}`;
  })();

  const isConnected = Boolean(health?.ok);

  const historyStills: ApiGeneration[] =
    history?.generations.filter((g) => g.type === "image") ?? [];
  const historyMotions: ApiGeneration[] =
    history?.generations.filter((g) => g.type === "motion") ?? [];

  // --- JSX ---

  return (
    <div className="mina-root">
      <header className="mina-header">
        <div className="mina-logo">MINA · Editorial AI</div>
        <div className="mina-header-right">
          <div className="mina-tabs">
            <button
              className={classNames(
                "tab",
                activeTab === "playground" && "active"
              )}
              onClick={() => setActiveTab("playground")}
            >
              Playground
            </button>
            <button
              className={classNames(
                "tab",
                activeTab === "profile" && "active"
              )}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
            {isAdmin && (
              <button
                className={classNames(
                  "tab",
                  activeTab === "admin" && "active"
                )}
                onClick={() => setActiveTab("admin")}
              >
                Admin
              </button>
            )}
          </div>
          <div className="mina-credits-badge">{creditsLabel}</div>
        </div>
      </header>

      <main className="mina-main">
        {activeTab === "playground" && (
          <div className="mina-layout">
            {/* Left column */}
            <div className="mina-left">
              {/* Step 1 */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step1Done && "step-done"
                    )}
                  />
                  <span>01 · Connection & session</span>
                </div>
                <div className="section-body">
                  <div className="status-row">
                    <div className="status-label">API</div>
                    <div
                      className={classNames(
                        "status-chip",
                        isConnected && "ok",
                        healthError && "error"
                      )}
                    >
                      {checkingHealth
                        ? "Checking…"
                        : isConnected
                        ? "Connected"
                        : "Not connected"}
                    </div>
                    <button
                      className="link-button subtle"
                      onClick={handleCheckHealth}
                      disabled={checkingHealth}
                    >
                      Recheck
                    </button>
                  </div>
                  {health?.time && (
                    <div className="hint small">
                      Last ping:{" "}
                      {new Date(health.time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                  {healthError && (
                    <div className="status-error">{healthError}</div>
                  )}

                  <div className="status-row">
                    <div className="status-label">Session</div>
                    <div
                      className={classNames(
                        "status-chip",
                        sessionId && "ok",
                        sessionError && "error"
                      )}
                    >
                      {sessionStarting
                        ? "Starting…"
                        : sessionId
                        ? "Active"
                        : "Idle"}
                    </div>
                    <button
                      className="link-button subtle"
                      onClick={handleStartSession}
                      disabled={sessionStarting}
                    >
                      Restart
                    </button>
                  </div>
                  {sessionError && (
                    <div className="status-error">{sessionError}</div>
                  )}
                </div>
              </section>

              {/* Step 2 */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step2Done && "step-done"
                    )}
                  />
                  <span>02 · Product & style</span>
                </div>
                <div className="section-body">
                  <div className="field">
                    <div className="field-label">Hero product image URL</div>
                    <input
                      className="field-input"
                      placeholder="https://cdn.shopify.com/..."
                      value={productImageUrl}
                      onChange={(e) => setProductImageUrl(e.target.value)}
                    />
                    <div className="hint small">
                      Later this becomes real upload / drag & drop. For now,
                      paste an image URL from Shopify or CDN.
                    </div>
                  </div>

                  <div className="field">
                    <div className="field-label">Extra style reference URLs</div>
                    <textarea
                      className="field-textarea"
                      placeholder="Optional. One URL per line."
                      value={styleImageUrlsRaw}
                      onChange={(e) => setStyleImageUrlsRaw(e.target.value)}
                    />
                  </div>

                  <div className="field-row">
                    <div className="field field-inline">
                      <div className="field-label">Style preset</div>
                      <select
                        className="field-input"
                        value={stylePresetKey}
                        onChange={(e) => setStylePresetKey(e.target.value)}
                      >
                        <option value="soft-desert-editorial">
                          Soft desert editorial
                        </option>
                        <option value="chrome-neon-night">
                          Chrome neon night
                        </option>
                        <option value="bathroom-ritual">
                          Bathroom ritual
                        </option>
                      </select>
                    </div>
                    <div className="field-toggle">
                      <input
                        type="checkbox"
                        checked={minaVisionEnabled}
                        onChange={(e) =>
                          setMinaVisionEnabled(e.target.checked)
                        }
                      />
                      <span
                        className={classNames(
                          "toggle-label",
                          minaVisionEnabled ? "on" : "off"
                        )}
                      >
                        Mina Vision Intelligence
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Step 3 */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step3Done && "step-done"
                    )}
                  />
                  <span>03 · Brief & format</span>
                </div>
                <div className="section-body">
                  <div className="field">
                    <div className="field-label">Brief</div>
                    <textarea
                      className="field-textarea"
                      placeholder="Tell Mina what you want to create…"
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                    />
                  </div>

                  <div className="field-row">
                    <div className="field field-inline">
                      <div className="field-label">Tone</div>
                      <input
                        className="field-input"
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                      />
                    </div>
                    <div className="field field-inline">
                      <div className="field-label">Platform</div>
                      <select
                        className="field-input"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                      >
                        <option value="tiktok">TikTok / Reels (9:16)</option>
                        <option value="instagram">Instagram post (4:5)</option>
                        <option value="youtube">YouTube (16:9)</option>
                      </select>
                    </div>
                  </div>

                  <div className="section-actions">
                    <button
                      className="primary-button"
                      onClick={handleGenerateStill}
                      disabled={!canGenerateStill}
                    >
                      {stillGenerating
                        ? "Creating still…"
                        : `Create still (−${imageCost} credits)`}
                    </button>
                    {stillError && (
                      <div className="error-text">{stillError}</div>
                    )}
                  </div>
                </div>
              </section>

              {/* Step 4 + 5 */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step4Done && step5Done && "step-done"
                    )}
                  />
                <span>04 · Motion loop</span>
                </div>
                <div className="section-body">
                  <div className="hint small">
                    Mina reads the current still, proposes a motion idea, then
                    Kling animates it.
                  </div>

                  <div className="field-row">
                    <button
                      className="secondary-button"
                      onClick={handleSuggestMotion}
                      disabled={
                        motionSuggestLoading ||
                        !stillItems.length ||
                        stillGenerating
                      }
                    >
                      {motionSuggestLoading
                        ? "Thinking motion…"
                        : "Suggest motion"}
                    </button>
                    <button
                      className="secondary-button"
                      onClick={handleGenerateMotion}
                      disabled={!canGenerateMotion}
                    >
                      {motionGenerating
                        ? "Animating…"
                        : `Create motion (−${motionCost} credits)`}
                    </button>
                  </div>

                  <div className="field">
                    <div className="field-label">Motion description</div>
                    <textarea
                      className="field-textarea"
                      placeholder="Wait for Mina’s idea… or type your own motion in 1–2 sentences."
                      value={motionDescription}
                      onChange={(e) => setMotionDescription(e.target.value)}
                    />
                  </div>

                  {motionError && (
                    <div className="status-error">{motionError}</div>
                  )}
                  {motionSuggestError && (
                    <div className="status-error">{motionSuggestError}</div>
                  )}
                </div>
              </section>
            </div>

            {/* Right column */}
            <div className="mina-right">
              {/* Stills pile */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step4Done && "step-done"
                    )}
                  />
                  <span>Stills · Pile</span>
                </div>
                <div className="section-body">
                  <div className="output-shell">
                    {stillItems.length === 0 ? (
                      <div className="output-placeholder">
                        No stills yet. Fill steps 2 & 3, then “Create still”.
                      </div>
                    ) : (
                      <>
                        <div className="output-media">
                          {currentStill && (
                            <img
                              src={currentStill.url}
                              alt="Mina still"
                              loading="lazy"
                            />
                          )}
                        </div>
                        <div className="output-meta">
                          <div className="output-tag-row">
                            <div className="output-tag">
                              {stillIndex + 1} / {stillItems.length}
                            </div>
                            <div className="output-tag subtle">Still</div>
                          </div>
                          {currentStill && (
                            <>
                              <div className="output-prompt">
                                {currentStill.prompt}
                              </div>
                              <div className="hint small">
                                {formatTime(currentStill.createdAt)}
                              </div>
                            </>
                          )}
                          <div className="section-actions">
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setStillIndex((prev) =>
                                  prev <= 0
                                    ? stillItems.length - 1
                                    : prev - 1
                                )
                              }
                              disabled={stillItems.length <= 1}
                            >
                              ◀
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setStillIndex((prev) =>
                                  prev >= stillItems.length - 1 ? 0 : prev + 1
                                )
                              }
                              disabled={stillItems.length <= 1}
                            >
                              ▶
                            </button>
                            <button
                              className="link-button"
                              onClick={() => handleLike("image")}
                              disabled={!currentStill}
                            >
                              ♥ Like · “More of this”
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* Motion pile */}
              <section className="mina-section">
                <div className="section-title">
                  <span
                    className={classNames(
                      "step-dot",
                      step5Done && "step-done"
                    )}
                  />
                  <span>Motion · Pile</span>
                </div>
                <div className="section-body">
                  <div className="output-shell">
                    {motionItems.length === 0 ? (
                      <div className="output-placeholder">
                        No motion yet. Generate a still, let Mina suggest
                        motion, then animate.
                      </div>
                    ) : (
                      <>
                        <div className="output-media">
                          {currentMotion && (
                            <video
                              src={currentMotion.url}
                              controls
                              playsInline
                              loop
                            />
                          )}
                        </div>
                        <div className="output-meta">
                          <div className="output-tag-row">
                            <div className="output-tag">
                              {motionIndex + 1} / {motionItems.length}
                            </div>
                            <div className="output-tag subtle">Motion</div>
                          </div>
                          {currentMotion && (
                            <>
                              <div className="output-prompt">
                                {currentMotion.prompt}
                              </div>
                              <div className="hint small">
                                {formatTime(currentMotion.createdAt)}
                              </div>
                            </>
                          )}
                          <div className="section-actions">
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setMotionIndex((prev) =>
                                  prev <= 0
                                    ? motionItems.length - 1
                                    : prev - 1
                                )
                              }
                              disabled={motionItems.length <= 1}
                            >
                              ◀
                            </button>
                            <button
                              className="secondary-button"
                              onClick={() =>
                                setMotionIndex((prev) =>
                                  prev >= motionItems.length - 1
                                    ? 0
                                    : prev + 1
                                )
                              }
                              disabled={motionItems.length <= 1}
                            >
                              ▶
                            </button>
                            <button
                              className="link-button"
                              onClick={() => handleLike("motion")}
                              disabled={!currentMotion}
                            >
                              ♥ Like · “More of this”
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="profile-layout">
            <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot step-done" />
                <span>Profile · Account & billing</span>
              </div>
              <div className="section-body">
                <div className="profile-body">
                  <div>
                    <div className="profile-label">Shopify customer id</div>
                    <div className="profile-value">{customerId}</div>
                    <div className="profile-hint">
                      You can link from Shopify like:
                      <br />
                      <code>
                        https://mina.yourdomain.com?customerId=&#123;&#123; customer.id &#125;&#125;
                      </code>
                    </div>
                  </div>
                  <div>
                    <div className="profile-label">Credits</div>
                    <div className="profile-value">
                      {credits?.balance ?? history?.credits?.balance ?? 0}{" "}
                      Machta
                    </div>
                    <div className="profile-hint">
                      Image −{imageCost} · Motion −{motionCost} credits
                    </div>
                  </div>
                  <div className="auto-topup-row">
                    <div className="profile-label">Auto top-up</div>
                    <div className="field-toggle">
                      <input
                        type="checkbox"
                        checked={autoTopupEnabled}
                        onChange={(e) =>
                          setAutoTopupEnabled(e.target.checked)
                        }
                      />
                      <span
                        className={classNames(
                          "toggle-label",
                          autoTopupEnabled ? "on" : "off"
                        )}
                      >
                        Enable auto top-up like OpenAI API
                      </span>
                    </div>
                    <div className="auto-topup-grid">
                      <div className="field">
                        <div className="field-label">
                          Monthly limit{" "}
                          <span className="field-unit">(USD)</span>
                        </div>
                        <input
                          className="field-input"
                          type="number"
                          min={10}
                          value={autoTopupLimit}
                          onChange={(e) => setAutoTopupLimit(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <div className="field-label">Pack</div>
                        <select
                          className="field-input"
                          value={autoTopupPack}
                          onChange={(e) => setAutoTopupPack(e.target.value)}
                        >
                          <option value="MINA-50">Mina 50 Machta</option>
                        </select>
                      </div>
                    </div>
                    <div className="profile-hint">
                      UI only for now. Later: real Stripe + Shopify billing
                      limits.
                    </div>
                  </div>
                </div>

                <div className="profile-credits-history">
                  {historyLoading && (
                    <div className="hint small">Loading history…</div>
                  )}
                  {historyError && (
                    <div className="status-error">{historyError}</div>
                  )}
                  {history?.credits?.history?.length ? (
                    <>
                      <div className="profile-label">Recent credit events</div>
                      <ul className="credits-list">
                        {history.credits.history
                          .slice()
                          .reverse()
                          .slice(0, 5)
                          .map((h, idx) => (
                            <li key={idx}>
                              <span className="credits-delta">
                                {h.delta > 0 ? "+" : ""}
                                {h.delta}
                              </span>
                              <span className="credits-reason">{h.reason}</span>
                              <span className="credits-time">
                                {formatTime(h.at)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </>
                  ) : (
                    !historyLoading &&
                    !historyError && (
                      <div className="hint small">
                        No credit history yet for this account.
                      </div>
                    )
                  )}
                </div>
              </div>
            </section>

            <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot" />
                <span>Gallery · Recent generations</span>
              </div>
              <div className="section-body">
                <div className="hint small">
                  This reads from Mina’s server history for this customer id
                  (not from your browser only).
                </div>
                <div className="gallery-grid">
                  {historyStills.map((g) => (
                    <div key={g.id} className="gallery-item">
                      <div className="gallery-media">
                        <img src={g.outputUrl} alt="Still" loading="lazy" />
                      </div>
                      <div className="gallery-meta">
                        <div className="gallery-meta-top">
                          <span className="gallery-tag">Still</span>
                          <span className="gallery-date">
                            {formatTime(g.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {historyMotions.map((g) => (
                    <div key={g.id} className="gallery-item">
                      <div className="gallery-media">
                        <video src={g.outputUrl} muted playsInline loop />
                      </div>
                      <div className="gallery-meta">
                        <div className="gallery-meta-top">
                          <span className="gallery-tag subtle">Motion</span>
                          <span className="gallery-date">
                            {formatTime(g.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!historyLoading &&
                    !historyError &&
                    historyStills.length === 0 &&
                    historyMotions.length === 0 && (
                      <div className="hint small">
                        No generations in server history yet.
                      </div>
                    )}
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === "admin" && isAdmin && (
          <div className="profile-layout">
            <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot step-done" />
                <span>Admin · Logs & overview</span>
              </div>
              <div className="section-body">
                <div className="field-row">
                  <div className="field">
                    <div className="field-label">Admin key status</div>
                    <div className="profile-value">
                      {ADMIN_KEY ? "Configured" : "Not set"}
                    </div>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={fetchAdminOverview}
                    disabled={adminLoading || !ADMIN_KEY}
                  >
                    {adminLoading ? "Refreshing…" : "Refresh overview"}
                  </button>
                </div>
                {adminError && (
                  <div className="status-error">{adminError}</div>
                )}
                {adminOverview && (
                  <>
                    <div className="profile-body">
                      <div>
                        <div className="profile-label">Customers</div>
                        <div className="profile-value">
                          {adminOverview.totals.customersWithCredits}
                        </div>
                      </div>
                      <div>
                        <div className="profile-label">Generations</div>
                        <div className="profile-value">
                          {adminOverview.totals.generations}
                        </div>
                      </div>
                      <div>
                        <div className="profile-label">Feedback</div>
                        <div className="profile-value">
                          {adminOverview.totals.feedbacks}
                        </div>
                      </div>
                    </div>

                    <div className="admin-columns">
                      <div className="admin-column">
                        <div className="profile-label">Recent credits</div>
                        <ul className="credits-list">
                          {adminOverview.credits
                            .flatMap((c) =>
                              c.history.map((h) => ({
                                customerId: c.customerId,
                                ...h,
                              }))
                            )
                            .sort(
                              (a, b) =>
                                new Date(b.at).getTime() -
                                new Date(a.at).getTime()
                            )
                            .slice(0, 10)
                            .map((entry, idx) => (
                              <li key={idx}>
                                <span className="credits-delta">
                                  {entry.delta > 0 ? "+" : ""}
                                  {entry.delta}
                                </span>
                                <span className="credits-reason">
                                  {entry.reason}
                                </span>
                                <span className="credits-time">
                                  #{entry.customerId} · {formatTime(entry.at)}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>

                      <div className="admin-column">
                        <div className="profile-label">Recent generations</div>
                        <ul className="credits-list">
                          {adminOverview.generations.slice(0, 10).map((g) => (
                            <li key={g.id}>
                              <span className="credits-reason">
                                {g.type === "image" ? "Still" : "Motion"}
                              </span>
                              <span className="credits-time">
                                #{g.customerId} · {formatTime(g.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </>
                )}
                {!adminOverview && !adminLoading && !adminError && (
                  <div className="hint small">
                    Set <code>ADMIN_DASHBOARD_KEY</code> on the backend and{" "}
                    <code>VITE_MINA_ADMIN_KEY</code> on the frontend to unlock
                    full admin overview.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

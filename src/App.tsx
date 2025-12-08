import { useEffect, useState } from "react";
import "./index.css";

// ===============================
// Config
// ===============================

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL || "http://localhost:3000";

// Mock customer id – this should match a real Shopify customer id
// that has credits in your backend. For now it's constant.
const MOCK_CUSTOMER_ID = "8766256447571";

// Auto top-up local storage key
const AUTO_TOPUP_KEY = "mina_auto_topup_settings_v1";

// ===============================
// Types
// ===============================

type HealthPayload = {
  ok: boolean;
  service: string;
  time: string;
};

type CreditsMeta = {
  imageCost: number;
  motionCost: number;
};

type CreditsBalancePayload = {
  ok: boolean;
  requestId: string;
  customerId: string;
  balance: number;
  historyLength: number;
  meta: CreditsMeta;
};

type TabId = "playground" | "profile";

type GenerationKind = "image" | "motion";

type GenerationItem = {
  id: string;
  kind: GenerationKind;
  url: string;
  prompt: string;
  createdAt: string;
  platform: string;
  sessionId?: string | null;
};

type AutoTopUpSettings = {
  enabled: boolean;
  monthlyLimitUsd: number;
  packSize: number;
};

// ===============================
// Helpers
// ===============================

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options && options.headers),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} – ${text}`);
  }

  return (await res.json()) as T;
}

function loadAutoTopupFromStorage(): AutoTopUpSettings {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      monthlyLimitUsd: 100,
      packSize: 50,
    };
  }
  try {
    const raw = window.localStorage.getItem(AUTO_TOPUP_KEY);
    if (!raw) {
      return {
        enabled: false,
        monthlyLimitUsd: 100,
        packSize: 50,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      monthlyLimitUsd: Number(parsed.monthlyLimitUsd || 100),
      packSize: Number(parsed.packSize || 50),
    };
  } catch {
    return {
      enabled: false,
      monthlyLimitUsd: 100,
      packSize: 50,
    };
  }
}

function saveAutoTopupToStorage(settings: AutoTopUpSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_TOPUP_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ===============================
// App
// ===============================

function App() {
  // Tabs
  const [activeTab, setActiveTab] = useState<TabId>("playground");

  // Health
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Credits
  const [credits, setCredits] = useState<CreditsBalancePayload | null>(null);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  // Session
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  // Editorial image input
  const [productImageUrl, setProductImageUrl] = useState("");
  const [styleImageUrl, setStyleImageUrl] = useState("");
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("Poetic");
  const [platform, setPlatform] = useState("tiktok");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);
  const [stylePresetKey, setStylePresetKey] = useState("");

  // Last outputs
  const [lastImageUrl, setLastImageUrl] = useState<string | null>(null);
  const [lastVideoUrl, setLastVideoUrl] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  // Image generation state
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Motion
  const [motionDescription, setMotionDescription] = useState("");
  const [isSuggestingMotion, setIsSuggestingMotion] = useState(false);
  const [isGeneratingMotion, setIsGeneratingMotion] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);

  // Feedback
  const [likeComment, setLikeComment] = useState("");
  const [likeSending, setLikeSending] = useState(false);
  const [likeMessage, setLikeMessage] = useState<string | null>(null);

  // Local history (this browser only)
  const [history, setHistory] = useState<GenerationItem[]>([]);

  // Auto top-up (local-only for now)
  const [autoTopupEnabled, setAutoTopupEnabled] = useState(
    () => loadAutoTopupFromStorage().enabled,
  );
  const [autoMonthlyLimit, setAutoMonthlyLimit] = useState<string>(() =>
    String(loadAutoTopupFromStorage().monthlyLimitUsd),
  );
  const [autoPackSize, setAutoPackSize] = useState<string>(() =>
    String(loadAutoTopupFromStorage().packSize),
  );

  // ===============================
  // API calls
  // ===============================

  async function handleCheckHealth() {
    setCheckingHealth(true);
    setHealthError(null);

    try {
      const data = await apiFetch<HealthPayload>("/health");
      setHealth(data);
    } catch (err: any) {
      setHealthError(err?.message || "Failed to reach Mina API");
    } finally {
      setCheckingHealth(false);
    }
  }

  async function handleLoadCredits() {
    setLoadingCredits(true);
    setCreditsError(null);

    try {
      const qp = encodeURIComponent(MOCK_CUSTOMER_ID);
      const data = await apiFetch<CreditsBalancePayload>(
        `/credits/balance?customerId=${qp}`,
      );
      setCredits(data);
    } catch (err: any) {
      setCreditsError(err?.message || "Failed to load credits");
    } finally {
      setLoadingCredits(false);
    }
  }

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;

    setCreatingSession(true);
    setSessionError(null);

    try {
      type StartSessionPayload = {
        ok: boolean;
        session: { id: string };
      };

      const data = await apiFetch<StartSessionPayload>("/sessions/start", {
        method: "POST",
        body: JSON.stringify({
          customerId: MOCK_CUSTOMER_ID,
          platform,
          title: "Mina session",
        }),
      });

      if (!data.ok || !data.session?.id) {
        throw new Error("Session start failed");
      }

      setSessionId(data.session.id);
      return data.session.id;
    } catch (err: any) {
      setSessionError(err?.message || "Failed to start session");
      throw err;
    } finally {
      setCreatingSession(false);
    }
  }

  async function handleGenerateImage() {
    setIsGeneratingImage(true);
    setGenerateError(null);
    setLastVideoUrl(null);

    try {
      const sid = await ensureSession();

      const styleImages = styleImageUrl
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      type EditorialResponse = {
        ok: boolean;
        imageUrl: string | null;
        imageUrls?: string[];
        prompt: string;
        sessionId: string;
        generationId: string;
      };

      const payload = {
        customerId: MOCK_CUSTOMER_ID,
        sessionId: sid,
        productImageUrl: productImageUrl || undefined,
        styleImageUrls: styleImages,
        brief: brief || undefined,
        tone: tone || undefined,
        platform,
        minaVisionEnabled,
        stylePresetKey: stylePresetKey || undefined,
      };

      const data = await apiFetch<EditorialResponse>("/editorial/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!data.ok) {
        throw new Error("Mina could not generate image");
      }
      if (!data.imageUrl) {
        throw new Error("No imageUrl returned from Mina");
      }

      const finalImageUrl = data.imageUrl;
      const nowIso = new Date().toISOString();

      setLastImageUrl(finalImageUrl);
      setLastPrompt(data.prompt);

      setHistory((prev) => {
        const next: GenerationItem[] = [
          {
            id: data.generationId || `image-${nowIso}`,
            kind: "image",
            url: finalImageUrl,
            prompt: data.prompt,
            createdAt: nowIso,
            platform,
            sessionId: data.sessionId || sid,
          },
          ...prev,
        ];
        return next.slice(0, 100);
      });

      // refresh credits after successful spend
      void handleLoadCredits();
    } catch (err: any) {
      setGenerateError(err?.message || "Failed to generate image");
    } finally {
      setIsGeneratingImage(false);
    }
  }

  async function handleSuggestMotion() {
    if (!lastImageUrl) {
      setMotionError(
        "Generate a still image first so Mina can propose a motion idea.",
      );
      return;
    }

    setIsSuggestingMotion(true);
    setMotionError(null);

    try {
      type MotionSuggestResponse = {
        ok: boolean;
        suggestion: string;
      };

      const payload = {
        customerId: MOCK_CUSTOMER_ID,
        referenceImageUrl: lastImageUrl,
        tone,
        platform,
        minaVisionEnabled,
        stylePresetKey: stylePresetKey || undefined,
      };

      const data = await apiFetch<MotionSuggestResponse>("/motion/suggest", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!data.ok || !data.suggestion) {
        throw new Error("No motion suggestion returned");
      }

      setMotionDescription(data.suggestion);
    } catch (err: any) {
      setMotionError(err?.message || "Failed to suggest motion");
    } finally {
      setIsSuggestingMotion(false);
    }
  }

  async function handleGenerateMotion() {
    if (!lastImageUrl) {
      setMotionError("Generate a still image first, or paste a lastImageUrl.");
      return;
    }
    if (!motionDescription.trim()) {
      setMotionError("Describe how Mina should move the scene first.");
      return;
    }

    setIsGeneratingMotion(true);
    setMotionError(null);

    try {
      const sid = await ensureSession();

      type MotionResponse = {
        ok: boolean;
        videoUrl: string | null;
        prompt: string;
        generationId: string;
        sessionId: string;
      };

      const payload = {
        customerId: MOCK_CUSTOMER_ID,
        sessionId: sid,
        lastImageUrl,
        motionDescription,
        tone,
        platform,
        minaVisionEnabled,
        stylePresetKey: stylePresetKey || undefined,
        durationSeconds: 5,
      };

      const data = await apiFetch<MotionResponse>("/motion/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!data.ok) {
        throw new Error("Mina could not generate motion");
      }
      if (!data.videoUrl) {
        throw new Error("No videoUrl returned from Mina");
      }

      const finalVideoUrl = data.videoUrl;
      const nowIso = new Date().toISOString();

      setLastVideoUrl(finalVideoUrl);
      setLastPrompt(data.prompt);

      setHistory((prev) => {
        const next: GenerationItem[] = [
          {
            id: data.generationId || `motion-${nowIso}`,
            kind: "motion",
            url: finalVideoUrl,
            prompt: data.prompt,
            createdAt: nowIso,
            platform,
            sessionId: data.sessionId || sid,
          },
          ...prev,
        ];
        return next.slice(0, 100);
      });

      void handleLoadCredits();
    } catch (err: any) {
      setMotionError(err?.message || "Failed to generate motion");
    } finally {
      setIsGeneratingMotion(false);
    }
  }

  async function handleSendLike() {
    if (!lastPrompt || (!lastImageUrl && !lastVideoUrl)) {
      setLikeMessage("Generate something first.");
      return;
    }

    setLikeSending(true);
    setLikeMessage(null);

    try {
      const isMotion = Boolean(lastVideoUrl);

      type LikeResponse = {
        ok: boolean;
        message: string;
      };

      const body: any = {
        customerId: MOCK_CUSTOMER_ID,
        resultType: isMotion ? "motion" : "image",
        platform,
        prompt: lastPrompt,
        comment: likeComment || undefined,
        imageUrl: !isMotion ? lastImageUrl : undefined,
        videoUrl: isMotion ? lastVideoUrl : undefined,
        sessionId,
      };

      const data = await apiFetch<LikeResponse>("/feedback/like", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!data.ok) {
        throw new Error(data.message || "Like failed");
      }

      setLikeMessage("Saved. Mina Vision will remember this vibe. ✨");
      setLikeComment("");
    } catch (err: any) {
      setLikeMessage(err?.message || "Failed to send feedback");
    } finally {
      setLikeSending(false);
    }
  }

  async function handleDevAddCredits() {
    try {
      await apiFetch("/credits/add", {
        method: "POST",
        body: JSON.stringify({
          customerId: MOCK_CUSTOMER_ID,
          amount: 999999,
          reason: "dev-test",
          source: "frontend-dev",
        }),
      });
      void handleLoadCredits();
    } catch {
      // ignore
    }
  }

  // ===============================
  // Effects
  // ===============================

  useEffect(() => {
    void handleCheckHealth();
    void handleLoadCredits();
  }, []);

  useEffect(() => {
    const limit = Number(autoMonthlyLimit || "0");
    const pack = Number(autoPackSize || "0");

    const settings: AutoTopUpSettings = {
      enabled: autoTopupEnabled,
      monthlyLimitUsd: Number.isFinite(limit) && limit > 0 ? limit : 100,
      packSize: Number.isFinite(pack) && pack > 0 ? pack : 50,
    };

    saveAutoTopupToStorage(settings);
  }, [autoTopupEnabled, autoMonthlyLimit, autoPackSize]);

  // ===============================
  // Render
  // ===============================

  return (
    <div className="mina-root">
      <header className="mina-header">
        <div className="mina-logo">Mina Editorial AI</div>
        <div className="mina-header-right">
          <div className="mina-tabs">
            <button
              type="button"
              className={activeTab === "playground" ? "tab active" : "tab"}
              onClick={() => setActiveTab("playground")}
            >
              Playground
            </button>
            <button
              type="button"
              className={activeTab === "profile" ? "tab active" : "tab"}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
          </div>
          <div className="mina-credits-badge">
            <span>{credits ? `${credits.balance} Machta` : "— Machta"}</span>
          </div>
        </div>
      </header>

      <main className="mina-main">
        {activeTab === "playground" ? (
          <div className="mina-layout">
            {/* LEFT SIDE – controls */}
            <div className="mina-left">
              {/* Connection */}
              <section className="mina-section">
                <div className="section-title">
                  <span className="step-dot step-done" />
                  <span>Connection</span>
                </div>
                <div className="section-body">
                  <div className="status-row">
                    <span className="status-label">API</span>
                    {checkingHealth ? (
                      <span className="status-chip">Checking…</span>
                    ) : health?.ok ? (
                      <span className="status-chip ok">Online</span>
                    ) : (
                      <span className="status-chip error">Error</span>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      onClick={handleCheckHealth}
                    >
                      refresh
                    </button>
                  </div>
                  {healthError && (
                    <div className="status-error">{healthError}</div>
                  )}

                  <div className="status-row">
                    <span className="status-label">Credits</span>
                    {loadingCredits ? (
                      <span className="status-chip">Loading…</span>
                    ) : credits ? (
                      <span className="status-chip ok">
                        {credits.balance} Machta
                      </span>
                    ) : (
                      <span className="status-chip">—</span>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      onClick={handleLoadCredits}
                    >
                      refresh
                    </button>
                    <button
                      type="button"
                      className="link-button subtle"
                      onClick={handleDevAddCredits}
                    >
                      dev +9,999,99
                    </button>
                  </div>
                  {creditsError && (
                    <div className="status-error">{creditsError}</div>
                  )}
                  {sessionError && (
                    <div className="status-error">{sessionError}</div>
                  )}
                </div>
              </section>

              {/* Still generation */}
              <section className="mina-section">
                <div className="section-title">
                  <span className="step-dot" />
                  <span>Still life</span>
                </div>
                <div className="section-body">
                  <label className="field">
                    <div className="field-label">Product image URL</div>
                    <input
                      className="field-input"
                      type="text"
                      placeholder="https://… main product image"
                      value={productImageUrl}
                      onChange={(e) => setProductImageUrl(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <div className="field-label">
                      Style references (comma separated URLs)
                    </div>
                    <input
                      className="field-input"
                      type="text"
                      placeholder="https://… , https://…"
                      value={styleImageUrl}
                      onChange={(e) => setStyleImageUrl(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <div className="field-label">Brief</div>
                    <textarea
                      className="field-textarea"
                      placeholder="Tell Mina what you want to create…"
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                    />
                  </label>

                  <div className="field-row">
                    <label className="field field-inline">
                      <div className="field-label">Tone</div>
                      <input
                        className="field-input"
                        type="text"
                        placeholder="Poetic"
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                      />
                    </label>

                    <label className="field field-inline">
                      <div className="field-label">Platform</div>
                      <select
                        className="field-input"
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                      >
                        <option value="tiktok">TikTok / Reels (9:16)</option>
                        <option value="instagram">Instagram Post (4:5)</option>
                        <option value="youtube">YouTube (16:9)</option>
                      </select>
                    </label>
                  </div>

                  <div className="field-row">
                    <label className="field field-inline">
                      <div className="field-label">Style preset</div>
                      <select
                        className="field-input"
                        value={stylePresetKey}
                        onChange={(e) => setStylePresetKey(e.target.value)}
                      >
                        <option value="">None</option>
                        <option value="soft-desert-editorial">
                          Soft Desert Editorial
                        </option>
                        <option value="chrome-neon-night">
                          Chrome Neon Night
                        </option>
                        <option value="bathroom-ritual">
                          Bathroom Ritual
                        </option>
                      </select>
                    </label>

                    <label className="field-toggle">
                      <input
                        type="checkbox"
                        checked={minaVisionEnabled}
                        onChange={(e) => setMinaVisionEnabled(e.target.checked)}
                      />
                      <span
                        className={
                          minaVisionEnabled
                            ? "toggle-label on"
                            : "toggle-label off"
                        }
                      >
                        Mina Vision Intelligence
                      </span>
                    </label>
                  </div>

                  <div className="section-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleGenerateImage}
                      disabled={isGeneratingImage || creatingSession}
                    >
                      {isGeneratingImage ? "Composing still…" : "Create still"}
                    </button>
                    {generateError && (
                      <div className="error-text">{generateError}</div>
                    )}
                  </div>
                </div>
              </section>

              {/* Motion */}
              <section className="mina-section">
                <div className="section-title">
                  <span className="step-dot" />
                  <span>Motion</span>
                </div>
                <div className="section-body">
                  <div className="hint">
                    Mina will read the last still, then suggest and create short
                    motion (up to ~10s).
                  </div>

                  <label className="field">
                    <div className="field-label">
                      Motion idea (Mina writes first, then you can edit)
                    </div>
                    <textarea
                      className="field-textarea"
                      placeholder="Slow editorial camera drift with soft breeze and moving shadows…"
                      value={motionDescription}
                      onChange={(e) => setMotionDescription(e.target.value)}
                    />
                  </label>

                  <div className="section-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleSuggestMotion}
                      disabled={isSuggestingMotion || !lastImageUrl}
                    >
                      {isSuggestingMotion ? "Thinking motion…" : "Suggest motion"}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleGenerateMotion}
                      disabled={isGeneratingMotion}
                    >
                      {isGeneratingMotion ? "Rendering motion…" : "Create motion"}
                    </button>
                  </div>

                  {motionError && (
                    <div className="error-text">{motionError}</div>
                  )}
                </div>
              </section>

              {/* Feedback */}
              <section className="mina-section">
                <div className="section-title">
                  <span className="step-dot" />
                  <span>Tell Mina what you liked</span>
                </div>
                <div className="section-body">
                  <label className="field">
                    <div className="field-label">
                      Speak to me (what you like / dislike)
                    </div>
                    <textarea
                      className="field-textarea"
                      placeholder="“I love the soft breeze and minimal backdrop, but the light is too harsh.”"
                      value={likeComment}
                      onChange={(e) => setLikeComment(e.target.value)}
                    />
                  </label>
                  <div className="section-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={handleSendLike}
                      disabled={likeSending}
                    >
                      {likeSending
                        ? "Saving to Mina Vision…"
                        : "Save feedback + like"}
                    </button>
                    {likeMessage && (
                      <div className="hint small">{likeMessage}</div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* RIGHT SIDE – output */}
            <div className="mina-right">
              <div className="output-shell">
                {!lastImageUrl && !lastVideoUrl ? (
                  <div className="output-placeholder">
                    <p>Mina will show your stills and motions here.</p>
                    <p className="hint">
                      Start by pasting a product image URL on the left.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="output-media">
                      {lastVideoUrl ? (
                        <video
                          src={lastVideoUrl}
                          controls
                          autoPlay
                          loop
                          playsInline
                        />
                      ) : lastImageUrl ? (
                        <img src={lastImageUrl} alt="Mina still" />
                      ) : null}
                    </div>
                    <div className="output-meta">
                      <div className="output-tag-row">
                        <span className="output-tag">
                          {lastVideoUrl ? "Motion" : "Still"}
                        </span>
                        <span className="output-tag subtle">
                          {platform.toUpperCase()}
                        </span>
                      </div>
                      {lastPrompt && (
                        <p className="output-prompt">{lastPrompt}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          // =====================
          // PROFILE TAB
          // =====================
          <div className="profile-layout">
            {/* Profile & balance */}
            <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot step-done" />
                <span>Profile & balance</span>
              </div>
              <div className="section-body profile-body">
                <div>
                  <div className="profile-label">Customer id (mock)</div>
                  <div className="profile-value">{MOCK_CUSTOMER_ID}</div>
                  <div className="profile-hint">
                    Later this will be your real Shopify / Mina account id.
                  </div>
                </div>
                <div>
                  <div className="profile-label">Credits</div>
                  <div className="profile-value">
                    {credits ? `${credits.balance} Machta` : "—"}
                  </div>
                  <div className="profile-hint">
                    1 still ≈ {credits?.meta.imageCost ?? 1} Machta · 1 motion ≈{" "}
                    {credits?.meta.motionCost ?? 5} Machta
                  </div>
                </div>
                <div>
                  <div className="profile-label">
                    This browser’s gallery only
                  </div>
                  <div className="profile-value">
                    {history.length} generations
                  </div>
                  <div className="profile-hint">
                    For now gallery is local. Later we’ll sync with your account.
                  </div>
                </div>
              </div>
            </section>

            {/* Auto top-up settings (local proto) */}
            <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot" />
                <span>Auto top-up (prototype)</span>
              </div>
              <div className="section-body profile-body">
                <div className="auto-topup-row">
                  <label className="field-toggle">
                    <input
                      type="checkbox"
                      checked={autoTopupEnabled}
                      onChange={(e) => setAutoTopupEnabled(e.target.checked)}
                    />
                    <span
                      className={
                        autoTopupEnabled
                          ? "toggle-label on"
                          : "toggle-label off"
                      }
                    >
                      Automatically buy credits when I’m empty
                    </span>
                  </label>
                  <div className="profile-hint">
                    Saved only in this browser. Later this will connect to
                    Stripe + real billing.
                  </div>
                </div>

                <div className="auto-topup-grid">
                  <label className="field">
                    <div className="field-label">
                      Top-up pack size <span className="field-unit">Machta</span>
                    </div>
                    <input
                      className="field-input"
                      type="number"
                      min={1}
                      step={1}
                      value={autoPackSize}
                      onChange={(e) => setAutoPackSize(e.target.value)}
                    />
                  </label>

                  <label className="field">
                    <div className="field-label">
                      Monthly limit{" "}
                      <span className="field-unit">USD (for you)</span>
                    </div>
                    <input
                      className="field-input"
                      type="number"
                      min={1}
                      step={1}
                      value={autoMonthlyLimit}
                      onChange={(e) => setAutoMonthlyLimit(e.target.value)}
                    />
                  </label>
                </div>

                <div className="profile-hint">
                  Not charging anything yet – this is just to shape the
                  experience like the OpenAI API: a monthly ceiling and an
                  auto-refill pack.{" "}
                  <span className="profile-hint-strong">
                    Your backend logic will later read these values and decide
                    when to call Stripe.
                  </span>
                </div>
              </div>
            </section>

            {/* Gallery */}
            <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot" />
                <span>Gallery (local)</span>
              </div>
              <div className="section-body">
                {history.length === 0 ? (
                  <div className="hint">
                    Generate stills or motions in the Playground and they will
                    appear here as your Mina grid.
                  </div>
                ) : (
                  <div className="gallery-grid">
                    {history.map((item) => (
                      <div className="gallery-item" key={item.id}>
                        <div className="gallery-media">
                          {item.kind === "motion" ? (
                            <video src={item.url} playsInline loop muted />
                          ) : (
                            <img src={item.url} alt={item.kind} />
                          )}
                        </div>
                        <div className="gallery-meta">
                          <div className="gallery-meta-top">
                            <span className="gallery-tag">
                              {item.kind === "motion" ? "Motion" : "Still"}
                            </span>
                            <span className="gallery-tag subtle">
                              {item.platform.toUpperCase()}
                            </span>
                          </div>
                          <div className="gallery-date">
                            {new Date(item.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
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

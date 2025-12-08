import React, { useEffect, useMemo, useState } from "react";

const API_BASE_URL =
import.meta.env.VITE_MINA_API_BASE_URL ??
"[https://mina-editorial-ai-api.onrender.com](https://mina-editorial-ai-api.onrender.com)";

type HealthPayload = {
ok: boolean;
service?: string;
time?: string;
};

type CreditsPayload = {
ok: boolean;
customerId: string;
balance: number;
meta?: {
imageCost: number;
motionCost: number;
};
};

type Mode = "still" | "motion";

type GalleryItem = {
url: string;
createdAt: string;
};

const DEFAULT_CUSTOMER_ID = "8766256447571";

const App: React.FC = () => {
const [mode, setMode] = useState<Mode>("still");

// API status
const [health, setHealth] = useState<HealthPayload | null>(null);
const [checkingHealth, setCheckingHealth] = useState(false);
const [healthError, setHealthError] = useState<string | null>(null);

// Customer + credits
const [customerId, setCustomerId] = useState<string>(DEFAULT_CUSTOMER_ID);
const [credits, setCredits] = useState<CreditsPayload | null>(null);
const [checkingCredits, setCheckingCredits] = useState(false);
const [creditsError, setCreditsError] = useState<string | null>(null);

// Still form
const [productImageUrl, setProductImageUrl] = useState("");
const [referencesUrl, setReferencesUrl] = useState("");
const [brief, setBrief] = useState("");
const [tone, setTone] = useState("");
const [platform, setPlatform] = useState("tiktok");
const [minaVision, setMinaVision] = useState(true);

const [isGeneratingStill, setIsGeneratingStill] = useState(false);
const [generationError, setGenerationError] = useState<string | null>(null);

// Gallery / latest image
const [gallery, setGallery] = useState<GalleryItem[]>([]);
const [activeIndex, setActiveIndex] = useState(0);
const [latestPrompt, setLatestPrompt] = useState<string | null>(null);

// ---- Notion-like steps ----

const steps = useMemo(
() => ({
description: brief.trim().length > 0,
format: !!platform,
style: tone.trim().length > 0,
product: productImageUrl.trim().length > 0,
refs: referencesUrl.trim().length > 0,
vision: minaVision,
}),
[brief, platform, tone, productImageUrl, referencesUrl, minaVision]
);

// ---- API helpers ----

async function checkHealth() {
if (!API_BASE_URL) {
setHealthError("Missing VITE_MINA_API_BASE_URL env var.");
return;
}

```
try {
  setCheckingHealth(true);
  setHealthError(null);
  const res = await fetch(API_BASE_URL + "/health");
  const data: HealthPayload = await res.json();
  setHealth(data);
} catch (err: any) {
  setHealthError(err?.message || "Failed to reach Mina API.");
} finally {
  setCheckingHealth(false);
}
```

}

async function fetchCredits(id: string) {
if (!API_BASE_URL) return;
const trimmed = id.trim();
if (!trimmed) return;

```
try {
  setCheckingCredits(true);
  setCreditsError(null);

  const url = new URL(API_BASE_URL + "/credits/balance");
  url.searchParams.set("customerId", trimmed);

  const res = await fetch(url.toString());
  const data = (await res.json()) as CreditsPayload & {
    meta?: { imageCost: number; motionCost: number };
  };

  setCredits({
    ok: data.ok,
    customerId: data.customerId,
    balance: data.balance,
    meta: data.meta,
  });
} catch (err: any) {
  setCreditsError(err?.message || "Could not fetch credits.");
} finally {
  setCheckingCredits(false);
}
```

}

// Dev helper: give this customer a huge balance
async function grantDevCredits() {
if (!API_BASE_URL) return;

```
try {
  setCreditsError(null);
  const cid = (customerId.trim() || DEFAULT_CUSTOMER_ID);

  const res = await fetch(API_BASE_URL + "/credits/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customerId: cid,
      amount: 9999999,
      reason: "dev-topup",
      source: "frontend-dev",
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.message || "Top-up failed");
  }

  await fetchCredits(cid);
} catch (err: any) {
  setCreditsError(
    err?.message || "Dev top-up failed. Check /credits/add endpoint."
  );
}
```

}

async function createStill() {
if (!API_BASE_URL) return;

```
setGenerationError(null);

if (!brief.trim() && !productImageUrl.trim()) {
  setGenerationError("Give Mina at least a brief or a product image URL.");
  return;
}

try {
  setIsGeneratingStill(true);

  const payload = {
    productImageUrl: productImageUrl.trim() || undefined,
    styleImageUrls: referencesUrl
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    brief: brief.trim(),
    tone: tone.trim(),
    platform,
    minaVisionEnabled: minaVision,
    customerId: customerId.trim() || DEFAULT_CUSTOMER_ID,
  };

  const res = await fetch(API_BASE_URL + "/editorial/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(data.message || "Generation failed.");
  }

  const url: string | null = data.imageUrl || null;
  const urls: string[] = Array.isArray(data.imageUrls)
    ? data.imageUrls
    : url
    ? [url]
    : [];

  if (!urls.length) {
    throw new Error("Mina responded but no image URL found.");
  }

  const now = new Date().toISOString();
  const newItems: GalleryItem[] = urls.map((u) => ({
    url: u,
    createdAt: now,
  }));

  setGallery((prev) => [...newItems, ...prev]);
  setActiveIndex(0);
  setLatestPrompt(data.prompt || null);

  await fetchCredits(customerId.trim() || DEFAULT_CUSTOMER_ID);
} catch (err: any) {
  setGenerationError(err?.message || "Something went wrong.");
} finally {
  setIsGeneratingStill(false);
}
```

}

useEffect(() => {
checkHealth();
fetchCredits(DEFAULT_CUSTOMER_ID);
}, []);

const activeImage = gallery[activeIndex] || null;

return ( <div className="mina-root"> <header className="mina-header"> <div className="mina-header-left"> <div className="mina-logo-wordmark"> <span className="mina-logo-dot" /> <span className="mina-logo-text">Mina Editorial AI</span> <span className="mina-logo-tag">Falta Studio</span> </div>

```
      <nav className="mina-nav">
        <button
          className={
            "mina-nav-tab " + (mode === "still" ? "is-active" : "")
          }
          onClick={() => setMode("still")}
        >
          Still life images
        </button>
        <button
          className={
            "mina-nav-tab " + (mode === "motion" ? "is-active" : "")
          }
          onClick={() => setMode("motion")}
        >
          Animate this
        </button>
      </nav>
    </div>

    <div className="mina-header-right">
      <div className="mina-status-pill">
        <span
          className={
            "mina-status-dot " + (health && health.ok ? "ok" : "off")
          }
        />
        <span className="mina-status-label">API</span>
        <span className="mina-status-value">
          {checkingHealth
            ? "Checking..."
            : health && health.ok
            ? "Online"
            : "Offline"}
        </span>
        {health && health.time && (
          <span className="mina-status-time">
            {new Date(health.time).toLocaleString()}
          </span>
        )}
      </div>

      <div className="mina-credits">
        <div className="mina-credits-top">
          <span className="mina-credits-label">Credits</span>
          <span className="mina-credits-value">
            {checkingCredits
              ? "—"
              : credits && typeof credits.balance === "number"
              ? credits.balance.toLocaleString()
              : "0"}
          </span>
        </div>
        <div className="mina-credits-sub">
          <span>
            {(credits && credits.meta && credits.meta.imageCost) || 1} img ·{" "}
            {(credits && credits.meta && credits.meta.motionCost) || 5} motion
          </span>
          <button
            type="button"
            className="mina-credits-dev"
            onClick={grantDevCredits}
          >
            Dev: 9,999,999 → this user
          </button>
        </div>
      </div>
    </div>
  </header>

  <main className="mina-main">
    {/* LEFT: Notion-like form */}
    <section className="mina-pane mina-pane-left">
      <div className="mina-left-inner">
        <div className="mina-customer-row">
          <label className="mina-customer-label">Customer ID</label>
          <div className="mina-customer-input-row">
            <input
              className="mina-input mina-input-underlined"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              onBlur={() =>
                fetchCredits(customerId.trim() || DEFAULT_CUSTOMER_ID)
              }
            />
            <button
              type="button"
              className="mina-small-link"
              onClick={() =>
                fetchCredits(customerId.trim() || DEFAULT_CUSTOMER_ID)
              }
            >
              Refresh credits
            </button>
          </div>
        </div>

        <div className="mina-steps">
          <StepRow
            label="Describe how you want your photo to feel."
            done={steps.description}
          >
            <textarea
              className="mina-textarea"
              placeholder="Soft desert ritual, warm light, minimal props..."
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </StepRow>

          <StepRow label="Choose the format." done={steps.format}>
            <select
              className="mina-select"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="tiktok">TikTok / Reels · 9:16</option>
              <option value="square">Square · 1:1</option>
              <option value="youtube">YouTube · 16:9</option>
            </select>
          </StepRow>

          <StepRow
            label="Describe the editorial style / tone."
            done={steps.style}
          >
            <input
              className="mina-input mina-input-underlined"
              placeholder="Calm, sensual, clinical..."
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            />
          </StepRow>

          <StepRow
            label="+ upload / paste your product image URL."
            done={steps.product}
          >
            <input
              className="mina-input mina-input-underlined"
              placeholder="https://… (drag & drop later)"
              value={productImageUrl}
              onChange={(e) => setProductImageUrl(e.target.value)}
            />
          </StepRow>

          <StepRow
            label="+ upload / paste style reference URLs (comma separated)."
            done={steps.refs}
          >
            <input
              className="mina-input mina-input-underlined"
              placeholder="https://ref-1…, https://ref-2…"
              value={referencesUrl}
              onChange={(e) => setReferencesUrl(e.target.value)}
            />
          </StepRow>

          <StepRow label="Mina Vision Intelligence." done={steps.vision}>
            <ToggleLine
              checked={minaVision}
              onChange={setMinaVision}
              label={minaVision ? "ON" : "OFF"}
            />
          </StepRow>
        </div>

        <div className="mina-actions">
          <button
            type="button"
            className="mina-primary-link"
            onClick={createStill}
            disabled={isGeneratingStill}
          >
            {isGeneratingStill ? "Creating…" : "Create still"}
          </button>
          {generationError && (
            <div className="mina-error-text">{generationError}</div>
          )}
          {creditsError && (
            <div className="mina-error-text">{creditsError}</div>
          )}
          {healthError && (
            <div className="mina-error-text">{healthError}</div>
          )}
        </div>
      </div>
    </section>

    {/* RIGHT: image frame */}
    <section className="mina-pane mina-pane-right">
      <div className="mina-right-inner">
        <div className="mina-right-frame">
          {activeImage ? (
            <img
              src={activeImage.url}
              alt="Mina latest still"
              className="mina-still-image"
            />
          ) : (
            <div className="mina-placeholder">
              <div className="mina-placeholder-title">Latest still</div>
              <div className="mina-placeholder-text">
                When you create a still, it will appear here in a full-bleed
                editorial frame.
              </div>
            </div>
          )}
        </div>

        <div className="mina-right-bottom">
          <div className="mina-carousel-dots">
            {gallery.length > 1 &&
              gallery.map((item, idx) => (
                <button
                  key={item.createdAt + "_" + idx}
                  className={"mina-dot " + (idx === activeIndex ? "is-active" : "")}
                  onClick={() => setActiveIndex(idx)}
                />
              ))}
          </div>

          <div className="mina-prompt-box">
            {latestPrompt ? (
              <>
                <div className="mina-prompt-label">
                  What Mina asked the model:
                </div>
                <div className="mina-prompt-text">{latestPrompt}</div>
              </>
            ) : (
              <div className="mina-prompt-empty">
                Speak to me later about what you like and dislike about my
                generations. I will remember.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  </main>
</div>
```

);
};

// ---- Small helper components ----

interface StepRowProps {
label: string;
done?: boolean;
children: React.ReactNode;
}

const StepRow: React.FC<StepRowProps> = ({ label, done, children }) => {
return ( <div className="mina-step-row">
<div className={"mina-step-line " + (done ? "is-done" : "")} /> <div className="mina-step-body"> <div className="mina-step-label">{label}</div> <div className="mina-step-control">{children}</div> </div> </div>
);
};

interface ToggleLineProps {
checked: boolean;
onChange: (val: boolean) => void;
label: string;
}

const ToggleLine: React.FC<ToggleLineProps> = ({
checked,
onChange,
label,
}) => {
return (
<button
type="button"
className={"mina-toggle " + (checked ? "is-on" : "is-off")}
onClick={() => onChange(!checked)}
> <span className="mina-toggle-pill"> <span className="mina-toggle-knob" /> </span> <span className="mina-toggle-label">{label}</span> </button>
);
};

export default App;

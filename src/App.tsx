import React, {
useCallback,
useEffect,
useMemo,
useState,
} from "react";

type HealthState = "checking" | "ok" | "error";
type Mode = "still" | "motion";
type UploadFieldKey = "product" | "ref1" | "ref2" | "ref3";

interface CreditsState {
balance: number | null;
loading: boolean;
error: string | null;
imageCost: number | null;
motionCost: number | null;
}

interface CreditsResponse {
balance?: number;
meta?: {
imageCost?: number;
motionCost?: number;
};
}

interface StillResult {
url: string;
prompt?: string;
generationId?: string;
sessionId?: string;
createdAt: string;
}

interface MotionResult {
videoUrl: string;
prompt?: string;
generationId?: string;
sessionId?: string;
createdAt: string;
}

interface EditorialGenerateResponse {
imageUrl?: string;
imageUrls?: string[];
prompt?: string;
generationId?: string;
sessionId?: string;
credits?: {
balance?: number;
};
}

const STYLE_PRESETS: { key: string; label: string }[] = [
{ key: "", label: "No preset" },
{ key: "soft-desert-editorial", label: "Soft desert editorial" },
{ key: "chrome-neon-night", label: "Chrome neon night" },
{ key: "bathroom-ritual", label: "Bathroom ritual" },
];

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
{ value: "tiktok_reel", label: "TikTok / Reels · 9:16" },
{ value: "instagram_post", label: "Instagram Post · 4:5" },
{ value: "youtube_horizontal", label: "YouTube Horizontal · 16:9" },
];

function isLikelyUrl(text: string): boolean {
const trimmed = text.trim();
if (!trimmed) return false;
return /^https?:///i.test(trimmed);
}

function computeMidtoneFromImage(img: HTMLImageElement): string {
try {
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
if (!ctx) return "#DDD9CC";


const sourceWidth = img.naturalWidth || img.width;
const sourceHeight = img.naturalHeight || img.height;
if (!sourceWidth || !sourceHeight) return "#DDD9CC";

const sampleSize = 32;
canvas.width = sampleSize;
canvas.height = sampleSize;

ctx.drawImage(
  img,
  (sourceWidth - sampleSize) / 2,
  (sourceHeight - sampleSize) / 2,
  sampleSize,
  sampleSize,
  0,
  0,
  sampleSize,
  sampleSize
);

const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
const data = imageData.data;

let r = 0;
let g = 0;
let b = 0;
let count = 0;

for (let i = 0; i < data.length; i += 4) {
  r += data[i];
  g += data[i + 1];
  b += data[i + 2];
  count++;
}

if (!count) return "#DDD9CC";

r = Math.round(r / count);
g = Math.round(g / count);
b = Math.round(b / count);

const mix = (c: number) => Math.round((c + 235) / 2);
const mr = mix(r);
const mg = mix(g);
const mb = mix(b);

return `rgb(${mr}, ${mg}, ${mb})`;
 

} catch (err) {
console.warn("Could not compute midtone color", err);
return "#DDD9CC";
}
}

const App: React.FC = () => {
const [healthState, setHealthState] = useState<HealthState>("checking");
const [healthMessage, setHealthMessage] = useState(
"Checking Mina backend..."
);

const [mode, setMode] = useState<Mode>("still");

const [customerId, setCustomerId] = useState("");
const [sessionId, setSessionId] = useState<string | null>(null);

const [credits, setCredits] = useState<CreditsState>({
balance: null,
loading: false,
error: null,
imageCost: null,
motionCost: null,
});

// Still controls
const [productUrl, setProductUrl] = useState("");
const [refUrl1, setRefUrl1] = useState("");
const [refUrl2, setRefUrl2] = useState("");
const [refUrl3, setRefUrl3] = useState("");
const [brief, setBrief] = useState("");
const [tone, setTone] = useState("Soft, editorial, ASMR still life");
const [platform, setPlatform] = useState(PLATFORM_OPTIONS[0].value);
const [stylePresetKey, setStylePresetKey] = useState<string>("");
const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);

const [activeUploadField, setActiveUploadField] =
useState<UploadFieldKey>("product");
const [isDragging, setIsDragging] = useState(false);
const [uploadError, setUploadError] = useState<string | null>(null);

const [stillLoading, setStillLoading] = useState(false);
const [stillError, setStillError] = useState<string | null>(null);
const [lastStill, setLastStill] = useState<StillResult | null>(null);
const [stillHistory, setStillHistory] = useState<StillResult[]>([]);
const [midtoneColor, setMidtoneColor] = useState<string>("#DDD9CC");
const [imageAspect, setImageAspect] = useState<
"portrait" | "landscape" | "square"

> ("landscape");
> const [feedbackComment, setFeedbackComment] = useState("");
> const [likeSending, setLikeSending] = useState(false);

// Motion controls
const [motionDescription, setMotionDescription] = useState("");
const [motionSuggestLoading, setMotionSuggestLoading] = useState(false);
const [motionLoading, setMotionLoading] = useState(false);
const [motionError, setMotionError] = useState<string | null>(null);
const [motionResult, setMotionResult] = useState<MotionResult | null>(null);
const [motionFeedbackComment, setMotionFeedbackComment] = useState("");
const [motionLikeSending, setMotionLikeSending] = useState(false);

// API base
const { apiBaseUrl, hasEnv } = useMemo(() => {
const raw =
import.meta.env.VITE_MINA_API_BASE_URL || "[http://localhost:3000](http://localhost:3000)";
const cleaned = raw.replace(//+$/, "");
return {
apiBaseUrl: cleaned,
hasEnv: Boolean(import.meta.env.VITE_MINA_API_BASE_URL),
};
}, []);

// Load stored customerId once
useEffect(() => {
try {
const stored = window.localStorage.getItem("mina.customerId");
if (stored) {
setCustomerId(stored);
}
} catch {
// ignore
}
}, []);

// Persist customerId
useEffect(() => {
const trimmed = customerId.trim();
if (!trimmed) return;
try {
window.localStorage.setItem("mina.customerId", trimmed);
} catch {
// ignore
}
}, [customerId]);

// Health check
useEffect(() => {
const run = async () => {
try {
const res = await fetch(`${apiBaseUrl}/health`);
if (!res.ok) {
throw new Error(`HTTP ${res.status}`);
}
const json = await res.json().catch(() => ({}));
console.log("Mina /health:", json);
setHealthState("ok");
setHealthMessage("Mina backend is online.");
} catch (err) {
console.error("Error calling /health:", err);
setHealthState("error");
setHealthMessage(
"Cannot reach Mina backend. Check API URL, server status, or CORS."
);
}
};
run();
}, [apiBaseUrl]);

const refreshCredits = useCallback(
async (customerIdOverride?: string) => {
const id = (customerIdOverride ?? customerId).trim();
if (!id) return;

 
  setCredits((prev) => ({
    ...prev,
    loading: true,
    error: null,
  }));

  try {
    const res = await fetch(
      `${apiBaseUrl}/credits/balance?customerId=${encodeURIComponent(id)}`
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data: CreditsResponse = await res.json();
    const balance =
      typeof data.balance === "number" && Number.isFinite(data.balance)
        ? data.balance
        : 0;
    const imageCost =
      typeof data.meta?.imageCost === "number"
        ? data.meta.imageCost
        : null;
    const motionCost =
      typeof data.meta?.motionCost === "number"
        ? data.meta.motionCost
        : null;

    setCredits({
      balance,
      loading: false,
      error: null,
      imageCost,
      motionCost,
    });
  } catch (err) {
    console.error("Error calling /credits/balance:", err);
    setCredits((prev) => ({
      ...prev,
      loading: false,
      error: "Could not load credits.",
    }));
  }
},
[apiBaseUrl, customerId]
 

);

// Debounced credits refresh on customerId change
useEffect(() => {
const trimmed = customerId.trim();
if (!trimmed || trimmed.length < 3) return;
const handle = window.setTimeout(() => {
refreshCredits(trimmed);
}, 500);
return () => window.clearTimeout(handle);
}, [customerId, refreshCredits]);

const ensureSession = useCallback(
async (platformValue: string): Promise<string | null> => {
if (sessionId) return sessionId;
const id = customerId.trim();
if (!id) return null;

 
  try {
    const res = await fetch(`${apiBaseUrl}/sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: id,
        platform: platformValue,
        title: "Mina editorial session",
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const newId: string | null =
      data.sessionId || data.id || data.session || null;
    if (newId) {
      setSessionId(newId);
    }
    return newId;
  } catch (err) {
    console.error("Error creating session:", err);
    return null;
  }
},
[apiBaseUrl, customerId, sessionId]
 

);

const applyUrlToField = useCallback(
(field: UploadFieldKey, url: string) => {
const clean = url.trim();
if (!clean) return;
setUploadError(null);
switch (field) {
case "product":
setProductUrl(clean);
break;
case "ref1":
setRefUrl1(clean);
break;
case "ref2":
setRefUrl2(clean);
break;
case "ref3":
setRefUrl3(clean);
break;
default:
break;
}
},
[]
);

// Global paste handler – use `any` type to avoid TS build issues
useEffect(() => {
const handler = (e: any) => {
const text =
(e.clipboardData && e.clipboardData.getData("text/plain")) || "";
if (!text || !isLikelyUrl(text)) return;
e.preventDefault();
applyUrlToField(activeUploadField, text);
};

 
window.addEventListener("paste", handler as any);
return () => {
  window.removeEventListener("paste", handler as any);
};
 

}, [activeUploadField, applyUrlToField]);

const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
e.preventDefault();
};

const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
e.preventDefault();
setIsDragging(true);
};

const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
e.preventDefault();
setIsDragging(false);
};

const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
e.preventDefault();
setIsDragging(false);
setUploadError(null);

 
const dt = e.dataTransfer;
if (!dt) return;

if (dt.files && dt.files.length > 0) {
  setUploadError(
    "Local image files will be supported later. For now, drop or paste an image URL."
  );
  return;
}

const uriList = dt.getData("text/uri-list");
const text = dt.getData("text/plain");
const candidate = uriList || text;
if (candidate && isLikelyUrl(candidate)) {
  applyUrlToField(activeUploadField, candidate);
} else if (candidate) {
  setUploadError(
    "Drop an image URL starting with http:// or https:// for now."
  );
}
 

};

const handleStillImageLoad = (
e: React.SyntheticEvent<HTMLImageElement, Event>
) => {
const img = e.currentTarget;
const w = img.naturalWidth || img.width;
const h = img.naturalHeight || img.height;

 
if (w && h) {
  if (h > w * 1.1) {
    setImageAspect("portrait");
  } else if (w > h * 1.1) {
    setImageAspect("landscape");
  } else {
    setImageAspect("square");
  }
}

const color = computeMidtoneFromImage(img);
setMidtoneColor(color);
 

};

const handleGenerateStill = async () => {
const id = customerId.trim();
if (!id) {
setStillError("Add a customer ID first.");
return;
}
if (!productUrl.trim() && !brief.trim()) {
setStillError("Add at least a product image URL or a brief.");
return;
}
if (healthState !== "ok") {
setStillError("Backend is offline. Check Mina backend first.");
return;
}

 
setStillError(null);
setMotionError(null);
setStillLoading(true);

const effectiveSessionId = await ensureSession(platform);

try {
  const body = {
    customerId: id,
    sessionId: effectiveSessionId || undefined,
    productImageUrl: productUrl.trim() || undefined,
    styleImageUrls: [refUrl1, refUrl2, refUrl3]
      .map((u) => u.trim())
      .filter(Boolean),
    brief: brief.trim() || undefined,
    tone: tone.trim() || undefined,
    platform,
    stylePresetKey: stylePresetKey || undefined,
    minaVisionEnabled,
  };

  const res = await fetch(`${apiBaseUrl}/editorial/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data: EditorialGenerateResponse = await res.json();
  const url =
    data.imageUrl ||
    (Array.isArray(data.imageUrls) ? data.imageUrls[0] : undefined);

  if (!url) {
    throw new Error("Backend did not return an image URL.");
  }

  const gen: StillResult = {
    url,
    prompt: data.prompt,
    generationId: data.generationId,
    sessionId: data.sessionId || effectiveSessionId || undefined,
    createdAt: new Date().toISOString(),
  };

  setLastStill(gen);
  setStillHistory((prev) => [gen, ...prev].slice(0, 5));

  if (data.sessionId && data.sessionId !== sessionId) {
    setSessionId(data.sessionId);
  }

  refreshCredits();
} catch (err: any) {
  console.error("Error generating editorial still:", err);
  setStillError(
    err?.message || "Could not generate editorial image right now."
  );
} finally {
  setStillLoading(false);
}
 

};

const handleSuggestMotion = async () => {
const id = customerId.trim();
if (!id) {
setMotionError("Add a customer ID first.");
return;
}
if (!lastStill?.url) {
setMotionError("Generate a still image first.");
return;
}
if (healthState !== "ok") {
setMotionError("Backend is offline. Check Mina backend first.");
return;
}

 
setMotionError(null);
setMotionSuggestLoading(true);

try {
  const body = {
    customerId: id,
    referenceImageUrl: lastStill.url,
    tone: tone.trim() || undefined,
    platform,
    stylePresetKey: stylePresetKey || undefined,
    minaVisionEnabled,
  };

  const res = await fetch(`${apiBaseUrl}/motion/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const suggestion =
    typeof data.suggestion === "string"
      ? data.suggestion
      : typeof data.motionDescription === "string"
      ? data.motionDescription
      : "";

  if (suggestion) {
    setMotionDescription(suggestion);
  }
} catch (err) {
  console.error("Error suggesting motion:", err);
  setMotionError("Could not suggest a motion right now.");
} finally {
  setMotionSuggestLoading(false);
}
 

};

const handleGenerateMotion = async () => {
const id = customerId.trim();
if (!id) {
setMotionError("Add a customer ID first.");
return;
}
if (!lastStill?.url) {
setMotionError("Generate a still image first.");
return;
}
if (!motionDescription.trim()) {
setMotionError(
"Add a motion description or let Mina suggest one first."
);
return;
}
if (healthState !== "ok") {
setMotionError("Backend is offline. Check Mina backend first.");
return;
}

 
setMotionError(null);
setMotionLoading(true);

const effectiveSessionId = await ensureSession(platform);

try {
  const body = {
    customerId: id,
    sessionId: effectiveSessionId || undefined,
    lastImageUrl: lastStill.url,
    motionDescription: motionDescription.trim(),
    tone: tone.trim() || undefined,
    platform,
    stylePresetKey: stylePresetKey || undefined,
    minaVisionEnabled,
    durationSeconds: 5,
  };

  const res = await fetch(`${apiBaseUrl}/motion/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const videoUrl: string | undefined =
    data.videoUrl || data.output || data.url;

  if (!videoUrl) {
    throw new Error("Backend did not return a video URL.");
  }

  const result: MotionResult = {
    videoUrl,
    prompt: data.prompt,
    generationId: data.generationId,
    sessionId: data.sessionId || effectiveSessionId || undefined,
    createdAt: new Date().toISOString(),
  };

  setMotionResult(result);

  if (data.sessionId && data.sessionId !== sessionId) {
    setSessionId(data.sessionId);
  }

  refreshCredits();
} catch (err: any) {
  console.error("Error generating motion:", err);
  setMotionError(err?.message || "Could not generate motion.");
} finally {
  setMotionLoading(false);
}
 

};

const handleLikeStill = async () => {
const id = customerId.trim();
if (!id || !lastStill) return;
if (healthState !== "ok") return;

 
setLikeSending(true);
try {
  const body = {
    customerId: id,
    resultType: "image",
    platform,
    prompt: lastStill.prompt,
    comment: feedbackComment.trim() || undefined,
    imageUrl: lastStill.url,
    videoUrl: undefined,
    sessionId: lastStill.sessionId || sessionId || undefined,
    generationId: lastStill.generationId,
  };

  await fetch(`${apiBaseUrl}/feedback/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  setFeedbackComment("");
} catch (err) {
  console.error("Error sending image feedback:", err);
} finally {
  setLikeSending(false);
}
 

};

const handleLikeMotion = async () => {
const id = customerId.trim();
if (!id || !motionResult) return;
if (healthState !== "ok") return;

 
setMotionLikeSending(true);
try {
  const body = {
    customerId: id,
    resultType: "motion",
    platform,
    prompt: motionResult.prompt,
    comment: motionFeedbackComment.trim() || undefined,
    imageUrl: undefined,
    videoUrl: motionResult.videoUrl,
    sessionId: motionResult.sessionId || sessionId || undefined,
    generationId: motionResult.generationId,
  };

  await fetch(`${apiBaseUrl}/feedback/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  setMotionFeedbackComment("");
} catch (err) {
  console.error("Error sending motion feedback:", err);
} finally {
  setMotionLikeSending(false);
}
 

};

const healthDotColor =
healthState === "ok"
? "#16a34a"
: healthState === "error"
? "#b91c1c"
: "rgba(8,10,0,0.4)";

const insufficientStillCredits =
credits.balance !== null &&
credits.imageCost !== null &&
credits.balance < credits.imageCost;

const insufficientMotionCredits =
credits.balance !== null &&
credits.motionCost !== null &&
credits.balance < credits.motionCost;

const rightBgColor = lastStill ? midtoneColor : "#DDD9CC";

const mainActionDisabled =
stillLoading ||
healthState !== "ok" ||
!customerId.trim() ||
insufficientStillCredits;

const motionActionDisabled =
motionLoading ||
healthState !== "ok" ||
!customerId.trim() ||
insufficientMotionCredits;

return ( <div className="mina-root"> <header className="mina-header"> <div className="mina-header-left"> <div className="mina-logo-circle"> <div className="mina-logo-inner">M</div> </div> <div className="mina-title-block"> <div className="mina-title">Mina Editorial AI</div> <div className="mina-subtitle">Falta Studio</div> </div> </div> <div className="mina-header-right"> <div className="mina-customer"> <div className="mina-customer-label">Customer ID</div>
<input
className="mina-customer-input"
placeholder="Paste Shopify customer id here"
value={customerId}
onChange={(e) => setCustomerId(e.target.value)}
/> </div> <div className="mina-header-metrics"> <div className="mina-credits-badge"> <span className="mina-credits-label">Credits</span> <span className="mina-credits-value">
{credits.loading
? "Loading…"
: credits.error
? "Error"
: credits.balance ?? "—"} </span> </div> <div className="mina-health-pill">
<span
className="mina-health-dot"
style={{ backgroundColor: healthDotColor }}
/> <span className="mina-health-text">
{healthState === "checking"
? "Checking"
: healthState === "ok"
? "Online"
: "Offline"} </span> </div> </div> </div> </header>

 
  <div className="mina-main">
    {/* LEFT HALF */}
    <div
      className={
        "mina-left-pane" +
        (isDragging ? " mina-left-pane--dragging" : "")
      }
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mina-mode-switch">
        <button
          type="button"
          className={
            "mina-mode-tab" +
            (mode === "still" ? " mina-mode-tab--active" : "")
          }
          onClick={() => setMode("still")}
        >
          Still life images
        </button>
        <button
          type="button"
          className={
            "mina-mode-tab" +
            (mode === "motion" ? " mina-mode-tab--active" : "")
          }
          onClick={() => setMode("motion")}
        >
          Animating this
        </button>
      </div>

      {mode === "still" ? (
        <>
          {/* Product */}
          <div className="mina-section-label">Product image</div>
          <div className="mina-field">
            <div className="mina-field-label-row">
              <button
                type="button"
                className={
                  "mina-upload-label" +
                  (activeUploadField === "product"
                    ? " mina-upload-label--active"
                    : "")
                }
                onClick={() => setActiveUploadField("product")}
                onMouseEnter={() => setActiveUploadField("product")}
              >
                + upload your product picture
              </button>
            </div>
            <div className="mina-field-underline" />
            <div className="mina-field-input-row">
              <input
                className="mina-url-input"
                placeholder="or paste an image URL here"
                value={productUrl}
                onFocus={() => setActiveUploadField("product")}
                onChange={(e) => setProductUrl(e.target.value)}
              />
              {productUrl && (
                <div className="mina-thumb-wrapper">
                  <img
                    src={productUrl}
                    alt=""
                    className="mina-thumb"
                  />
                </div>
              )}
            </div>
          </div>

          {/* References */}
          <div className="mina-section-label">Style references</div>

          <div className="mina-field">
            <div className="mina-field-label-row">
              <button
                type="button"
                className={
                  "mina-upload-label" +
                  (activeUploadField === "ref1"
                    ? " mina-upload-label--active"
                    : "")
                }
                onClick={() => setActiveUploadField("ref1")}
                onMouseEnter={() => setActiveUploadField("ref1")}
              >
                + upload a reference image
              </button>
            </div>
            <div className="mina-field-underline" />
            <div className="mina-field-input-row">
              <input
                className="mina-url-input"
                placeholder="paste URL for your first reference"
                value={refUrl1}
                onFocus={() => setActiveUploadField("ref1")}
                onChange={(e) => setRefUrl1(e.target.value)}
              />
              {refUrl1 && (
                <div className="mina-thumb-wrapper">
                  <img src={refUrl1} alt="" className="mina-thumb" />
                </div>
              )}
            </div>
          </div>

          <div className="mina-field">
            <div className="mina-field-label-row">
              <button
                type="button"
                className={
                  "mina-upload-label" +
                  (activeUploadField === "ref2"
                    ? " mina-upload-label--active"
                    : "")
                }
                onClick={() => setActiveUploadField("ref2")}
                onMouseEnter={() => setActiveUploadField("ref2")}
              >
                + second reference (optional)
              </button>
            </div>
            <div className="mina-field-underline" />
            <div className="mina-field-input-row">
              <input
                className="mina-url-input"
                placeholder="paste URL for a second reference"
                value={refUrl2}
                onFocus={() => setActiveUploadField("ref2")}
                onChange={(e) => setRefUrl2(e.target.value)}
              />
              {refUrl2 && (
                <div className="mina-thumb-wrapper">
                  <img src={refUrl2} alt="" className="mina-thumb" />
                </div>
              )}
            </div>
          </div>

          <div className="mina-field">
            <div className="mina-field-label-row">
              <button
                type="button"
                className={
                  "mina-upload-label" +
                  (activeUploadField === "ref3"
                    ? " mina-upload-label--active"
                    : "")
                }
                onClick={() => setActiveUploadField("ref3")}
                onMouseEnter={() => setActiveUploadField("ref3")}
              >
                + third reference (optional)
              </button>
            </div>
            <div className="mina-field-underline" />
            <div className="mina-field-input-row">
              <input
                className="mina-url-input"
                placeholder="paste URL for a third reference"
                value={refUrl3}
                onFocus={() => setActiveUploadField("ref3")}
                onChange={(e) => setRefUrl3(e.target.value)}
              />
              {refUrl3 && (
                <div className="mina-thumb-wrapper">
                  <img src={refUrl3} alt="" className="mina-thumb" />
                </div>
              )}
            </div>
          </div>

          {/* Brief */}
          <div className="mina-section-label">Creative brief</div>
          <div className="mina-field">
            <div className="mina-field-underline" />
            <textarea
              className="mina-textarea"
              placeholder="Tell Mina what you want to create…"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </div>

          {/* Tone / platform / style preset */}
          <div className="mina-select-row">
            <div className="mina-select-block">
              <div className="mina-select-label">Tone</div>
              <div className="mina-field-underline" />
              <input
                className="mina-url-input"
                placeholder="Soft editorial, minimal, ASMR"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </div>

            <div className="mina-select-block">
              <div className="mina-select-label">Format</div>
              <div className="mina-field-underline" />
              <select
                className="mina-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mina-select-row">
            <div className="mina-select-block">
              <div className="mina-select-label">Style preset</div>
              <div className="mina-field-underline" />
              <select
                className="mina-select"
                value={stylePresetKey}
                onChange={(e) => setStylePresetKey(e.target.value)}
              >
                {STYLE_PRESETS.map((preset) => (
                  <option key={preset.key || "none"} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mina-select-block">
              <div className="mina-select-label">Vision intelligence</div>
              <div className="mina-field-underline" />
              <button
                type="button"
                className={
                  "mina-toggle" +
                  (minaVisionEnabled ? " mina-toggle--on" : "")
                }
                onClick={() => setMinaVisionEnabled((v) => !v)}
              >
                <span className="mina-toggle-dot" />
                <span className="mina-toggle-label">
                  Mina Vision intelligence
                </span>
              </button>
              <div className="mina-toggle-caption">
                Learns from your likes to refine the style.
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mina-actions-row">
            <button
              type="button"
              className="mina-primary-link"
              disabled={mainActionDisabled}
              onClick={handleGenerateStill}
            >
              {stillLoading ? "Creating still…" : "Create still life image"}
            </button>
            {insufficientStillCredits && (
              <div className="mina-helper-text">
                Not enough credits. Buy more in Shopify.
              </div>
            )}
          </div>

          {uploadError && (
            <div className="mina-error-text">{uploadError}</div>
          )}
          {stillError && (
            <div className="mina-error-text">{stillError}</div>
          )}
          {credits.error && (
            <div className="mina-error-text">{credits.error}</div>
          )}

          <div className="mina-debug-row">
            <span>API: {apiBaseUrl}</span>
            {!hasEnv && (
              <span> · VITE_MINA_API_BASE_URL not set (using localhost)</span>
            )}
          </div>
        </>
      ) : (
        <>
          {/* MOTION MODE */}
          <div className="mina-section-label">Animate this still</div>
          <div className="mina-field">
            <div className="mina-field-underline" />
            <textarea
              className="mina-textarea"
              placeholder="Describe the motion you want…"
              value={motionDescription}
              onChange={(e) => setMotionDescription(e.target.value)}
            />
          </div>

          <div className="mina-actions-row">
            <button
              type="button"
              className="mina-secondary-link"
              disabled={motionSuggestLoading || healthState !== "ok"}
              onClick={handleSuggestMotion}
            >
              {motionSuggestLoading
                ? "Asking Mina for a suggestion…"
                : "Suggest motion from this still"}
            </button>
          </div>

          <div className="mina-select-row">
            <div className="mina-select-block">
              <div className="mina-select-label">Tone</div>
              <div className="mina-field-underline" />
              <input
                className="mina-url-input"
                placeholder="Soft ASMR, slow, tactile"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </div>

            <div className="mina-select-block">
              <div className="mina-select-label">Format</div>
              <div className="mina-field-underline" />
              <select
                className="mina-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
              >
                {PLATFORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mina-select-row">
            <div className="mina-select-block">
              <div className="mina-select-label">Style preset</div>
              <div className="mina-field-underline" />
              <select
                className="mina-select"
                value={stylePresetKey}
                onChange={(e) => setStylePresetKey(e.target.value)}
              >
                {STYLE_PRESETS.map((preset) => (
                  <option key={preset.key || "none"} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mina-select-block">
              <div className="mina-select-label">Vision intelligence</div>
              <div className="mina-field-underline" />
              <button
                type="button"
                className={
                  "mina-toggle" +
                  (minaVisionEnabled ? " mina-toggle--on" : "")
                }
                onClick={() => setMinaVisionEnabled((v) => !v)}
              >
                <span className="mina-toggle-dot" />
                <span className="mina-toggle-label">
                  Mina Vision intelligence
                </span>
              </button>
              <div className="mina-toggle-caption">
                Uses your likes to guide motion style.
              </div>
            </div>
          </div>

          <div className="mina-actions-row">
            <button
              type="button"
              className="mina-primary-link"
              disabled={motionActionDisabled}
              onClick={handleGenerateMotion}
            >
              {motionLoading ? "Generating motion…" : "Generate motion"}
            </button>
            {insufficientMotionCredits && (
              <div className="mina-helper-text">
                Not enough credits. Buy more in Shopify.
              </div>
            )}
          </div>

          {motionError && (
            <div className="mina-error-text">{motionError}</div>
          )}
          <div className="mina-debug-row">
            <span>API: {apiBaseUrl}</span>
            {!hasEnv && (
              <span> · VITE_MINA_API_BASE_URL not set (using localhost)</span>
            )}
          </div>
        </>
      )}
    </div>

    {/* RIGHT HALF */}
    <div className="mina-right-pane" style={{ backgroundColor: rightBgColor }}>
      <div className="mina-right-preview">
        {mode === "still" ? (
          lastStill ? (
            <img
              src={lastStill.url}
              alt="Latest Mina still"
              className={
                imageAspect === "portrait"
                  ? "mina-right-image mina-right-image--portrait"
                  : imageAspect === "square"
                  ? "mina-right-image mina-right-image--square"
                  : "mina-right-image mina-right-image--landscape"
              }
              onLoad={handleStillImageLoad}
            />
          ) : (
            <div className="mina-right-placeholder">
              Drop or paste your product and style references on the left.
            </div>
          )
        ) : motionResult ? (
          <video
            className="mina-right-video"
            src={motionResult.videoUrl}
            controls
            autoPlay
            loop
            muted
          />
        ) : lastStill ? (
          <img
            src={lastStill.url}
            alt="Reference still"
            className="mina-right-image mina-right-image--square"
            onLoad={handleStillImageLoad}
          />
        ) : (
          <div className="mina-right-placeholder">
            Generate a still first, then animate it here.
          </div>
        )}
      </div>

      <div className="mina-right-feedback">
        {mode === "still" ? (
          <>
            <div className="mina-feedback-row">
              <button
                type="button"
                className="mina-like-link"
                disabled={!lastStill || likeSending}
                onClick={handleLikeStill}
              >
                {likeSending ? "Sending feedback…" : "♥ more like this"}
              </button>
            </div>
            <div className="mina-field-underline" />
            <textarea
              className="mina-comment-input"
              placeholder="Tell Mina what you like / dislike about this image…"
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
            />
            {stillHistory.length > 1 && (
              <div className="mina-history-strip">
                {stillHistory.slice(1, 5).map((s) => (
                  <button
                    key={s.createdAt + s.url}
                    type="button"
                    className="mina-history-thumb-button"
                    onClick={() => setLastStill(s)}
                  >
                    <img
                      src={s.url}
                      alt=""
                      className="mina-history-thumb"
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mina-feedback-row">
              <button
                type="button"
                className="mina-like-link"
                disabled={!motionResult || motionLikeSending}
                onClick={handleLikeMotion}
              >
                {motionLikeSending
                  ? "Sending feedback…"
                  : "♥ more like this motion"}
              </button>
            </div>
            <div className="mina-field-underline" />
            <textarea
              className="mina-comment-input"
              placeholder="Tell Mina what works / doesn’t in this motion…"
              value={motionFeedbackComment}
              onChange={(e) => setMotionFeedbackComment(e.target.value)}
            />
          </>
        )}
      </div>
    </div>
  </div>
</div>
 

);
};

export default App;

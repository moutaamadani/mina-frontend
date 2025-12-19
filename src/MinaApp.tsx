// src/MinaApp.tsx
// ============================================================================
// [PART 1 START] Imports & environment
// ============================================================================
import React, { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "./lib/supabaseClient";
import StudioLeft from "./StudioLeft";
import StudioRight from "./StudioRight";
import { isAdmin as checkIsAdmin, loadAdminConfig } from "./lib/adminConfig";
import { useAuthContext, usePassId } from "./components/AuthGate";
import Profile from "./Profile";
import TopLoadingBar from "./components/TopLoadingBar";


const normalizeBase = (raw?: string | null) => {
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

const MATCHA_URL =
  "https://www.faltastudio.com/checkouts/cn/hWN6ZMJyJf9Xoe5NY4oPf4OQ/en-ae?_r=AQABkH10Ox_45MzEaFr8pfWPV5uVKtznFCRMT06qdZv_KKw";

// Prefer an env override, then fall back to same-origin /api so production
// builds avoid CORS errors when the backend is reverse-proxied. On SSR builds
// (no window), we retain the Render URL as a last resort to keep dev usable.
const API_BASE_URL = (() => {
  const envBase = normalizeBase(
    import.meta.env.VITE_MINA_API_BASE_URL ||
      (import.meta as any).env?.VITE_API_BASE_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL
  );
  if (envBase) return envBase;

  if (typeof window !== "undefined") {
    if (window.location.origin.includes("localhost")) return "http://localhost:3000";
    return `${window.location.origin}/api`;
  }

  return "https://mina-editorial-ai-api.onrender.com";
})();

const LIKE_STORAGE_KEY = "minaLikedMap";
// ============================================================================
// [PART 1 END]
// ============================================================================

// ------------------------------------------------------------------------------
// File map (read this first)
// ------------------------------------------------------------------------------
// Part 1 – Environment: wires up imports + runtime constants.
// Part 2 – Types: shapes for API responses, uploads, and UI state.
// Part 3 – Constants/helpers: reusable numbers, formatters, and URL safety helpers.
// Part 4 – Component scaffold: MinaApp() plus state buckets.
//   4.1 – High-level tab + admin context.
//   4.2 – Health + credits tracking.
//   4.3 – Studio prompts + toggles.
//   4.4 – Upload queues and pill/panel UI toggles.
//   4.5 – Generate state (pending/error flags for still + motion).
//   4.6 – History + profile view pagination.
//   4.7 – Vision/typing UI timing + caret/textarea focus.
//   4.8 – Custom style upload/edit UI.
//   4.9 – Stable refs for cleanup.
// Part 5 – Derived values: computed booleans and memoized UI helpers.
// Part 6 – Effects: on-mount bootstrapping and event listeners.
// Part 7 – API helpers: network calls for health, credits, and uploads.
// Part 8 – Upload helpers (small functions inside Part 7 section).
// Part 9 – Stills: editorial flow (prompt building, generate, history tiles).
// Part 10 – Motion: suggestion + video generation flow.
// Part 11 – Feedback/like/download utilities.
// Part 12 – Studio layout: left/right panes wiring.
// Part 13 – Custom style CRUD (saved presets management).
// Part 15 – Render helpers: right side + premium CTA pills.
// Part 16 – Custom style modal rendering.
// Part 18 – Final layout composition + conditional overlays.

// ============================================================================
// [PART 2 START] Types
// ============================================================================
type HealthState = {
  ok: boolean;
  message?: string;
};

type CreditsMeta = {
  imageCost: number;
  motionCost: number;

  // ISO date when the current credits expire (optional, if backend returns it)
  expiresAt?: string | null;
};

type CreditsState = {
  balance: number;
  meta?: CreditsMeta;
};

type GptMeta = {
  userMessage?: string;   // what you want to show to the user
  imageTexts?: string[];  // optional: short vision analysis strings
  input?: string;         // optional: raw prompt sent to GPT (if you return it)
  output?: string;        // optional: raw GPT output (if you return it)
  model?: string;         // optional: which model used
};

type EditorialResponse = {
  ok: boolean;
  prompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  generationId?: string;
  sessionId?: string;

  // ✅ Add this
  gpt?: GptMeta;

  credits?: {
    balance: number;
    cost?: number;
  };
};

type MotionSuggestResponse = {
  ok: boolean;
  suggestion?: string;

  // optional (only if your backend returns it)
  gpt?: GptMeta;
};

type MotionResponse = {
  ok: boolean;
  prompt?: string;
  videoUrl?: string;
  generationId?: string;
  sessionId?: string;

  // ✅ Add this (only if your backend returns it)
  gpt?: GptMeta;

  credits?: {
    balance: number;
    cost?: number;
  };
};


type GenerationRecord = {
  id: string;
  type: string;
  sessionId: string;
  passId: string;
  platform: string;
  prompt: string;
  outputUrl: string;
  createdAt: string;
    meta?: {
      tone?: string;
      platform?: string;
      minaVisionEnabled?: boolean;
      stylePresetKey?: string;
      stylePresetKeys?: string[];
      productImageUrl?: string;
      styleImageUrls?: string[];
      aspectRatio?: string;
    [key: string]: unknown;
  } | null;
};

type FeedbackRecord = {
  id: string;
  passId: string;
  resultType: string;
  platform: string;
  prompt: string;
  comment: string;
  imageUrl?: string;
  videoUrl?: string;
  createdAt: string;
};

type HistoryResponse = {
  ok: boolean;
  passId: string;
  credits: {
    balance: number;

    // Optional: when the current credits expire (if backend returns it)
    expiresAt?: string | null;

    history?: {
      id: string;
      amount: number;
      reason: string;
      createdAt: string;
    }[];
  };
  generations: GenerationRecord[];
  feedbacks: FeedbackRecord[];
};

type StillItem = {
  id: string;
  url: string;
  createdAt: string;
  prompt: string;
  aspectRatio?: string;
};

type MotionItem = {
  id: string;
  url: string;
  createdAt: string;
  prompt: string;
};

type CustomStyleImage = {
  id: string;
  url: string; // blob url for UI
  file: File;
};

type CustomStylePreset = {
  key: string; // "custom-..."
  label: string; // editable name
  thumbDataUrl: string; // persisted
};

type UploadKind = "file" | "url";

type UploadItem = {
  id: string;
  kind: UploadKind;

  // url = UI preview (blob: or http)
  url: string;

  // remoteUrl = REAL stored URL in R2 (https://...)
  remoteUrl?: string;

  file?: File; // only for kind=file
  uploading?: boolean;
  error?: string;
};

type UploadPanelKey = "product" | "logo" | "inspiration";

type AspectKey = "9-16" | "3-4" | "2-3" | "1-1";

type AspectOption = {
  key: AspectKey;
  ratio: string;
  label: string;
  subtitle: string;
  platformKey: string;
};

type MinaAppProps = Record<string, never>;
// ============================================================================
// [PART 2 END]
// ============================================================================

// ============================================================================
// [PART 3 START] Constants & helpers
// ============================================================================
// Part 3 overview: shared constant values and tiny helper functions that power
// the UI (aspect ratios, style presets, animations, and small formatters).
// Everything below is read-only configuration or pure helpers with no side
// effects so you can skim them quickly.
const ASPECT_OPTIONS: AspectOption[] = [
  { key: "9-16", ratio: "9:16", label: "9:16", subtitle: "Tiktok/Reel", platformKey: "tiktok" },
  { key: "3-4", ratio: "3:4", label: "3:4", subtitle: "Post", platformKey: "instagram-post" },
  { key: "2-3", ratio: "2:3", label: "2:3", subtitle: "Printing", platformKey: "print" },
  { key: "1-1", ratio: "1:1", label: "1:1", subtitle: "Square", platformKey: "square" },
];

const ASPECT_ICON_URLS: Record<AspectKey, string> = {
  "9-16":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/tiktokreels_icon_e116174c-afc7-4174-9cf0-f24a07c8517b.svg?v=1765425956",
  "3-4":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/post_icon_f646fcb5-03be-4cf5-b25c-b1ec38f6794e.svg?v=1765425956",
  "2-3":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Printing_icon_c7252c7d-863e-4efb-89c4-669261119d61.svg?v=1765425956",
  "1-1":
    "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/square_icon_901d47a8-44a8-4ab9-b412-2224e97fd9d9.svg?v=1765425956",
};

// Map our UI ratios to Replicate-safe values
const REPLICATE_ASPECT_RATIO_MAP: Record<string, string> = {
  "9:16": "9:16",
  "3:4": "3:4",
  "2:3": "2:3",
  "1:1": "1:1",
};

const MINA_THINKING_DEFAULT = [
  "Pouring my matcha over ice… 🧊🍵",
  "Sip… sipsip… calibrating the vibe…",
  "Clink—setting the cup down gently…",
  "Brushing light onto your scene… ✨",
  "Painting pixels one by one… 🎨",
  "Finding the perfect soft shadow…",
  "Tuning the colors like a playlist… 🎧",
  "Stirring in a little sparkle… (quietly)",
  "Listening for the photo’s heartbeat…",
  "Adding that ‘fresh café window’ glow…",
  "Making the details feel expensive… 💎",
  "Letting the background breathe…",
  "Smoothing edges like steamed milk…",
  "Saving the best highlight for last…",
  "Dreaming—if I had hands, I’d frame this for you…",
  "One day I’ll be human… but for now, I’ll be your artist…",
  "If I could blink, I’d blink at this lighting… 😉",
  "Okay… tiny magic time…",
  "Hold on—Mina is locking in the mood…",
  "Almost there… the pixels are listening…",
];

const MINA_FILLER_DEFAULT = ["sip…",
  "sipsip…",
  "clink.",
  "ice clatter…",
  "stir stir…",
  "soft pour…",
  "tiny hum…",
  "tap tap…",
  "mm…",
  "breathing…",
  "refining…",
  "one more little brushstroke…"];

const STYLE_PRESETS = [
  {
    key: "vintage",
    label: "Vintage",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Editorial%20style/vintage-thumb.png",
    hero: "https://assets.faltastudio.com/Website%20Assets/Editorial%20style/vintage-hero.png",
  },
  {
    key: "gradient",
    label: "Gradient",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Editorial%20style/gradient-thumb.png",
    hero: "https://assets.faltastudio.com/Website%20Assets/Editorial%20style/gradient-hero.png",
  },
  {
    key: "back-light",
    label: "Back light",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Editorial%20style/backlight-hero.png",
    hero: "https://assets.faltastudio.com/Website%20Assets/Editorial%20style/backlight-hero.png",
  },
] as const;

const PANEL_LIMITS: Record<UploadPanelKey, number> = {
  product: 1,
  logo: 1,
  inspiration: 4,
};

const CUSTOM_STYLES_LS_KEY = "minaCustomStyles_v1";

// Premium reveal timing
const PILL_INITIAL_DELAY_MS = 260; // when the first pill starts appearing
const PILL_STAGGER_MS = 90; // delay between each pill (accordion / wave)
const PILL_SLIDE_DURATION_MS = 320; // slide + fade duration (must exceed stagger for smoothness)
const PANEL_REVEAL_DELAY_MS = PILL_INITIAL_DELAY_MS; // panel shows with first pill
const CONTROLS_REVEAL_DELAY_MS = 0; // vision + create show later
const GROUP_FADE_DURATION_MS = 420; // shared fade timing for pills/panels/controls/textarea
const TYPING_HIDE_DELAY_MS = 2000; // wait before hiding UI when typing starts
const TYPING_REVEAL_DELAY_MS = 600; // wait before showing UI after typing stops
const TEXTAREA_FLOAT_DISTANCE_PX = 12; // tiny translate to avoid layout jump

function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function formatTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function formatDateOnly(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function padEditorialNumber(value: number | string) {
  const clean = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(clean)) {
    return clean.toString().padStart(2, "0");
  }
  return String(value).trim() || "00";
}

// ✅ Detect signed URLs (R2/S3/CloudFront style) so we never break them by adding params
function hasSignedQuery(searchParams: URLSearchParams) {
  return (
    searchParams.has("X-Amz-Signature") ||
    searchParams.has("X-Amz-Credential") ||
    searchParams.has("X-Amz-Algorithm") ||
    searchParams.has("X-Amz-Date") ||
    searchParams.has("X-Amz-Expires") ||
    searchParams.has("Signature") ||
    searchParams.has("Expires") ||
    searchParams.has("Key-Pair-Id") ||
    searchParams.has("Policy") ||
    Array.from(searchParams.keys()).some((k) => k.toLowerCase().includes("signature"))
  );
}

// ✅ Turn a signed URL into a non-expiring base URL (works when your R2 objects are public)
function stripSignedQuery(url: string) {
  try {
    const parsed = new URL(url);
    if (!hasSignedQuery(parsed.searchParams)) return url;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

// ✅ Replicate detection (so we never show it in Profile)
function isReplicateUrl(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes("replicate.delivery") || h.includes("replicate.com");
  } catch {
    return false;
  }
}

// ✅ Preview URL: never modify signed URLs (that’s what caused the ❓ icons)
function toPreviewUrl(url: string) {
  try {
    const parsed = new URL(url);

    // If signed → DO NOT touch query params, and also strip to stable base (no expiry)
    if (hasSignedQuery(parsed.searchParams)) return stripSignedQuery(parsed.toString());

    // Only add resize params for Shopify CDN (safe)
    if (parsed.hostname.includes("cdn.shopify.com")) {
      if (!parsed.searchParams.has("w")) parsed.searchParams.set("w", "900");
      if (!parsed.searchParams.has("auto")) parsed.searchParams.set("auto", "format");
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

function safeIsHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function looksLikeImageUrl(url: string) {
  const u = url.trim();
  if (!safeIsHttpUrl(u)) return false;
  return /\.(png|jpg|jpeg|webp|gif|avif)(\?.*)?$/i.test(u) || u.includes("cdn.shopify.com");
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadCustomStyles(): CustomStylePreset[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_STYLES_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomStylePreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) =>
        x &&
        typeof x.key === "string" &&
        typeof x.label === "string" &&
        typeof x.thumbDataUrl === "string"
    );
  } catch {
    return [];
  }
}

function saveCustomStyles(styles: CustomStylePreset[]) {
  try {
    window.localStorage.setItem(CUSTOM_STYLES_LS_KEY, JSON.stringify(styles));
  } catch {
    // ignore
  }
}
// ============================================================================
// [PART 3 END]
// ============================================================================


// ==============================================
// PART UI HELPERS (pills/panels)
// ==============================================
// Part 3.1 (UI helpers) – small utilities that keep panel/pill behavior tidy,
// like URL detection and picking the closest aspect ratio. These helpers are
// isolated from React state so they are easy to reason about and test.
type PanelKey = "product" | "logo" | "inspiration" | "style" | null;

type CustomStyle = {
  id: string; // custom-...
  key: string; // used as stylePresetKey
  label: string;
  thumbUrl: string; // dataURL or https
  createdAt: string;
};

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function extractFirstHttpUrl(text: string) {
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : null;
}

function aspectRatioToNumber(ratio: string) {
  const [w, h] = ratio.split(":").map((n) => Number(n) || 0);
  if (!h || !w) return 1;
  return w / h;
}

function pickNearestAspectOption(ratio: number, options: AspectOption[]): AspectOption {
  if (!Number.isFinite(ratio) || ratio <= 0) return options[0];
  return options.reduce((closest, option) => {
    const candidate = aspectRatioToNumber(option.ratio);
    return Math.abs(candidate - ratio) < Math.abs(aspectRatioToNumber(closest.ratio) - ratio)
      ? option
      : closest;
  }, options[0]);
}


// ============================================================================
// [PART 4 START] Component
// ============================================================================
const MinaApp: React.FC<MinaAppProps> = () => {
  // Part 4 is broken into labeled blocks so you can skim state by topic:
  // - 4.1..4.3 keep track of the active view and user/session meta.
  // - 4.4..4.5 capture what the user is uploading or generating.
  // - 4.6..4.8 store profile/history paging plus custom-style form state.
  // - 4.9 holds refs that survive renders for cleanup + observers.
  // Each block now carries a short plain-English header explaining what the
  // group of state/effects does.
  // =====================
// [NUMBER MAP START]
// =====================
const [numberMap, setNumberMap] = useState<Record<string, string>>(() => {
  try {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem("minaProfileNumberMap")
        : null;
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
});

const [editingNumberId, setEditingNumberId] = useState<string | null>(null);
const [editingNumberValue, setEditingNumberValue] = useState<string>("");
// =====================
// [NUMBER MAP END]
// =====================
  // =======================
// History state (REQUIRED)
// =======================
const [historyGenerations, setHistoryGenerations] = useState<GenerationRecord[]>([]);
const [historyFeedbacks, setHistoryFeedbacks] = useState<FeedbackRecord[]>([]);
const [historyLoading, setHistoryLoading] = useState(false);
const [historyError, setHistoryError] = useState<string | null>(null);
const [visibleHistoryCount, setVisibleHistoryCount] = useState(20);
// Cache profile payloads per passId so tab switches reuse the last fetch instead
// of re-normalizing every generation URL.
const historyCacheRef = useRef<Record<string, { generations: GenerationRecord[]; feedbacks: FeedbackRecord[] }>>({});
const historyDirtyRef = useRef<boolean>(false);

// Cache credits per passId to skip duplicate balance calls when navigating
// between Studio/Profile for the same user.
const creditsCacheRef = useRef<Record<string, CreditsState>>({});
const creditsDirtyRef = useRef<boolean>(true);
const creditsCacheAtRef = useRef<Record<string, number>>({});

  // -------------------------
  // 4.1 Global tab + customer
  // -------------------------
  const [activeTab, setActiveTab] = useState<"studio" | "profile">("studio");
  const passId = usePassId();

  const [isAdminUser, setIsAdminUser] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [adminConfig, setAdminConfig] = useState(loadAdminConfig());
  const [computedStylePresets, setComputedStylePresets] = useState(STYLE_PRESETS);

  // -------------------------
  // 4.2 Health / credits / session
  // -------------------------
  const [health, setHealth] = useState<HealthState | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("Mina Studio session");

  // -------------------------
  // App boot loading bar
  // -------------------------
  const [booting] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  // -------------------------
  // 4.3 Studio – brief + steps
  // -------------------------
  const [brief, setBrief] = useState("");
  const [stillBrief, setStillBrief] = useState("");
  const [tone] = useState("still-life");
  const [, setPlatform] = useState("tiktok");
  const [aspectIndex, setAspectIndex] = useState(2);
  const [animateAspectKey, setAnimateAspectKey] = useState<AspectKey>(ASPECT_OPTIONS[aspectIndex].key);
  const [animateMode, setAnimateMode] = useState(false);

  // Stills
  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);
  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [lastStillPrompt, setLastStillPrompt] = useState<string>("");

  const [minaMessage, setMinaMessage] = useState("");
  const [minaTalking, setMinaTalking] = useState(false);
// When set, we show THIS instead of placeholder thinking text
const [minaOverrideText, setMinaOverrideText] = useState<string | null>(null);

  // Motion
  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);
  const [motionDescription, setMotionDescription] = useState("");
  const [motionStyleKeys, setMotionStyleKeys] = useState<MotionStyleKey[]>(["fix_camera"]);
  const [motionSuggestLoading, setMotionSuggestLoading] = useState(false);
  const [motionSuggestError, setMotionSuggestError] = useState<string | null>(null);
  const [motionSuggestTyping, setMotionSuggestTyping] = useState(false);
  const [animateAspectRotated, setAnimateAspectRotated] = useState(false);
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);
  const [isRightMediaDark, setIsRightMediaDark] = useState(false);
  const [activeMediaKind, setActiveMediaKind] = useState<"still" | "motion" | null>(null);

  // Feedback
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LIKE_STORAGE_KEY) : null;
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [likeSubmitting, setLikeSubmitting] = useState(false);

  // Panels (only one open at a time)
  const [activePanel, setActivePanel] = useState<PanelKey>(null);

  // Stage 0 = only textarea
  // Stage 1 = pills fade in (stagger)
  // Stage 2 = panels area available
  // Stage 3 = vision + create available
  const [uiStage, setUiStage] = useState<0 | 1 | 2 | 3>(0);
  const stageT2Ref = useRef<number | null>(null);
  const stageT3Ref = useRef<number | null>(null);

  // Global drag overlay (whole page)
  const [globalDragging, setGlobalDragging] = useState(false);
  const dragDepthRef = useRef(0);

  // Upload buckets
  const [uploads, setUploads] = useState<Record<UploadPanelKey, UploadItem[]>>({
    product: [],
    logo: [],
    inspiration: [],
  });

  // Style selection (allow multiple, default to none)
  const [stylePresetKeys, setStylePresetKeys] = useState<string[]>([]);
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);

  // Inline rename for styles (no new panel)
  const [styleLabelOverrides, setStyleLabelOverrides] = useState<Record<string, string>>(() => {
    try {
      const raw = window.localStorage.getItem("minaStyleLabelOverrides");
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  const [customStyles, setCustomStyles] = useState<CustomStyle[]>(() => {
    try {
      const raw = window.localStorage.getItem("minaCustomStyles");
      return raw ? (JSON.parse(raw) as CustomStyle[]) : [];
    } catch {
      return [];
    }
  });

  const [editingStyleKey, setEditingStyleKey] = useState<string | null>(null);
  const [editingStyleValue, setEditingStyleValue] = useState<string>("");

  useEffect(() => {
    setAdminConfig(loadAdminConfig());
    const handler = () => setAdminConfig(loadAdminConfig());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    const allowedMotionKeys: MotionStyleKey[] = [
      "melt",
      "drop",
      "expand",
      "satisfying",
      "slow_motion",
      "fix_camera",
      "loop",
    ];
    const fromConfig = adminConfig.styles?.movementKeywords || [];
    const filtered = fromConfig.filter((k): k is MotionStyleKey => allowedMotionKeys.includes(k as MotionStyleKey));
    if (filtered.length) setMotionStyleKeys(filtered);

    const publishedPresets = (adminConfig.styles?.presets || [])
      .filter((p) => p.status === "published")
      .map((p) => ({ key: p.id, label: p.name, thumb: p.heroImage || p.images[0] || "" }));
    setComputedStylePresets([...STYLE_PRESETS, ...publishedPresets]);
  }, [adminConfig]);

  // -------------------------
  // 4.5 Upload refs / drag state
  // -------------------------
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const inspirationInputRef = useRef<HTMLInputElement | null>(null);

  // -------------------------
  // 4.6 Brief helper hint ("Describe more")
  // -------------------------
  const [showDescribeMore, setShowDescribeMore] = useState(false);
  const describeMoreTimeoutRef = useRef<number | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingCalmTimeoutRef = useRef<number | null>(null);
  const typingHideTimeoutRef = useRef<number | null>(null);
  const typingRevealTimeoutRef = useRef<number | null>(null);
  const [typingUiHidden, setTypingUiHidden] = useState(false);

  useEffect(() => {
    return () => {
      if (describeMoreTimeoutRef.current !== null) {
        window.clearTimeout(describeMoreTimeoutRef.current);
      }
      if (typingCalmTimeoutRef.current !== null) {
        window.clearTimeout(typingCalmTimeoutRef.current);
      }
      if (typingHideTimeoutRef.current !== null) {
        window.clearTimeout(typingHideTimeoutRef.current);
      }
      if (typingRevealTimeoutRef.current !== null) {
        window.clearTimeout(typingRevealTimeoutRef.current);
      }
    };
  }, []);

  // -------------------------
  // 4.7 Brief scroll ref
  // -------------------------
  const briefShellRef = useRef<HTMLDivElement | null>(null);
  const briefInputRef = useRef<HTMLTextAreaElement | null>(null);

  // -------------------------
  // 4.8 Custom style modal + custom saved styles
  // -------------------------
  const [customStylePanelOpen, setCustomStylePanelOpen] = useState(false);
  const [customStyleImages, setCustomStyleImages] = useState<CustomStyleImage[]>([]);
  const [customStyleHeroId, setCustomStyleHeroId] = useState<string | null>(null);
  const [customStyleHeroThumb, setCustomStyleHeroThumb] = useState<string | null>(null);
  const [customStyleTraining, setCustomStyleTraining] = useState(false);
  const [customStyleError, setCustomStyleError] = useState<string | null>(null);
  const customStyleInputRef = useRef<HTMLInputElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [customPresets, setCustomPresets] = useState<CustomStylePreset[]>(() => {
    if (typeof window === "undefined") return [];
    return loadCustomStyles();
  });

  // -------------------------
  // 4.9 Stable refs for unmount cleanup (avoid undefined productItems/etc)
  // -------------------------
  const uploadsRef = useRef(uploads);
  const customStyleHeroThumbRef = useRef<string | null>(customStyleHeroThumb);
  const customStyleImagesRef = useRef<CustomStyleImage[]>(customStyleImages);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  useEffect(() => {
    customStyleHeroThumbRef.current = customStyleHeroThumb;
  }, [customStyleHeroThumb]);

  useEffect(() => {
    customStyleImagesRef.current = customStyleImages;
  }, [customStyleImages]);

  useEffect(() => {
    const currentBrief = brief;
    if (animateMode) {
      setStillBrief(currentBrief);
      setMotionDescription("");
      setBrief("");
      setTypingUiHidden(true);
      window.setTimeout(() => setTypingUiHidden(false), 220);
    } else {
      setMotionDescription(currentBrief);
      setBrief(stillBrief || currentBrief);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateMode]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("minaProfileNumberMap", JSON.stringify(numberMap));
      }
    } catch {
      // ignore
    }
  }, [numberMap]);

  useEffect(() => {
    setVisibleHistoryCount(20);
  }, [historyGenerations]);

  useEffect(() => {
    if (activeTab !== "profile") return undefined;
    const target = loadMoreRef.current;
    if (!target) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleHistoryCount((count) =>
            Math.min(historyGenerations.length, count + Math.max(10, Math.floor(count * 0.2)))
          );
        }
      },
      { rootMargin: "1200px 0px 1200px 0px" }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [activeTab, historyGenerations.length]);

  // ========================================================================
  // [PART 5 START] Derived values (the “rules” you requested)
  // ========================================================================
  // Part 5 explains the computed booleans/numbers the UI relies on (stages,
  // currently selected items, pricing, typing timers). Nothing here mutates
  // state; it only combines existing state to simplify the render logic.
  const briefLength = brief.trim().length;
  const uploadsPending = Object.values(uploads).some((arr) => arr.some((it) => it.uploading));
  const currentPassId = passId;

  // Mark caches dirty anytime the passId changes so the next Profile visit
  // reloads fresh data for the new user.
  useEffect(() => {
    historyDirtyRef.current = true;
    creditsDirtyRef.current = true;
  }, [currentPassId]);

  // UI stages
  const stageHasPills = uiStage >= 1;
  const showPanels = uiStage >= 1;
  const showControls = uiStage >= 3;
  const showPills = stageHasPills && !typingUiHidden;

  const animationTimingVars = useMemo<React.CSSProperties>(
    () => ({
      "--pill-slide-duration": `${PILL_SLIDE_DURATION_MS}ms`,
      "--group-fade-duration": `${GROUP_FADE_DURATION_MS}ms`,
      "--textarea-float-distance": `${TEXTAREA_FLOAT_DISTANCE_PX}px`,
    }),
    []
  );

  // counts for +/✓
  const productCount = uploads.product.length;
  const logoCount = uploads.logo.length;
  const inspirationCount = uploads.inspiration.length;

  const currentAspect = ASPECT_OPTIONS[aspectIndex];
  const latestStill: StillItem | null = stillItems[0] || null;
  const currentStill: StillItem | null = stillItems[stillIndex] || stillItems[0] || null;
  const currentMotion: MotionItem | null = motionItems[motionIndex] || motionItems[0] || null;

  const parseTs = (iso?: string | null) => (iso ? Date.parse(iso) || 0 : 0);
  const newestStillAt = parseTs(stillItems[0]?.createdAt);
  const newestMotionAt = parseTs(motionItems[0]?.createdAt);

  const animateImage = uploads.product[0] || null;
  const animateAspectOption = ASPECT_OPTIONS.find((opt) => opt.key === animateAspectKey) || currentAspect;
  const animateAspectIconUrl = ASPECT_ICON_URLS[animateAspectOption.key];
  const animateImageHttp = animateImage?.remoteUrl && isHttpUrl(animateImage.remoteUrl)
    ? animateImage.remoteUrl
    : animateImage?.url && isHttpUrl(animateImage.url)
      ? animateImage.url
      : "";
  const motionReferenceImageUrl = animateImageHttp || latestStill?.url || "";

  const personalityThinking = useMemo(
    () =>
      adminConfig.ai?.personality?.thinking?.length
        ? adminConfig.ai.personality.thinking
        : MINA_THINKING_DEFAULT,
    [adminConfig.ai?.personality?.thinking]
  );

  const personalityFiller = useMemo(
    () =>
      adminConfig.ai?.personality?.filler?.length
        ? adminConfig.ai.personality.filler
        : MINA_FILLER_DEFAULT,
    [adminConfig.ai?.personality?.filler]
  );

  const imageCost = credits?.meta?.imageCost ?? adminConfig.pricing?.imageCost ?? 1;
  const motionCost = credits?.meta?.motionCost ?? adminConfig.pricing?.motionCost ?? 5;

  const creditBalance = credits?.balance;
  const imageCreditsOk = creditBalance === null || creditBalance === undefined ? true : creditBalance >= imageCost;
  const motionCreditsOk = creditBalance === null || creditBalance === undefined ? true : creditBalance >= motionCost;
  const motionBlockReason = motionCreditsOk ? null : "Buy more credits to animate.";

  const briefHintVisible = showDescribeMore;

  useEffect(() => {
    if (activeMediaKind === null) {
      if (!newestStillAt && !newestMotionAt) return;
      setActiveMediaKind(newestMotionAt > newestStillAt ? "motion" : "still");
      return;
    }

    if (activeMediaKind === "motion" && !motionItems.length && stillItems.length) {
      setActiveMediaKind("still");
      return;
    }

    if (activeMediaKind === "still" && !stillItems.length && motionItems.length) {
      setActiveMediaKind("motion");
    }
  }, [activeMediaKind, newestMotionAt, newestStillAt, motionItems.length, stillItems.length]);

  useEffect(() => {
    if (isTyping) {
      if (typingRevealTimeoutRef.current !== null) {
        window.clearTimeout(typingRevealTimeoutRef.current);
        typingRevealTimeoutRef.current = null;
      }
      if (typingHideTimeoutRef.current === null && !typingUiHidden) {
        typingHideTimeoutRef.current = window.setTimeout(() => {
          setTypingUiHidden(true);
          typingHideTimeoutRef.current = null;
        }, TYPING_HIDE_DELAY_MS);
      }
      return;
    }

    if (typingHideTimeoutRef.current !== null) {
      window.clearTimeout(typingHideTimeoutRef.current);
      typingHideTimeoutRef.current = null;
    }

    typingRevealTimeoutRef.current = window.setTimeout(() => {
      setTypingUiHidden(false);
      typingRevealTimeoutRef.current = null;
    }, TYPING_REVEAL_DELAY_MS);
  }, [isTyping, typingUiHidden]);

  // Style keys for API (avoid unknown custom keys)
  const normalizeStyleKeyForApi = (k: string) => (k.startsWith("custom-") ? "custom-style" : k);
  const stylePresetKeysForApi = (stylePresetKeys.length ? stylePresetKeys : ["none"]).map(normalizeStyleKeyForApi);
  const primaryStyleKeyForApi = stylePresetKeysForApi[0] || "none";

  useEffect(() => {
    let cancelled = false;

    const setFromRatio = (ratio: number) => {
      if (cancelled) return;
      const nearest = pickNearestAspectOption(ratio, ASPECT_OPTIONS);
      setAnimateAspectKey(nearest.key);
      setAnimateAspectRotated(ratio > 1);
    };

    const inferFromUrl = (url: string, fallbackRatio?: number) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
        setFromRatio(ratio || 1);
      };
      img.onerror = () => {
        if (!cancelled && fallbackRatio) setFromRatio(fallbackRatio);
      };
      img.src = url;
    };

    const primaryUrl = animateImage?.remoteUrl || animateImage?.url;
    if (primaryUrl) {
      inferFromUrl(primaryUrl, aspectRatioToNumber(currentAspect.ratio));
      return () => {
        cancelled = true;
      };
    }

    if (latestStill?.aspectRatio) {
      setFromRatio(aspectRatioToNumber(latestStill.aspectRatio));
      return () => {
        cancelled = true;
      };
    }

    if (latestStill?.url) {
      inferFromUrl(latestStill.url, aspectRatioToNumber(currentAspect.ratio));
      return () => {
        cancelled = true;
      };
    }

    setFromRatio(aspectRatioToNumber(currentAspect.ratio));

    return () => {
      cancelled = true;
    };
  }, [animateImage?.remoteUrl, animateImage?.url, latestStill?.aspectRatio, latestStill?.url, currentAspect.ratio]);

  useEffect(() => {
    const url = currentMotion?.url || currentStill?.url;
    if (!url) {
      setIsRightMediaDark(false);
      return undefined;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 10;
        canvas.height = 10;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 10, 10);
        const data = ctx.getImageData(0, 0, 10, 10).data;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        const avg = total / (data.length / 4 || 1);
        setIsRightMediaDark(avg < 90);
      } catch {
        setIsRightMediaDark(false);
      }
    };
    img.onerror = () => {
      if (!cancelled) setIsRightMediaDark(false);
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [currentMotion?.url, currentStill?.url]);

  const motionTextTrimmed = motionDescription.trim();
  const canCreateMotion = !!motionReferenceImageUrl && motionTextTrimmed.length > 0 && !motionSuggestTyping;
  const minaBusy = stillGenerating || motionGenerating || motionSuggestLoading || motionSuggestTyping;
  // ========================================================================
  // [PART 5 END]
  // ========================================================================

  // ============================================
// PART UI STAGING (premium reveal / no jumping)
// ============================================

// Persist style storage
useEffect(() => {
  try {
    window.localStorage.setItem("minaStyleLabelOverrides", JSON.stringify(styleLabelOverrides));
  } catch {
    // ignore
  }
}, [styleLabelOverrides]);

useEffect(() => {
  try {
    window.localStorage.setItem("minaCustomStyles", JSON.stringify(customStyles));
  } catch {
    // ignore
  }
}, [customStyles]);

useEffect(() => {
  try {
    window.localStorage.setItem(LIKE_STORAGE_KEY, JSON.stringify(likedMap));
  } catch {
    // ignore
  }
}, [likedMap]);

// ----------------------------
// MINA “thinking out loud” UI
// ----------------------------

// 1) Placeholder text WHILE busy (only if no override text)
useEffect(() => {
  if (!minaBusy) return;
  if (minaOverrideText) return;

  setMinaTalking(true);

  const phrases = [...personalityThinking, ...personalityFiller].filter(Boolean);
  let phraseIndex = 0;
  let charIndex = 0;
  let t: number | null = null;

  const CHAR_MS = 35;       // faster typing
  const END_PAUSE_MS = 160; // faster pause

  const tick = () => {
    const phrase = phrases[phraseIndex % phrases.length] || "";
    const nextChar = charIndex + 1;
    const nextSlice = phrase.slice(0, Math.min(nextChar, phrase.length));

    setMinaMessage(nextSlice || personalityFiller[0] || "typing…");

    const reachedEnd = nextChar > phrase.length;
    charIndex = reachedEnd ? 0 : nextChar;
    if (reachedEnd) phraseIndex += 1;

    t = window.setTimeout(tick, reachedEnd ? END_PAUSE_MS : CHAR_MS);
  };

  t = window.setTimeout(tick, CHAR_MS);

  return () => {
    if (t !== null) window.clearTimeout(t);
  };
}, [minaBusy, minaOverrideText, personalityThinking, personalityFiller]);

// 2) When override arrives, type it VERY fast
useEffect(() => {
  if (!minaOverrideText) return;

  setMinaTalking(true);
  setMinaMessage("");

  let cancelled = false;
  let i = 0;
  let t: number | null = null;

  const text = minaOverrideText;
  const CHAR_MS = 6; // very fast

  const tick = () => {
    if (cancelled) return;
    i += 1;
    setMinaMessage(text.slice(0, i));
    if (i < text.length) t = window.setTimeout(tick, CHAR_MS);
  };

  t = window.setTimeout(tick, CHAR_MS);

  return () => {
    cancelled = true;
    if (t !== null) window.clearTimeout(t);
  };
}, [minaOverrideText]);

// 3) When not busy, keep override briefly then clear
useEffect(() => {
  if (minaBusy) return;

  if (minaOverrideText) {
    const hold = window.setTimeout(() => {
      setMinaTalking(false);
      setMinaMessage("");
      setMinaOverrideText(null);
    }, 2200);

    return () => window.clearTimeout(hold);
  }

  setMinaTalking(false);
  setMinaMessage("");
}, [minaBusy, minaOverrideText]);

// ----------------------------
// UI Stage reveal
// ----------------------------
useEffect(() => {
  // Stage 0: only textarea (no pills, no panels)
  if (briefLength <= 0) {
    if (stageT2Ref.current !== null) window.clearTimeout(stageT2Ref.current);
    if (stageT3Ref.current !== null) window.clearTimeout(stageT3Ref.current);
    stageT2Ref.current = null;
    stageT3Ref.current = null;

    setUiStage(0);
    setActivePanel(null);
    setGlobalDragging(false);
    dragDepthRef.current = 0;
    return;
  }

  // Start the reveal ONLY once (when transitioning 0 -> typing)
  if (uiStage === 0) {
    setUiStage(1);
    setActivePanel((prev) => prev ?? "product");

    stageT2Ref.current = window.setTimeout(() => {
      setUiStage((s) => (s < 2 ? 2 : s));
    }, PANEL_REVEAL_DELAY_MS);

    stageT3Ref.current = window.setTimeout(() => {
      setUiStage((s) => (s < 3 ? 3 : s));
    }, CONTROLS_REVEAL_DELAY_MS);
  }
}, [briefLength, uiStage]);


  // ========================================================================
  // [PART 6 START] Effects – bootstrap
  // ========================================================================
  // Part 6 wires up lifecycle hooks: on-mount bootstrapping for session/admin
  // context plus cleanup-safe listeners (storage sync, window resize, etc.).
  // ✅ Reuse the Supabase session handed down by AuthGate so we don't double
  // check auth on mount. This also keeps the studio shell visible while the
  // session hydrates.
  const authContext = useAuthContext();

  useEffect(() => {
    const email = authContext?.session?.user?.email?.toLowerCase() || null;
    setCurrentUserEmail(email);

    let cancelled = false;
    const syncAdmin = async () => {
      try {
        const ok = await checkIsAdmin();
        if (!cancelled) setIsAdminUser(ok);
      } catch {
        if (!cancelled) setIsAdminUser(false);
      }
    };

    void syncAdmin();

    return () => {
      cancelled = true;
    };
  }, [authContext]);


  // ========================================================================
  // [PART 6 END]
  // ========================================================================

  // ========================================================================
// [PART 7 START] API helpers
// ========================================================================
// Part 7 organizes every network helper: authentication bridge, health/credit
// fetchers, session bootstrap, history loaders, and upload endpoints. Each
// subsection is labeled so you can trace requests quickly.

// ------------------------------------------------------------------------
// Supabase → API auth bridge
// Every Mina API call remains API-based, but gets Supabase JWT automatically.
// ------------------------------------------------------------------------
const getSupabaseAccessToken = async (accessTokenFromAuth: string | null): Promise<string | null> => {
  // Prefer the token already loaded by AuthGate to avoid a second session fetch.
  if (accessTokenFromAuth) return accessTokenFromAuth;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
};

const apiFetch = async (path: string, init: RequestInit = {}) => {
  setPendingRequests((n) => n + 1);
  try {
    if (!API_BASE_URL) throw new Error("Missing API base URL");

    const headers = new Headers(init.headers || {});
    const token = await getSupabaseAccessToken(authContext?.accessToken || null);

    // Attach JWT for your backend to verify (safe even if backend ignores it)
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (currentPassId && !headers.has("X-Mina-Pass-Id")) {
      headers.set("X-Mina-Pass-Id", currentPassId);
    }

    // Ensure JSON content-type when body is present and caller didn't specify
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } finally {
    setPendingRequests((n) => Math.max(0, n - 1));
  }
};

const handleCheckHealth = async () => {
  if (!API_BASE_URL) return;
  try {
    setCheckingHealth(true);
    const res = await apiFetch("/health");
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    setHealth({ ok: json.ok ?? false, message: json.message ?? "" });
  } catch (err: any) {
    setHealth({ ok: false, message: err?.message || "Unable to reach Mina." });
  } finally {
    setCheckingHealth(false);
  }
};

const extractExpiresAt = (obj: any): string | null => {
  const v =
    obj?.expiresAt ??
    obj?.expirationDate ??
    obj?.expiry ??
    obj?.expiration ??
    obj?.meta?.expiresAt ??
    obj?.meta?.expirationDate ??
    obj?.meta?.expiry ??
    obj?.meta?.expiration ??
    null;

  return typeof v === "string" && v.trim() ? v.trim() : null;
};

const fetchCredits = async () => {
  if (!API_BASE_URL || !currentPassId) return;
  try {
    // Reuse cached balance unless a new generation/passId change marked it
    // dirty, or the cache is older than ~30s.
    const cached = creditsCacheRef.current[currentPassId];
    const cachedAt = creditsCacheAtRef.current[currentPassId] || 0;
    const isStale = Date.now() - cachedAt > 30_000;

    if (!creditsDirtyRef.current && cached && !isStale) {
      setCredits(cached);
      return;
    }

    setCreditsLoading(true);

    const params = new URLSearchParams({ passId: currentPassId });
    const res = await apiFetch(`/credits/balance?${params.toString()}`);
    if (!res.ok) return;

    const json = (await res.json().catch(() => ({}))) as any;

    const expiresAt = extractExpiresAt(json);

    const nextCredits: CreditsState = {
      balance: Number(json?.balance ?? credits?.balance ?? 0),
      meta: {
        imageCost: Number(json?.meta?.imageCost ?? credits?.meta?.imageCost ?? adminConfig.pricing?.imageCost ?? 1),
        motionCost: Number(json?.meta?.motionCost ?? credits?.meta?.motionCost ?? adminConfig.pricing?.motionCost ?? 5),
        expiresAt,
      },
    };

    creditsCacheRef.current[currentPassId] = nextCredits;
    creditsCacheAtRef.current[currentPassId] = Date.now();
    creditsDirtyRef.current = false;
    setCredits(nextCredits);
  } catch {
    // silent
  } finally {
    setCreditsLoading(false);
  }
};

const ensureSession = async (): Promise<string | null> => {
  if (sessionId) return sessionId;
  if (!API_BASE_URL || !currentPassId) return null;

  try {
    const res = await apiFetch("/sessions/start", {
      method: "POST",
      body: JSON.stringify({
        passId: currentPassId,
        platform: currentAspect.platformKey,
        title: sessionTitle,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; session?: { id: string; title?: string } };
    if (json.ok && json.session?.id) {
      setSessionId(json.session.id);
      setSessionTitle(json.session.title || sessionTitle);
      return json.session.id;
    }
  } catch {
    // ignore
  }
  return null;
};

const fetchHistoryForPass = async (pid: string): Promise<HistoryResponse> => {
  const res = await apiFetch(`/history/pass/${encodeURIComponent(pid)}`);
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as HistoryResponse;
  if (!json.ok) throw new Error("History error");
  return json;
};

// fetchHistory: load single MEGA ledger by pass id
const fetchHistory = async () => {
  if (!API_BASE_URL || !currentPassId) return;

  try {
    // Serve cached profile data unless a new generation invalidated it.
    if (!historyDirtyRef.current && historyCacheRef.current[currentPassId]) {
      const cached = historyCacheRef.current[currentPassId];
      setHistoryGenerations(cached.generations);
      setHistoryFeedbacks(cached.feedbacks);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);

    const history = await fetchHistoryForPass(currentPassId);

    if (history?.credits) {
      setCredits((prev) => ({
        balance: history.credits.balance,
        meta: {
          imageCost: prev?.meta?.imageCost ?? adminConfig.pricing?.imageCost ?? 1,
          motionCost: prev?.meta?.motionCost ?? adminConfig.pricing?.motionCost ?? 5,
          expiresAt: history.credits.expiresAt ?? prev?.meta?.expiresAt ?? null,
        },
      }));
    }

    const gens = history?.generations || [];
    const feedbacks = history?.feedbacks || [];

    // Normalize links into stable R2 (but never drop items if that fails)
    const updated = await Promise.all(
      gens.map(async (g) => {
        const original = g.outputUrl;
        try {
          const r2 = await storeRemoteToR2(original, "generations");
          const stable = stripSignedQuery(r2);
          return { ...g, outputUrl: stable || original };
        } catch {
          return { ...g, outputUrl: original };
        }
      })
    );

    historyCacheRef.current[currentPassId] = { generations: updated, feedbacks };
    historyDirtyRef.current = false;

    setHistoryGenerations(updated);
    setHistoryFeedbacks(feedbacks);
  } catch (err: any) {
    setHistoryError(err?.message || "Unable to load history.");
  } finally {
    setHistoryLoading(false);
  }
};

useEffect(() => {
  if (activeTab !== "profile") return;
  if (!currentPassId) return;

  setVisibleHistoryCount(20);
  void fetchCredits();
  void fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTab, currentPassId]);

useEffect(() => {
  const markCreditsDirty = () => {
    creditsDirtyRef.current = true;
    void fetchCredits();
  };

  const handleVisibility = () => {
    if (!document.hidden) markCreditsDirty();
  };

  window.addEventListener("focus", markCreditsDirty);
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    window.removeEventListener("focus", markCreditsDirty);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentPassId]);


const getEditorialNumber = (id: string, index: number) => {
  const fallback = padEditorialNumber(index + 1);
  const custom = numberMap[id];
  return custom ? custom : fallback;
};

const handleBeginEditNumber = (id: string, index: number) => {
  if (!isAdminUser) return;
  setEditingNumberId(id);
  setEditingNumberValue(getEditorialNumber(id, index));
};

const handleCommitNumber = () => {
  if (!editingNumberId) return;
  const cleaned = editingNumberValue.trim();
  const normalized = padEditorialNumber(cleaned);
  setNumberMap((prev) => ({ ...prev, [editingNumberId]: normalized }));
  setEditingNumberId(null);
  setEditingNumberValue("");
};

const handleCancelNumberEdit = () => {
  setEditingNumberId(null);
  setEditingNumberValue("");
};

const handleDownloadGeneration = (item: GenerationRecord, label: string) => {
  const safeLabel = `mina-v3-prompt-${label || item.id}`;
  const filename = buildDownloadName(item.outputUrl, safeLabel, guessDownloadExt(item.outputUrl, ".png"));

  const link = document.createElement("a");
  link.href = item.outputUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const handleBrandingChange = (side: "left" | "right", field: string, value: string) => {
  if (side === "left") {
    setBrandingLeft((prev) => ({ ...prev, [field]: value }));
  } else {
    setBrandingRight((prev) => ({ ...prev, [field]: value }));
  }
};

const stopBrandingEdit = () => setBrandingEditing(null);
// ========================================================================
// [PART 7 END]
// ========================================================================

// ==============================
// R2 helpers (upload + store)
// ==============================

// ✅ Pick a URL from backend response, prefer stable/public first
function pickUrlFromR2Response(json: any): string | null {
  if (!json) return null;

  const candidates: any[] = [
    // Prefer public first (non-expiring)
    json.publicUrl,
    json.public_url,
    json.url,
    json.public,

    json.result?.publicUrl,
    json.result?.public_url,
    json.result?.url,

    json.data?.publicUrl,
    json.data?.public_url,
    json.data?.url,

    // Signed LAST (expires)
    json.signedUrl,
    json.signed_url,
    json.result?.signedUrl,
    json.data?.signedUrl,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  return null;
}

// ✅ Ensure non-expiring URL (strip signature query if present)
function normalizeNonExpiringUrl(url: string): string {
  return stripSignedQuery(url);
}

async function uploadFileToR2(panel: UploadPanelKey, file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);

  const res = await apiFetch("/api/r2/upload-signed", {
    method: "POST",
    body: JSON.stringify({
      dataUrl,
      kind: panel, // "product" | "logo" | "inspiration"
      passId: currentPassId,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.message || json?.error || `Upload failed (${res.status})`);
  }

  const rawUrl = pickUrlFromR2Response(json);
  if (!rawUrl) throw new Error("Upload succeeded but no URL returned");

  const stable = normalizeNonExpiringUrl(rawUrl);
  if (!stable.startsWith("http")) throw new Error("Upload returned invalid URL");
  return stable;
}

async function storeRemoteToR2(url: string, kind: string): Promise<string> {
  const res = await apiFetch("/api/r2/store-remote-signed", {
    method: "POST",
    body: JSON.stringify({
      url,
      kind, // "generations" | "motions" | etc.
      passId: currentPassId,
    }),
  });

  const json = await res.json().catch(() => ({}));

  // If backend fails, keep original (so user still sees something)
  if (!res.ok || json?.ok === false) {
    return url;
  }

  const rawUrl = pickUrlFromR2Response(json);
  if (!rawUrl) return url;

  const stable = normalizeNonExpiringUrl(rawUrl);
  return stable || url;
}

function patchUploadItem(panel: UploadPanelKey, id: string, patch: Partial<UploadItem>) {
  setUploads((prev) => ({
    ...prev,
    [panel]: prev[panel].map((it) => (it.id === id ? { ...it, ...patch } : it)),
  }));
}

async function startUploadForFileItem(panel: UploadPanelKey, id: string, file: File) {
  try {
    patchUploadItem(panel, id, { uploading: true, error: undefined });
    const remoteUrl = await uploadFileToR2(panel, file);
    patchUploadItem(panel, id, { remoteUrl, uploading: false });
  } catch (err: any) {
    patchUploadItem(panel, id, { uploading: false, error: err?.message || "Upload failed" });
  }
}

async function startStoreForUrlItem(panel: UploadPanelKey, id: string, url: string) {
  try {
    patchUploadItem(panel, id, { uploading: true, error: undefined });
    const remoteUrl = await storeRemoteToR2(url, panel);
    patchUploadItem(panel, id, { remoteUrl, uploading: false });
  } catch (err: any) {
    patchUploadItem(panel, id, { uploading: false, error: err?.message || "Store failed" });
  }
}


  // ========================================================================
  // [PART 9 START] Stills (editorial)
  // ========================================================================
  // Part 9 handles the editorial still-image flow: building prompts, kicking
  // off generation, and managing the gallery/history tiles for still outputs.
const handleGenerateStill = async () => {
  const trimmed = stillBrief.trim();
  if (trimmed.length < 40) return;

  // Flip UI state immediately so the CTA responds instantly
  setStillGenerating(true);
  setStillError(null);
  setMinaOverrideText(null);

  if (!API_BASE_URL) {
    setStillError("Missing API base URL (VITE_MINA_API_BASE_URL).");
    setStillGenerating(false);
    return;
  }

  if (!currentPassId) {
    setStillError("Missing Pass ID for MEGA session.");
    setStillGenerating(false);
    return;
  }

  const sid = await ensureSession();
  if (!sid) {
    setStillError("Could not start Mina session.");
    setStillGenerating(false);
    return;
  }

  try {
    const safeAspectRatio = REPLICATE_ASPECT_RATIO_MAP[currentAspect.ratio] || "2:3";

    const payload: {
      passId: string;
      sessionId: string;
      brief: string;
      tone: string;
      platform: string;
      minaVisionEnabled: boolean;
      stylePresetKey: string;
      stylePresetKeys?: string[];
      aspectRatio: string;
      productImageUrl?: string;
      logoImageUrl?: string;
      styleImageUrls?: string[];
    } = {
      passId: currentPassId,
      sessionId: sid,
      brief: trimmed,
      tone,
      platform: currentAspect.platformKey,
      minaVisionEnabled,
      stylePresetKey: primaryStyleKeyForApi,
      stylePresetKeys: stylePresetKeysForApi,
      aspectRatio: safeAspectRatio,
    };

    // Forward product (R2 first, then http only)
    const productItem = uploads.product[0];
    const productUrl = productItem?.remoteUrl || productItem?.url;
    if (productUrl && isHttpUrl(productUrl)) payload.productImageUrl = productUrl;

    // Forward logo (optional)
    const logoItem = uploads.logo[0];
    const logoUrl = logoItem?.remoteUrl || logoItem?.url;
    if (logoUrl && isHttpUrl(logoUrl)) payload.logoImageUrl = logoUrl;

    // Forward inspiration up to 4
    const inspirationUrls = uploads.inspiration
      .map((u) => u.remoteUrl || u.url)
      .filter((u) => isHttpUrl(u))
      .slice(0, 4);

    if (inspirationUrls.length) payload.styleImageUrls = inspirationUrls;

    const res = await apiFetch("/editorial/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.message || `Error ${res.status}: Failed to generate editorial still.`;
      throw new Error(msg);
    }

    const data = (await res.json()) as EditorialResponse;
    const url = data.imageUrl || data.imageUrls?.[0];
    if (!url) throw new Error("No image URL in Mina response.");

    // ✅ Build the text we want to SHOW to the user (userMessage + prompt)
    const serverUserMessage =
      typeof data.gpt?.userMessage === "string" ? data.gpt.userMessage.trim() : "";

    const promptText = typeof data.prompt === "string" ? data.prompt.trim() : "";

    const imageTexts =
      Array.isArray(data.gpt?.imageTexts)
        ? data.gpt!.imageTexts!.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim())
        : [];

    const clamp = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}…` : t);

    const briefEcho = clamp(trimmed, 220);
    const promptShort = clamp(promptText, 380);

    let overlay = serverUserMessage || briefEcho;

    // include prompt (what you asked)
    if (promptShort) {
      overlay = `${overlay}\n\nPrompt:\n${promptShort}`;
    }

    // optional: include a little of vision text (if present)
    if (imageTexts.length) {
      const lines = imageTexts.slice(0, 3).map((t) => `• ${clamp(t, 140)}`).join("\n");
      overlay = `${overlay}\n\nNotes:\n${lines}`;
    }

    if (overlay.trim()) setMinaOverrideText(overlay.trim());

    // store remote AFTER we already showed text (faster UX)
    const storedUrl = await storeRemoteToR2(url, "generations");

    // Mark profile caches dirty so Profile reloads fresh history/credits next time.
    historyDirtyRef.current = true;
    creditsDirtyRef.current = true;

    const item: StillItem = {
      id: data.generationId || `still_${Date.now()}`,
      url: storedUrl,
      createdAt: new Date().toISOString(),
      prompt: data.prompt || trimmed,
      aspectRatio: currentAspect.ratio,
    };

    setStillItems((prev) => {
      const next = [item, ...prev];
      setStillIndex(0);
      return next;
    });

    setActiveMediaKind("still");

    setLastStillPrompt(item.prompt);

    // Update credits
    if (data.credits?.balance !== undefined) {
      setCredits((prev) => ({
        balance: data.credits!.balance,
        meta: prev?.meta,
      }));
    }
  } catch (err: any) {
    setStillError(err?.message || "Unexpected error generating still.");
  } finally {
    setStillGenerating(false);
  }
};

// ========================================================================
// [PART 9 END]
// ========================================================================

  // ========================================================================
  // [PART 10 START] Motion (suggest + generate)
  // ========================================================================
  // Part 10 mirrors the still flow but for motion: suggestion prompts, video
  // generation, and handling the active motion clip selection.
const chunkSuggestion = (text: string) => {
  const words = text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 4) {
    lines.push(words.slice(i, i + 4).join(" "));
  }
  return lines;
};

const applyMotionSuggestionText = async (text: string) => {
  if (!text) return;
  if (describeMoreTimeoutRef.current !== null) {
    window.clearTimeout(describeMoreTimeoutRef.current);
    describeMoreTimeoutRef.current = null;
  }
  setShowDescribeMore(false);
  setMotionSuggestTyping(true);

  const lines = chunkSuggestion(text);
  let accumulated = "";

  for (const line of lines) {
    accumulated = accumulated ? `${accumulated}\n${line}` : line;
    setMotionDescription(accumulated);
    setBrief(accumulated);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  setMotionSuggestTyping(false);
};

const handleSuggestMotion = async () => {
  if (!API_BASE_URL || !motionReferenceImageUrl || motionSuggestLoading || motionSuggestTyping) return;
  if (!currentPassId) return;

  setAnimateMode(true);

  try {
    setMotionSuggestLoading(true);
    setMotionSuggestError(null);

    const res = await apiFetch("/motion/suggest", {
      method: "POST",
      body: JSON.stringify({
        passId: currentPassId,
        referenceImageUrl: motionReferenceImageUrl,
        tone,
        platform: animateAspectOption.platformKey,
        minaVisionEnabled,
        stylePresetKey: primaryStyleKeyForApi,
        stylePresetKeys: stylePresetKeysForApi,
        motionStyles: motionStyleKeys,
        aspectRatio: animateAspectOption.ratio,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.message || `Error ${res.status}: Failed to suggest motion.`;
      throw new Error(msg);
    }

    const data = (await res.json()) as MotionSuggestResponse;
    if (data.suggestion) await applyMotionSuggestionText(data.suggestion);
  } catch (err: any) {
    setMotionSuggestError(err?.message || "Unexpected error suggesting motion.");
  } finally {
    setMotionSuggestLoading(false);
    setMotionSuggestTyping(false);
  }
};

const handleGenerateMotion = async () => {
  if (!API_BASE_URL || !motionReferenceImageUrl || !motionTextTrimmed) return;

  // Flip UI state immediately so the CTA responds instantly
  setMotionGenerating(true);
  setMotionError(null);
  setMinaOverrideText(null);

  if (!currentPassId) {
    setMotionError("Missing Pass ID for MEGA session.");
    setMotionGenerating(false);
    return;
  }

  const sid = await ensureSession();
  if (!sid) {
    setMotionError("Could not start Mina session.");
    setMotionGenerating(false);
    return;
  }

  try {
    const res = await apiFetch("/motion/generate", {
      method: "POST",
      body: JSON.stringify({
        passId: currentPassId,
        sessionId: sid,
        lastImageUrl: motionReferenceImageUrl,
        motionDescription: motionTextTrimmed,
        tone,
        platform: animateAspectOption.platformKey,
        minaVisionEnabled,
        stylePresetKey: primaryStyleKeyForApi,
        stylePresetKeys: stylePresetKeysForApi,
        motionStyles: motionStyleKeys,
        aspectRatio: animateAspectOption.ratio,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.message || `Error ${res.status}: Failed to generate motion.`;
      throw new Error(msg);
    }

    const data = (await res.json()) as MotionResponse;
    const url = data.videoUrl;
    if (!url) throw new Error("No video URL in Mina response.");

    // ✅ Show message + prompt (if backend returns it)
    const serverUserMessage =
      typeof data.gpt?.userMessage === "string" ? data.gpt.userMessage.trim() : "";

    const promptText = typeof data.prompt === "string" ? data.prompt.trim() : "";

    const clamp = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}…` : t);
    const promptShort = clamp(promptText, 380);

    let overlay = serverUserMessage || "Motion is ready.";

    if (promptShort) overlay = `${overlay}\n\nPrompt:\n${promptShort}`;

    if (overlay.trim()) setMinaOverrideText(overlay.trim());

    const storedUrl = await storeRemoteToR2(url, "motions");

    // Mark profile caches dirty so the next Profile visit pulls the latest run.
    historyDirtyRef.current = true;
    creditsDirtyRef.current = true;

    const item: MotionItem = {
      id: data.generationId || `motion_${Date.now()}`,
      url: storedUrl,
      createdAt: new Date().toISOString(),
      prompt: data.prompt || motionTextTrimmed,
    };

    setMotionItems((prev) => {
      const next = [item, ...prev];
      setMotionIndex(0);
      return next;
    });

    setActiveMediaKind("motion");

    if (data.credits?.balance !== undefined) {
      setCredits((prev) => ({
        balance: data.credits!.balance,
        meta: prev?.meta,
      }));
    }
  } catch (err: any) {
    setMotionError(err?.message || "Unexpected error generating motion.");
  } finally {
    setMotionGenerating(false);
  }
};

// ========================================================================
// [PART 10 END]
// ========================================================================

  // ========================================================================
  // [PART 11 START] Feedback / like / download
  // ========================================================================
  // Part 11 groups user feedback utilities: sending comments, toggling likes,
  // and building download links for generated assets.
const getCurrentMediaKey = () => {
  const mediaType = currentMotion ? "motion" : currentStill ? "still" : null;
  if (!mediaType) return null;

  const rawKey = currentMotion?.id || currentStill?.id || currentMotion?.url || currentStill?.url;
  return rawKey ? `${mediaType}:${rawKey}` : null;
};

const guessDownloadExt = (url: string, fallbackExt: string) => {
  const lower = url.toLowerCase();
  if (lower.endsWith(".mp4")) return ".mp4";
  if (lower.endsWith(".webm")) return ".webm";
  if (lower.endsWith(".mov")) return ".mov";
  if (lower.endsWith(".m4v")) return ".m4v";
  if (lower.match(/\.jpe?g$/)) return ".jpg";
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".gif")) return ".gif";
  if (lower.endsWith(".webp")) return ".webp";
  return fallbackExt;
};

const buildDownloadName = (url: string, _fallbackBase: string, fallbackExt: string) => {
  // Force a consistent branded filename for all downloads.
  const base = "Mina_v3_prompt";
  const ext = guessDownloadExt(url, fallbackExt);
  return base.endsWith(ext) ? base : `${base}${ext}`;
};

const forceSaveUrl = async (url: string, filename: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed with ${res.status}`);

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(blobUrl);
};

const handleLikeCurrentStill = async () => {
  const targetMedia = currentMotion || currentStill;
  if (!targetMedia) return;

  if (!currentPassId) return;

  const resultType = currentMotion ? "motion" : "image";
  const likeKey = getCurrentMediaKey();
  const nextLiked = likeKey ? !likedMap[likeKey] : false;

  if (likeKey) {
    setLikedMap((prev) => ({ ...prev, [likeKey]: nextLiked }));
  }

  if (!API_BASE_URL || !nextLiked) return;

  try {
    setLikeSubmitting(true);
    await apiFetch("/feedback/like", {
      method: "POST",
      body: JSON.stringify({
        passId: currentPassId,
        resultType,
        platform: currentAspect.platformKey,
        prompt: currentMotion?.prompt || currentStill?.prompt || lastStillPrompt || stillBrief || brief,
        comment: "",
        imageUrl: currentMotion ? "" : targetMedia.url,
        videoUrl: currentMotion ? targetMedia.url : "",
        sessionId,
        liked: true,
      }),
    });
  } catch {
    // non-blocking
  } finally {
    setLikeSubmitting(false);
  }
};

const handleSubmitFeedback = async () => {
  if (!API_BASE_URL || !feedbackText.trim() || !currentPassId) return;
  const comment = feedbackText.trim();

  const targetVideo = currentMotion?.url || "";
  const targetImage = currentStill?.url || "";

  try {
    setFeedbackSending(true);
    setFeedbackError(null);

    await apiFetch("/feedback/like", {
      method: "POST",
      body: JSON.stringify({
        passId: currentPassId,
        resultType: targetVideo ? "motion" : "image",
        platform: currentAspect.platformKey,
        prompt: lastStillPrompt || stillBrief || brief,
        comment,
        imageUrl: targetImage,
        videoUrl: targetVideo,
        sessionId,
      }),
    });

    setFeedbackText("");
  } catch (err: any) {
    setFeedbackError(err?.message || "Failed to send feedback.");
  } finally {
    setFeedbackSending(false);
  }
};

const handleDownloadCurrentStill = async () => {
  const target = currentMotion?.url || currentStill?.url;
  if (!target) return;

  const safePrompt =
    (lastStillPrompt || stillBrief || brief || "Mina-image")
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 80) || "mina-image";
  const fallbackBase = currentMotion ? `mina-motion-${safePrompt}` : `mina-image-${safePrompt}`;
  const filename = buildDownloadName(target, fallbackBase, guessDownloadExt(target, currentMotion ? ".mp4" : ".png"));

  try {
    await forceSaveUrl(target, filename);
  } catch (err: any) {
    const msg = err?.message || "Download failed.";
    if (currentMotion) setMotionError(msg);
    else setStillError(msg);
  }
};

const currentMediaKey = getCurrentMediaKey();
const isCurrentLiked = currentMediaKey ? likedMap[currentMediaKey] : false;
// ========================================================================
// [PART 11 END]
// ========================================================================


  // ========================================================================
  // [PART 12 START] UI helpers – aspect + uploads + logout
  // ========================================================================
  // Part 12 is the grab-bag of UI helpers that glue the studio together:
  // aspect cycling, toggling animate mode, scroll handling, and logout tidy-up.
  const handleCycleAspect = () => {
    setAspectIndex((prev) => {
      const next = (prev + 1) % ASPECT_OPTIONS.length;
      setPlatform(ASPECT_OPTIONS[next].platformKey);
      return next;
    });
  };

  const handleToggleAnimateMode = () => {
    setAnimateMode((prev) => {
      const next = !prev;
      if (next && latestStill?.url) {
        setUploads((curr) => ({
          ...curr,
          product: [
            {
              id: `product_auto_${Date.now()}`,
              kind: "url",
              url: latestStill.url,
              remoteUrl: latestStill.url,
              uploading: false,
            },
          ],
        }));
      }
      return next;
    });
  };

  // Open panel (click only)
  const openPanel = (key: PanelKey) => {
    if (!stageHasPills) return;
    if (!key) return;

    setActivePanel(key);

    // Clicking a pill should reveal panels immediately
    setUiStage((s) => (s < 2 ? 2 : s));
  };

  const capForPanel = (panel: UploadPanelKey) => {
    if (panel === "inspiration") return 4;
    return 1; // product + logo
  };

  const pickTargetPanel = (): UploadPanelKey =>
    activePanel === "logo" ? "logo" : activePanel === "inspiration" ? "inspiration" : "product";

  const addFilesToPanel = (panel: UploadPanelKey, files: FileList) => {
    const max = capForPanel(panel);
    const incoming = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!incoming.length) return;

    // For product/logo, we replace the current item (only 1)
    const replace = panel !== "inspiration";

    // Compute how many we can accept right now
    const existingCount = uploads[panel].length;
    const remaining = replace ? max : Math.max(0, max - existingCount);
    const slice = incoming.slice(0, remaining);
    if (!slice.length) return;

    const created: Array<{ id: string; file: File }> = [];

    setUploads((prev) => {
      // Revoke old blobs if replacing product/logo
      if (replace) {
        prev[panel].forEach((it) => {
          if (it.kind === "file" && it.url.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(it.url);
            } catch {}
          }
        });
      }

      const base = replace ? [] : prev[panel];

      const nextItems: UploadItem[] = slice.map((file) => {
        const id = `${panel}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const previewUrl = URL.createObjectURL(file);
        created.push({ id, file });

        return {
          id,
          kind: "file",
          url: previewUrl, // blob preview
          remoteUrl: undefined, // will become https after upload
          file,
          uploading: true,
        };
      });

      return {
        ...prev,
        [panel]: [...base, ...nextItems].slice(0, max),
      };
    });

    // Kick off uploads AFTER state update
    created.forEach(({ id, file }) => {
      void startUploadForFileItem(panel, id, file);
    });
  };

  const addUrlToPanel = (panel: UploadPanelKey, url: string) => {
    const max = capForPanel(panel);
    const replace = panel !== "inspiration";

    const id = `${panel}_url_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    setUploads((prev) => {
      const base = replace ? [] : prev[panel];

      const next: UploadItem = {
        id,
        kind: "url",
        url, // original http url (preview)
        remoteUrl: undefined, // will become R2 url
        uploading: true,
      };

      return {
        ...prev,
        [panel]: [...base, next].slice(0, max),
      };
    });

    void startStoreForUrlItem(panel, id, url);
  };

  const handlePasteImageUrl = (url: string) => {
    const targetPanel = pickTargetPanel();
    addUrlToPanel(targetPanel, url);
  };

  const removeUploadItem = (panel: UploadPanelKey, id: string) => {
    setUploads((prev) => {
      const item = prev[panel].find((x) => x.id === id);
      if (item?.kind === "file" && item.url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(item.url);
        } catch {
          // ignore
        }
      }
      return {
        ...prev,
        [panel]: prev[panel].filter((x) => x.id !== id),
      };
    });
  };

  const moveUploadItem = (panel: UploadPanelKey, from: number, to: number) => {
    setUploads((prev) => {
      const arr = [...prev[panel]];
      if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return prev;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...prev, [panel]: arr };
    });
  };

  const triggerPick = (panel: UploadPanelKey) => {
    if (panel === "product") productInputRef.current?.click();
    if (panel === "logo") logoInputRef.current?.click();
    if (panel === "inspiration") inspirationInputRef.current?.click();
  };

  const handleFileInput = (panel: UploadPanelKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) addFilesToPanel(panel, files);
    e.target.value = "";
  };

  // Whole-page drag/drop + paste (silent, no big text)
  useEffect(() => {
    if (uiStage === 0) return;

    const targetPanel: UploadPanelKey = pickTargetPanel();

    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setGlobalDragging(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setGlobalDragging(false);
    };

    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer) return;
      if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setGlobalDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length) addFilesToPanel(targetPanel, files);
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const targetEl = e.target as HTMLElement | null;
      const isTypingField = !!targetEl?.closest("textarea, input, [contenteditable='true']");

      // image paste
      const items = Array.from(e.clipboardData.items || []);
      const imgItem = items.find((it) => it.type && it.type.startsWith("image/"));
      if (imgItem) {
        const file = imgItem.getAsFile();
        if (file) {
          if (!isTypingField) e.preventDefault();
          const list = {
            0: file,
            length: 1,
            item: (i: number) => (i === 0 ? file : null),
          } as unknown as FileList;
          addFilesToPanel(targetPanel, list);
          return;
        }
      }

      // url paste (silent)
      const text = e.clipboardData.getData("text/plain") || "";
      const url = extractFirstHttpUrl(text);
      if (url && /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(url)) {
        if (!isTypingField) e.preventDefault();
        addUrlToPanel(targetPanel, url);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [uiStage, activePanel]);

  // Style hover-select + inline rename
  const getStyleLabel = (key: string, fallback: string) =>
    (styleLabelOverrides[key] || fallback).trim() || fallback;

  const beginRenameStyle = (key: string, currentLabel: string) => {
    setEditingStyleKey(key);
    setEditingStyleValue(currentLabel);
  };

  const commitRenameStyle = () => {
    if (!editingStyleKey) return;
    const next = editingStyleValue.trim();
    setStyleLabelOverrides((prev) => ({
      ...prev,
      [editingStyleKey]: next,
    }));
    setEditingStyleKey(null);
    setEditingStyleValue("");
  };

  const cancelRenameStyle = () => {
    setEditingStyleKey(null);
    setEditingStyleValue("");
  };

  const deleteCustomStyle = (key: string) => {
    setCustomStyles((prev) => prev.filter((s) => s.key !== key));
    setStyleLabelOverrides((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    // Remove deleted styles from any selection
    setStylePresetKeys((prev) => prev.filter((k) => k !== key));
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      try {
        window.localStorage.removeItem("minaProfileNumberMap");
        // keep likes/styles if you want; remove if you want a clean logout:
        // window.localStorage.removeItem("minaLikedMap");
      } catch {
        // ignore
      }
      if (typeof window !== "undefined") window.location.reload();
    }
  };

  const handleBriefScroll = () => {
    // fade is handled by CSS mask on .studio-brief-shell
  };

  const handleBriefChange = (value: string) => {
    setBrief(value);
    if (animateMode) setMotionDescription(value);
    else setStillBrief(value);

    if (describeMoreTimeoutRef.current !== null) {
      window.clearTimeout(describeMoreTimeoutRef.current);
      describeMoreTimeoutRef.current = null;
    }

    if (typingCalmTimeoutRef.current !== null) {
      window.clearTimeout(typingCalmTimeoutRef.current);
    }

    setIsTyping(true);
    typingCalmTimeoutRef.current = window.setTimeout(() => setIsTyping(false), 900);
    if (typingHideTimeoutRef.current === null && !typingUiHidden) {
      typingHideTimeoutRef.current = window.setTimeout(() => {
        setTypingUiHidden(true);
        typingHideTimeoutRef.current = null;
      }, TYPING_HIDE_DELAY_MS);
    }
    if (typingRevealTimeoutRef.current !== null) {
      window.clearTimeout(typingRevealTimeoutRef.current);
      typingRevealTimeoutRef.current = null;
    }

    setShowDescribeMore(false);

    const trimmedLength = value.trim().length;
    if (trimmedLength > 0 && trimmedLength < 20) {
      describeMoreTimeoutRef.current = window.setTimeout(() => setShowDescribeMore(true), 1200);
    }
  };
  // ========================================================================
  // [PART 12 END]
  // ========================================================================

  // ========================================================================
  // [PART 13 START] Custom styles (saved list + rename + delete)
  // ========================================================================
  // Part 13 manages CRUD-like behaviors for custom style presets: open/close
  // panel, set errors, and update the saved list.
  const handleOpenCustomStylePanel = () => {
    setCustomStylePanelOpen(true);
    setCustomStyleError(null);
  };

  const handleCloseCustomStylePanel = () => {
    setCustomStylePanelOpen(false);
  };

  const handleCustomStyleFiles = (files: FileList | null) => {
    if (!files) return;

    const remainingSlots = Math.max(0, 10 - customStyleImages.length);
    if (!remainingSlots) return;

    const nextFiles = Array.from(files).slice(0, remainingSlots);
    const now = Date.now();

    const newItems: CustomStyleImage[] = nextFiles.map((file, index) => ({
      id: `${now}_${index}_${file.name}`,
      url: URL.createObjectURL(file),
      file,
    }));

    setCustomStyleImages((prev) => {
      const merged = [...prev, ...newItems];
      let nextHeroId = customStyleHeroId;
      if (!nextHeroId && merged.length) nextHeroId = merged[0].id;

      setCustomStyleHeroId(nextHeroId || null);

      const heroImage = merged.find((img) => img.id === nextHeroId) || merged[0];
      if (heroImage) {
        setCustomStyleHeroThumb((prevThumb) => {
          if (prevThumb && prevThumb.startsWith("blob:")) URL.revokeObjectURL(prevThumb);
          return heroImage.url;
        });
      }
      return merged;
    });
  };

  const handleCustomStyleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleCustomStyleFiles(e.target.files);
    e.target.value = "";
  };

  const handleCustomStyleUploadClick = () => {
    customStyleInputRef.current?.click();
  };

  const handleSelectCustomStyleHero = (id: string) => {
    setCustomStyleHeroId(id);
    const img = customStyleImages.find((item) => item.id === id);
    if (img) {
      setCustomStyleHeroThumb((prevThumb) => {
        if (prevThumb && prevThumb.startsWith("blob:")) URL.revokeObjectURL(prevThumb);
        return img.url;
      });
    }
  };

  const handleTrainCustomStyle = async () => {
    if (!customStyleImages.length || !customStyleHeroId) return;

    try {
      setCustomStyleTraining(true);
      setCustomStyleError(null);

      const hero = customStyleImages.find((x) => x.id === customStyleHeroId);
      if (!hero?.file) throw new Error("Pick a hero image.");

      // Persistable thumb (dataURL)
      const thumbUrl = await fileToDataUrl(hero.file);

      const newKey = `custom-${Date.now()}`;
      const newStyle: CustomStyle = {
        id: newKey,
        key: newKey,
        label: `Style ${customStyles.length + 1}`,
        thumbUrl,
        createdAt: new Date().toISOString(),
      };

      setCustomStyles((prev) => [newStyle, ...prev]);
      setStylePresetKeys((prev) => {
        const next = prev.filter((k) => k !== newKey);
        return [newKey, ...next];
      });

      // close modal
      setCustomStylePanelOpen(false);
    } catch (err: any) {
      setCustomStyleError(err?.message || "Unable to create style right now.");
    } finally {
      setCustomStyleTraining(false);
    }
  };

  const handleRenameCustomPreset = (key: string) => {
    const preset = customPresets.find((p) => p.key === key);
    if (!preset) return;
    const next = window.prompt("Rename style", preset.label);
    if (!next) return;

    const updated = customPresets.map((p) => (p.key === key ? { ...p, label: next.trim() || p.label } : p));
    setCustomPresets(updated);
    saveCustomStyles(updated);
  };

  const handleDeleteCustomPreset = (key: string) => {
    const preset = customPresets.find((p) => p.key === key);
    if (!preset) return;
    const ok = window.confirm(`Delete "${preset.label}"?`);
    if (!ok) return;

    const updated = customPresets.filter((p) => p.key !== key);
    setCustomPresets(updated);
    saveCustomStyles(updated);

    setStylePresetKeys((prev) => prev.filter((k) => k !== key));
  };
  // ========================================================================
  // [PART 13 END]
  // ========================================================================

  // ========================================================================
  // [PART 15 START] Render – RIGHT side (separate component)
  // ========================================================================
  // Part 15 extracts the right-pane renderer (image/video preview + controls)
  // so the JSX below stays readable.

  const mediaKindForDisplay =
    activeMediaKind ?? (newestMotionAt > newestStillAt ? "motion" : newestStillAt ? "still" : null);
  const displayedMotion = mediaKindForDisplay === "motion" ? currentMotion : null;
  const displayedStill = mediaKindForDisplay === "motion" ? null : currentStill;

  const renderStudioRight = () => {
    return (
      <StudioRight
        currentStill={displayedStill}
        currentMotion={displayedMotion}
        stillItems={stillItems}
        stillIndex={stillIndex}
        setStillIndex={setStillIndex}
        feedbackText={feedbackText}
        setFeedbackText={setFeedbackText}
        feedbackSending={feedbackSending}
        feedbackError={feedbackError}
        onSubmitFeedback={handleSubmitFeedback}
      />
    );
  };

  // ========================================================================
  // [PART 15 END]
  // ========================================================================

  // ========================================================================
  // [PART 16 START] Render – Custom style modal (blur handled in CSS)
  // ========================================================================
  // Part 16 renders the custom-style modal shell; data/state is handled above,
  // so this section is mostly JSX wiring for the dialog.
  const renderCustomStyleModal = () => {
    if (!customStylePanelOpen) return null;

    return (
      <div className="mina-modal-backdrop" onClick={handleCloseCustomStylePanel}>
        <div className="mina-modal" onClick={(e) => e.stopPropagation()}>
          <div className="mina-modal-header">
            <div>Create a style</div>
            <button type="button" className="mina-modal-close" onClick={handleCloseCustomStylePanel}>
              Close
            </button>
          </div>

          <div
            className="mina-modal-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleCustomStyleFiles(e.dataTransfer.files);
            }}
          >
            <div className="mina-modal-drop-main">
              <button type="button" className="link-button" onClick={handleCustomStyleUploadClick}>
                Upload images
              </button>
              <span>(up to 10)</span>
            </div>
            <div className="mina-modal-drop-help">Drop up to 10 reference images and pick one as hero.</div>

            <input
              ref={customStyleInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={handleCustomStyleInputChange}
            />
          </div>

          {customStyleImages.length > 0 && (
            <div className="mina-modal-grid">
              {customStyleImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  className={classNames("mina-modal-thumb", customStyleHeroId === img.id && "hero")}
                  onClick={() => handleSelectCustomStyleHero(img.id)}
                >
                  <img src={img.url} alt="" />
                  {customStyleHeroId === img.id && <div className="mina-modal-thumb-tag">Hero</div>}
                </button>
              ))}
            </div>
          )}

          <div className="mina-modal-footer">
            {customStyleError && <div className="error-text">{customStyleError}</div>}
            <button
              type="button"
              className="mina-modal-train"
              onClick={handleTrainCustomStyle}
              disabled={!customStyleImages.length || !customStyleHeroId || customStyleTraining}
            >
              {customStyleTraining ? "Creating…" : "Create style"}
            </button>
          </div>
        </div>
      </div>
    );
  };
  // ========================================================================
  // [PART 16 END]
  // ========================================================================

  // ========================================================================
  // [PART 18 START] Final layout
  // ========================================================================
  // Part 18 composes the full studio layout: left controls, right preview, and
  // conditional overlays/loaders.
  // Keep the top loading bar limited to "heavy" actions so navigation between
  // tabs doesn't cause flicker.
  const topBarActive =
    pendingRequests > 0 ||
    uploadsPending ||
    stillGenerating ||
    motionGenerating ||
    customStyleTraining;
  const appUi = (
    <div className="mina-studio-root">
      <div className={classNames("mina-drag-overlay", globalDragging && "show")} />
      <div className="studio-frame">
        <div className={classNames("studio-header-overlay", isRightMediaDark && "is-dark")}>
          <div className="studio-header-left">
            <a href="https://mina.faltastudio.com" className="studio-logo-link">
              Mina
            </a>
          </div>

          <div className="studio-header-right">
            {activeTab === "studio" && (
              <>
                <button
                  type="button"
                  className="studio-header-cta"
                  onClick={handleToggleAnimateMode}
                  disabled={stillGenerating || motionGenerating || pendingRequests > 0}
                >
                  {animateMode ? "Create" : "Animate this"}
                </button>

                <button
                  type="button"
                  className="studio-header-cta"
                  onClick={handleLikeCurrentStill}
                  disabled={!currentStill && !currentMotion}
                >
                  {isCurrentLiked ? "ok" : "♡ more of this"}
                </button>

                <button
                  type="button"
                  className="studio-header-cta"
                  onClick={handleDownloadCurrentStill}
                  disabled={!currentStill && !currentMotion}
                >
                  Download
                </button>
              </>
            )}
          </div>
        </div>

        {activeTab === "studio" ? (
          <div className={classNames("studio-body", "studio-body--two-col")}>
            <StudioLeft
              globalDragging={globalDragging}
              typingHidden={typingUiHidden}
              timingVars={animationTimingVars}
              showPills={showPills}
              showPanels={showPanels}
              showControls={showControls}
              uiStage={uiStage}
              brief={brief}
              briefHintVisible={briefHintVisible}
              briefShellRef={briefShellRef}
              onBriefScroll={handleBriefScroll}
              onBriefChange={handleBriefChange}
              animateMode={animateMode}
              onToggleAnimateMode={handleToggleAnimateMode}
              activePanel={activePanel}
              openPanel={openPanel}
              pillInitialDelayMs={PILL_INITIAL_DELAY_MS}
              pillStaggerMs={PILL_STAGGER_MS}
              panelRevealDelayMs={PANEL_REVEAL_DELAY_MS}
              currentAspect={currentAspect}
              currentAspectIconUrl={ASPECT_ICON_URLS[currentAspect.key]}
              onCycleAspect={handleCycleAspect}
              animateAspect={animateAspectOption}
              animateAspectIconUrl={animateAspectIconUrl}
              animateAspectIconRotated={animateAspectRotated}
              uploads={uploads}
              uploadsPending={uploadsPending}
              removeUploadItem={removeUploadItem}
              moveUploadItem={moveUploadItem}
              triggerPick={triggerPick}
              onFilesPicked={addFilesToPanel}
              productInputRef={productInputRef}
              logoInputRef={logoInputRef}
              inspirationInputRef={inspirationInputRef}
              stylePresetKeys={stylePresetKeys}
              setStylePresetKeys={setStylePresetKeys}
              stylePresets={computedStylePresets}
              customStyles={customStyles}
              getStyleLabel={getStyleLabel}
              editingStyleKey={editingStyleKey}
              editingStyleValue={editingStyleValue}
              setEditingStyleValue={setEditingStyleValue}
              beginRenameStyle={beginRenameStyle}
              commitRenameStyle={commitRenameStyle}
              cancelRenameStyle={cancelRenameStyle}
              deleteCustomStyle={deleteCustomStyle}
              onOpenCustomStylePanel={handleOpenCustomStylePanel}
              onImageUrlPasted={handlePasteImageUrl}
              minaVisionEnabled={minaVisionEnabled}
              onToggleVision={() => setMinaVisionEnabled((p) => !p)}
              stillGenerating={stillGenerating}
              stillError={stillError}
              onCreateStill={handleGenerateStill}
              motionStyleKeys={motionStyleKeys}
              setMotionStyleKeys={setMotionStyleKeys}
              motionSuggesting={motionSuggestLoading || motionSuggestTyping}
              canCreateMotion={canCreateMotion}
              motionHasImage={!!motionReferenceImageUrl}
              motionCreditsOk={motionCreditsOk}
              motionBlockReason={motionBlockReason}
              motionGenerating={motionGenerating}
              motionError={motionError}
              onCreateMotion={handleGenerateMotion}
              onTypeForMe={handleSuggestMotion}
              imageCreditsOk={imageCreditsOk}
              matchaUrl={MATCHA_URL}
              minaMessage={minaMessage}
              minaTalking={minaTalking}
              onGoProfile={() => setActiveTab("profile")}
            />
            {renderStudioRight()}
          </div>
        ) : (
            <Profile
              passId={currentPassId}
              apiBaseUrl={API_BASE_URL}
              onBackToStudio={() => setActiveTab("studio")}
            />

        )}
      </div>

      {renderCustomStyleModal()}
    </div>
  );

  return (
    <>
      <TopLoadingBar active={topBarActive} />
      {appUi}
    </>
  );
  // ========================================================================
  // [PART 18 END]
  // ========================================================================
};

export default MinaApp;
// ============================================================================
// [PART 4 END] Component
// ============================================================================

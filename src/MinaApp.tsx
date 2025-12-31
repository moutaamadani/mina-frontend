// src/MinaApp.tsx
// ============================================================================
// MMA-ONLY MinaApp (NO legacy fallbacks)
// - Still create:      POST /mma/still/create
// - Video suggest:     POST /mma/video/animate  (suggest_only)
// - Video generate:    POST /mma/video/animate
// - Still tweak:       POST /mma/still/:id/tweak
// - Video tweak:       POST /mma/video/:id/tweak
// - Like:              POST /mma/events
// - History/Credits/R2 remain via existing Mina backend routes
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import StudioLeft from "./StudioLeft";
import StudioRight from "./StudioRight";
import { isAdmin as checkIsAdmin, loadAdminConfig } from "./lib/adminConfig";
import { useAuthContext, usePassId } from "./components/AuthGate";
import Profile from "./Profile";
import TopLoadingBar from "./components/TopLoadingBar";
import { downloadMinaAsset } from "./lib/minaDownload";

// ============================================================================
// [PART 1 START] Imports & environment
// ============================================================================
const normalizeBase = (raw?: string | null) => {
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

const MATCHA_URL = "https://www.faltastudio.com/cart/43328351928403:1";


// Prefer an env override, then fall back to same-origin /api so production
// builds avoid CORS errors when the backend is reverse-proxied.
const API_BASE_URL = (() => {
  const envBase = normalizeBase(
    import.meta.env.VITE_MINA_API_BASE_URL ||
      (import.meta as any).env?.VITE_API_BASE_URL ||
      (import.meta as any).env?.VITE_BACKEND_URL
  );

  // Render-only: prefer env var, otherwise hard-fallback to Render API
  return envBase || "https://mina-editorial-ai-api.onrender.com";
})();


const LIKE_STORAGE_KEY = "minaLikedMap";
const RECREATE_DRAFT_KEY = "mina_recreate_draft_v1";
// ============================================================================
// [PART 1 END]
// ============================================================================

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
  expiresAt?: string | null;
};

type CreditsState = {
  balance: number;
  meta?: CreditsMeta;
};

type GptMeta = {
  userMessage?: string;
  imageTexts?: string[];
  input?: string;
  output?: string;
  model?: string;
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

// MMA (Mina Mind API) Types
type MmaCreateResponse = {
  generation_id: string;
  status: string; // "queued"
  sse_url: string; // "/mma/stream/<id>"
  credits_cost?: number;
  parent_generation_id?: string | null;
};

type MmaGenerationResponse = {
  generation_id: string;
  status: string; // "queued" | "scanning" | "prompting" | "generating" | "postscan" | "done" | "error"
  mode?: string; // "still" | "video"
  mma_vars?: any;
  outputs?: {
    seedream_image_url?: string;
    kling_video_url?: string;
    image_url?: string;
    video_url?: string;
  };
  prompt?: string | null;
  error?: any;
  credits?: { balance: any; cost?: any };
};

// Motion styles (UI keywords)
type MotionStyleKey =
  | "melt"
  | "drop"
  | "expand"
  | "satisfying"
  | "slow_motion"
  | "fix_camera"
  | "loop";

type CustomStyleImage = {
  id: string;
  url: string; // blob url for UI
  file: File;
};

type CustomStylePreset = {
  key: string;
  label: string;
  thumbDataUrl: string;
};

type UploadKind = "file" | "url";

type UploadItem = {
  id: string;
  kind: UploadKind;
  url: string; // UI preview (blob: or http)
  remoteUrl?: string; // stored URL in R2 (https://...)
  file?: File;
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

type StyleMode = "main" | "niche";

type MinaAppProps = Record<string, never>;
// ============================================================================
// [PART 2 END]
// ============================================================================

// ============================================================================
// [PART 3 START] Constants & helpers
// ============================================================================
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

const REPLICATE_ASPECT_RATIO_MAP: Record<string, string> = {
  "9:16": "9:16",
  "3:4": "3:4",
  "2:3": "2:3",
  "1:1": "1:1",
};

const STYLE_PRESETS = [
  {
    key: "vintage",
    label: "Vintage",
    thumb: "https://assets.faltastudio.com/mma/still/c0e36258-3c2d-4509-93f0-6d29a65ce291.jpg",
    hero: [
      "https://assets.faltastudio.com/Website%20Assets/Editorial%20style/vintage-hero.png",//luxury pearl
      "https://assets.faltastudio.com/mma/still/c0e36258-3c2d-4509-93f0-6d29a65ce291.jpg",//brown wood
      "https://assets.faltastudio.com/mma/still/8089c15b-895a-41e4-a46f-b3d0790da584.jpg", //brown eggplant
    ],
  },
  {
    key: "gradient",
    label: "Luxury",
    thumb: "https://assets.faltastudio.com/Website%20Assets/Editorial%20style/gradient-thumb.png",
    hero: [
      "https://assets.faltastudio.com/Website%20Assets/Editorial%20style/gradient-hero.png", //horse
      "https://assets.faltastudio.com/mma/still/1163bcdd-5dbf-4fe0-adc4-8348f3b1b5df.jpg", //candle
      "https://assets.faltastudio.com/mma/still/c106e481-3cbb-47b1-a4bc-52d383c62875.jpg", //tomato
    ],
  },
  {
    key: "back-light",
    label: "Minimal",
    thumb: "https://assets.faltastudio.com/mma/still/d70ea648-bf74-4e1f-8a39-83f6d3f962af.jpg",
    hero: [
      "https://assets.faltastudio.com/mma/still/c8b0c214-bd61-4b39-ae27-7af2f4de5460.jpg", //Poire
      "https://assets.faltastudio.com/mma/still/d70ea648-bf74-4e1f-8a39-83f6d3f962af.jpg", //Vanilla Sticks
      "https://assets.faltastudio.com/mma/still/7f1615a9-95f7-4659-a293-960b287d8c96.jpg", //Cerise bowl
      "",
    ],
  },
] as const;


const CUSTOM_STYLES_LS_KEY = "minaCustomStyles_v1";

// Premium reveal timing
const PILL_INITIAL_DELAY_MS = 260;
const PILL_STAGGER_MS = 90;
const PILL_SLIDE_DURATION_MS = 320;
const PANEL_REVEAL_DELAY_MS = PILL_INITIAL_DELAY_MS;
const CONTROLS_REVEAL_DELAY_MS = 0;
const GROUP_FADE_DURATION_MS = 420;
const MAX_BRIEF_CHARS = 1000;
const TYPING_HIDE_DELAY_MS = 400000;
const TYPING_REVEAL_DELAY_MS = 320;
const TEXTAREA_FLOAT_DISTANCE_PX = 12;

function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function padEditorialNumber(value: number | string) {
  const clean = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(clean)) return clean.toString().padStart(2, "0");
  return String(value).trim() || "00";
}

// Signed URL detection
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

function isReplicateUrl(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes("replicate.delivery") || h.includes("replicate.com");
  } catch {
    return false;
  }
}

function safeIsHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

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
// ============================================================================
// Background preload (makes style selection feel instant)
// ============================================================================
const __preloadCache = new Set<string>();

function preloadImage(url: string) {
  const u = String(url || "").trim();
  if (!u || !isHttpUrl(u)) return;
  if (__preloadCache.has(u)) return;
  __preloadCache.add(u);

  const img = new Image();
  // hint: decode async, don't block click
  (img as any).decoding = "async";
  img.src = u;
}

function scheduleIdle(cb: () => void, timeoutMs = 800) {
  if (typeof window === "undefined") return -1 as any;

  const ric = (window as any).requestIdleCallback;
  if (typeof ric === "function") return ric(cb, { timeout: timeoutMs });

  return window.setTimeout(cb, Math.min(800, timeoutMs));
}

function cancelIdle(handle: any) {
  if (typeof window === "undefined") return;

  const cic = (window as any).cancelIdleCallback;
  if (typeof cic === "function") {
    try { cic(handle); } catch {}
    return;
  }
  try { window.clearTimeout(handle); } catch {}
}

// ============================================================================
// [PART 4 START] Component
// ============================================================================
type PanelKey = "product" | "logo" | "inspiration" | "style" | null;

type CustomStyle = {
  id: string;
  key: string;
  label: string;

  // Used by the UI list thumbnail (now a real https URL)
  thumbUrl: string;

  // ✅ Treat like preset.hero: we store Hero + 2 others (all https URLs)
  heroUrls: string[];

  // Optional: keep all uploaded refs (up to 10) for future upgrades
  allUrls?: string[];

  createdAt: string;
};


const MinaApp: React.FC<MinaAppProps> = () => {
  // =====================
  // Auth + identity
  // =====================
  const passId = usePassId();
  const authContext = useAuthContext();

  // =====================
  // Admin / config
  // =====================
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [adminConfig, setAdminConfig] = useState(loadAdminConfig());
  const [computedStylePresets, setComputedStylePresets] = useState(STYLE_PRESETS);

  // =====================
  // Tabs / session
  // =====================
  const [activeTab, setActiveTab] = useState<"studio" | "profile">("studio");
  // --------------------------------------------------------------------------
  // Tab navigation + mobile back gesture support
  // - Keeps navigation inside Mina: Profile -> back -> Studio
  // - Uses #studio / #profile in the URL
  // --------------------------------------------------------------------------
  const goTab = useCallback(
    (tab: "studio" | "profile", mode: "push" | "replace" = "push") => {
      setActiveTab(tab);
      if (typeof window === "undefined") return;

      const base = window.location.pathname + window.location.search;
      const hash = tab === "profile" ? "#profile" : "#studio";
      const url = base + hash;

      try {
        if (mode === "replace") window.history.replaceState({ minaTab: tab }, "", url);
        else window.history.pushState({ minaTab: tab }, "", url);
      } catch {
        // ignore
      }
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Ensure the current history entry has a Mina tab state
    const h = (window.location.hash || "").toLowerCase();
    const initialTab: "studio" | "profile" = h.includes("profile") ? "profile" : "studio";
    goTab(initialTab, "replace");

    const onPop = (ev: PopStateEvent) => {
      const st = (ev.state as any)?.minaTab;
      if (st === "studio" || st === "profile") {
        setActiveTab(st);
        return;
      }
      const hh = (window.location.hash || "").toLowerCase();
      setActiveTab(hh.includes("profile") ? "profile" : "studio");
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [goTab]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("Mina Studio session");

  // =====================
  // Health / credits / loading
  // =====================
  const [health, setHealth] = useState<HealthState | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const [pendingRequests, setPendingRequests] = useState(0);

  // =====================
  // Studio: brief + modes
  // =====================
  const [brief, setBrief] = useState("");
  // ✅ Mobile: show everything from the start (skip stage 0)
  const isMobileInit =
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

  // ✅ UI STAGE: only allow stage=0 before the user has ever typed (desktop only)
  const [hasEverTyped, setHasEverTyped] = useState<boolean>(isMobileInit);

  const [stillBrief, setStillBrief] = useState("");
  const [tone] = useState("still-life");
  const [, setPlatform] = useState("tiktok");
  const [aspectIndex, setAspectIndex] = useState(() => {
  // ✅ Mobile default ratio = 9:16
  if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
    return 0; // ASPECT_OPTIONS[0] = 9:16
  }
  return 2; // desktop default stays 2:3
});


  const [animateAspectKey, setAnimateAspectKey] = useState<AspectKey>(ASPECT_OPTIONS[aspectIndex].key);
  const [animateMode, setAnimateMode] = useState(false);

  // Stills
  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);
  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [lastStillPrompt, setLastStillPrompt] = useState<string>("");

  // Mina UI “talking”
  const [minaMessage, setMinaMessage] = useState("");
  const [minaTalking, setMinaTalking] = useState(false);
  const [minaOverrideText, setMinaOverrideText] = useState<string | null>(null);

  // Motion
  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);
  const [motionDescription, setMotionDescription] = useState("");
  const [motionFinalPrompt, setMotionFinalPrompt] = useState("");

  const [motionStyleKeys, setMotionStyleKeys] = useState<MotionStyleKey[]>([]);
  const [motionSuggesting, setMotionSuggesting] = useState(false);
  const [motionSuggestTyping, setMotionSuggestTyping] = useState(false);
  const [animateAspectRotated, setAnimateAspectRotated] = useState(false);
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);

 
  const [activeMediaKind, setActiveMediaKind] = useState<"still" | "motion" | null>(null);

  // Feedback (tweak)
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Likes (local)
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LIKE_STORAGE_KEY) : null;
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [likeSubmitting, setLikeSubmitting] = useState(false);

  // Panels: open Product by default on mobile
  const [activePanel, setActivePanel] = useState<PanelKey>(isMobileInit ? "product" : null);

  // UI stage: start visible on mobile
  const [uiStage, setUiStage] = useState<0 | 1 | 2 | 3>(isMobileInit ? 3 : 0);
  const stageT2Ref = useRef<number | null>(null);
  const stageT3Ref = useRef<number | null>(null);

  // Global drag overlay
  const [globalDragging, setGlobalDragging] = useState(false);
  const dragDepthRef = useRef(0);

  // Upload buckets
  const [uploads, setUploads] = useState<Record<UploadPanelKey, UploadItem[]>>({
    product: [],
    logo: [],
    inspiration: [],
  });

  // Style selection
  const [stylePresetKeys, setStylePresetKeys] = useState<string[]>([]);

  // ✅ NEW: Main(10) / Niche(14) reference caps
  const [styleMode, setStyleMode] = useState<StyleMode>(() => {
    try {
      const raw = window.localStorage.getItem("minaStyleMode");
      return raw === "niche" ? "niche" : "main";
    } catch {
      return "main";
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem("minaStyleMode", styleMode);
    } catch {
      // ignore
    }
  }, [styleMode]);

  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);

  // Inline rename for styles
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

  // Admin-only number map (Profile)
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

  // History state
  const [historyGenerations, setHistoryGenerations] = useState<GenerationRecord[]>([]);
  const [historyFeedbacks, setHistoryFeedbacks] = useState<FeedbackRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(20);

  const historyCacheRef = useRef<Record<string, { generations: GenerationRecord[]; feedbacks: FeedbackRecord[] }>>({});
  const historyDirtyRef = useRef<boolean>(false);

  const creditsCacheRef = useRef<Record<string, CreditsState>>({});
  const creditsDirtyRef = useRef<boolean>(true);
  const creditsCacheAtRef = useRef<Record<string, number>>({});

  // Upload refs
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const inspirationInputRef = useRef<HTMLInputElement | null>(null);

  // Brief helper hint
  const [showDescribeMore, setShowDescribeMore] = useState(false);
  const describeMoreTimeoutRef = useRef<number | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingCalmTimeoutRef = useRef<number | null>(null);
  const typingHideTimeoutRef = useRef<number | null>(null);
  const typingRevealTimeoutRef = useRef<number | null>(null);
  const [typingUiHidden, setTypingUiHidden] = useState(false);

  // Brief scroll refs
  const briefShellRef = useRef<HTMLDivElement | null>(null);

  // Custom style modal
  const [customStylePanelOpen, setCustomStylePanelOpen] = useState(false);
  const [customStyleImages, setCustomStyleImages] = useState<CustomStyleImage[]>([]);
  const [customStyleHeroId, setCustomStyleHeroId] = useState<string | null>(null);
  const [customStyleHeroThumb, setCustomStyleHeroThumb] = useState<string | null>(null);
  const [customStyleTraining, setCustomStyleTraining] = useState(false);
  const [customStyleError, setCustomStyleError] = useState<string | null>(null);
  const customStyleInputRef = useRef<HTMLInputElement | null>(null);

  const [customPresets, setCustomPresets] = useState<CustomStylePreset[]>(() => {
    if (typeof window === "undefined") return [];
    return loadCustomStyles();
  });

  // Load-more sentinel (Profile)
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Stable refs
  const uploadsRef = useRef(uploads);
  const customStyleHeroThumbRef = useRef<string | null>(customStyleHeroThumb);
  const customStyleImagesRef = useRef<CustomStyleImage[]>(customStyleImages);
  const applyingRecreateDraftRef = useRef(false);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  useEffect(() => {
    customStyleHeroThumbRef.current = customStyleHeroThumb;
  }, [customStyleHeroThumb]);

  useEffect(() => {
    customStyleImagesRef.current = customStyleImages;
  }, [customStyleImages]);

  // Clean timers on unmount
  useEffect(() => {
    return () => {
      if (describeMoreTimeoutRef.current !== null) window.clearTimeout(describeMoreTimeoutRef.current);
      if (typingCalmTimeoutRef.current !== null) window.clearTimeout(typingCalmTimeoutRef.current);
      if (typingHideTimeoutRef.current !== null) window.clearTimeout(typingHideTimeoutRef.current);
      if (typingRevealTimeoutRef.current !== null) window.clearTimeout(typingRevealTimeoutRef.current);
      if (stageT2Ref.current !== null) window.clearTimeout(stageT2Ref.current);
      if (stageT3Ref.current !== null) window.clearTimeout(stageT3Ref.current);
    };
  }, [styleMode]);

  // Persist maps
  useEffect(() => {
    try {
      window.localStorage.setItem("minaProfileNumberMap", JSON.stringify(numberMap));
    } catch {
      // ignore
    }
  }, [numberMap]);

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

  // Load admin config updates from localStorage
  useEffect(() => {
    setAdminConfig(loadAdminConfig());
    const handler = () => setAdminConfig(loadAdminConfig());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Sync admin + email from AuthGate session
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

  // Motion keywords from config
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
      .filter((p: any) => p.status === "published")
      .map((p: any) => ({ key: p.id, label: p.name, thumb: p.heroImage || p.images[0] || "" }));

    setComputedStylePresets([...STYLE_PRESETS, ...publishedPresets]);
  }, [adminConfig]);

  // Keep brief/stillBrief/motionDescription aligned when toggling animate mode
  useEffect(() => {
    if (applyingRecreateDraftRef.current) return;

    const currentBrief = brief;
    if (animateMode) {
      setStillBrief(currentBrief);
      setMotionDescription(currentBrief);
      setTypingUiHidden(true);
      window.setTimeout(() => setTypingUiHidden(false), 220);
    } else {
      setStillBrief(currentBrief);
      setMotionDescription(currentBrief);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateMode]);

  // ========================================================================
  // [PART 5 START] Derived values
  // ========================================================================
  const briefLength = brief.trim().length;
  const uploadsPending = Object.values(uploads).some((arr) => arr.some((it) => it.uploading));
  const currentPassId = passId;

  const stageHasPills = uiStage >= 1;
  const showPanels = uiStage >= 1;
const showControls = uiStage >= 3 || hasEverTyped;
  const showPills = stageHasPills && !typingUiHidden;
  // Preload ALL style thumbs/heroes lazily (after UI is idle)
  useEffect(() => {
    const h = scheduleIdle(() => {
      const urls: string[] = [];

      (computedStylePresets as any[])?.forEach((p) => {
        if (typeof p?.thumb === "string") urls.push(p.thumb);
        if (Array.isArray(p?.hero)) urls.push(...p.hero);
      });

      (customStyles || []).forEach((s) => {
        if (typeof s?.thumbUrl === "string") urls.push(s.thumbUrl);
        if (Array.isArray(s?.heroUrls)) urls.push(...s.heroUrls);
      });

      Array.from(new Set(urls.filter((u) => typeof u === "string" && isHttpUrl(u))))
        .slice(0, 60) // safety cap
        .forEach(preloadImage);
    }, 900);

    return () => cancelIdle(h);
  }, [computedStylePresets, customStyles]);

  // When user selects a style, preload THAT style heroes (still async / non-blocking)
  useEffect(() => {
    const h = scheduleIdle(() => {
      const urls: string[] = [];

      (stylePresetKeys || []).forEach((k) => {
        const preset = (computedStylePresets as any[])?.find((p) => String(p.key) === String(k));
        if (preset) {
          if (Array.isArray(preset.hero)) urls.push(...preset.hero);
          if (typeof preset.thumb === "string") urls.push(preset.thumb);
        }

        const cs = (customStyles || []).find((s) => String(s.key) === String(k));
        if (cs) {
          if (Array.isArray(cs.heroUrls)) urls.push(...cs.heroUrls);
          if (typeof cs.thumbUrl === "string") urls.push(cs.thumbUrl);
        }
      });

      Array.from(new Set(urls.filter((u) => typeof u === "string" && isHttpUrl(u))))
        .slice(0, 12)
        .forEach(preloadImage);
    }, 200);

    return () => cancelIdle(h);
  }, [stylePresetKeys, computedStylePresets, customStyles]);

  const animationTimingVars = useMemo<React.CSSProperties>(
    () => ({
      "--pill-slide-duration": `${PILL_SLIDE_DURATION_MS}ms`,
      "--group-fade-duration": `${GROUP_FADE_DURATION_MS}ms`,
      "--textarea-float-distance": `${TEXTAREA_FLOAT_DISTANCE_PX}px`,
    }),
    []
  );

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

  const animateImageHttp =
    animateImage?.remoteUrl && isHttpUrl(animateImage.remoteUrl)
      ? animateImage.remoteUrl
      : animateImage?.url && isHttpUrl(animateImage.url)
        ? animateImage.url
        : "";

  const motionReferenceImageUrl = animateImageHttp || currentStill?.url || latestStill?.url || "";

  const personalityThinking = useMemo(
  () => (adminConfig.ai?.personality?.thinking?.length ? adminConfig.ai.personality.thinking : []),
  [adminConfig.ai?.personality?.thinking]
);


  const personalityFiller = useMemo(
  () => (adminConfig.ai?.personality?.filler?.length ? adminConfig.ai.personality.filler : []),
  [adminConfig.ai?.personality?.filler]
);


  const imageCost = credits?.meta?.imageCost ?? adminConfig.pricing?.imageCost ?? 1;
  const motionCost = credits?.meta?.motionCost ?? adminConfig.pricing?.motionCost ?? 5;

  const creditBalance = credits?.balance;
  const imageCreditsOk = creditBalance === null || creditBalance === undefined ? true : creditBalance >= imageCost;
  const motionCreditsOk = creditBalance === null || creditBalance === undefined ? true : creditBalance >= motionCost;
  const motionBlockReason = motionCreditsOk ? null : "Get more matchas to animate.";
  // ✅ Tweak uses the same pricing rules as the media type you're tweaking
  const tweakCreditsOk =
  activeMediaKind === "motion" ? motionCreditsOk : activeMediaKind === "still" ? imageCreditsOk : true;

  const tweakBlockReason = tweakCreditsOk ? null : "Get more matchas to tweak.";

  const briefHintVisible = showDescribeMore;

  // choose media kind automatically
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

  // Typing UI hide/reveal
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

  // Style keys for API
  const normalizeStyleKeyForApi = (k: string) => (k.startsWith("custom-") ? "custom-style" : k);
  const stylePresetKeysForApi = (stylePresetKeys.length ? stylePresetKeys : ["none"]).map(normalizeStyleKeyForApi);
  const primaryStyleKeyForApi = stylePresetKeysForApi[0] || "none";

  // Infer animate aspect from image ratio
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


  const motionTextTrimmed = motionDescription.trim();
  const canCreateMotion =
    !!motionReferenceImageUrl && motionTextTrimmed.length > 0 && !motionSuggestTyping && !motionSuggesting;

  const minaBusy =
    stillGenerating ||
    motionGenerating ||
    motionSuggesting ||
    motionSuggestTyping ||
    customStyleTraining ||
    feedbackSending;

  // ========================================================================
  // [PART 5 END]
  // ========================================================================

  // ========================================================================
  // UI Stage reveal (✅ stage 0 ONLY before first typing)
  // ========================================================================
  useEffect(() => {
    // clear any pending timers first (safe)
    if (stageT2Ref.current !== null) window.clearTimeout(stageT2Ref.current);
    if (stageT3Ref.current !== null) window.clearTimeout(stageT3Ref.current);
    stageT2Ref.current = null;
    stageT3Ref.current = null;

    const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

    // If empty brief:
    // - before first typing -> stage 0 (hide)
    // - after first typing  -> stage 1 (keep UI visible)
    if (briefLength <= 0) {
    const nextStage: 0 | 1 | 2 | 3 = (hasEverTyped || isMobile) ? 3 : 0;

      setUiStage(nextStage);

      if (hasEverTyped || isMobile) {
        // keep panels ready (don’t collapse everything)
        setActivePanel((prev) => prev ?? "product");
      } else {
        // first time ever: fully reset
        setActivePanel(null);
      }

      setGlobalDragging(false);
      dragDepthRef.current = 0;
      return;
    }

    // Non-empty brief: ensure stage at least 1
    if (uiStage < 1) {
      setUiStage(1);
      setActivePanel((prev) => prev ?? "product");
    }

    // Schedule reveal to stage 2 then 3 every time user has text
    stageT2Ref.current = window.setTimeout(() => {
      setUiStage((s) => (s < 2 ? 2 : s));
    }, PANEL_REVEAL_DELAY_MS);

    stageT3Ref.current = window.setTimeout(() => {
      setUiStage((s) => (s < 3 ? 3 : s));
    }, CONTROLS_REVEAL_DELAY_MS);
  }, [briefLength, uiStage, hasEverTyped]);


  // ========================================================================
  // MINA “thinking out loud” UI
  // ========================================================================
  useEffect(() => {
    if (!minaBusy) return;
    if (minaOverrideText) return;

    setMinaTalking(true);

    const phrases = [...personalityThinking, ...personalityFiller].filter(Boolean);
    let phraseIndex = 0;
    let charIndex = 0;
    let t: number | null = null;

    const CHAR_MS = 35;
    const END_PAUSE_MS = 160;

    const tick = () => {
      const phrase = phrases[phraseIndex % phrases.length] || "";
      const nextChar = charIndex + 1;
      const nextSlice = phrase.slice(0, Math.min(nextChar, phrase.length));

      setMinaMessage(nextSlice || "typing…");

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

  useEffect(() => {
    if (!minaOverrideText) return;

    setMinaTalking(true);
    setMinaMessage("");

    let cancelled = false;
    let i = 0;
    let t: number | null = null;

    const text = minaOverrideText;
    const CHAR_MS = 6;

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

  // ========================================================================
  // [PART 7 START] API helpers (MMA + history/credits/R2)
  // ========================================================================
  const getSupabaseAccessToken = async (accessTokenFromAuth: string | null): Promise<string | null> => {
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

      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      if (currentPassId && !headers.has("X-Mina-Pass-Id")) {
        headers.set("X-Mina-Pass-Id", currentPassId);
      }

      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    } finally {
      setPendingRequests((n) => Math.max(0, n - 1));
    }
  };

    // ============================================================================
  // MMA double-fire protection + idempotency_key injection
  // - Prevents accidental double-click / double-submit
  // - Sends idempotency_key to backend (top-level + inputs)
  // ============================================================================
  const mmaInFlightRef = useRef<Map<string, Promise<{ generationId: string }>>>(new Map());

    // ✅ store idempotency key ONLY while a request is running
    const mmaIdemKeyRef = useRef<Map<string, string>>(new Map());
    
    const makeIdempotencyKey = (prefix = "mma") => {
      try {
        // @ts-ignore
        const u = crypto?.randomUUID?.();
        if (u) return `${prefix}_${u}`;
      } catch {}
      return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random()
        .toString(16)
        .slice(2)}`;
    };
    
    // ✅ New behavior:
    // - same key reused only for the SAME in-flight request
    // - once it finishes, next click gets a NEW key (so user can generate again)
    const getIdemForRun = (actionKey: string) => {
      const existing = mmaIdemKeyRef.current.get(actionKey);
      if (existing) return existing;
    
      const key = makeIdempotencyKey(actionKey.replace(/[^a-z0-9:_-]/gi, "").slice(0, 40) || "mma");
      mmaIdemKeyRef.current.set(actionKey, key);
      return key;
    };


  const attachIdempotencyKey = (payload: any, idem: string) => {
    const body =
      payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : { payload };

    // top-level
    body.idempotency_key = idem;

    // also inside inputs (your router supports both)
    if (body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)) {
      body.inputs = { ...body.inputs, idempotency_key: idem };
    } else {
      body.inputs = { idempotency_key: idem };
    }

    return body;
  };

  const buildMmaActionKey = (createPath: string, body: any) => {
    const b = body || {};
    const inputs = b.inputs || {};
    const intent = String(b.intent || inputs.intent || inputs.action || "").toLowerCase();

    const isSuggest =
      !!b.suggest_only ||
      !!b.suggestOnly ||
      !!inputs.suggest_only ||
      !!inputs.suggestOnly ||
      !!inputs.prompt_only ||
      !!inputs.promptOnly ||
      !!inputs.text_only ||
      !!inputs.textOnly ||
      intent.includes("suggest") ||
      intent.includes("type_for_me");

    return `${createPath}:${isSuggest ? "suggest" : "run"}:${intent}`.toLowerCase();
  };

  // MMA SSE stream
  type MmaStreamState = { status: string; scanLines: string[] };
  const mmaStreamRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      try {
        mmaStreamRef.current?.close();
      } catch {
        // ignore
      }
      mmaStreamRef.current = null;
    };
  }, []);
    const mmaCreateAndWait = (
    createPath: string,
    body: any,
    onProgress?: (s: MmaStreamState) => void
  ): Promise<{ generationId: string }> => {
    const actionKey = buildMmaActionKey(createPath, body);

    // ✅ If double-fired, return the same in-flight promise (no second backend call)
    const existing = mmaInFlightRef.current.get(actionKey);
    if (existing) return existing;

    const run = (async () => {
      const idem = getIdemForRun(actionKey);
      const bodyWithIdem = attachIdempotencyKey(body || {}, idem);

      const res = await apiFetch(createPath, { method: "POST", body: JSON.stringify(bodyWithIdem) });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || `MMA create failed (${res.status})`);
      }

      const created = (await res.json().catch(() => ({}))) as Partial<MmaCreateResponse> & any;

      const generationId = created.generation_id || created.generationId || created.id || null;
      if (!generationId) throw new Error("MMA create returned no generation id.");

      const relSse =
        created.sse_url || created.sseUrl || `/mma/stream/${encodeURIComponent(String(generationId))}`;

      // ✅ FIX: backend may return absolute URL
      const sseUrl = /^https?:\/\//i.test(String(relSse))
        ? String(relSse)
        : `${API_BASE_URL}${String(relSse)}`;

      const scanLines: string[] = [];
      let status = created.status || "queued";

      try {
        onProgress?.({ status, scanLines: [...scanLines] });
      } catch {}

      try {
        mmaStreamRef.current?.close();
      } catch {}
      mmaStreamRef.current = null;

      const es = new EventSource(sseUrl);
      mmaStreamRef.current = es;

      await new Promise<void>((resolve) => {
        const cleanup = () => {
          try {
            es.close();
          } catch {}
          if (mmaStreamRef.current === es) mmaStreamRef.current = null;
        };

        es.onmessage = (ev: MessageEvent) => {
          try {
            const raw = (ev as any)?.data;

            if (
              typeof raw === "string" &&
              raw.trim() &&
              raw.trim()[0] !== "{" &&
              raw.trim()[0] !== "["
            ) {
              status = raw.trim();
              onProgress?.({ status, scanLines: [...scanLines] });
              return;
            }

            const data = JSON.parse(raw || "{}");

            const nextStatus =
              data.status || data.status_text || data.statusText || data.text || data.message || null;

            if (typeof nextStatus === "string" && nextStatus.trim()) status = nextStatus.trim();

            const incoming =
              (Array.isArray(data.scanLines) && data.scanLines) ||
              (Array.isArray(data.scan_lines) && data.scan_lines) ||
              [];

            if (incoming.length) {
              scanLines.length = 0;
              incoming.forEach((x: any) => {
                const t = typeof x === "string" ? x : x?.text;
                if (t) scanLines.push(String(t));
              });
            }

            onProgress?.({ status, scanLines: [...scanLines] });
          } catch {}
        };

        es.addEventListener("status", (ev: any) => {
          try {
            const data = JSON.parse(ev.data || "{}");
            const next = data.status || data.status_text || data.statusText || data.text || null;
            if (typeof next === "string" && next.trim()) status = next.trim();
            onProgress?.({ status, scanLines: [...scanLines] });
          } catch {}
        });

        es.addEventListener("scan_line", (ev: any) => {
          try {
            const data = JSON.parse(ev.data || "{}");
            const text = String(data.text || data.message || data.line || "");
            if (text) scanLines.push(text);
            onProgress?.({ status, scanLines: [...scanLines] });
          } catch {}
        });

        es.addEventListener("done", () => {
          cleanup();
          resolve();
        });

        es.onerror = () => {
          // ✅ don’t block forever if SSE drops
          window.setTimeout(() => {
            cleanup();
            resolve();
          }, 900);
        };
      });

      return { generationId: String(generationId) };
    })();

    mmaInFlightRef.current.set(actionKey, run);

    // ensure we always clean up
    run.finally(() => {
      const cur = mmaInFlightRef.current.get(actionKey);
      if (cur === run) mmaInFlightRef.current.delete(actionKey);
    
      // ✅ allow new generations after this finishes
      mmaIdemKeyRef.current.delete(actionKey);
    });
    return run;
  };


  // ============================================================================
// MMA result polling helpers (backend: GET /mma/generations/:generation_id)
// ============================================================================

async function mmaFetchResult(generationId: string): Promise<MmaGenerationResponse> {
  const id = encodeURIComponent(String(generationId || ""));
  const res = await apiFetch(`/mma/generations/${id}`);

  // Keep UI alive even if backend is briefly behind
  if (!res.ok) {
    return { generation_id: String(generationId), status: "queued" } as any;
  }

  const json = (await res.json().catch(() => ({}))) as any;

  const mmaVars = json?.mma_vars ?? json?.mg_mma_vars ?? json?.vars ?? undefined;

  const status =
    json?.status ??
    json?.mg_mma_status ??
    json?.mma_status ??
    json?.state ??
    "queued";

  const outputs =
    json?.outputs ??
    mmaVars?.outputs ??
    mmaVars?.provider_outputs ??
    mmaVars?.result?.outputs ??
    undefined;

  const prompt =
    json?.prompt ??
    json?.mg_prompt ??
    mmaVars?.prompt ??
    null;

  const error =
    json?.error ??
    json?.mg_error ??
    mmaVars?.error ??
    undefined;

  // helpful fallbacks for your later `(result as any)?.outputUrl/imageUrl/videoUrl` checks
  const outputUrl =
    json?.outputUrl ??
    json?.mg_output_url ??
    outputs?.seedream_image_url ??
    outputs?.kling_video_url ??
    outputs?.image_url ??
    outputs?.video_url ??
    "";

  return {
    generation_id: String(json?.generation_id ?? json?.mg_generation_id ?? generationId),
    status: String(status),
    mode: json?.mode ?? json?.mg_mma_mode,
    mma_vars: mmaVars,
    outputs,
    prompt,
    error,
    credits: json?.credits ?? json?.billing ?? undefined,
    ...(outputUrl ? { outputUrl } : {}),
  } as any;
}

async function mmaWaitForFinal(
  generationId: string,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<MmaGenerationResponse> {
  const timeoutMs = Math.max(5_000, Number(opts?.timeoutMs ?? 180_000)); // 3 min default
  const intervalMs = Math.max(400, Number(opts?.intervalMs ?? 900));

  const started = Date.now();
  let last: MmaGenerationResponse = { generation_id: generationId, status: "queued" } as any;

  const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

  while (Date.now() - started < timeoutMs) {
    last = await mmaFetchResult(generationId);

    const st = String(last?.status || "").toLowerCase().trim();

    // terminal statuses (cover common variants)
    if (
      st === "done" ||
      st === "error" ||
      st === "failed" ||
      st === "succeeded" ||
      st === "success" ||
      st === "completed" ||
      st === "cancelled" ||
      st === "canceled" ||
      st === "suggested"
    ) {
      return last;
    }

    // sometimes outputs appear before status flips
    const hasOutputs =
      !!last?.outputs?.seedream_image_url ||
      !!last?.outputs?.kling_video_url ||
      !!last?.outputs?.image_url ||
      !!last?.outputs?.video_url ||
      !!(last as any)?.outputUrl ||
      !!(last as any)?.imageUrl ||
      !!(last as any)?.videoUrl;

    if (hasOutputs) return last;

    await sleep(intervalMs);
  }

  return last;
}



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

      const cachedBalance = cached?.balance ?? credits?.balance;
      let balance = cachedBalance;

      const rawBalance = json?.credits ?? json?.balance ?? json?.data?.credits ?? json?.data?.balance ?? null;

      if (rawBalance !== null && rawBalance !== undefined) {
        const parsed = Number(rawBalance);
        if (Number.isFinite(parsed)) balance = parsed;
      }
      if (balance === undefined || balance === null) balance = cachedBalance ?? 0;

      const nextCredits: CreditsState = {
        balance,
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

  const applyCreditsFromResponse = (resp?: { balance: any; cost?: any }) => {
    if (!resp) return;

    const parsed = Number(resp.balance);
    const prevBalance = creditsCacheRef.current[currentPassId || ""]?.balance ?? credits?.balance;

    const looksValid = Number.isFinite(parsed) && parsed >= 0;

    const suspiciousZero =
      looksValid &&
      parsed === 0 &&
      typeof prevBalance === "number" &&
      Number.isFinite(prevBalance) &&
      prevBalance > 0;

    if (!looksValid || suspiciousZero) {
      creditsDirtyRef.current = true;
      void fetchCredits();
      return;
    }

    setCredits((prev) => ({ balance: parsed, meta: prev?.meta }));
    if (currentPassId) {
      creditsCacheRef.current[currentPassId] = { balance: parsed, meta: creditsCacheRef.current[currentPassId]?.meta };
      creditsCacheAtRef.current[currentPassId] = Date.now();
      creditsDirtyRef.current = false;
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
          meta: { timezone: "Asia/Dubai" },
        }),
      });

      if (!res.ok) return null;
      const json = (await res.json().catch(() => ({}))) as any;

      const sid = json?.sessionId || json?.session_id || json?.session?.id || json?.session?.sessionId || null;
      if (sid) {
        setSessionId(String(sid));
        return String(sid);
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

  const fetchHistory = async () => {
    if (!API_BASE_URL || !currentPassId) return;

    try {
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

      const strippedGens = gens.map((g) => {
        const original = g.outputUrl || "";
        const stable = stripSignedQuery(original);
        return stable && stable !== original ? { ...g, outputUrl: stable } : g;
      });

      const hasReplicate = strippedGens.some((g) => isReplicateUrl(g.outputUrl || ""));

      const updated = hasReplicate
        ? await Promise.all(
            strippedGens.map(async (g) => {
              const url = g.outputUrl || "";
              if (!url) return g;
              if (!isReplicateUrl(url)) return g;
              try {
                const kind = isVideoUrl(url) ? "motions" : "generations";
                const r2 = await storeRemoteToR2(url, kind);
                const stable = stripSignedQuery(r2);
                return stable ? { ...g, outputUrl: stable } : g;
              } catch {
                return g;
              }
            })
          )
        : strippedGens;

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

  // Profile mount fetch
  useEffect(() => {
    if (activeTab !== "profile") return;
    if (!currentPassId) return;

    setVisibleHistoryCount(20);
    void fetchCredits();
    void fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentPassId]);

  // Refresh credits when returning focus
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

  // Infinite scroll for profile
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

  // Admin numbering helpers
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

  // ========================================================================
  // R2 helpers
  // ========================================================================
  function pickUrlFromR2Response(json: any): string | null {
    if (!json) return null;
    const candidates: any[] = [
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

  function normalizeNonExpiringUrl(url: string): string {
    return stripSignedQuery(url);
  }

  async function uploadFileToR2(panel: UploadPanelKey, file: File): Promise<string> {
    const contentType = file.type || "application/octet-stream";
    const fileName = file.name || `upload_${Date.now()}`;
    const folder = "user_uploads";

    const res = await apiFetch("/api/r2/upload-signed", {
      method: "POST",
      body: JSON.stringify({
        contentType,
        fileName,
        folder,
        kind: panel,
        passId: currentPassId,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.message || json?.error || `Upload-signed failed (${res.status})`);
    }

    const uploadUrl =
      json.uploadUrl || json.upload_url || json.signedUrl || json.signed_url || json.url || null;

    const publicUrl =
      json.publicUrl || json.public_url || json.public || json.result?.publicUrl || json.data?.publicUrl || null;

    if (!uploadUrl || !publicUrl) throw new Error("Upload-signed response missing uploadUrl/publicUrl");

    const putRes = await fetch(String(uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });

    if (!putRes.ok) throw new Error(`R2 PUT failed (${putRes.status})`);

    const stable = normalizeNonExpiringUrl(String(publicUrl));
    if (!stable.startsWith("http")) throw new Error("Upload returned invalid publicUrl");
    return stable;
  }

  const ASSETS_HOST = "assets.faltastudio.com";

  function isAssetsUrl(url: string) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      return h === ASSETS_HOST || h.endsWith(`.${ASSETS_HOST}`);
    } catch {
      return false;
    }
  }

  function isVideoUrl(url: string) {
    const base = (url || "").split("?")[0].split("#")[0].toLowerCase();
    return base.endsWith(".mp4") || base.endsWith(".webm") || base.endsWith(".mov") || base.endsWith(".m4v");
  }

  async function storeRemoteToR2(url: string, kind: string): Promise<string> {
    const res = await apiFetch("/api/r2/store-remote-signed", {
      method: "POST",
      body: JSON.stringify({
        sourceUrl: url,
        folder: "user_uploads",
        url,
        kind,
        passId: currentPassId,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) return url;

    const rawUrl = pickUrlFromR2Response(json);
    if (!rawUrl) return url;

    const stable = normalizeNonExpiringUrl(rawUrl);
    return stable || url;
  }

  async function ensureAssetsUrl(url: string, kind: "generations" | "motions") {
    const stable = stripSignedQuery(url || "");
    if (!stable) return "";
    if (isAssetsUrl(stable)) return stable;

    const stored = await storeRemoteToR2(stable, kind);
    const storedStable = stripSignedQuery(stored);
    return storedStable || stable;
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
  // [PART 9] STILL CREATE (MMA ONLY)
  // ========================================================================
  const handleGenerateStill = async () => {
    const trimmed = stillBrief.trim();
    if (trimmed.length < 20) return;

    if (!API_BASE_URL) {
      setStillError("Missing API base URL (VITE_MINA_API_BASE_URL).");
      return;
    }
    if (!currentPassId) {
      setStillError("Missing Pass ID for MEGA session.");
      return;
    }

    setStillGenerating(true);
    setStillError(null);

    try {
      const safeAspectRatio =
        REPLICATE_ASPECT_RATIO_MAP[currentAspect.ratio] || currentAspect.ratio || "2:3";

      const sid = await ensureSession();

      const productItem = uploads.product[0];
      const productUrl = productItem?.remoteUrl || productItem?.url || "";

      const logoItem = uploads.logo[0];
      const logoUrl = logoItem?.remoteUrl || logoItem?.url || "";

        // ✅ include selected style preset hero urls + custom style heroUrls + user inspiration uploads
const styleHeroUrls = (stylePresetKeys || [])
  .flatMap((k) => {
    // 1) predefined / published presets
    const preset = (computedStylePresets as any[])?.find((p) => String(p.key) === String(k));
    if (preset) {
      const hero = preset?.hero;
      if (Array.isArray(hero)) return hero.filter((u: any) => typeof u === "string" && isHttpUrl(u));
      if (typeof hero === "string" && hero.trim() && isHttpUrl(hero.trim())) return [hero.trim()];
      if (typeof preset?.thumb === "string" && preset.thumb.trim() && isHttpUrl(preset.thumb.trim()))
        return [preset.thumb.trim()];
    }

    // 2) custom styles (your “Your style”)
    const cs = (customStyles || []).find((s) => String(s.key) === String(k));
    if (cs) {
      const arr = Array.isArray((cs as any).heroUrls) ? (cs as any).heroUrls : [];
      const fallback = typeof cs.thumbUrl === "string" ? [cs.thumbUrl] : [];
      return [...arr, ...fallback].filter((u) => typeof u === "string" && isHttpUrl(u)).slice(0, 3);
    }

    return [];
  })
  .filter((u) => isHttpUrl(u));


      const userInspirationUrls = (uploads.inspiration || [])
        .map((u) => u.remoteUrl || u.url)
        .filter((u) => isHttpUrl(u));

      // ✅ TOTAL reference cap (product + logo + inspiration combined)
      const refCap = styleMode === "niche" ? 14 : 10;

      const productStable = stripSignedQuery(productUrl || "");
      const logoStable = stripSignedQuery(logoUrl || "");

      const baseCount =
        (productStable && isHttpUrl(productStable) ? 1 : 0) + (logoStable && isHttpUrl(logoStable) ? 1 : 0);

      const remaining = Math.max(0, refCap - baseCount);

      // pool = style heroes first, then user inspiration
      const pool = [...styleHeroUrls, ...userInspirationUrls]
        .map((u) => stripSignedQuery(String(u || "").trim()))
        .filter((u) => isHttpUrl(u))
        .filter((u) => u !== productStable && u !== logoStable);

      // dedupe + trim to remaining
      const inspirationUrls = Array.from(new Set(pool)).slice(0, remaining);


      const mmaBody = {
        passId: currentPassId,
        assets: {
          product_image_url: isHttpUrl(productUrl) ? productUrl : "",
          logo_image_url: isHttpUrl(logoUrl) ? logoUrl : "",
          inspiration_image_urls: inspirationUrls,
        },
        inputs: {
          brief: trimmed,
          tone,
          platform: currentAspect.platformKey,
          aspect_ratio: safeAspectRatio,
          stylePresetKeys: stylePresetKeysForApi,
          stylePresetKey: primaryStyleKeyForApi,
          minaVisionEnabled,
        },
        settings: {},
        history: {
          sessionId: sid || sessionId || null,
          sessionTitle: sessionTitle || null,
        },
        feedback: {still_feedback: trimmed},
        prompts: {},
      };

      const { generationId } = await mmaCreateAndWait(
        "/mma/still/create",
        mmaBody,
       ({ status, scanLines }) => {
          const last = scanLines.slice(-1)[0] || status || "";
          if (last) setMinaOverrideText(last);
        }

      );

      const result = await mmaWaitForFinal(generationId);

      if (result?.status === "error") {
        const msg = result?.error?.message || result?.error?.code || "MMA pipeline failed.";
        throw new Error(String(msg));
      }

      const rawUrl =
        result?.outputs?.seedream_image_url ||
        result?.outputs?.image_url ||
        (result as any)?.imageUrl ||
        (result as any)?.outputUrl ||
        "";

      const url = rawUrl ? await ensureAssetsUrl(rawUrl, "generations") : "";
      if (!url) throw new Error("MMA returned no image URL.");

      historyDirtyRef.current = true;
      creditsDirtyRef.current = true;
      void fetchCredits();

      applyCreditsFromResponse(result?.credits);

      const item: StillItem = {
        id: generationId,
        url,
        createdAt: new Date().toISOString(),
        prompt: String(result?.prompt || trimmed),
        aspectRatio: currentAspect.ratio,
      };

      setStillItems((prev) => {
        const next = [item, ...prev];
        setStillIndex(0);
        return next;
      });

      setActiveMediaKind("still");
      setLastStillPrompt(item.prompt);
    } catch (err: any) {
      setStillError(err?.message || "Unexpected error generating still.");
    } finally {
      setStillGenerating(false);
    }
  };

  // ========================================================================
  // [PART 10] MOTION SUGGEST + GENERATE (MMA ONLY)
  // ========================================================================
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

  const onTypeForMe = useCallback(async () => {
    if (motionSuggesting) return;

    const frame0 = uploads.product?.[0]?.remoteUrl || uploads.product?.[0]?.url || "";
    const frame1 = uploads.product?.[1]?.remoteUrl || uploads.product?.[1]?.url || "";

    const startFrame = isHttpUrl(frame0) ? frame0 : (motionReferenceImageUrl || "");
    const endFrame = isHttpUrl(frame1) ? frame1 : "";

    if (!startFrame) return;
    if (!API_BASE_URL || !currentPassId) return;

    setMotionSuggesting(true);

    try {
      const sid = await ensureSession();

      const typedBrief = (brief || motionDescription || "").trim();

          const mmaBody = {
            passId: currentPassId,
            assets: {
              start_image_url: startFrame,
              end_image_url: endFrame || "",
              kling_image_urls: endFrame ? [startFrame, endFrame] : [startFrame],
            },
            inputs: {
              intent: "type_for_me",
              type_for_me: true,
              suggest_only: true,
          
              // redundant on purpose (backend mapping safety)
              motion_user_brief: typedBrief,
              motionDescription: typedBrief,
              motion_description: typedBrief,
          
              selected_movement_style: (motionStyleKeys?.[0] || "").trim(),
          
              platform: animateAspectOption.platformKey,
              aspect_ratio: animateAspectOption.ratio,
          
              stylePresetKeys: stylePresetKeysForApi,
              stylePresetKey: primaryStyleKeyForApi,
          
              minaVisionEnabled,
            },
            settings: {},
            history: {
              sessionId: sid || sessionId || null,
              sessionTitle: sessionTitle || null,
            },
          
            // send both so backend never misses it
            feedback: {
              motion_feedback: typedBrief,
              still_feedback: typedBrief,
            },
          
            prompts: {},
          };


        const { generationId } = await mmaCreateAndWait(
          "/mma/video/animate",
          mmaBody,
          ({ status, scanLines }) => {
            const last = scanLines.slice(-1)[0] || status || "";
            if (last) setMinaOverrideText(last);
          }
        );

      const final = await mmaWaitForFinal(generationId);

      const suggested =
        String(
          final?.mma_vars?.prompts?.suggested_prompt ||
            final?.mma_vars?.prompts?.sugg_prompt ||
            final?.mma_vars?.suggested_prompt ||
            final?.prompt ||
            (final as any)?.suggestion ||
            ""
        ).trim();

      if (!suggested) throw new Error("MMA returned no suggestion.");
      setMotionFinalPrompt(suggested);

      await applyMotionSuggestionText(suggested);
    } catch (e) {
      console.error("type-for-me failed:", e);
    } finally {
      setMotionSuggesting(false);
    }
  }, [
    motionSuggesting,
    uploads.product,
    motionReferenceImageUrl,
    API_BASE_URL,
    currentPassId,
    brief,
    motionDescription,
    motionStyleKeys,
    animateAspectOption.platformKey,
    animateAspectOption.ratio,
    stylePresetKeysForApi,
    primaryStyleKeyForApi,
    minaVisionEnabled,
    sessionId,
    sessionTitle,
    ensureSession,
    mmaCreateAndWait,
    mmaFetchResult,
  ]);

  const handleGenerateMotion = async () => {
    if (!API_BASE_URL || !motionReferenceImageUrl || !motionTextTrimmed) return;

    if (!currentPassId) {
      setMotionError("Missing Pass ID for MEGA session.");
      return;
    }

    setMotionGenerating(true);
    setMotionError(null);

    try {
      const sid = await ensureSession();

      const frame0 = uploads.product[0]?.remoteUrl || uploads.product[0]?.url || "";
      const frame1 = uploads.product[1]?.remoteUrl || uploads.product[1]?.url || "";

      const startFrame = isHttpUrl(frame0) ? frame0 : motionReferenceImageUrl;
      const endFrame = isHttpUrl(frame1) ? frame1 : "";

      const mmaBody = {
        passId: currentPassId,
        assets: {
          start_image_url: startFrame,
          end_image_url: endFrame || "",
          kling_image_urls: endFrame ? [startFrame, endFrame] : [startFrame],
        },
        inputs: {
          motionDescription: (motionFinalPrompt || motionTextTrimmed).trim(),
          prompt_override: (motionFinalPrompt || motionTextTrimmed).trim(),
          use_prompt_override: !!(motionFinalPrompt || motionTextTrimmed).trim(),
          tone,
          platform: animateAspectOption.platformKey,
          aspect_ratio: animateAspectOption.ratio,

          stylePresetKeys: stylePresetKeysForApi,
          stylePresetKey: primaryStyleKeyForApi,

          minaVisionEnabled,
        },
        settings: {},
        history: {
          sessionId: sid || sessionId || null,
          sessionTitle: sessionTitle || null,
        },
        feedback: {},
        prompts: {},
      };

     const { generationId } = await mmaCreateAndWait(
        "/mma/video/animate",
        mmaBody,
        ({ status, scanLines }) => {
          const last = scanLines.slice(-1)[0] || status || "";
          if (last) setMinaOverrideText(last);
        }

      );


      const result = await mmaWaitForFinal(generationId);

      if (result?.status === "error") {
        const msg = result?.error?.message || result?.error?.code || "MMA pipeline failed.";
        throw new Error(String(msg));
      }

      const rawUrl =
        result?.outputs?.kling_video_url ||
        result?.outputs?.video_url ||
        (result as any)?.videoUrl ||
        (result as any)?.outputUrl ||
        "";

      const url = rawUrl ? await ensureAssetsUrl(rawUrl, "motions") : "";
      if (!url) throw new Error("MMA returned no video URL.");

      historyDirtyRef.current = true;
      creditsDirtyRef.current = true;
      void fetchCredits();

      applyCreditsFromResponse(result?.credits);

      const item: MotionItem = {
        id: generationId,
        url,
        createdAt: new Date().toISOString(),
        prompt: String(result?.prompt || motionTextTrimmed),
      };

      setMotionItems((prev) => {
        const next = [item, ...prev];
        setMotionIndex(0);
        return next;
      });

      setActiveMediaKind("motion");
    } catch (err: any) {
      setMotionError(err?.message || "Unexpected error generating motion.");
    } finally {
      setMotionGenerating(false);
    }
  };

  // ========================================================================
  // [TWEAK] MMA ONLY
  // ========================================================================
  const onTweak = useCallback(
    async (rawText: string) => {
      const tweak = String(rawText || "").trim();
      if (!tweak) {
        setFeedbackError("Type a tweak first.");
        return;
      }
      
      const isMotion = activeMediaKind === "motion" && !!currentMotion?.id;
      const parentId = isMotion ? String(currentMotion?.id || "") : String(currentStill?.id || "");
      
      if (!parentId) {
        setFeedbackError("Create an image/video first, then tweak it.");
        return;
      }
      
      if (!API_BASE_URL) {
        setFeedbackError("Missing API base URL.");
        return;
      }
      
      if (!currentPassId) {
        setFeedbackError("Missing Pass ID.");
        return;
      }


      setFeedbackSending(true);
      setMinaOverrideText("got it, tweaking that now");
      setFeedbackError(null);

      try {
        const sid = await ensureSession();

       const onProgress = ({ status, scanLines }: { status: string; scanLines: string[] }) => {
          const last = scanLines.slice(-1)[0] || status || "";
          if (last) setMinaOverrideText(last);
        };



        if (!isMotion) {
          const safeAspectRatio =
            REPLICATE_ASPECT_RATIO_MAP[currentAspect.ratio] || currentAspect.ratio || "2:3";

          const mmaBody = {
            passId: currentPassId,
            inputs: {
              intent: "tweak",
              tweak,
              tweak_text: tweak,
              user_tweak: tweak,

              brief: (stillBrief || brief || "").trim(),
              platform: currentAspect.platformKey,
              aspect_ratio: safeAspectRatio,

              stylePresetKeys: stylePresetKeysForApi,
              stylePresetKey: primaryStyleKeyForApi,

              minaVisionEnabled,
            },
            settings: {},
            history: { sessionId: sid || sessionId || null, sessionTitle: sessionTitle || null },
            feedback: { comment: tweak, motion_feedback: tweak, still_feedback: tweak },
            prompts: {},
          };

          const { generationId } = await mmaCreateAndWait(
            `/mma/still/${encodeURIComponent(parentId)}/tweak`,
            mmaBody,
            onProgress
          );

          const result = await mmaWaitForFinal(generationId);
          if (result?.status === "error") {
            const msg = result?.error?.message || result?.error?.code || "MMA tweak failed.";
            throw new Error(String(msg));
          }

          const rawUrl =
            result?.outputs?.seedream_image_url ||
            result?.outputs?.image_url ||
            (result as any)?.imageUrl ||
            (result as any)?.outputUrl ||
            "";

          const url = rawUrl ? await ensureAssetsUrl(rawUrl, "generations") : "";
          if (!url) throw new Error("MMA tweak returned no image URL.");

          applyCreditsFromResponse(result?.credits);

          const item: StillItem = {
            id: generationId,
            url,
            createdAt: new Date().toISOString(),
            prompt: String(result?.prompt || stillBrief || brief || ""),
            aspectRatio: currentAspect.ratio,
          };

          setStillItems((prev) => {
            const next = [item, ...prev];
            setStillIndex(0);
            return next;
          });

          setActiveMediaKind("still");
        } else {
          const frame0 = uploads.product[0]?.remoteUrl || uploads.product[0]?.url || "";
          const frame1 = uploads.product[1]?.remoteUrl || uploads.product[1]?.url || "";

          const startFrame = isHttpUrl(frame0) ? frame0 : (motionReferenceImageUrl || "");
          const endFrame = isHttpUrl(frame1) ? frame1 : "";

          const mmaBody = {
            passId: currentPassId,
            assets: {
              start_image_url: startFrame,
              end_image_url: endFrame || "",
              kling_image_urls: endFrame ? [startFrame, endFrame] : [startFrame],
            },
            inputs: {
              intent: "tweak",
              tweak,
              tweak_text: tweak,
              user_tweak: tweak,

              motionDescription: (motionTextTrimmed || motionDescription || brief || "").trim(),
              platform: animateAspectOption.platformKey,
              aspect_ratio: animateAspectOption.ratio,

              stylePresetKeys: stylePresetKeysForApi,
              stylePresetKey: primaryStyleKeyForApi,

              minaVisionEnabled,
            },
            settings: {},
            history: { sessionId: sid || sessionId || null, sessionTitle: sessionTitle || null },
            feedback: { comment: tweak, motion_feedback: tweak },
            prompts: {},
          };

          const { generationId } = await mmaCreateAndWait(
            `/mma/video/${encodeURIComponent(parentId)}/tweak`,
            mmaBody,
            onProgress
          );

          const result = await mmaWaitForFinal(generationId);
          if (result?.status === "error") {
            const msg = result?.error?.message || result?.error?.code || "MMA tweak failed.";
            throw new Error(String(msg));
          }

          const rawUrl =
            result?.outputs?.kling_video_url ||
            result?.outputs?.video_url ||
            (result as any)?.videoUrl ||
            (result as any)?.outputUrl ||
            "";

          const url = rawUrl ? await ensureAssetsUrl(rawUrl, "motions") : "";
          if (!url) throw new Error("MMA tweak returned no video URL.");

          applyCreditsFromResponse(result?.credits);

          const item: MotionItem = {
            id: generationId,
            url,
            createdAt: new Date().toISOString(),
            prompt: String(result?.prompt || motionTextTrimmed || motionDescription || brief || ""),
          };

          setMotionItems((prev) => {
            const next = [item, ...prev];
            setMotionIndex(0);
            return next;
          });

          setActiveMediaKind("motion");
        }

        historyDirtyRef.current = true;
        creditsDirtyRef.current = true;
        void fetchCredits();

        setFeedbackText("");
      } catch (err: any) {
        setFeedbackError(err?.message || "Tweak failed.");
      } finally {
        setFeedbackSending(false);
      }
    },
    [
      API_BASE_URL,
      currentPassId,
      activeMediaKind,
      currentMotion?.id,
      currentStill?.id,
      stillBrief,
      brief,
      currentAspect.ratio,
      currentAspect.platformKey,
      stylePresetKeysForApi,
      primaryStyleKeyForApi,
      minaVisionEnabled,
      sessionId,
      sessionTitle,
      ensureSession,
      mmaCreateAndWait,
      mmaFetchResult,
      ensureAssetsUrl,
      fetchCredits,
      uploads.product,
      motionReferenceImageUrl,
      motionTextTrimmed,
      motionDescription,
      animateAspectOption.platformKey,
      animateAspectOption.ratio,
    ]
  );

  // ========================================================================
  // [LIKES] MMA ONLY
  // ========================================================================
  const normalizeLikeUrl = (url: string) => stripSignedQuery(String(url || "").trim());

  const getCurrentMediaKey = () => {
    const motionUrl = currentMotion?.url ? normalizeLikeUrl(currentMotion.url) : "";
    const stillUrl = currentStill?.url ? normalizeLikeUrl(currentStill.url) : "";

    const kind = activeMediaKind === "motion" ? "motion" : "still";
    const url = kind === "motion" ? motionUrl : stillUrl;
    const id = kind === "motion" ? (currentMotion?.id || "") : (currentStill?.id || "");

    if (url) return `${kind}:url:${url}`;
    if (id) return `${kind}:id:${id}`;
    return "";
  };

  const currentMediaKey = getCurrentMediaKey();
  const isCurrentLiked = currentMediaKey ? likedMap[currentMediaKey] : false;

  const handleLikeCurrent = async () => {
    const isMotion = activeMediaKind === "motion" && !!currentMotion?.url;
    const targetMedia = isMotion ? currentMotion : currentStill;

    if (!targetMedia) return;
    if (!currentPassId) return;
    if (!API_BASE_URL) return;

    const resultType = isMotion ? "motion" : "image";
    const likeKey = getCurrentMediaKey();
    const nextLiked = likeKey ? !likedMap[likeKey] : false;

    if (likeKey) setLikedMap((prev) => ({ ...prev, [likeKey]: nextLiked }));

    // Only write to backend when liking (not unliking)
    if (!nextLiked) return;

    try {
      setLikeSubmitting(true);

      await apiFetch("/mma/events", {
        method: "POST",
        body: JSON.stringify({
          passId: currentPassId,
          generation_id: targetMedia.id || null,
          event_type: "like",
          payload: {
            result_type: resultType,
            url: targetMedia.url,
            prompt: isMotion
              ? (currentMotion?.prompt || "")
              : (currentStill?.prompt || lastStillPrompt || stillBrief || brief || ""),
          },
        }),
      });
    } catch {
      // non-blocking
    } finally {
      setLikeSubmitting(false);
    }
  };

   // ========================================================================
  // Download helpers (extracted)
  // ========================================================================
  const handleDownloadCurrent = async () => {
    const target = activeMediaKind === "motion" ? currentMotion?.url : currentStill?.url;
    if (!target) return;

    const kind = activeMediaKind === "motion" ? "motion" : "still";

    const prompt =
      kind === "motion"
        ? (motionFinalPrompt || motionTextTrimmed || motionDescription || brief || "")
        : (lastStillPrompt || stillBrief || brief || "");

    try {
      await downloadMinaAsset({
        url: target,
        kind,
        prompt,
        // If you want the old fixed filename behavior, uncomment:
        // baseNameOverride: "Mina_v3_prompt",
      });
    } catch (err: any) {
      const msg = err?.message || "Download failed.";
      if (activeMediaKind === "motion") setMotionError(msg);
      else setStillError(msg);
    }
  };

  // ========================================================================
  // [PART 12] UI helpers – aspect + uploads + logout + paste/drag
  // ========================================================================
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

      if (!next) {
        setUploads((curr) => ({
          ...curr,
          product: (curr.product || []).slice(0, 1),
        }));
      }

      return next;
    });
  };

  const openPanel = (key: PanelKey) => {
  if (!key) return;

  // ✅ arm UI immediately (so first click doesn’t feel like it only “wakes” the UI)
  if (!hasEverTyped) setHasEverTyped(true);

  setActivePanel(key);

  // ✅ bump to stage 3 so buttons/areas become interactive immediately
  setUiStage((s) => (s < 3 ? 3 : s));
};


  const capForPanel = (panel: UploadPanelKey) => {
    if (panel === "inspiration") return styleMode === "niche" ? 14 : 10;
    if (panel === "product") return animateMode ? 2 : 1;
    return 1;
  };

  const pickTargetPanel = (): UploadPanelKey =>
    activePanel === "logo" ? "logo" : activePanel === "inspiration" ? "inspiration" : "product";

  const addFilesToPanel = (panel: UploadPanelKey, files: FileList) => {
    const max = capForPanel(panel);

    const incoming = Array.from(files || []).filter(
      (f) => f && typeof f.type === "string" && f.type.startsWith("image/")
    );
    if (!incoming.length) return;

    // inspiration append; product in animate also append
    const replace = panel === "inspiration" ? false : !(panel === "product" && animateMode);

    const current = uploadsRef.current?.[panel] || [];
    const existingCount = current.length;

    const remaining = replace ? max : Math.max(0, max - existingCount);
    const slice = incoming.slice(0, remaining);
    if (!slice.length) return;

    const now = Date.now();
    const created = slice.map((file, i) => {
      const id = `${panel}_${now}_${i}_${Math.random().toString(16).slice(2)}`;
      const previewUrl = URL.createObjectURL(file);

      const item: UploadItem = {
        id,
        kind: "file",
        url: previewUrl,
        remoteUrl: undefined,
        file,
        uploading: true,
        error: undefined,
      };

      return { id, file, previewUrl, item };
    });

    setUploads((prev) => {
      if (replace) {
        prev[panel].forEach((it) => {
          if (it.kind === "file" && it.url && it.url.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(it.url);
            } catch {
              // ignore
            }
          }
        });
      }

      const base = replace ? [] : prev[panel];
      const next = [...base, ...created.map((c) => c.item)].slice(0, max);

      const accepted = new Set(next.map((x) => x.id));
      created.forEach((c) => {
        if (!accepted.has(c.id)) {
          try {
            URL.revokeObjectURL(c.previewUrl);
          } catch {
            // ignore
          }
        }
      });

      return { ...prev, [panel]: next };
    });

    created.forEach(({ id, file }) => {
      void startUploadForFileItem(panel, id, file);
    });
  };

  const addUrlToPanel = (panel: UploadPanelKey, url: string) => {
    const max = capForPanel(panel);
    const replace = panel === "inspiration" ? false : !(panel === "product" && animateMode);

    const id = `${panel}_url_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    setUploads((prev) => {
      const base = replace ? [] : prev[panel];

      const next: UploadItem = {
        id,
        kind: "url",
        url,
        remoteUrl: undefined,
        uploading: true,
      };

      return { ...prev, [panel]: [...base, next].slice(0, max) };
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
  // ✅ arm UI immediately, and ensure the right panel is active
  if (!hasEverTyped) setHasEverTyped(true);
  setActivePanel(panel);

  // ✅ make UI interactive right away
  setUiStage((s) => (s < 3 ? 3 : s));

  // ✅ IMPORTANT: keep the input click DIRECT (no timeout), otherwise browsers may block it
  if (panel === "product") productInputRef.current?.click();
  if (panel === "logo") logoInputRef.current?.click();
  if (panel === "inspiration") inspirationInputRef.current?.click();
};


  // Whole-page drag/drop + paste
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
  }, [uiStage, activePanel, animateMode]);

  // Style hover-select + inline rename
  const getStyleLabel = (_key: string, fallback: string) => fallback;

  const beginRenameStyle = (key: string, currentLabel: string) => {
    setEditingStyleKey(key);
    setEditingStyleValue(currentLabel);
  };

  const commitRenameStyle = () => {
    if (!editingStyleKey) return;
    const next = editingStyleValue.trim();
    setStyleLabelOverrides((prev) => ({ ...prev, [editingStyleKey]: next }));
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
    setStylePresetKeys((prev) => prev.filter((k) => k !== key));
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      try {
        window.localStorage.removeItem("minaProfileNumberMap");
      } catch {
        // ignore
      }
      if (typeof window !== "undefined") window.location.reload();
    }
  };

  const handleBriefScroll = () => {
    // fade handled in CSS
  };

  const handleBriefChange = (value: string) => {
    const trimmedToMax = (value || "").slice(0, MAX_BRIEF_CHARS);
    setBrief(trimmedToMax);
    setMotionFinalPrompt("");
    if (animateMode) setMotionDescription(trimmedToMax);
    else setStillBrief(trimmedToMax);

    if (describeMoreTimeoutRef.current !== null) {
      window.clearTimeout(describeMoreTimeoutRef.current);
      describeMoreTimeoutRef.current = null;
    }

    if (typingCalmTimeoutRef.current !== null) window.clearTimeout(typingCalmTimeoutRef.current);

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

    const trimmedLength = trimmedToMax.trim().length;
    // ✅ once user typed at least 1 char, never go back to stage 0 again
    if (!hasEverTyped && trimmedLength > 0) {
      setHasEverTyped(true);
    }

    if (trimmedLength > 0 && trimmedLength < 20) {
      describeMoreTimeoutRef.current = window.setTimeout(() => setShowDescribeMore(true), 1200);
    }
  };

  // Recreate draft hydrator (single source of truth)
  const applyRecreateDraft = useCallback((draft: any) => {
    if (!draft || typeof draft !== "object") return;

    const mode = String(draft.mode || "").toLowerCase();
    const briefText = String(draft.brief || "").trim();
    if (!briefText) return;

    const ratioRaw =
      String(draft?.settings?.aspect_ratio || draft?.settings?.aspectRatio || draft?.aspect_ratio || "").trim() || "";
    const ratioNormalized = ratioRaw.includes("/") ? ratioRaw.replace("/", ":") : ratioRaw;
    const idx = ASPECT_OPTIONS.findIndex((o) => o.ratio === ratioNormalized);
    if (idx >= 0) setAspectIndex(idx);

    const nextStyleKeys = (draft?.settings?.stylePresetKeys || draft?.inputs?.stylePresetKeys || []) as any;
    if (Array.isArray(nextStyleKeys) && nextStyleKeys.length) {
      setStylePresetKeys(nextStyleKeys.map(String));
    }

    const vision = draft?.settings?.minaVisionEnabled ?? draft?.inputs?.minaVisionEnabled;
    if (typeof vision === "boolean") setMinaVisionEnabled(vision);

    const smRaw = String(draft?.settings?.styleMode || draft?.styleMode || "").toLowerCase();
    const sm = smRaw === "niche" ? ("niche" as StyleMode) : smRaw === "main" ? ("main" as StyleMode) : null;
    if (sm) setStyleMode(sm);

    const recreateCap = (sm || styleMode) === "niche" ? 14 : 10;

    const assets = (draft.assets || {}) as any;
    const pickStr = (...keys: string[]) => {
      for (const k of keys) {
        const v = assets?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      return "";
    };
    const pickArr = (...keys: string[]) => {
      for (const k of keys) {
        const v = assets?.[k];
        if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.startsWith("http"));
      }
      return [];
    };

    const productUrl = pickStr("productImageUrl", "product_image_url");
    const logoUrl = pickStr("logoImageUrl", "logo_image_url");
    const inspUrls = pickArr("styleImageUrls", "style_image_urls", "inspiration_image_urls");

    const startUrl = pickStr("kling_start_image_url", "start_image_url", "startImageUrl");
    const endUrl = pickStr("kling_end_image_url", "end_image_url", "endImageUrl");

    const mkUrlItem = (panel: UploadPanelKey, url: string) => ({
      id: `${panel}_recreate_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      kind: "url" as const,
      url,
      remoteUrl: url,
      uploading: false,
    });

    applyingRecreateDraftRef.current = true;

    const wantMotion = mode === "motion" || mode === "video";
    setAnimateMode(wantMotion);

    if (wantMotion) setMotionDescription(briefText);
    else setStillBrief(briefText);
    setBrief(briefText);

    setUploads((prev) => ({
      ...prev,
      product: wantMotion
        ? [startUrl || productUrl]
            .filter(Boolean)
            .slice(0, 1)
            .map((u) => mkUrlItem("product", u))
            .concat(endUrl ? [mkUrlItem("product", endUrl)] : [])
        : (productUrl ? [mkUrlItem("product", productUrl)] : []),
      logo: logoUrl ? [mkUrlItem("logo", logoUrl)] : [],
      inspiration: inspUrls.slice(0, recreateCap).map((u) => mkUrlItem("inspiration", u)),
    }));

    setActivePanel("product");
    setUiStage((s) => (s < 3 ? 3 : s));

    window.setTimeout(() => {
      applyingRecreateDraftRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    if (activeTab !== "studio") return;

    try {
      const raw = window.localStorage.getItem(RECREATE_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      window.localStorage.removeItem(RECREATE_DRAFT_KEY);
      applyRecreateDraft(draft);
    } catch {
      // ignore
    }
  }, [activeTab, applyRecreateDraft]);

  // ========================================================================
  // [PART 13] Custom styles modal
  // ========================================================================
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

    if (!API_BASE_URL) throw new Error("Missing API base URL.");
    if (!currentPassId) throw new Error("Missing Pass ID.");

    // 1) pick hero + two others (from the 10 uploads)
    const hero = customStyleImages.find((x) => x.id === customStyleHeroId);
    if (!hero?.file) throw new Error("Pick a hero image.");

    const others = customStyleImages
      .filter((x) => x.id !== customStyleHeroId)
      .slice(0, 2);

    const trio = [hero, ...others];

    // 2) upload ALL selected images to R2 (optional, but matches “upload 10 photos”)
    //    Then store Hero+2 as heroUrls (like a real preset hero table)
    const allFiles = customStyleImages.map((x) => x.file).filter(Boolean).slice(0, 10);

    // ✅ Use the same proven uploader (it already returns stable https public URL)
    // We upload as "inspiration" kind just to reuse the existing signed route safely.
    const uploadedAll = await Promise.all(
      allFiles.map(async (file) => {
        const url = await uploadFileToR2("inspiration", file);
        if (!isHttpUrl(url)) throw new Error("Style upload returned invalid URL.");
        return url;
      })
    );

    // upload hero+2 in order (to guarantee we can pick exact 3)
    // (We re-upload these 3 only if they weren’t in uploadedAll order; simplest is upload again)
    const uploadedTrio = await Promise.all(
      trio.map(async (x) => {
        const url = await uploadFileToR2("inspiration", x.file);
        if (!isHttpUrl(url)) throw new Error("Style upload returned invalid URL.");
        return url;
      })
    );

    const heroUrls = uploadedTrio.slice(0, 3);

    const newKey = `custom-${Date.now()}`;
    const newStyle: CustomStyle = {
      id: newKey,
      key: newKey,
      label: `Style ${customStyles.length + 1}`,
      thumbUrl: heroUrls[0], // hero
      heroUrls,              // hero + 2
      allUrls: uploadedAll,  // optional
      createdAt: new Date().toISOString(),
    };

    // 3) save + auto-select it
    setCustomStyles((prev) => [newStyle, ...prev]);
    setStylePresetKeys([newKey]); // ✅ with Patch 1, it’s single-select anyway

    // 4) clean up local blob previews to avoid memory leaks
    try {
      customStyleImages.forEach((x) => {
        if (x?.url && x.url.startsWith("blob:")) URL.revokeObjectURL(x.url);
      });
    } catch {
      // ignore
    }

    setCustomStyleImages([]);
    setCustomStyleHeroId(null);
    setCustomStyleHeroThumb((prevThumb) => {
      try {
        if (prevThumb && prevThumb.startsWith("blob:")) URL.revokeObjectURL(prevThumb);
      } catch {}
      return null;
    });

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
  // Render helpers
  // ========================================================================
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
        tweakText={feedbackText}
        setTweakText={setFeedbackText}
        onSendTweak={(text) => void onTweak(text)}
        sending={feedbackSending}
        error={feedbackError}
        tweakCreditsOk={tweakCreditsOk}
        tweakBlockReason={tweakBlockReason}
      />
    );
  };

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
              id="mina_custom_style_upload"
              name="mina_custom_style_upload"
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
  // FINAL LAYOUT
  // ========================================================================
  const topBarActive =
  pendingRequests > 0 ||
  uploadsPending ||
  stillGenerating ||
  motionGenerating ||
  customStyleTraining ||
  feedbackSending;

  // --------------------------------------------------------------------------
  // Header CTA contrast (Animate / Love it / Download)
  // - Makes text dark on light images, light on dark images
  // - No backgrounds (text-only)
  // - Avoid CORS spam: only sample pixel data for allowlisted hosts
  // --------------------------------------------------------------------------
  const [headerIsDark, setHeaderIsDark] = useState<boolean | null>(null);

  // sample the area behind the header buttons (top-right of the current media)
  const headerSampleUrl =
    (mediaKindForDisplay === "motion" ? motionReferenceImageUrl : displayedStill?.url) || "";

  // ---- Madani: CORS-safe allowlist for canvas sampling ----
  const headerCorsHosts = useMemo(() => {
    const raw = String(import.meta.env.VITE_CORS_IMAGE_HOSTS || "");
    const hosts = raw
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    return new Set(hosts);
  }, []);

  const canSampleHeaderPixels = useCallback(
    (url: string) => {
      try {
        const u = new URL(url, window.location.href);

        // same origin always ok
        if (u.origin === window.location.origin) return true;

        // cross-origin: only if host is explicitly allowlisted
        return headerCorsHosts.has(u.hostname.toLowerCase());
      } catch {
        return false;
      }
    },
    [headerCorsHosts]
  );

  // tiny luminance sampler (safe + fast)
  const computeHeaderLuma = useCallback(
    async (url: string): Promise<number | null> => {
      try {
        if (!url || !isHttpUrl(url)) return null;
        if (!canSampleHeaderPixels(url)) return null;

        return await new Promise((resolve) => {
          const img = new Image();

          // ✅ IMPORTANT: keep crossOrigin for allowed cross-origin hosts
          try {
            const u = new URL(url, window.location.href);
            if (u.origin !== window.location.origin) {
              img.crossOrigin = "anonymous";
            }
          } catch {}

          (img as any).decoding = "async";

          img.onload = () => {
            try {
              const W = 64;
              const H = 64;

              const canvas = document.createElement("canvas");
              canvas.width = W;
              canvas.height = H;

              const ctx = canvas.getContext("2d", { willReadFrequently: true } as any);
              if (!ctx) return resolve(null);

              ctx.drawImage(img, 0, 0, W, H);

              let data: Uint8ClampedArray;
              try {
                // ✅ If canvas is tainted, this throws — we just bail silently
                data = ctx.getImageData(0, 0, W, H).data;
              } catch {
                resolve(null);
                return;
              }

              // sample top-right region (where the buttons sit)
              const x0 = Math.floor(W * 0.55);
              const y0 = 0;
              const x1 = W;
              const y1 = Math.floor(H * 0.35);

              let sum = 0;
              let count = 0;

              for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                  const i = (y * W + x) * 4;
                  const r = data[i];
                  const g = data[i + 1];
                  const b = data[i + 2];
                  sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
                  count++;
                }
              }

              resolve(count ? sum / count : null);
            } catch {
              resolve(null);
            }
          };

          img.onerror = () => resolve(null);

          // crossOrigin must be set BEFORE src
          img.src = url;
        });
      } catch {
        return null;
      }
    },
    [canSampleHeaderPixels]
  );

useEffect(() => {
  let cancelled = false;

  const run = async () => {
    const luma = await computeHeaderLuma(headerSampleUrl);
    if (cancelled) return;

    // if we can't sample (CORS), fallback to "light background" (dark text)
    if (typeof luma !== "number") {
      setHeaderIsDark(false);
      return;
    }

    // threshold tweak: lower = more often "dark"
    setHeaderIsDark(luma < 145);
  };

  void run();
  return () => {
    cancelled = true;
  };
}, [headerSampleUrl, computeHeaderLuma]);

const headerOverlayClass =
  headerIsDark === true ? "header-on-dark" : "header-on-light";

  const appUi = (
    <div className="mina-studio-root">
      <div className={classNames("mina-drag-overlay", globalDragging && "show")} />
      <div className="studio-frame">
        <div className={classNames("studio-header-overlay", headerOverlayClass)}>
          <div className="studio-header-left">
            <a
              href="#studio"
              className="studio-logo-link"
              onClick={(event) => {
                event.preventDefault();
                // ✅ If we're on profile, keep history so back-swipe returns to profile.
                goTab("studio", activeTab === "profile" ? "push" : "replace");
              }}
            >

              <img
                src="https://assets.faltastudio.com/Website%20Assets/Black_Logo_mina.svg"
                alt="Mina logo"
                className="studio-logo"
              />
            </a>
          </div>

          <div className="studio-header-right">
            {activeTab === "studio" && (
              <>
                {/* lock everything while creating/animating/tweaking */}
                {/*
                  stillGenerating = creating image
                  motionGenerating = generating video
                  feedbackSending = tweaking
                */}
                <button
                  type="button"
                  className="studio-header-cta"
                   
                  onClick={handleToggleAnimateMode}
                  disabled={stillGenerating || motionGenerating || feedbackSending}
                >
                  {feedbackSending
                    ? "Tweaking…"
                    : stillGenerating
                      ? "Creating…"
                      : motionGenerating
                        ? "Animating…"
                        : animateMode
                          ? "Create"
                          : "Animate"}
                </button>
          
                <button
                  type="button"
                  className="studio-header-cta"
                   
                  onClick={handleLikeCurrent}
                  disabled={
                    (!currentStill && !currentMotion) ||
                    likeSubmitting ||
                    feedbackSending ||
                    stillGenerating ||
                    motionGenerating
                  }
                >
                  {isCurrentLiked ? "Thanks" : "Love it"}
                </button>
          
                <button
                  type="button"
                  className="studio-header-cta"
                   
                  onClick={handleDownloadCurrent}
                  disabled={
                    (!currentStill && !currentMotion) ||
                    feedbackSending ||
                    stillGenerating ||
                    motionGenerating
                  }
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
              styleMode={styleMode}
              setStyleMode={setStyleMode}
              stylePresets={computedStylePresets}
              customStyles={customStyles}
              getStyleLabel={getStyleLabel}
              
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
              motionSuggesting={motionSuggesting}
              canCreateMotion={canCreateMotion}
              motionHasImage={(uploads.product?.length ?? 0) > 0}
              motionCreditsOk={motionCreditsOk}
              motionBlockReason={motionBlockReason}
              motionGenerating={motionGenerating}
              motionError={motionError}
              onCreateMotion={handleGenerateMotion}
              onTypeForMe={onTypeForMe}
              imageCreditsOk={imageCreditsOk}
              matchaUrl={MATCHA_URL}
              minaMessage={minaMessage}
              minaTalking={minaTalking}
              onGoProfile={() => goTab("profile")}
            />
            {renderStudioRight()}

            <div className="studio-mobile-footer">
              <button type="button" className="studio-footer-link" onClick={() => goTab("profile")}>
                Profile
              </button>
              <a className="studio-footer-link" href="https://wa.me/971522177594" target="_blank" rel="noreferrer">
                Need help?
              </a>
              <span className="studio-footer-link studio-footer-link--disabled">Tutorial</span>
            </div>
          </div>
        ) : (
          <Profile
            email={currentUserEmail || ""}
            credits={credits?.balance ?? null}
            expiresAt={credits?.meta?.expiresAt ?? null}
            generations={historyGenerations as any}
            feedbacks={historyFeedbacks as any}
            matchaUrl={MATCHA_URL}
            loading={historyLoading || creditsLoading}
            error={historyError}
            onRefresh={() => {
              historyDirtyRef.current = true;
              creditsDirtyRef.current = true;
              void fetchCredits();
              void fetchHistory();
            }}
            onDelete={async (id) => {
              const res = await apiFetch(`/history/${encodeURIComponent(id)}`, { method: "DELETE" });
              if (!res.ok) {
                const txt = await res.text().catch(() => "");
                throw new Error(`Delete failed (${res.status})${txt ? `: ${txt.slice(0, 180)}` : ""}`);
              }

              setHistoryGenerations((prev) => prev.filter((g) => g.id !== id));
              setHistoryFeedbacks((prev) => prev.filter((f) => f.id !== id));

              if (currentPassId && historyCacheRef.current[currentPassId]) {
                historyCacheRef.current[currentPassId] = {
                  generations: historyCacheRef.current[currentPassId].generations.filter((g) => g.id !== id),
                  feedbacks: historyCacheRef.current[currentPassId].feedbacks.filter((f) => f.id !== id),
                };
              }
            }}
            onRecreate={(draft) => {
              try {
                window.localStorage.setItem(RECREATE_DRAFT_KEY, JSON.stringify(draft));
              } catch {
                // ignore
              }
              goTab("studio");
            }}
            onBackToStudio={() => goTab("studio")}
            onLogout={handleSignOut}
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
};

export default MinaApp;

// ============================================================================
// [PART 4 END] Component
// ============================================================================

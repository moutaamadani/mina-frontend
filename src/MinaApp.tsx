// src/MinaApp.tsx
// ============================================================================
// [PART 1 START] Imports & environment
// ============================================================================
import React, { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "./lib/supabaseClient";
import StudioLeft from "./StudioLeft";
import { loadAdminConfig } from "./lib/adminConfig";
import AdminLink from "./components/AdminLink"; 


const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

const TOPUP_URL =
  import.meta.env.VITE_MINA_TOPUP_URL ||
  "https://www.faltastudio.com/checkouts/cn/hWN6EhbqQW5KrdIuBO3j5HKV/en-ae?_r=AQAB9NY_ccOV_da3y7VmTxJU-dDoLEOCdhP9sg2YlvDwLQQ";

const LIKE_STORAGE_KEY = "minaLikedMap";
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
};

type CreditsState = {
  balance: number;
  meta?: CreditsMeta;
};

type EditorialResponse = {
  ok: boolean;
  prompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  generationId?: string;
  sessionId?: string;
  credits?: {
    balance: number;
    cost?: number;
  };
};

type MotionSuggestResponse = {
  ok: boolean;
  suggestion?: string;
};

type MotionResponse = {
  ok: boolean;
  prompt?: string;
  videoUrl?: string;
  generationId?: string;
  sessionId?: string;
  credits?: {
    balance: number;
    cost?: number;
  };
};

type GenerationRecord = {
  id: string;
  type: string;
  sessionId: string;
  customerId: string;
  platform: string;
  prompt: string;
  outputUrl: string;
  createdAt: string;
  meta?: {
    tone?: string;
    platform?: string;
    minaVisionEnabled?: boolean;
    stylePresetKey?: string;
    productImageUrl?: string;
    styleImageUrls?: string[];
    aspectRatio?: string;
    [key: string]: unknown;
  } | null;
};

type FeedbackRecord = {
  id: string;
  customerId: string;
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
  customerId: string;
  credits: {
    balance: number;
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

type MinaAppProps = {
  initialCustomerId?: string;
};
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

// Map our UI ratios to Replicate-safe values
const REPLICATE_ASPECT_RATIO_MAP: Record<string, string> = {
  "9:16": "9:16",
  "3:4": "3:4",
  "2:3": "2:3",
  "1:1": "1:1",
};

const MINA_THINKING_DEFAULT = [
  "Sketching ideas…",
  "Let me weave a scene…",
  "Curating tiny details…",
  "Whispering to the lens…",
  "Layering mood + motion…",
  "Painting with light…",
  "Mixing silk, glass, shine…",
  "Checking the perfect drip…",
  "Setting the camera drift…",
  "Dreaming in slow loops…",
];

const MINA_FILLER_DEFAULT = ["typing…", "breathing…", "thinking aloud…", "refining…"];

const ADMIN_ALLOWLIST_TABLE = "admin_allowlist";

const STYLE_PRESETS = [
  {
    key: "vintage",
    label: "Vintage",
    thumb: "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Vintage_1.png?v=1765457775",
  },
  {
    key: "gradient",
    label: "Gradient",
    thumb: "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Gradient.png?v=1765457775",
  },
  {
    key: "back-light",
    label: "Back light",
    thumb: "https://cdn.shopify.com/s/files/1/0678/9254/3571/files/Backlight.png?v=1765457775",
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

function getInitialCustomerId(initialCustomerId?: string): string {
  try {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("customerId");
      if (fromUrl && fromUrl.trim().length > 0) return fromUrl.trim();

      const stored = window.localStorage.getItem("minaCustomerId");
      if (stored && stored.trim().length > 0) return stored.trim();
    }
  } catch {
    // ignore
  }
  if (initialCustomerId && initialCustomerId.trim().length > 0) return initialCustomerId.trim();
  return "anonymous";
}

function persistCustomerId(id: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem("minaCustomerId", id);
  } catch {
    // ignore
  }
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

function toPreviewUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("w")) parsed.searchParams.set("w", "900");
    if (!parsed.searchParams.has("auto")) parsed.searchParams.set("auto", "format");
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
const MinaApp: React.FC<MinaAppProps> = ({ initialCustomerId }) => {
  // -------------------------
  // 4.1 Global tab + customer
  // -------------------------
  const [activeTab, setActiveTab] = useState<"studio" | "profile">("studio");
  const [customerId, setCustomerId] = useState<string>(() => getInitialCustomerId(initialCustomerId));
  const [customerIdInput, setCustomerIdInput] = useState<string>(customerId);
  const [isAdmin, setIsAdmin] = useState(false);
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
  // 4.3 Studio – brief + steps
  // -------------------------
  const [brief, setBrief] = useState("");
  const [stillBrief, setStillBrief] = useState("");
  const [tone] = useState("Poetic");
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

  // Style selection (hover selects too)
  const [stylePresetKey, setStylePresetKey] = useState<string>("vintage");
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
    const allowedMotionKeys: MotionStyleKey[] = ["melt", "drop", "expand", "satisfying", "slow_motion", "fix_camera"];
    const fromConfig = adminConfig.styles?.movementKeywords || [];
    const filtered = fromConfig.filter((k): k is MotionStyleKey => allowedMotionKeys.includes(k as MotionStyleKey));
    if (filtered.length) setMotionStyleKeys(filtered);

    const publishedPresets = (adminConfig.styles?.presets || [])
      .filter((p) => p.status === "published")
      .map((p) => ({ key: p.id, label: p.name, thumb: p.heroImage || p.images[0] || "" }));
    setComputedStylePresets([...STYLE_PRESETS, ...publishedPresets]);
  }, [adminConfig]);

  // -------------------------
  // 4.4 History (profile)
  // -------------------------
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyGenerations, setHistoryGenerations] = useState<GenerationRecord[]>([]);
  const [historyFeedbacks, setHistoryFeedbacks] = useState<FeedbackRecord[]>([]);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(20);
  const [numberMap, setNumberMap] = useState<Record<string, string>>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("minaProfileNumberMap") : null;
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [editingNumberId, setEditingNumberId] = useState<string | null>(null);
  const [editingNumberValue, setEditingNumberValue] = useState("");
  const [brandingLeft, setBrandingLeft] = useState({
    title: "MINA AI",
    accent: "Taste",
    handle: "@mina.editorial.ai",
  });
  const [brandingRight, setBrandingRight] = useState({
    handle: "@madani_branding",
    note: "Trained by Madani",
  });
  const [brandingEditing, setBrandingEditing] = useState<"left" | "right" | null>(null);

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
    if (animateMode) {
      const currentBrief = brief;
      setStillBrief(currentBrief);
      setBrief(motionDescription || currentBrief);
    } else {
      const currentBrief = brief;
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
  const briefLength = brief.trim().length;
  const stillBriefLength = stillBrief.trim().length;
  const uploadsPending = Object.values(uploads).some((arr) => arr.some((it) => it.uploading));
  const historyIndexMap = useMemo(
    () =>
      historyGenerations.reduce<Record<string, number>>((acc, item, idx) => {
        acc[item.id] = idx;
        return acc;
      }, {}),
    [historyGenerations]
  );
  const visibleHistory = useMemo(
    () => historyGenerations.slice(0, Math.min(visibleHistoryCount, historyGenerations.length)),
    [historyGenerations, visibleHistoryCount]
  );

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

  const briefHintVisible = showDescribeMore;

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

  // Style key for API (avoid unknown custom keys)
  const stylePresetKeyForApi = stylePresetKey.startsWith("custom-") ? "custom-style" : stylePresetKey;

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
  useEffect(() => {
    // Persist style storage
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

  useEffect(() => {
    if (!minaBusy) {
      setMinaTalking(false);
      setMinaMessage("");
      return undefined;
    }

    setMinaTalking(true);
    const phrases = [...personalityThinking, ...personalityFiller];
    let phraseIndex = 0;
    let charIndex = 0;
    let raf: number;

    const typeTick = () => {
      const phrase = phrases[phraseIndex % phrases.length] || "";
      const nextChar = charIndex + 1;
      const nextSlice = phrase.slice(0, Math.min(nextChar, phrase.length));

      setMinaMessage(nextSlice || personalityFiller[0] || "typing…");

      const reachedEnd = nextChar > phrase.length;
      charIndex = reachedEnd ? 0 : nextChar;
      if (reachedEnd) {
        phraseIndex += 1;
      }

      const pause = reachedEnd ? 360 : 140;
      raf = window.setTimeout(typeTick, pause);
    };

    raf = window.setTimeout(typeTick, 140);

    return () => {
      window.clearTimeout(raf);
    };
  }, [minaBusy, personalityThinking, personalityFiller]);

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
  // [PART 6 START] Effects – persist customer + bootstrap
  // ========================================================================
  useEffect(() => {
    setCustomerIdInput(customerId);
    persistCustomerId(customerId);
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;

    const hydrateUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const email = (data.user?.email || customerId || "").toLowerCase();
        setCurrentUserEmail(email || null);
        setIsAdmin(email ? ADMIN_EMAILS.includes(email) : false);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    };

    void hydrateUser();

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  useEffect(() => {
    if (!API_BASE_URL || !customerId) return;

    const bootstrap = async () => {
      await handleCheckHealth();
      await fetchCredits();
      await ensureSession();
      await fetchHistory();
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // clear "describe more" timer on unmount
  useEffect(() => {
    return () => {
      if (describeMoreTimeoutRef.current !== null) {
        window.clearTimeout(describeMoreTimeoutRef.current);
      }
    };
  }, []);

  // revoke blob urls on unmount
  useEffect(() => {
    return () => {
      const revokeIfBlob = (u?: string) => {
        if (u && u.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(u);
          } catch {
            // ignore
          }
        }
      };

      // Use refs so we always cleanup the latest state on unmount
      const snap = uploadsRef.current;
      snap.product.forEach((x) => revokeIfBlob(x.url));
      snap.logo.forEach((x) => revokeIfBlob(x.url));
      snap.inspiration.forEach((x) => revokeIfBlob(x.url));

      revokeIfBlob(customStyleHeroThumbRef.current || undefined);

      customStyleImagesRef.current.forEach((img) => {
        revokeIfBlob(img.url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========================================================================
  // [PART 6 END]
  // ========================================================================

  // ========================================================================
  // [PART 7 START] API helpers
  // ========================================================================
  const handleCheckHealth = async () => {
    if (!API_BASE_URL) return;
    try {
      setCheckingHealth(true);
      const res = await fetch(`${API_BASE_URL}/health`);
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      setHealth({ ok: json.ok ?? false, message: json.message ?? "" });
    } catch (err: any) {
      setHealth({ ok: false, message: err?.message || "Unable to reach Mina." });
    } finally {
      setCheckingHealth(false);
    }
  };

  const fetchCredits = async () => {
    if (!API_BASE_URL || !customerId) return;
    try {
      setCreditsLoading(true);
      const params = new URLSearchParams({ customerId });
      const res = await fetch(`${API_BASE_URL}/credits/balance?${params}`);
      if (!res.ok) return;
      const json = (await res.json()) as { balance: number; meta?: { imageCost: number; motionCost: number } };
      setCredits({ balance: json.balance, meta: json.meta });
    } catch {
      // silent
    } finally {
      setCreditsLoading(false);
    }
  };

  const ensureSession = async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    if (!API_BASE_URL || !customerId) return null;

    try {
      const res = await fetch(`${API_BASE_URL}/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
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

  const fetchHistory = async () => {
    if (!API_BASE_URL || !customerId) return;
    try {
      setHistoryLoading(true);
      const res = await fetch(`${API_BASE_URL}/history/customer/${encodeURIComponent(customerId)}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = (await res.json()) as HistoryResponse;
      if (!json.ok) throw new Error("History error");

      setCredits((prev) => ({ balance: json.credits.balance, meta: prev?.meta }));
      setHistoryGenerations(json.generations || []);
      setHistoryFeedbacks(json.feedbacks || []);
    } catch (err: any) {
      setHistoryError(err?.message || "Unable to load history.");
    } finally {
      setHistoryLoading(false);
    }
  };
  
  const getEditorialNumber = (id: string, index: number) => {
    const fallback = padEditorialNumber(index + 1);
    const custom = numberMap[id];
    return custom ? custom : fallback;
  };

  const handleBeginEditNumber = (id: string, index: number) => {
    if (!isAdmin) return;
    setEditingNumberId(id);
    setEditingNumberValue(getEditorialNumber(id, index));
  };

  const handleCommitNumber = () => {
    if (!editingNumberId) return;
    const cleaned = editingNumberValue.trim();
    setNumberMap((prev) => ({ ...prev, [editingNumberId]: cleaned || padEditorialNumber(cleaned) }));
    setEditingNumberId(null);
    setEditingNumberValue("");
  };

  const handleCancelNumberEdit = () => {
    setEditingNumberId(null);
    setEditingNumberValue("");
  };

  const handleDownloadGeneration = (item: GenerationRecord, label: string) => {
    const link = document.createElement("a");
    link.href = item.outputUrl;
    link.download = `mina-v3-prompt-${label || item.id}`;
    link.target = "_blank";
    link.rel = "noreferrer";
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
  function pickUrlFromR2Response(json: any): string | null {
    if (!json) return null;
    if (typeof json.url === "string" && json.url.startsWith("http")) return json.url;
    if (typeof json.signedUrl === "string" && json.signedUrl.startsWith("http")) return json.signedUrl;
    if (typeof json.publicUrl === "string" && json.publicUrl.startsWith("http")) return json.publicUrl;
    if (json.result && typeof json.result.url === "string" && json.result.url.startsWith("http")) return json.result.url;
    if (json.data && typeof json.data.url === "string" && json.data.url.startsWith("http")) return json.data.url;
    return null;
  }

  async function uploadFileToR2(panel: UploadPanelKey, file: File): Promise<string> {
    if (!API_BASE_URL) throw new Error("Missing API base URL");
    const dataUrl = await fileToDataUrl(file);

    const res = await fetch(`${API_BASE_URL}/api/r2/upload-signed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        kind: panel, // "product" | "logo" | "inspiration"
        customerId, // so you can track who uploaded
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.message || json?.error || `Upload failed (${res.status})`);
    }

    const url = pickUrlFromR2Response(json);
    if (!url) throw new Error("Upload succeeded but no URL returned");
    return url;
  }

  async function storeRemoteToR2(url: string, kind: string): Promise<string> {
    if (!API_BASE_URL) throw new Error("Missing API base URL");

    const res = await fetch(`${API_BASE_URL}/api/r2/store-remote-signed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        kind, // "generations" | "motions" | etc.
        customerId,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      // if storing fails, just return original url (non-blocking)
      return url;
    }

    return pickUrlFromR2Response(json) || url;
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
  const handleGenerateStill = async () => {
    const trimmed = stillBrief.trim();
    if (trimmed.length < 40) return;

    if (!API_BASE_URL) {
      setStillError("Missing API base URL (VITE_MINA_API_BASE_URL).");
      return;
    }

    const sid = await ensureSession();
    if (!sid) {
      setStillError("Could not start Mina session.");
      return;
    }

    try {
      setStillGenerating(true);
      setStillError(null);

      const safeAspectRatio = REPLICATE_ASPECT_RATIO_MAP[currentAspect.ratio] || "2:3";

      const payload: {
        customerId: string;
        sessionId: string;
        brief: string;
        tone: string;
        platform: string;
        minaVisionEnabled: boolean;
        stylePresetKey: string;
        aspectRatio: string;
        productImageUrl?: string;
        styleImageUrls?: string[];
      } = {
        customerId,
        sessionId: sid,
        brief: trimmed,
        tone,
        platform: currentAspect.platformKey,
        minaVisionEnabled,
        stylePresetKey: stylePresetKeyForApi,
        aspectRatio: safeAspectRatio,
      };

      // Forward product (R2 first, then http only)
      const productItem = uploads.product[0];
      const productUrl = productItem?.remoteUrl || productItem?.url;
      if (productUrl && isHttpUrl(productUrl)) {
        payload.productImageUrl = productUrl;
      }

      // Forward inspiration up to 4 (R2 first, then http only)
      const inspirationUrls = uploads.inspiration
        .map((u) => u.remoteUrl || u.url)
        .filter((u) => isHttpUrl(u))
        .slice(0, 4);

      if (inspirationUrls.length) {
        payload.styleImageUrls = inspirationUrls;
      }

      const res = await fetch(`${API_BASE_URL}/editorial/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      const storedUrl = await storeRemoteToR2(url, "generations");

      const item: StillItem = {
        id: data.generationId || `still_${Date.now()}`,
        url: storedUrl,
        createdAt: new Date().toISOString(),
        prompt: data.prompt || trimmed,
        aspectRatio: currentAspect.ratio,
      };

      setStillItems((prev) => {
        const next = [item, ...prev]; // ✅ newest first
        setStillIndex(0); // ✅ always show the newest immediately
        return next;
      });

      setLastStillPrompt(item.prompt);

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
  const applyMotionSuggestionText = async (text: string) => {
    if (!text) return;
    if (describeMoreTimeoutRef.current !== null) {
      window.clearTimeout(describeMoreTimeoutRef.current);
      describeMoreTimeoutRef.current = null;
    }
    setShowDescribeMore(false);
    setMotionSuggestTyping(true);

    for (let i = 0; i < text.length; i++) {
      const next = text.slice(0, i + 1);
      setMotionDescription(next);
      setBrief(next);
      // small delay for typewriter feel
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 12));
    }

    setMotionSuggestTyping(false);
  };

  const handleSuggestMotion = async () => {
    if (!API_BASE_URL || !motionReferenceImageUrl || motionSuggestLoading || motionSuggestTyping) return;

    setAnimateMode(true);

    try {
      setMotionSuggestLoading(true);
      setMotionSuggestError(null);
      const res = await fetch(`${API_BASE_URL}/motion/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          referenceImageUrl: motionReferenceImageUrl,
          tone,
          platform: animateAspectOption.platformKey,
          minaVisionEnabled,
          stylePresetKey: stylePresetKeyForApi,
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

    const sid = await ensureSession();
    if (!sid) {
      setMotionError("Could not start Mina session.");
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
          sessionId: sid,
          lastImageUrl: motionReferenceImageUrl,
          motionDescription: motionTextTrimmed,
          tone,
          platform: animateAspectOption.platformKey,
          minaVisionEnabled,
          stylePresetKey: stylePresetKeyForApi,
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

      const storedUrl = await storeRemoteToR2(url, "motions");

      const item: MotionItem = {
        id: data.generationId || `motion_${Date.now()}`,
        url: storedUrl,
        createdAt: new Date().toISOString(),
        prompt: data.prompt || motionTextTrimmed,
      };

      setMotionItems((prev) => {
        const next = [...prev, item];
        setMotionIndex(next.length - 1); // always select newest
        return next;
      });

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
  const getCurrentMediaKey = () => {
    const mediaType = currentMotion ? "motion" : currentStill ? "still" : null;
    if (!mediaType) return null;

    const rawKey = currentMotion?.id || currentStill?.id || currentMotion?.url || currentStill?.url;
    return rawKey ? `${mediaType}:${rawKey}` : null;
  };

  const handleLikeCurrentStill = async () => {
    const targetMedia = currentMotion || currentStill;
    if (!targetMedia) return;

    const resultType = currentMotion ? "motion" : "image";
    const likeKey = getCurrentMediaKey();
    const nextLiked = likeKey ? !likedMap[likeKey] : false;

    if (likeKey) {
      setLikedMap((prev) => ({ ...prev, [likeKey]: nextLiked }));
    }

    if (!API_BASE_URL || !nextLiked) return;

    try {
      setLikeSubmitting(true);
      await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
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
    if (!API_BASE_URL || !feedbackText.trim()) return;
    const comment = feedbackText.trim();

    const targetVideo = currentMotion?.url || "";
    const targetImage = currentStill?.url || "";

    try {
      setFeedbackSending(true);
      setFeedbackError(null);

      await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
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

  const handleDownloadCurrentStill = () => {
    const target = currentMotion?.url || currentStill?.url;
    if (!target) return;

    let filename = "";
    try {
      const parsed = new URL(target);
      const last = parsed.pathname.split("/").filter(Boolean).pop();
      if (last && last.includes(".")) filename = last;
    } catch {
      // fallback below
    }

    if (!filename) {
      const safePrompt =
        (lastStillPrompt || brief || "Mina-image")
          .replace(/[^a-z0-9]+/gi, "-")
          .toLowerCase()
          .slice(0, 80) || "mina-image";
      filename = currentMotion ? `mina-motion-${safePrompt}.mp4` : `mina-image-${safePrompt}.png`;
    }

    const a = document.createElement("a");
    a.href = target;
    const safePrompt =
      (lastStillPrompt || stillBrief || brief || "Mina-image")
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()
        .slice(0, 80) || "mina-image";
    a.download = `Mina-v3-${safePrompt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const currentMediaKey = getCurrentMediaKey();
  const isCurrentLiked = currentMediaKey ? likedMap[currentMediaKey] : false;
  // ========================================================================
  // [PART 11 END]
  // ========================================================================

  // ==============================================
  // 12. UI helpers – aspect + uploads + logout
  // ==============================================
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
      if (!prev && !uploads.product.length && latestStill?.url) {
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
    // if deleting selected, fall back to vintage
    if (stylePresetKey === key) setStylePresetKey("vintage");
  };

  const handleChangeCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customerIdInput.trim();
    if (!trimmed) return;
    setCustomerId(trimmed);
    setSessionId(null);
    setStillItems([]);
    setMotionItems([]);
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
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
      setStylePresetKey(newKey);

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

    if (stylePresetKey === key) {
      setStylePresetKey("vintage");
    }
  };
  // ========================================================================
  // [PART 13 END]
  // ========================================================================

  // ========================================================================
  // [PART 15 START] Render – RIGHT side (separate component)
  // ========================================================================

  // Keep lazy component stable across renders (no remounting)
  const StudioRightLazyRef = useRef<
    React.LazyExoticComponent<React.ComponentType<any>> | null
  >(null);

  if (!StudioRightLazyRef.current) {
    StudioRightLazyRef.current = React.lazy(() => import("./StudioRight"));
  }

  const renderStudioRight = () => {
    const StudioRight = StudioRightLazyRef.current!;

    return (
      <React.Suspense
        fallback={
          <div className="studio-right">
            <div className="studio-right-surface">
              <div className="studio-empty-text">New ideas don’t actually exist, just recycle.</div>
            </div>
          </div>
        }
      >
        <StudioRight
          currentStill={currentStill}
          currentMotion={currentMotion}
          stillItems={stillItems}
          stillIndex={stillIndex}
          setStillIndex={setStillIndex}
          feedbackText={feedbackText}
          setFeedbackText={setFeedbackText}
          feedbackSending={feedbackSending}
          feedbackError={feedbackError}
          onSubmitFeedback={handleSubmitFeedback}
        />
      </React.Suspense>
    );
  };

  // ========================================================================
  // [PART 15 END]
  // ========================================================================

  // ========================================================================
  // [PART 16 START] Render – Custom style modal (blur handled in CSS)
  // ========================================================================
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
// [PART 17 START] Profile body – editorial history (revamped)
// ========================================================================
const renderProfileBody = () => {
  // Helpers for formatting date and sorting generations
  const expirationCandidate =
    (credits?.meta as any)?.expiresAt ||
    (credits?.meta as any)?.expirationDate ||
    (credits?.meta as any)?.expiry ||
    (credits?.meta as any)?.expiration;
  const expirationLabel = formatDateOnly(expirationCandidate);

  // Show newest first
  const sortedVisibleHistory = [...visibleHistory].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // A per‑card component so we can use React state and effects
  const HistoryCard: React.FC<{ g: GenerationRecord; index: number }> = ({
    g,
    index,
  }) => {
    const [loaded, setLoaded] = React.useState(false);
    const [progress, setProgress] = React.useState(0);
    const [showFull, setShowFull] = React.useState(false);
    // simulate progress until the image loads
    React.useEffect(() => {
      if (loaded) return;
      const timer = setInterval(() => {
        setProgress((p) => (p < 95 ? p + 5 : p));
      }, 100);
      return () => clearInterval(timer);
    }, [loaded]);
    const handleLoaded = () => {
      setLoaded(true);
      setProgress(100);
    };
    // shorten long prompts unless "view more" toggled
    const maxChars = 80;
    const isLong = (g.prompt?.length || 0) > maxChars;
    const promptText =
      !showFull && isLong
        ? (g.prompt ?? "").slice(0, maxChars).trim() + "…"
        : g.prompt || "Untitled prompt";
    const variantClasses = ["hero", "tall", "wide", "square", "mini", "wide", "tall"];
    const variant = variantClasses[index % variantClasses.length];
    // generation numbering (uses helper functions from existing code)
    const idx = historyIndexMap[g.id] ?? 0;
    const numberLabel = getEditorialNumber(g.id, idx);
    const [editing, setEditing] = React.useState(false);
    const [editValue, setEditValue] = React.useState(numberLabel);
    const commitNumber = () => {
      handleCommitNumber();
      setEditing(false);
    };
    return (
      <article key={g.id} className={`profile-card profile-card--${variant}`}>
        {/* Number badge (editable if admin) */}
        <div
          className="profile-card-number"
          style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "Scheibe" }}
          onDoubleClick={() => {
            handleBeginEditNumber(g.id, idx);
            setEditing(true);
          }}
          title={isAdmin ? "Double-click to edit" : undefined}
        >
          {editing ? (
            <input
              autoFocus
              className="profile-card-number-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitNumber}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitNumber();
                if (e.key === "Escape") {
                  setEditing(false);
                  handleCancelNumberEdit();
                }
              }}
            />
          ) : (
            <span>{numberLabel}</span>
          )}
        </div>

        {/* Card media with loading state */}
        <div
          className="profile-card-media"
          style={{
            position: "relative",
            background: loaded ? "transparent" : "rgba(8, 10, 0, 0.1)",
            border: "1px solid rgba(8, 10, 0, 0.08)",
          }}
        >
          {/* Progress bar along the top */}
          {!loaded && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: 3,
                width: `${progress}%`,
                background: "rgba(8, 10, 0, 0.8)",
                transition: "width 0.2s ease-out",
              }}
            />
          )}
          {/* Compressed preview (if available) loads first; full res loads afterward */}
          <img
            src={toPreviewUrl(g.outputUrl)}
            loading="lazy"
            decoding="async"
            alt={g.prompt}
            referrerPolicy="no-referrer"
            onLoad={handleLoaded}
            style={{
              display: loaded ? "block" : "none",
              objectFit: "cover",
              width: "100%",
              height: "100%",
            }}
          />
          {!loaded && (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "rgba(8, 10, 0, 0.1)",
              }}
            />
          )}
          {/* Action bar: download only */}
          <div
            className="profile-card-actions"
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "4px 6px",
              backdropFilter: "blur(5px)",
              WebkitBackdropFilter: "blur(5px)",
              background: "rgba(0, 0, 0, 0.4)",
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadGeneration(g, numberLabel);
              }}
              style={{
                fontWeight: "700",
                textTransform: "none",
                letterSpacing: "normal",
                fontSize: "10pt",
                border: "none",
                background: "transparent",
                color: loaded ? "rgba(8, 10, 0, 0.9)" : "rgba(255, 255, 255, 0.9)",
                cursor: "pointer",
                fontFamily: "Scheibe",
              }}
            >
              download
            </button>
          </div>
        </div>

        {/* Meta: prompt and actions */}
        <div className="profile-card-meta">
          <div
            className="profile-card-prompt"
            style={{
              fontSize: "10pt",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textTransform: "none",
              letterSpacing: "normal",
              fontFamily: "Scheibe",
            }}
          >
            {promptText}{" "}
            {isLong && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFull(!showFull);
                }}
                style={{
                  fontSize: "10pt",
                  fontWeight: "normal",
                  textDecoration: "underline",
                  background: "none",
                  border: "none",
                  padding: 0,
                  margin: 0,
                  color: "rgba(8, 10, 0, 0.6)",
                  cursor: "pointer",
                  fontFamily: "Scheibe",
                }}
              >
                {showFull ? "view less" : "view more"}
              </button>
            )}
          </div>
          <div
            className="profile-card-submeta"
            style={{
              fontSize: "10pt",
              textTransform: "none",
              letterSpacing: "normal",
              fontFamily: "Scheibe",
            }}
          >
            <span>{formatDateOnly(g.createdAt)}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("Delete this image?")) {
                  setHistoryGenerations((prev) => prev.filter((item) => item.id !== g.id));
                }
              }}
              style={{
                textDecoration: "underline",
                cursor: "pointer",
                marginLeft: 8,
              }}
            >
              delete image
            </span>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="profile-editorial-shell">
      {/* Header */}
      <header
        className="profile-header"
        style={{ display: "flex", flexDirection: "column", fontFamily: "Scheibe" }}
      >
        {/* Top row: Back to studio & Sign out */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <button
            type="button"
            className="link-button subtle"
            onClick={() => setActiveTab("studio")}
            style={{
              textTransform: "none",
              letterSpacing: "normal",
              fontFamily: "Scheibe",
              fontSize: "12px",
              fontWeight: "500",
            }}
          >
            Back to studio
          </button>
          <button
            type="button"
            className="link-button subtle"
            onClick={handleSignOut}
            style={{
              textTransform: "none",
              letterSpacing: "normal",
              fontFamily: "Scheibe",
              fontSize: "12px",
              fontWeight: "500",
            }}
          >
            Sign out
          </button>
        </div>

        {/* Second row: Profile label and meta */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <div
              className="profile-header-label"
              style={{
                textTransform: "none",
                letterSpacing: "normal",
                fontFamily: "Scheibe",
                fontSize: "16px",
                fontWeight: "600",
              }}
            >
              Profile
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              type="button"
              onClick={() => window.open(TOPUP_URL, "_blank", "noreferrer")}
              style={{
                textTransform: "none",
                letterSpacing: "normal",
                fontFamily: "Scheibe",
                fontSize: "12px",
                fontWeight: "700",
                border: "1px solid rgba(8,10,0,0.6)",
                padding: "4px 8px",
                cursor: "pointer",
                background: "rgba(8,10,0,0.05)",
                color: "rgba(8,10,0,0.9)",
              }}
            >
              Get more matchas
            </button>
            <div className="profile-meta-block">
              <span
                className="profile-meta-title"
                style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "Scheibe" }}
              >
                Matchas remaining
              </span>
              <span className="profile-meta-value">{credits ? credits.balance : "—"}</span>
            </div>
            <div className="profile-meta-block">
              <span
                className="profile-meta-title"
                style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "Scheibe" }}
              >
                Expiration date
              </span>
                <span className="profile-meta-value">{expirationLabel}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Archive section */}
      <section className="profile-gallery">
        <div
          className="profile-gallery-head"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "24px",
            fontFamily: "Scheibe",
          }}
        >
          <div
            className="profile-gallery-title"
            style={{ textTransform: "none", letterSpacing: "normal", fontSize: "24px", fontWeight: "700" }}
          >
            Archive
          </div>
          <div
            className="profile-gallery-sub"
            style={{ textTransform: "none", letterSpacing: "normal", fontSize: "14px" }}
          >
            {historyGenerations.length} pieces
          </div>
        </div>
        {historyLoading && <div className="profile-gallery-status">Loading archive…</div>}
        {historyError && (
          <div className="profile-gallery-status error-text">{historyError}</div>
        )}
        {!historyLoading && !historyGenerations.length && (
          <div className="profile-gallery-status">No archive yet.</div>
        )}
        <div className="profile-grid">
          {sortedVisibleHistory.map((g, i) => (
            <HistoryCard key={g.id} g={g} index={i} />
          ))}
        </div>
        <div ref={loadMoreRef} className="profile-grid-sentinel" aria-hidden />
      </section>

      {/* Bottom navigation: only “Studio” */}
      <div className="profile-bottom-nav">
        <button
          type="button"
          onClick={() => setActiveTab("studio")}
          style={{
            textTransform: "none",
            letterSpacing: "normal",
            fontFamily: "Scheibe",
            fontSize: "12px",
            fontWeight: "700",
            border: "1px solid rgba(8,10,0,0.6)",
            padding: "4px 8px",
            background: "rgba(8,10,0,0.05)",
            cursor: "pointer",
            color: "rgba(8,10,0,0.9)",
          }}
        >
          Studio
        </button>
      </div>
    </div>
  );
};
// ========================================================================
// [PART 17 END]
// ========================================================================



  // ========================================================================
  // [PART 18 START] Final layout
  // ========================================================================
  return (
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
                <button type="button" className="studio-header-cta" onClick={handleToggleAnimateMode}>
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

            {activeTab === "profile" && (
              <button type="button" className="link-button subtle" onClick={() => setActiveTab("studio")}>
                Back to studio
              </button>
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
              stylePresetKey={stylePresetKey}
              setStylePresetKey={setStylePresetKey}
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
              motionGenerating={motionGenerating}
              motionError={motionError}
              onCreateMotion={handleGenerateMotion}
              onTypeForMe={handleSuggestMotion}
              minaMessage={minaMessage}
              minaTalking={minaTalking}
              onGoProfile={() => setActiveTab("profile")}
            />
            {renderStudioRight()}
          </div>
        ) : (
          renderProfileBody()
        )}
      </div>

      {renderCustomStyleModal()}
    </div>
  );
  // ========================================================================
  // [PART 18 END]
  // ========================================================================
};

export default MinaApp;
// ============================================================================
// [PART 4 END] Component
// ============================================================================

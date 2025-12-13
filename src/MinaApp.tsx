// src/MinaApp.tsx
// =====================================================================================
// MINA APP — FULL FILE (NUMBERED PARTS)
// In the future you can tell me: “replace PART 9.2 to PART 9.6” etc.
// =====================================================================================

/* =====================================================================================
   [PART 1] Imports & environment
===================================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import StudioLeft, { MotionStyleKey } from "./StudioLeft";

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://mina-editorial-ai-api.onrender.com";

const TOPUP_URL =
  import.meta.env.VITE_MINA_TOPUP_URL ||
  "https://www.faltastudio.com/checkouts/cn/hWN6EhbqQW5KrdIuBO3j5HKV/en-ae?_r=AQAB9NY_ccOV_da3y7VmTxJU-dDoLEOCdhP9sg2YlvDwLQQ";

/* =====================================================================================
   [PART 2] Types
===================================================================================== */
type HealthState = { ok: boolean; message?: string };

type CreditsMeta = { imageCost: number; motionCost: number };
type CreditsState = { balance: number; meta?: CreditsMeta };

type EditorialResponse = {
  ok: boolean;
  prompt?: string;
  imageUrl?: string;
  imageUrls?: string[];
  generationId?: string;
  sessionId?: string;
  credits?: { balance: number; cost?: number };
};

type MotionSuggestResponse = { ok: boolean; suggestion?: string };

type MotionResponse = {
  ok: boolean;
  prompt?: string;
  videoUrl?: string;
  generationId?: string;
  sessionId?: string;
  credits?: { balance: number; cost?: number };
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
  meta?: Record<string, unknown> | null;
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
  credits: { balance: number; history?: any[] };
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

type UploadKind = "file" | "url";

type UploadItem = {
  id: string;
  kind: UploadKind;
  url: string; // preview blob or http
  remoteUrl?: string; // stored (signed)
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

type MinaAppProps = { initialCustomerId?: string };

/* =====================================================================================
   [PART 3] Constants & helpers
===================================================================================== */
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

// Map UI ratio -> Replicate safe values
const REPLICATE_ASPECT_RATIO_MAP: Record<string, string> = {
  "9:16": "9:16",
  "3:4": "3:4",
  "2:3": "2:3",
  "1:1": "1:1",
  "4:5": "4:5",
  "16:9": "16:9",
};

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function safeIsHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function getInitialCustomerId(initialCustomerId?: string): string {
  try {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("customerId");
      if (fromUrl && fromUrl.trim()) return fromUrl.trim();

      const stored = window.localStorage.getItem("minaCustomerId");
      if (stored && stored.trim()) return stored.trim();
    }
  } catch {
    // ignore
  }
  if (initialCustomerId && initialCustomerId.trim()) return initialCustomerId.trim();
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

/* =====================================================================================
   [PART 4] MinaApp component
===================================================================================== */
const MinaApp: React.FC<MinaAppProps> = ({ initialCustomerId }) => {
  /* -----------------------------------------------------------------------------------
     [PART 4.1] Global nav + customer
  ----------------------------------------------------------------------------------- */
  const [activeTab, setActiveTab] = useState<"studio" | "profile">("studio");

  const [customerId, setCustomerId] = useState<string>(() => getInitialCustomerId(initialCustomerId));
  const [customerIdInput, setCustomerIdInput] = useState<string>(customerId);

  const [studioMode, setStudioMode] = useState<"create" | "animate">("create"); // ✅ your toggle
  const [animateActivePanel, setAnimateActivePanel] = useState<"image" | "motionStyle" | "type" | null>("image");

  /* -----------------------------------------------------------------------------------
     [PART 4.2] Health / credits / session / profile history
  ----------------------------------------------------------------------------------- */
  const [health, setHealth] = useState<HealthState | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [credits, setCredits] = useState<CreditsState | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("Mina Studio session");

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyGenerations, setHistoryGenerations] = useState<GenerationRecord[]>([]);
  const [historyFeedbacks, setHistoryFeedbacks] = useState<FeedbackRecord[]>([]);

  /* -----------------------------------------------------------------------------------
     [PART 4.3] Create side state (stills + brief + uploads)
  ----------------------------------------------------------------------------------- */
  const [brief, setBrief] = useState("");
  const [tone] = useState("Poetic");
  const [platform, setPlatform] = useState("tiktok");
  const [aspectIndex, setAspectIndex] = useState(2);

  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);
  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [lastStillPrompt, setLastStillPrompt] = useState<string>("");

  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);
  const [stylePresetKey, setStylePresetKey] = useState<string>("vintage"); // keep if you use it

  const [uploads, setUploads] = useState<Record<UploadPanelKey, UploadItem[]>>({
    product: [],
    logo: [],
    inspiration: [],
  });

  const uploadsRef = useRef(uploads);
  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  /* -----------------------------------------------------------------------------------
     [PART 4.4] Animate side state (motion image + styles + brief + auto ratio)
  ----------------------------------------------------------------------------------- */
  const [motionImage, setMotionImage] = useState<UploadItem | null>(null);

  // ✅ default selected = fix-camera (can be deselected + multi-select)
  const [motionStylesSelected, setMotionStylesSelected] = useState<MotionStyleKey[]>(["fix-camera"]);

  const [motionBrief, setMotionBrief] = useState<string>("");

  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);

  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);

  // ✅ auto aspect label + rotate + icon (animate mode)
  const [motionAspectLabel, setMotionAspectLabel] = useState("9:16");
  const [motionAspectSubtitle, setMotionAspectSubtitle] = useState("Auto");
  const [motionAspectIconRotateDeg, setMotionAspectIconRotateDeg] = useState(0);
  const [motionAspectIconUrl, setMotionAspectIconUrl] = useState(ASPECT_ICON_URLS["9-16"]);

  /* -----------------------------------------------------------------------------------
     [PART 4.5] Feedback (RIGHT side: ONLY feedback)
  ----------------------------------------------------------------------------------- */
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  /* =====================================================================================
     [PART 5] Derived values
  ===================================================================================== */
  const currentAspect = ASPECT_OPTIONS[aspectIndex];
  const currentStill: StillItem | null = stillItems[stillIndex] || stillItems[0] || null;
  const currentMotion: MotionItem | null = motionItems[motionIndex] || motionItems[0] || null;

  const stylePresetKeyForApi = stylePresetKey.startsWith("custom-") ? "custom-style" : stylePresetKey;

  /* =====================================================================================
     [PART 6] Effects — persist customer + bootstrap + cleanup
  ===================================================================================== */
  useEffect(() => {
    setCustomerIdInput(customerId);
    persistCustomerId(customerId);
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

  // Cleanup blob URLs on unmount
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

      const snap = uploadsRef.current;
      snap.product.forEach((x) => revokeIfBlob(x.url));
      snap.logo.forEach((x) => revokeIfBlob(x.url));
      snap.inspiration.forEach((x) => revokeIfBlob(x.url));
      revokeIfBlob(motionImage?.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =====================================================================================
     [PART 7] API helpers (health, credits, session, history, R2)
  ===================================================================================== */
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
      const json = (await res.json()) as { balance: number; meta?: CreditsMeta };
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

  function pickUrlFromR2Response(json: any): string | null {
    if (!json) return null;
    if (typeof json.url === "string" && json.url.startsWith("http")) return json.url;
    if (typeof json.signedUrl === "string" && json.signedUrl.startsWith("http")) return json.signedUrl;
    if (typeof json.publicUrl === "string" && json.publicUrl.startsWith("http")) return json.publicUrl;
    if (json.result && typeof json.result.url === "string" && json.result.url.startsWith("http")) return json.result.url;
    if (json.data && typeof json.data.url === "string" && json.data.url.startsWith("http")) return json.data.url;
    return null;
  }

  async function storeRemoteToR2(url: string, kind: string): Promise<string> {
    if (!API_BASE_URL) return url;
    try {
      const res = await fetch(`${API_BASE_URL}/api/r2/store-remote-signed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, kind, customerId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) return url;
      return pickUrlFromR2Response(json) || url;
    } catch {
      return url;
    }
  }

  async function uploadFileToR2(kind: string, file: File): Promise<string> {
    if (!API_BASE_URL) throw new Error("Missing API base URL");
    const dataUrl = await fileToDataUrl(file);

    const res = await fetch(`${API_BASE_URL}/api/r2/upload-signed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataUrl,
        kind,
        customerId,
        filename: file.name,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.message || json?.error || `Upload failed (${res.status})`);
    }
    const url = pickUrlFromR2Response(json);
    if (!url) throw new Error("Upload ok but no URL returned");
    return url;
  }

  /* =====================================================================================
     [PART 8] Create handlers — brief, aspect, generate still
  ===================================================================================== */
  const handleBriefChange = (value: string) => setBrief(value);

  const handleCycleAspect = () => {
    setAspectIndex((prev) => {
      const next = (prev + 1) % ASPECT_OPTIONS.length;
      setPlatform(ASPECT_OPTIONS[next].platformKey);
      return next;
    });
  };

  const handleGenerateStill = async () => {
    const trimmed = brief.trim();
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

      const payload: any = {
        customerId,
        sessionId: sid,
        brief: trimmed,
        tone,
        platform: currentAspect.platformKey,
        minaVisionEnabled,
        stylePresetKey: stylePresetKeyForApi,
        aspectRatio: safeAspectRatio,
      };

      // product
      const productItem = uploads.product[0];
      const productUrl = productItem?.remoteUrl || productItem?.url;
      if (productUrl && safeIsHttpUrl(productUrl)) payload.productImageUrl = productUrl;

      // inspiration (up to 4)
      const inspirationUrls = uploads.inspiration
        .map((u) => u.remoteUrl || u.url)
        .filter((u) => safeIsHttpUrl(u))
        .slice(0, 4);

      if (inspirationUrls.length) payload.styleImageUrls = inspirationUrls;

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
        const next = [item, ...prev];
        setStillIndex(0);
        return next;
      });

      setLastStillPrompt(item.prompt);

      if (data.credits?.balance !== undefined) {
        setCredits((prev) => ({ balance: data.credits!.balance, meta: prev?.meta }));
      }
    } catch (err: any) {
      setStillError(err?.message || "Unexpected error generating still.");
    } finally {
      setStillGenerating(false);
    }
  };

  /* =====================================================================================
     [PART 9] Animate handlers — toggle, pick image, auto ratio, suggest, generate motion
  ===================================================================================== */

  // [PART 9.1] Toggle mode
  const handleToggleStudioMode = () => {
    if (studioMode === "create") {
      // ✅ if user is on a still, use it as motion input
      if (currentStill?.url) {
        setMotionImage({
          id: "motion-from-selected",
          kind: "url",
          url: currentStill.url,
          remoteUrl: currentStill.url,
          uploading: false,
        });
      }
      setAnimateActivePanel("image");
      setStudioMode("animate");
    } else {
      setStudioMode("create");
    }
  };

  // [PART 9.2] Pick motion image (upload to R2)
  const handlePickMotionImage = async (files: FileList) => {
    const file = files?.[0];
    if (!file) return;

    const id = `motion_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);

    setMotionImage({
      id,
      kind: "file",
      url: previewUrl,
      remoteUrl: undefined,
      file,
      uploading: true,
    });

    try {
      const remoteUrl = await uploadFileToR2("animate", file);
      setMotionImage((prev) => (prev?.id === id ? { ...prev, remoteUrl, uploading: false } : prev));
    } catch (e: any) {
      setMotionImage((prev) => (prev?.id === id ? { ...prev, uploading: false, error: e?.message || "Upload failed" } : prev));
    }
  };

  // [PART 9.3] Auto ratio from motion image
  const SUPPORTED = ["9:16", "3:4", "2:3", "1:1", "4:5", "16:9"] as const;

  const parseRatio = (r: string) => {
    const [a, b] = r.split(":").map(Number);
    return a > 0 && b > 0 ? a / b : 1;
  };

  const pickNearestRatio = (w: number, h: number) => {
    const r = w / h;

    let best = "9:16";
    let bestErr = Infinity;
    let rotateDeg = 0;

    for (const key of SUPPORTED) {
      const base = parseRatio(key);
      const opts = [
        { label: key, value: base, rot: 0 },
        { label: key.split(":").reverse().join(":"), value: 1 / base, rot: 90 },
      ];

      for (const o of opts) {
        const err = Math.abs(Math.log(r) - Math.log(o.value));
        if (err < bestErr) {
          bestErr = err;
          best = o.label;
          rotateDeg = o.rot;
        }
      }
    }

    return { label: best, rotateDeg };
  };

  const aspectKeyFromLabel = (label: string): AspectKey => {
    const [a, b] = label.split(":");
    if (a === "1" && b === "1") return "1-1";
    if ((a === "3" && b === "4") || (a === "4" && b === "3")) return "3-4";
    if ((a === "2" && b === "3") || (a === "3" && b === "2")) return "2-3";
    return "9-16";
  };

  const updateMotionAspectFromImage = async (url: string) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;

      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("img load failed"));
      });

      const { label, rotateDeg } = pickNearestRatio(img.naturalWidth, img.naturalHeight);
      setMotionAspectLabel(label);
      setMotionAspectSubtitle("Auto");
      setMotionAspectIconRotateDeg(rotateDeg);

      const k = aspectKeyFromLabel(label);
      setMotionAspectIconUrl(ASPECT_ICON_URLS[k]);
    } catch {
      setMotionAspectLabel("9:16");
      setMotionAspectSubtitle("Auto");
      setMotionAspectIconRotateDeg(0);
      setMotionAspectIconUrl(ASPECT_ICON_URLS["9-16"]);
    }
  };

  useEffect(() => {
    if (!motionImage) return;
    const u = motionImage.remoteUrl || motionImage.url;
    if (!u) return;
    void updateMotionAspectFromImage(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionImage?.remoteUrl, motionImage?.url]);

  // [PART 9.4] Suggest motion brief (StudioLeft will do the cute typing)
  const suggestMotionBrief = async (referenceImageUrl: string): Promise<string> => {
    if (!API_BASE_URL) return "";
    try {
      const res = await fetch(`${API_BASE_URL}/motion/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          referenceImageUrl,
          tone,
          platform: currentAspect.platformKey,
          minaVisionEnabled,
          stylePresetKey: stylePresetKeyForApi,
          sessionId,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as MotionSuggestResponse;
      const base = (json?.suggestion || "").trim();

      // include movement styles in the text (since backend doesn’t accept a separate field)
      if (!base) return "";
      if (motionStylesSelected.length === 0) return base;

      const stylesText = motionStylesSelected.join(", ");
      return `${base} Movement style: ${stylesText}.`;
    } catch {
      return "";
    }
  };

  // [PART 9.5] Create motion
  const handleCreateMotion = async () => {
    if (!API_BASE_URL) return;

    const imgUrl = motionImage?.remoteUrl || motionImage?.url;
    const briefText = motionBrief.trim();
    if (!imgUrl || !briefText) return;

    const sid = await ensureSession();
    if (!sid) {
      setMotionError("Could not start Mina session.");
      return;
    }

    try {
      setMotionGenerating(true);
      setMotionError(null);

      // include movement styles into the prompt text
      const stylesText = motionStylesSelected.length ? ` Movement style: ${motionStylesSelected.join(", ")}.` : "";
      const finalBrief = `${briefText}${stylesText}`.trim();

      const res = await fetch(`${API_BASE_URL}/motion/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          sessionId: sid,
          lastImageUrl: imgUrl,
          motionDescription: finalBrief,
          tone,
          platform: currentAspect.platformKey,
          minaVisionEnabled,
          stylePresetKey: stylePresetKeyForApi,
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
        prompt: data.prompt || finalBrief,
      };

      setMotionItems((prev) => {
        const next = [item, ...prev];
        setMotionIndex(0);
        return next;
      });

      if (data.credits?.balance !== undefined) {
        setCredits((prev) => ({ balance: data.credits!.balance, meta: prev?.meta }));
      }
    } catch (err: any) {
      setMotionError(err?.message || "Unexpected error generating motion.");
    } finally {
      setMotionGenerating(false);
    }
  };

  /* =====================================================================================
     [PART 10] Feedback / Like / Download
     ✅ Like does NOT change button label (no “OK”)
  ===================================================================================== */
  const handleLikeCurrent = async () => {
    if (!API_BASE_URL) return;

    const targetVideo = currentMotion?.url || "";
    const targetImage = currentStill?.url || "";

    const prompt = (targetVideo ? currentMotion?.prompt : currentStill?.prompt) || lastStillPrompt || brief;

    if (!prompt) return;

    try {
      await fetch(`${API_BASE_URL}/feedback/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          resultType: targetVideo ? "motion" : "image",
          platform: currentAspect.platformKey,
          prompt,
          comment: "",
          imageUrl: targetImage,
          videoUrl: targetVideo,
          sessionId,
        }),
      });
    } catch {
      // non-blocking
    }
  };

  const handleSubmitFeedback = async () => {
    if (!API_BASE_URL || !feedbackText.trim()) return;

    const comment = feedbackText.trim();
    const targetVideo = currentMotion?.url || "";
    const targetImage = currentStill?.url || "";
    const prompt = (targetVideo ? currentMotion?.prompt : currentStill?.prompt) || lastStillPrompt || brief;

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
          prompt,
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

  const handleDownload = () => {
    const target = currentMotion?.url || currentStill?.url;
    if (!target) return;

    const a = document.createElement("a");
    a.href = target;

    const safeName =
      (lastStillPrompt || brief || "mina")
        .replace(/[^a-z0-9]+/gi, "-")
        .toLowerCase()
        .slice(0, 80) || "mina";

    a.download = `Mina-${safeName}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /* =====================================================================================
     [PART 11] Profile helpers
  ===================================================================================== */
  const handleChangeCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customerIdInput.trim();
    if (!trimmed) return;
    setCustomerId(trimmed);
    setSessionId(null);
    setStillItems([]);
    setMotionItems([]);
    setMotionImage(null);
    setMotionBrief("");
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      if (typeof window !== "undefined") window.location.reload();
    }
  };

  /* =====================================================================================
     [PART 12] Right side render (StudioRight lazy)
  ===================================================================================== */
  const StudioRightLazyRef = useRef<React.LazyExoticComponent<React.ComponentType<any>> | null>(null);
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

  /* =====================================================================================
     [PART 13] Profile body
  ===================================================================================== */
  const renderProfileBody = () => (
    <div className="studio-profile-body">
      <div className="studio-profile-left">
        <h2>Profile</h2>

        <div className="profile-row">
          <div className="profile-label">Customer ID</div>
          <form onSubmit={handleChangeCustomer} className="profile-inline-form">
            <input className="profile-input" value={customerIdInput} onChange={(e) => setCustomerIdInput(e.target.value)} />
            <button type="submit" className="link-button primary-button">
              Switch
            </button>
          </form>
        </div>

        <div className="profile-row">
          <div className="profile-label">Credits</div>
          <div className="profile-value">{credits ? credits.balance : "—"}</div>
        </div>

        <div className="profile-row">
          <a href={TOPUP_URL} target="_blank" rel="noreferrer" className="link-button primary-button">
            Add credits
          </a>
        </div>

        <div className="profile-row">
          <button type="button" className="link-button subtle" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <div className="profile-row small">
          <button type="button" className="link-button subtle" onClick={() => setActiveTab("studio")}>
            ← Back to studio
          </button>
        </div>
      </div>

      <div className="studio-profile-right">
        <h3>Recent generations</h3>
        {historyLoading && <div>Loading history…</div>}
        {historyError && <div className="error-text">{historyError}</div>}
        {!historyLoading && !historyGenerations.length && <div>No history yet.</div>}

        <div className="profile-history-grid">
          {historyGenerations.map((g) => (
            <a key={g.id} href={g.outputUrl} target="_blank" rel="noreferrer" className="profile-history-card">
              <div className="profile-history-thumb" />
              <div className="profile-history-meta">
                <div className="profile-history-type">{g.type}</div>
                <div className="profile-history-time">{formatTime(g.createdAt)}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );

  /* =====================================================================================
     [PART 14] FINAL LAYOUT
     ✅ Header layout rule:
        - LEFT: Toggle button (Animate this / Create)
        - RIGHT: Like + Download only
  ===================================================================================== */
  return (
    <div className="mina-studio-root">
      <div className="studio-frame">
        <div className="studio-header-overlay">
          <div className="studio-header-left">
            <a href="https://mina.faltastudio.com" className="studio-logo-link">
              Mina
            </a>

            {activeTab === "studio" && (
              <button type="button" className="studio-header-cta" onClick={handleToggleStudioMode}>
                {studioMode === "create" ? "Animate this" : "Create"}
              </button>
            )}
          </div>

          <div className="studio-header-right">
            {activeTab === "studio" && (currentStill || currentMotion) && (
              <>
                <button type="button" className="studio-header-cta" onClick={handleLikeCurrent}>
                  ♡ more of this
                </button>

                <button type="button" className="studio-header-cta studio-header-cta--download" onClick={handleDownload}>
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
              mode={studioMode}
              // CREATE
              brief={brief}
              onBriefChange={handleBriefChange}
              minaVisionEnabled={minaVisionEnabled}
              onToggleVision={() => setMinaVisionEnabled((v) => !v)}
              onCreateStill={handleGenerateStill}
              stillGenerating={stillGenerating}
              stillError={stillError}
              // ANIMATE
              animateActivePanel={animateActivePanel}
              setAnimateActivePanel={setAnimateActivePanel}
              motionImage={motionImage}
              onPickMotionImage={handlePickMotionImage}
              onRemoveMotionImage={() => setMotionImage(null)}
              motionStylesSelected={motionStylesSelected}
              setMotionStylesSelected={setMotionStylesSelected}
              motionBrief={motionBrief}
              onMotionBriefChange={setMotionBrief}
              onSuggestMotionBrief={suggestMotionBrief}
              motionAspectLabel={motionAspectLabel}
              motionAspectSubtitle={motionAspectSubtitle}
              motionAspectIconUrl={motionAspectIconUrl}
              motionAspectIconRotateDeg={motionAspectIconRotateDeg}
              onCreateMotion={handleCreateMotion}
              motionGenerating={motionGenerating}
              motionError={motionError}
            />

            {renderStudioRight()}
          </div>
        ) : (
          renderProfileBody()
        )}
      </div>
    </div>
  );
};

export default MinaApp;

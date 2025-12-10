// ==============================================
// 1. Imports & environment
// ==============================================
import React, { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_MINA_API_BASE_URL ||
  "https://www.faltastudio.com/checkouts/cn/hWN6EhbqQW5KrdIuBO3j5HKV/en-ae?_r=AQAB9NY_ccOV_da3y7VmTxJU-dDoLEOCdhP9sg2YlvDwLQQ";

const ADMIN_KEY = import.meta.env.VITE_MINA_ADMIN_KEY || "";
const ADMIN_SECRET_STORAGE_KEY = "minaAdminSecretV1";

// ==============================================
// 2. Types
// ==============================================
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

// New admin API types
interface AdminSummary {
  totalCustomers: number;
  totalCredits: number;
  autoTopupOn: number;
}

interface AdminCustomer {
  customerId: string;
  balance: number;
}

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

  // ==============================================
// 3. Helpers
// ==============================================

const devCustomerId = "8766256447571";

function getInitialCustomerId(initialCustomerId: string): string {
  try {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("customerId");

      // If Shopify passes ?customerId=... → auto sign-in
      if (fromUrl && fromUrl.trim().length > 0) {
        return fromUrl.trim();
      }
    }
  } catch {
    // ignore
  }

  // Fallback to the id coming from Supabase
  if (initialCustomerId && initialCustomerId.trim().length > 0) {
    return initialCustomerId.trim();
  }

  // Last resort: no id
  return "";
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

function classNames(
  ...parts: Array<string | false | null | undefined>
) {
  return parts.filter(Boolean).join(" ");
}
type MinaAppProps = {
  initialCustomerId: string;
  onSignOut?: () => void;
};

// ==============================================
// 4. App component
// ==============================================
function MinaApp({ initialCustomerId, onSignOut }: MinaAppProps) {
  // --------------------------------------------
  // 4.1 Basic tab + customer
  // --------------------------------------------
  
    const [activeTab, setActiveTab] = useState<
      "playground" | "profile" | "admin"
    >("playground");
    
    const [customerId] = useState(() =>
      getInitialCustomerId(initialCustomerId)
    );
    
    const isAdmin = Boolean(ADMIN_KEY && customerId === devCustomerId);



  // --------------------------------------------
  // 4.2 Core state: health, credits, session
  // --------------------------------------------
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [credits, setCredits] = useState<CreditsBalance | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // --------------------------------------------
  // 4.3 Still + motion state (inputs & results)
  // --------------------------------------------
  const [productImageUrl, setProductImageUrl] = useState("");
  const [styleImageUrlsRaw, setStyleImageUrlsRaw] = useState("");
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("Poetic");
  const [platform, setPlatform] = useState("tiktok");
  const [stylePresetKey, setStylePresetKey] =
    useState("soft-desert-editorial");
  const [minaVisionEnabled, setMinaVisionEnabled] = useState(true);

  const [stillGenerating, setStillGenerating] = useState(false);
  const [stillError, setStillError] = useState<string | null>(null);
  const [lastStillPrompt, setLastStillPrompt] = useState<string | null>(null);
  const [stillItems, setStillItems] = useState<StillItem[]>([]);
  const [stillIndex, setStillIndex] = useState(0);

  const [motionDescription, setMotionDescription] = useState("");
  const [motionSuggestLoading, setMotionSuggestLoading] = useState(false);
  const [motionSuggestError, setMotionSuggestError] = useState<string | null>(
    null
  );

  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);
  const [motionItems, setMotionItems] = useState<MotionItem[]>([]);
  const [motionIndex, setMotionIndex] = useState(0);

  // --------------------------------------------
  // 4.4 Billing & auto-topup (with API)
  // --------------------------------------------
  const [autoTopupEnabled, setAutoTopupEnabled] = useState(false);
  const [autoTopupLimit, setAutoTopupLimit] = useState("0");
  const [autoTopupPack, setAutoTopupPack] = useState("MINA-50");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  // --------------------------------------------
  // 4.5 New Admin panel (Profile tab, admin secret)
  // --------------------------------------------
  const [adminMode, setAdminMode] = useState(false);
  const [adminSecret, setAdminSecret] = useState("");
  const [adminSummary, setAdminSummary] = useState<AdminSummary | null>(null);
  const [adminCustomers, setAdminCustomers] = useState<AdminCustomer[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminAdjust, setAdminAdjust] = useState<Record<string, string>>({});

  // --------------------------------------------
  // 4.6 History + old Admin overview (ADMIN_KEY)
  // --------------------------------------------
  const [history, setHistory] = useState<CustomerHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [adminOverview, setAdminOverview] =
    useState<AdminOverview | null>(null);

  // --------------------------------------------
  // 4.7 Effects – persist customer & admin secret
  // --------------------------------------------
      useEffect(() => {
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem("minaCustomerId", customerId);
          }
        } catch {
          // ignore
        }
      }, [customerId]);
    
      useEffect(() => {
        try {
          if (typeof window !== "undefined") {
            const stored = window.localStorage.getItem(ADMIN_SECRET_STORAGE_KEY);
            if (stored) {
              setAdminSecret(stored);
            }
          }
        } catch {
          // ignore
        }
      }, []);
    
     

  // ============================================
  // 5. Step “done” flags
  // ============================================
  const step1Done = Boolean(health?.ok && sessionId);
  const step2Done = Boolean(
    productImageUrl.trim().length || styleImageUrlsRaw.trim().length
  );
  const step3Done = Boolean(brief.trim().length);
  const step4Done = stillItems.length > 0;
  const step5Done = motionItems.length > 0;
   

  // ============================================
// 6. API helpers – core
// ============================================

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
  const trimmedId = customerId?.trim();
  if (!trimmedId) {
    setCredits(null);
    return;
  }

  try {
    setCreditsLoading(true);
    setCreditsError(null);
    const res = await fetch(
      `${API_BASE_URL}/credits/balance?customerId=${encodeURIComponent(
        trimmedId
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
  const trimmedId = customerId?.trim();
  if (!trimmedId) {
    return;
  }

  try {
    setSessionStarting(true);
    setSessionError(null);
    const res = await fetch(`${API_BASE_URL}/sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: trimmedId,
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
  const trimmedId = cid?.trim();
  if (!trimmedId) {
    setHistory(null);
    return;
  }

  try {
    setHistoryLoading(true);
    setHistoryError(null);
    const res = await fetch(
      `${API_BASE_URL}/history/customer/${encodeURIComponent(trimmedId)}`
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



  // ============================================
  // 7. API helpers – billing & admin
  // ============================================
  const fetchBillingSettings = async (cid: string) => {
    if (!API_BASE_URL) return;
    try {
      setBillingLoading(true);
      setBillingError(null);
      const res = await fetch(
        `${API_BASE_URL}/billing/settings?customerId=${encodeURIComponent(
          cid
        )}`
      );
      if (!res.ok) {
        throw new Error(`Billing error: ${res.status}`);
      }
      const data = (await res.json()) as {
        enabled?: boolean;
        monthlyLimitPacks?: number;
      };
      setAutoTopupEnabled(Boolean(data.enabled));
      setAutoTopupLimit(String(data.monthlyLimitPacks ?? 0));
    } catch (err: any) {
      setBillingError(err?.message || "Failed to load billing settings.");
    } finally {
      setBillingLoading(false);
    }
  };

  const saveBillingSettings = async () => {
    if (!customerId || !API_BASE_URL) return;
    try {
      setBillingSaving(true);
      setBillingError(null);
      const res = await fetch(`${API_BASE_URL}/billing/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          enabled: autoTopupEnabled,
          monthlyLimitPacks: Number(autoTopupLimit || "0"),
        }),
      });
      if (!res.ok) {
        throw new Error(`Billing save error: ${res.status}`);
      }
      const data = await res.json();
      setAutoTopupEnabled(Boolean(data.enabled));
      setAutoTopupLimit(String(data.monthlyLimitPacks ?? 0));
    } catch (err: any) {
      setBillingError(err?.message || "Failed to save billing settings.");
    } finally {
      setBillingSaving(false);
    }
  };

  const loadAdminData = async (secret: string) => {
    if (!API_BASE_URL || !secret) return;
    try {
      setAdminLoading(true);
      setAdminError(null);
      const headers = { "x-admin-secret": secret };

      const [summaryRes, customersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/summary`, { headers }),
        fetch(`${API_BASE_URL}/admin/customers`, { headers }),
      ]);

      if (!summaryRes.ok) throw new Error("Admin summary failed");
      if (!customersRes.ok) throw new Error("Admin customers failed");

      const summary = (await summaryRes.json()) as AdminSummary;
      const customersJson = await customersRes.json();
      const customers: AdminCustomer[] =
        customersJson.customers ?? customersJson;

      setAdminSummary(summary);
      setAdminCustomers(customers);
      setAdminMode(true);
    } catch (err: any) {
      console.error(err);
      setAdminError(
        err?.message || "Failed to load admin data. Check secret."
      );
      setAdminMode(false);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminEnter = async () => {
    if (!adminSecret) return;
    window.localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, adminSecret);
    await loadAdminData(adminSecret);
  };

  const handleAdminAdjust = async (targetCustomerId: string) => {
    if (!API_BASE_URL || !adminSecret) return;
    const raw = adminAdjust[targetCustomerId];
    const delta = Number(raw);
    if (!Number.isFinite(delta) || delta === 0) return;

    try {
      setAdminLoading(true);
      setAdminError(null);
      const res = await fetch(`${API_BASE_URL}/admin/credits/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ customerId: targetCustomerId, delta }),
      });

      if (!res.ok) throw new Error("Admin adjust failed");

      const data = (await res.json()) as {
        customerId: string;
        balance: number;
      };

      setAdminCustomers((prev) =>
        prev.map((c) =>
          c.customerId === data.customerId
            ? { ...c, balance: data.balance }
            : c
        )
      );

      setAdminAdjust((prev) => ({ ...prev, [targetCustomerId]: "" }));

      if (customerId && String(customerId) === String(data.customerId)) {
        await handleFetchCredits();
      }
    } catch (err: any) {
      console.error(err);
      setAdminError(err?.message || "Failed to adjust credits.");
    } finally {
      setAdminLoading(false);
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

      // ============================================
    // 8. Bootstrap on first load + when customer changes
    // ============================================
    
    useEffect(() => {
      const bootstrap = async () => {
        await handleCheckHealth();
    
        const trimmed = customerId?.trim();
        if (!trimmed) {
          // not logged in yet → only health
          return;
        }
    
        await handleFetchCredits();
        await handleStartSession();
        await fetchHistory(trimmed);
        await fetchBillingSettings(trimmed);
    
        if (isAdmin) {
          await fetchAdminOverview();
        }
      };
    
      void bootstrap();
    
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerId, isAdmin]);

  // ============================================
  // 9. API helpers – stills & motions
  // ============================================
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
  const handleLogout = () => {
    setCustomerId("");
    setLoginInput("");

    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("minaCustomerId");

        const params = new URLSearchParams(window.location.search);
        params.delete("customerId");
        const newUrl =
          window.location.pathname +
          (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState({}, "", newUrl);
      }
    } catch {
      // ignore
    }

    setSessionId(null);
    setStillItems([]);
    setStillIndex(0);
    setMotionItems([]);
    setMotionIndex(0);
    setHistory(null);
    setCredits(null);
  };

  // ============================================
  // 10. Derived values
  // ============================================
  
  const currentStill = stillItems[stillIndex] || null;
  const currentMotion = motionItems[motionIndex] || null;
  
  const imageCost = credits?.meta?.imageCost ?? 1;
  const motionCost = credits?.meta?.motionCost ?? 5;
  
  const hasCreditsForStill = credits ? credits.balance >= imageCost : true;
  const hasCreditsForMotion = credits ? credits.balance >= motionCost : true;
  
  const canGenerateStill =
    !stillGenerating &&
    !!sessionId &&
    !!productImageUrl.trim() &&
    !!brief.trim() &&
    hasCreditsForStill;
  
  const canGenerateMotion =
    !motionGenerating &&
    !!sessionId &&
    !!currentStill &&
    !!motionDescription.trim() &&
    hasCreditsForMotion;
  
  const creditsLabel = (() => {
    if (creditsLoading) return "Credits: …";
    if (creditsError) return "Credits error";
  
    const baseDetail = `img ${imageCost} · motion ${motionCost}`;
  
    if (!credits) {
      return `Credits: — (${baseDetail})`;
    }
  
    const base = `Credits: ${credits.balance}`;
    if (credits.balance <= 0) {
      return `${base} (add more to generate) · ${baseDetail}`;
    }
    if (!hasCreditsForStill || !hasCreditsForMotion) {
      return `${base} (not enough for next run) · ${baseDetail}`;
    }
    return `${base} (${baseDetail})`;
  })();
  
  const isConnected = Boolean(health?.ok);
  
  const historyStills: ApiGeneration[] =
    history?.generations.filter((g) => g.type === "image") ?? [];
  const historyMotions: ApiGeneration[] =
    history?.generations.filter((g) => g.type === "motion") ?? [];


   // ============================================
  // 11. JSX
  // ============================================

  return (
    <div className="mina-root">
      {/* 11.1 Header / tabs / credits badge */}
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
              className={classNames("tab", activeTab === "profile" && "active")}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
            {isAdmin && (
              <button
                className={classNames("tab", activeTab === "admin" && "active")}
                onClick={() => setActiveTab("admin")}
              >
                Admin
              </button>
            )}
          </div>

          <div className="mina-credits-badge">{creditsLabel}</div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginLeft: 12,
              fontSize: 12,
            }}
          >
            <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {customerId}
            </span>
            <button
                type="button"
                className="link-button subtle"
                onClick={onSignOut}
              >
                Sign out
              </button>

          </div>
        </div>
      </header>


      {/* 11.2 Main content area (tabs body) */}
      <main className="mina-main">
        {/* 11.2.1 Playground tab */}
        {activeTab === "playground" && (
          <div className="mina-layout">
            {/* 11.2.1.1 Left column – Steps 1–4 */}
            <div className="mina-left">
              {/* Step 1 – Connection & session */}
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

              {/* Step 2 – Product & style */}
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

              {/* Step 3 – Brief & format */}
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
                        <div className="error-text">
                          {stillError}
                          {TOPUP_URL && (
                            <>
                              {" "}
                              ·{" "}
                              <a
                                href={TOPUP_URL}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Buy credits
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                </div>
              </section>

              {/* Step 4 & 5 – Motion loop */}
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
                    <div className="status-error">
                      {motionError}
                      {TOPUP_URL && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={TOPUP_URL}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Buy credits
                          </a>
                        </>
                      )}
                    </div>
                  )}
                  {motionSuggestError && (
                    <div className="status-error">{motionSuggestError}</div>
                  )}

                </div>
              </section>
            </div>

            {/* 11.2.1.2 Right column – Stills + Motion piles */}
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

        {/* 11.2.2 Profile tab */}
        {activeTab === "profile" && (
          <div className="profile-layout">
            {/* 11.2.2.1 Profile – account, credits, auto top-up, history */}
                        <section className="mina-section wide">
              <div className="section-title">
                <span className="step-dot step-done" />
                <span>Profile · Account & billing</span>
              </div>
              <div className="section-body">
                <div
                  className="field-row"
                  style={{ justifyContent: "flex-end", marginBottom: 8 }}
                >
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      if (customerId) {
                        void handleFetchCredits();
                        void fetchHistory(customerId);
                        void fetchBillingSettings(customerId);
                      }
                    }}
                  >
                    Refresh data
                  </button>
                </div>

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

                  {/* 11.2.2.1.a Auto top-up (profile card) */}
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
                        {autoTopupEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>

                    <div className="auto-topup-grid">
                      <div className="field">
                        <div className="field-label">
                          Monthly limit{" "}
                          <span className="field-unit">(packs)</span>
                        </div>
                        <input
                          className="field-input"
                          type="number"
                          min={0}
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

                    <div className="field-row" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={saveBillingSettings}
                        disabled={billingSaving || billingLoading}
                      >
                        {billingSaving ? "Saving…" : "Save auto top-up"}
                      </button>

                      {billingLoading && (
                        <div className="profile-hint">Loading settings…</div>
                      )}

                      {billingError && (
                        <div className="status-error">{billingError}</div>
                      )}
                    </div>

                    <div className="profile-hint">
                      For now Mina only stores this preference. Later it will
                      control real auto-purchases via Shopify/Stripe.
                    </div>
                  </div>

                  {/* 11.2.2.1.b Recent credit events */}
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

            {/* 11.2.2.2 Admin – credits & customers (in profile tab) */}
            <section className="mina-section wide">
              <div className="section-title">ADMIN · CREDITS & CUSTOMERS</div>
              <div className="section-body">
                <div className="field-row" style={{ alignItems: "flex-end" }}>
                  <div className="field" style={{ maxWidth: 260 }}>
                    <div className="field-label">Admin secret</div>
                    <input
                      className="field-input"
                      type="password"
                      value={adminSecret}
                      onChange={(e) => setAdminSecret(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleAdminEnter}
                    disabled={!adminSecret || adminLoading}
                  >
                    {adminMode ? "Refresh admin data" : "Enter admin mode"}
                  </button>
                </div>

                {adminError && (
                  <div className="status-error" style={{ marginTop: 6 }}>
                    {adminError}
                  </div>
                )}

                {adminMode && (
                  <>
                    {adminSummary && (
                      <div style={{ marginTop: 8, fontSize: 13 }}>
                        <div>Total customers: {adminSummary.totalCustomers}</div>
                        <div>Total credits: {adminSummary.totalCredits}</div>
                        <div>
                          Auto top-up on: {adminSummary.autoTopupOn} customers
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 12, fontSize: 13 }}>
                      <div
                        className="field-label"
                        style={{ marginBottom: 4 }}
                      >
                        Customers
                      </div>
                      <div
                        style={{
                          maxHeight: 260,
                          overflow: "auto",
                          border: "1px solid rgba(8,10,0,0.18)",
                          backgroundColor: "#EEEED2",
                        }}
                      >
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: 12,
                          }}
                        >
                          <thead>
                            <tr>
                              <th
                                style={{
                                  textAlign: "left",
                                  padding: "4px 6px",
                                  borderBottom:
                                    "1px solid rgba(8,10,0,0.18)",
                                }}
                              >
                                Customer ID
                              </th>
                              <th
                                style={{
                                  textAlign: "right",
                                  padding: "4px 6px",
                                  borderBottom:
                                    "1px solid rgba(8,10,0,0.18)",
                                }}
                              >
                                Balance
                              </th>
                              <th
                                style={{
                                  textAlign: "right",
                                  padding: "4px 6px",
                                  borderBottom:
                                    "1px solid rgba(8,10,0,0.18)",
                                }}
                              >
                                Adjust
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminCustomers.map((c) => (
                              <tr key={c.customerId}>
                                <td
                                  style={{
                                    padding: "4px 6px",
                                    borderBottom:
                                      "1px solid rgba(8,10,0,0.08)",
                                  }}
                                >
                                  {c.customerId}
                                </td>
                                <td
                                  style={{
                                    padding: "4px 6px",
                                    textAlign: "right",
                                    borderBottom:
                                      "1px solid rgba(8,10,0,0.08)",
                                  }}
                                >
                                  {c.balance}
                                </td>
                                <td
                                  style={{
                                    padding: "4px 6px",
                                    textAlign: "right",
                                    borderBottom:
                                      "1px solid rgba(8,10,0,0.08)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <input
                                    type="number"
                                    style={{ width: 70, marginRight: 4 }}
                                    value={adminAdjust[c.customerId] ?? ""}
                                    onChange={(e) =>
                                      setAdminAdjust((prev) => ({
                                        ...prev,
                                        [c.customerId]: e.target.value,
                                      }))
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    style={{
                                      padding: "4px 8px",
                                      fontSize: 11,
                                    }}
                                    onClick={() =>
                                      handleAdminAdjust(c.customerId)
                                    }
                                    disabled={adminLoading}
                                  >
                                    Apply
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {adminCustomers.length === 0 && (
                              <tr>
                                <td
                                  colSpan={3}
                                  style={{
                                    padding: "6px",
                                    textAlign: "center",
                                  }}
                                >
                                  No customers yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* 11.2.2.3 Gallery – recent generations */}
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

        {/* 11.2.3 Admin tab (top-level) */}
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

export default MinaApp;


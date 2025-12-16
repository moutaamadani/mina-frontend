// src/lib/adminConfig.ts
// Safe config loader: NEVER throws, always returns a usable object.
// This prevents a blank screen if old tables were deleted.

export type AdminConfig = {
  pricing?: {
    imageCost?: number;
    motionCost?: number;
  };
  ai?: {
    personality?: {
      thinking?: string[];
      filler?: string[];
    };
  };
  styles?: {
    movementKeywords?: string[];
    presets?: Array<{
      id: string;
      name: string;
      status: "published" | "draft" | string;
      heroImage?: string;
      images: string[];
    }>;
  };
};

const LS_KEY = "minaAdminConfig";

export const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  pricing: { imageCost: 1, motionCost: 5 },
  ai: {
    personality: {
      thinking: [],
      filler: [],
    },
  },
  styles: {
    movementKeywords: ["fix_camera"],
    presets: [],
  },
};

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadAdminConfig(): AdminConfig {
  try {
    if (typeof window === "undefined") return DEFAULT_ADMIN_CONFIG;
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_ADMIN_CONFIG;

    const parsed = safeJsonParse<AdminConfig>(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_ADMIN_CONFIG;

    // Merge with defaults so missing fields never break UI
    return {
      ...DEFAULT_ADMIN_CONFIG,
      ...parsed,
      pricing: { ...DEFAULT_ADMIN_CONFIG.pricing, ...parsed.pricing },
      ai: {
        ...DEFAULT_ADMIN_CONFIG.ai,
        ...parsed.ai,
        personality: {
          ...DEFAULT_ADMIN_CONFIG.ai?.personality,
          ...parsed.ai?.personality,
        },
      },
      styles: {
        ...DEFAULT_ADMIN_CONFIG.styles,
        ...parsed.styles,
      },
    };
  } catch {
    return DEFAULT_ADMIN_CONFIG;
  }
}

export function saveAdminConfig(next: AdminConfig) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

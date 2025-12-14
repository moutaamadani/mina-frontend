import { useEffect, useState } from "react";

export const ADMIN_ALLOWLIST = ["madanimoutaavisions@gmail.com"];

export type ProviderParam = { key: string; value: string };
export type ProviderKey = { provider: string; masked: string; secret?: string };

export type AdminStyleAsset = {
  id: string;
  name: string;
  heroImage?: string;
  images: string[];
  trainingText: string;
  status: "draft" | "published";
};

export type AdminConfig = {
  ai: {
    providerKeys: ProviderKey[];
    defaultProvider: string;
    defaultModel: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    context: string;
    providerParams: ProviderParam[];
    futureReplicateNotes: string;
  };
  pricing: {
    defaultCredits: number;
    expirationDays: number;
    imageCost: number;
    motionCost: number;
  };
  styles: {
    presets: AdminStyleAsset[];
    movementKeywords: string[];
  };
  generations: {
    records: Array<{
      id: string;
      prompt: string;
      model: string;
      status: string;
      user: string;
      createdAt: string;
      cost?: number;
      url?: string;
      liked?: boolean;
      params?: Record<string, unknown>;
    }>;
    filters: { status: string; model: string; query: string };
  };
  clients: Array<{
    id: string;
    email: string;
    credits: number;
    expiresAt?: string;
    lastActive?: string;
    disabled?: boolean;
  }>;
  logs: Array<{
    id: string;
    level: "info" | "warn" | "error";
    message: string;
    at: string;
    source?: string;
  }>;
  architecture: string;
  assets: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    logo?: string;
    otherAssets: Array<{ id: string; name: string; url: string }>;
  };
  personality?: {
    thinkingPhrases?: string[];
    typewriterSuggestions?: string[];
  };
};

const STORAGE_KEY = "mina_admin_config_v1";

export function getDefaultAdminConfig(): AdminConfig {
  return {
    ai: {
      providerKeys: [{ provider: "openai", masked: "••••" }],
      defaultProvider: "openai",
      defaultModel: "gpt-4",
      temperature: 0.8,
      topP: 1,
      maxTokens: 1024,
      context: "You are Mina, an editorial AI assistant.",
      providerParams: [{ key: "seadream_mode", value: "fast" }],
      futureReplicateNotes: "Paste replicate snippets for future SVG/audio here.",
    },
    pricing: {
      defaultCredits: 15,
      expirationDays: 30,
      imageCost: 1,
      motionCost: 5,
    },
    styles: {
      presets: [],
      movementKeywords: ["fix_camera", "slow_motion"],
    },
    generations: {
      records: [],
      filters: { status: "", model: "", query: "" },
    },
    clients: [],
    logs: [],
    architecture:
      "1) Upload assets → 2) Preprocess → 3) Select model → 4) Generate → 5) Store outputs → 6) Deduct credits → 7) Expose in history.",
    assets: {
      primaryColor: "#111111",
      secondaryColor: "#f5f5f5",
      fontFamily: "Inter, sans-serif",
      otherAssets: [],
    },
    personality: {
      thinkingPhrases: [
        "Mina is arranging ideas…",
        "Sketching your vibe…",
        "Polishing the concept…",
        "Curating textures…",
      ],
      typewriterSuggestions: [
        "Slow cinematic pan across the product on a stone pedestal, soft moss, morning mist, luxe neutrals.",
        "Macro close-up with droplets sliding, minimal black background, spotlight bloom, elegant tempo.",
      ],
    },
  };
}

export function loadAdminConfig(): AdminConfig {
  if (typeof window === "undefined") return getDefaultAdminConfig();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return getDefaultAdminConfig();
  try {
    const parsed = JSON.parse(raw) as AdminConfig;
    return {
      ...getDefaultAdminConfig(),
      ...parsed,
      ai: { ...getDefaultAdminConfig().ai, ...parsed.ai },
      pricing: { ...getDefaultAdminConfig().pricing, ...parsed.pricing },
      styles: { ...getDefaultAdminConfig().styles, ...parsed.styles },
      generations: { ...getDefaultAdminConfig().generations, ...parsed.generations },
      assets: { ...getDefaultAdminConfig().assets, ...parsed.assets },
      personality: { ...getDefaultAdminConfig().personality, ...parsed.personality },
    };
  } catch {
    return getDefaultAdminConfig();
  }
}

export function saveAdminConfig(next: AdminConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function useAdminConfigState() {
  const [config, setConfig] = useState<AdminConfig>(loadAdminConfig());

  useEffect(() => {
    const handler = () => setConfig(loadAdminConfig());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const updateConfig = (next: AdminConfig) => {
    setConfig(next);
    saveAdminConfig(next);
  };

  return { config, updateConfig } as const;
}

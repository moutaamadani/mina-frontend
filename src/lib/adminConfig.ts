// src/lib/adminConfig.ts
// - Stores UI runtime config in localStorage (safe)
// - Provides isAdmin() based on MEGA tables (safe, no crashes)

import { supabase } from "./supabaseClient";

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
  ai: { personality: { thinking: [], filler: [] } },
  styles: { movementKeywords: ["fix_camera"], presets: [] },
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
      styles: { ...DEFAULT_ADMIN_CONFIG.styles, ...parsed.styles },
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

/* =============================================================================
   ADMIN LOGIC (MEGA)
   ✅ Source of truth: mega_customers.mg_admin_allowlist = true
   (Only this flag determines admin access.)
============================================================================= */

const MEGA_CUSTOMERS = "mega_customers";

const COL_USER_ID = "mg_user_id";
const COL_EMAIL = "mg_email";

// ✅ you added this column in mega_customers
const COL_ADMIN_ALLOWLIST = "mg_admin_allowlist";

function normalizeEmail(email?: string | null) {
  const e = (email || "").trim().toLowerCase();
  return e || "";
}

function truthy(v: any): boolean {
  if (v === true) return true;
  if (v === 1) return true;
  if (typeof v === "string" && v.toLowerCase().trim() === "true") return true;
  return false;
}

/**
 * ✅ isAdmin():
 * - Reads current Supabase user
 * - Loads mega_customers row by mg_user_id first, then mg_email
 * - Admin if: mg_admin_allowlist === true
 * - NEVER throws
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;

    const userId = (user?.id || "").trim();
    const email = normalizeEmail(user?.email || "");

    if (!userId && !email) return false;

    let row: any | null = null;

    // 1) by user id (best)
    if (userId) {
      const { data: byId, error } = await supabase
        .from(MEGA_CUSTOMERS)
        .select("*")
        .eq(COL_USER_ID, userId)
        .limit(1)
        .maybeSingle();

      if (!error && byId) row = byId as any;
    }

    // 2) fallback by email (for older rows)
    if (!row && email) {
      const { data: byEmail, error } = await supabase
        .from(MEGA_CUSTOMERS)
        .select("*")
        .eq(COL_EMAIL, email)
        .limit(1)
        .maybeSingle();

      if (!error && byEmail) row = byEmail as any;
    }

    if (!row) return false;

    // ✅ primary admin flag
    if (truthy(row?.[COL_ADMIN_ALLOWLIST])) return true;

    return false;
  } catch {
    return false;
  }
}

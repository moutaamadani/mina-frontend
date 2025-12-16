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
   - Primary: mega_customers (credits >= 9999 OR role/is_admin flag)
   - Optional: mega_admin allowlist rows (record_type = admin_allowlist)
============================================================================= */

const MEGA_CUSTOMERS = "mega_customers";
const MEGA_ADMIN = "mega_admin";

// ✅ Your “super-admin credits flag”
const ADMIN_CREDITS_THRESHOLD = 9999;

function findNumericField(row: any, candidates: string[]): number | null {
  for (const k of candidates) {
    const v = row?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function findCredits(row: any): number | null {
  if (!row || typeof row !== "object") return null;

  // common explicit names first
  const direct = findNumericField(row, [
    "credits",
    "credit",
    "balance",
    "mg_credits",
    "mg_credit",
    "mg_balance",
    "mg_credits_balance",
    "mg_credit_balance",
    "mg_remaining_credits",
    "remaining_credits",
  ]);
  if (direct !== null) return direct;

  // fallback: scan any field with "credit" or "balance"
  for (const key of Object.keys(row)) {
    if (!/credit|balance/i.test(key)) continue;
    const v = row[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function findIsAdminFlag(row: any): boolean {
  if (!row || typeof row !== "object") return false;

  const boolKeys = ["is_admin", "admin", "mg_is_admin", "mg_admin"];
  for (const k of boolKeys) {
    if (row?.[k] === true) return true;
    if (row?.[k] === "true") return true;
    if (row?.[k] === 1) return true;
  }

  const roleKeys = ["role", "mg_role"];
  for (const k of roleKeys) {
    const v = row?.[k];
    if (typeof v === "string" && /admin|owner|staff/i.test(v)) return true;
  }

  return false;
}

/**
 * ✅ isAdmin():
 * - Reads current Supabase user
 * - Checks mega_customers row: admin flag OR credits >= 9999
 * - Optionally checks mega_admin allowlist rows (record_type = admin_allowlist)
 * - NEVER throws
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    const email = (user?.email || "").trim().toLowerCase();
    const userId = (user?.id || "").trim();

    if (!email && !userId) return false;

    // 1) mega_customers check (best: each user can read their own row via RLS)
    try {
      // Try by user_id first, fallback to email
      const q = supabase
        .from(MEGA_CUSTOMERS)
        .select("*")
        .limit(1);

      const byUserId =
        userId
          ? await q.eq("mg_user_id", userId).maybeSingle()
          : { data: null, error: null };

      const row1 = byUserId?.data ?? null;

      const byEmail =
        !row1 && email
          ? await supabase.from(MEGA_CUSTOMERS).select("*").limit(1).eq("mg_email", email).maybeSingle()
          : { data: null, error: null };

      const row = row1 || byEmail?.data || null;

      if (row) {
        if (findIsAdminFlag(row)) return true;
        const credits = findCredits(row);
        if (credits !== null && credits >= ADMIN_CREDITS_THRESHOLD) return true;
      }
    } catch {
      // ignore (RLS or schema mismatch)
    }

    // 2) Optional mega_admin allowlist rows
    // Add rows like:
    //  mg_record_type = "admin_allowlist"
    //  mg_email = "someone@domain.com"
    //  mg_is_admin = true
    try {
      if (!email) return false;

      const { data: allowRow } = await supabase
        .from(MEGA_ADMIN)
        .select("mg_email, mg_is_admin, mg_role, mg_record_type")
        .eq("mg_record_type", "admin_allowlist")
        .eq("mg_email", email)
        .limit(1)
        .maybeSingle();

      if (allowRow) {
        if (allowRow.mg_is_admin === true) return true;
        if (typeof allowRow.mg_role === "string" && /admin|owner|staff/i.test(allowRow.mg_role)) return true;
        return true; // if row exists, treat as admin
      }
    } catch {
      // ignore
    }

    return false;
  } catch {
    return false;
  }
}

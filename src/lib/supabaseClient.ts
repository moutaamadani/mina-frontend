// src/lib/supabaseClient.ts
// -----------------------------------------------------------------------------
// File map
// 1) Imports: Supabase client factory.
// 2) Env constants: URL + anon key with safety guard.
// 3) Client setup: createClient with durable auth options and storage fallback.
// 4) Helpers: getSupabaseJwt + withSupabaseAuthHeaders for API calls.
// -----------------------------------------------------------------------------
// [PART 1] Imports
import { createClient } from "@supabase/supabase-js";

// [PART 2] Env constants
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
}

// [PART 3] Safe client setup
// Safe storage (prevents crashes in non-browser builds)
const storage =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage
    : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ Keep users signed in between page reloads / browser restarts
    persistSession: true,

    // ✅ Refresh tokens automatically when nearing expiry
    autoRefreshToken: true,

    // ✅ Needed for OAuth + magic link redirects
    detectSessionInUrl: true,

    // ✅ PKCE recommended for SPA apps
    flowType: "pkce",

    // ✅ Stable storage key (prevents collisions)
    storageKey: "mina.supabase.auth",

    // ✅ Use safe storage when available
    storage,
  },
});

/**
 * Mina API helper: returns the Supabase JWT (access token) if logged in.
 * Use this token as: Authorization: Bearer <token>
 */
export async function getSupabaseJwt(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Mina API helper: builds headers with JWT when available.
 */
export async function withSupabaseAuthHeaders(
  base: Record<string, string> = {}
): Promise<Record<string, string>> {
  const jwt = await getSupabaseJwt();
  return jwt ? { ...base, Authorization: `Bearer ${jwt}` } : base;
}

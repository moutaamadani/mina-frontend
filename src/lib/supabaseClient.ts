// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
}

// Safe storage (prevents crashes in non-browser builds)
const storage =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ keeps user logged in
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "mina.supabase.auth", // optional but recommended
    // ✅ important for OAuth + magic-link redirects (PKCE flow is recommended)
    flowType: "pkce",
    detectSessionInUrl: true,

    // ✅ keeps JWT fresh
    autoRefreshToken: true,

    // ✅ custom storage (optional but safer)
    storage,
  },
});

/**
 * Mina API helper: returns the Supabase JWT (access token) if logged in.
 * Use this token as: Authorization: Bearer <token>
 */
export async function getSupabaseJwt(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
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

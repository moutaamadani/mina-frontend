// src/lib/errorReporting.ts
// -----------------------------------------------------------------------------
// Helpers for sending client-side errors to the backend logging endpoint.
// -----------------------------------------------------------------------------
import { supabase } from "./supabaseClient";

export type ClientErrorPayload = {
  emoji: "🖥️" | "⚠️" | string;
  code: string;
  message: string;
  stack?: string | null;
  url?: string;
  userAgent?: string;
  userId?: string;
  email?: string;
  extra?: any;
};

export function getErrorEndpoint(): string {
  const base = (import.meta.env.VITE_BACKEND_URL as string | undefined) || "";
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalizedBase}/api/log-error`;
}

export async function sendClientError(payload: ClientErrorPayload): Promise<void> {
  try {
    const endpoint = getErrorEndpoint();
    const body: ClientErrorPayload = {
      ...payload,
      url: payload.url ?? window.location.href,
      userAgent: payload.userAgent ?? navigator.userAgent,
    };

    if (!body.userId || !body.email) {
      try {
        const { data } = await supabase.auth.getSession();
        body.userId = body.userId ?? data.session?.user?.id ?? undefined;
        body.email = body.email ?? data.session?.user?.email ?? undefined;
      } catch {
        // ignore auth lookup issues
      }
    }

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // ignore network errors
    });
  } catch {
    // Swallow all errors to avoid impacting UX
  }
}

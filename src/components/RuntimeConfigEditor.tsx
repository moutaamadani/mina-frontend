import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = { apiBase: string };

function normalizeBase(input: string) {
  const raw = (input || "").trim();
  if (!raw) return { base: window.location.origin, error: null as string | null };

  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    // IMPORTANT: keep path prefix (ex: https://domain.com/api)
    const path = (u.pathname || "/").replace(/\/+$/, "");
    const base = path && path !== "/" ? `${u.origin}${path}` : u.origin;
    return { base, error: null as string | null };
  } catch {
    return { base: "", error: "Invalid URL. Example: https://mina-editorial-ai-api.onrender.com" };
  }
}

// Smart join that avoids /api/api duplication if user already typed .../api
function joinSmart(base: string, path: string) {
  const b = (base || "").replace(/\/+$/, "");
  let p = (path || "").trim();
  if (!p) return b;

  // allow full URL override
  if (/^https?:\/\//i.test(p)) return p;

  if (!p.startsWith("/")) p = `/${p}`;

  // De-dupe: base ends with "/api" AND path starts with "/api/"
  if (b.toLowerCase().endsWith("/api") && p.toLowerCase().startsWith("/api/")) {
    p = p.replace(/^\/api/i, "");
  }
  return `${b}${p}`;
}

async function getAuthHeaders() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function fetchJsonStrict(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, mode: "cors" });
  const text = await res.text();
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) throw new Error(`HTTP ${res.status}\n${text.slice(0, 1800)}`);
  if (!ct.includes("json")) throw new Error(`Expected JSON but got "${ct || "unknown"}"\n${text.slice(0, 1800)}`);

  return JSON.parse(text);
}

// PUT might return 204 or empty body — treat as success
async function putJson(url: string, bodyObj: any, headers: Record<string, string>) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(bodyObj),
    credentials: "omit",
    mode: "cors",
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}\n${text.slice(0, 1800)}`);

  // If server returns JSON, show it (optional)
  if (text && text.trim()) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return null;
}

type Attempt = { url: string; ok: boolean; error?: string };

export default function RuntimeConfigEditor({ apiBase }: Props) {
  const [endpointOverride, setEndpointOverride] = useState<string>(""); // optional
  const [jsonText, setJsonText] = useState<string>("{}");

  const [activeEndpoint, setActiveEndpoint] = useState<string>("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = useMemo(() => normalizeBase(apiBase), [apiBase]);

  const candidatePaths = useMemo(
    () => [
      // ✅ Add admin paths (YOUR OLD VERSION DID NOT TRY THESE)
      "/admin/runtime-config",
      "/admin/runtime_config",
      "/admin/runtimeConfig",

      "/api/admin/runtime-config",
      "/api/admin/runtime_config",
      "/api/admin/runtimeConfig",

      "/runtime-config",
      "/runtime_config",
      "/runtimeConfig",

      "/api/runtime-config",
      "/api/runtime_config",
      "/api/runtimeConfig",
    ],
    []
  );

  const candidateUrls = useMemo(() => {
    if (!normalized.base) return [];
    const out: string[] = [];

    if (endpointOverride.trim()) out.push(joinSmart(normalized.base, endpointOverride.trim()));

    for (const p of candidatePaths) {
      const u = joinSmart(normalized.base, p);
      if (!out.includes(u)) out.push(u);
    }
    return out;
  }, [normalized.base, endpointOverride, candidatePaths]);

  const testHealth = async () => {
    setError(null);
    setAttempts([]);
    setLoading(true);
    try {
      if (normalized.error) throw new Error(normalized.error);

      const data = await fetchJsonStrict(joinSmart(normalized.base, "/"), {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
      });

      alert(`Health OK ✅\n${JSON.stringify(data, null, 2).slice(0, 1200)}`);
    } catch (e: any) {
      setError(e?.message ?? "Health check failed");
    } finally {
      setLoading(false);
    }
  };

  const load = async () => {
    setError(null);
    setAttempts([]);
    setLoading(true);

    try {
      if (normalized.error) throw new Error(normalized.error);
      const auth = await getAuthHeaders();

      const tries: Attempt[] = [];
      let lastErr: any = null;

      for (const url of candidateUrls) {
        try {
          const data = await fetchJsonStrict(url, {
            method: "GET",
            headers: { Accept: "application/json", ...auth },
            credentials: "omit",
          });

          setActiveEndpoint(url);
          setJsonText(JSON.stringify(data ?? {}, null, 2));
          tries.push({ url, ok: true });
          setAttempts(tries);
          return;
        } catch (e: any) {
          lastErr = e;
          tries.push({ url, ok: false, error: String(e?.message ?? e) });
        }
      }

      setAttempts(tries);
      throw lastErr || new Error("Failed to load runtime config.");
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);

    try {
      if (normalized.error) throw new Error(normalized.error);

      const target =
        activeEndpoint ||
        (endpointOverride.trim() ? joinSmart(normalized.base, endpointOverride.trim()) : "");

      if (!target) throw new Error("No endpoint selected. Click Retry (load) first OR type Endpoint override.");

      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e: any) {
        throw new Error("Invalid JSON.\n" + (e?.message || ""));
      }

      const auth = await getAuthHeaders();
      await putJson(target, parsed, auth);

      alert("Runtime config saved ✅");
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-grid">
      <section className="admin-section">
        <header>
          <div className="admin-section-title">Runtime Config (Live backend)</div>
          <p className="admin-section-desc">
            Tries multiple endpoints (including <code>/admin/runtime-config</code>). If your API base points to the FRONTEND,
            you will get HTML (SPA), not JSON.
          </p>
        </header>

        {normalized.error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            {normalized.error}
          </div>
        )}

        <div className="admin-inline" style={{ alignItems: "end" }}>
          <label style={{ flex: 1 }}>
            <strong>Endpoint override (optional)</strong>
            <input
              value={endpointOverride}
              onChange={(e) => setEndpointOverride(e.target.value)}
              placeholder="Example: /admin/runtime-config   or   /api/admin/runtime-config"
            />
          </label>

          <button className="admin-button ghost" type="button" onClick={() => void testHealth()} disabled={loading}>
            Test API
          </button>

          <button className="admin-button ghost" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading..." : "Retry"}
          </button>

          <button className="admin-button" type="button" onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {!!attempts.length && (
          <div style={{ marginTop: 12 }}>
            <strong>Tried endpoints</strong>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
              {attempts
                .map((a) => (a.ok ? `✅ ${a.url}` : `❌ ${a.url}\n${(a.error || "").slice(0, 700)}`))
                .join("\n\n")}
            </pre>
          </div>
        )}

        {activeEndpoint && (
          <div className="admin-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Using endpoint: <strong>{activeEndpoint}</strong>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: 12,
              marginTop: 10,
              border: "1px solid crimson",
              color: "crimson",
              borderRadius: 8,
              whiteSpace: "pre-wrap",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <strong>Runtime config JSON</strong>
          <textarea
            className="admin-textarea"
            style={{ minHeight: 320 }}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
        </div>
      </section>
    </div>
  );
}

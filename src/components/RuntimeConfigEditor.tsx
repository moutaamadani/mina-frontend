import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = { apiBase?: string };

function normalizeBase(input: string) {
  const raw = (input || "").trim();
  if (!raw) return { base: window.location.origin, error: null as string | null };

  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    return { base: `${u.protocol}//${u.host}`, error: null as string | null };
  } catch {
    return { base: "", error: "Invalid URL. Example: https://mina-editorial-ai-api.onrender.com" };
  }
}

function joinUrl(base: string, pathOrFullUrl: string) {
  const p = (pathOrFullUrl || "").trim();
  if (!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const path = p.startsWith("/") ? p : `/${p}`;
  return `${base}${path}`;
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

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text.slice(0, 2000)}`);
  }
  if (!ct.toLowerCase().includes("application/json")) {
    throw new Error(`Expected JSON but got "${ct || "unknown"}"\n${text.slice(0, 2000)}`);
  }
  return JSON.parse(text);
}

export default function RuntimeConfigEditor({ apiBase = "" }: Props) {
  const [baseInput, setBaseInput] = useState(apiBase);
  // IMPORTANT: you must set this to the REAL backend path
  const [endpointPath, setEndpointPath] = useState("/runtime-config"); // change this after you find the correct route

  const [jsonText, setJsonText] = useState("{}");
  const [activeEndpoint, setActiveEndpoint] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = useMemo(() => normalizeBase(baseInput), [baseInput]);

  const commonPaths = useMemo(
    () => [
      "/runtime-config",
      "/admin/runtime-config",
      "/api/runtime-config",
      "/api/admin/runtime-config",
      "/api/admin/runtime_config",
      "/api/runtime_config",
      "/api/config/runtime",
      "/api/admin/config/runtime",
    ],
    []
  );

  const endpointUrl = useMemo(() => {
    if (!normalized.base) return "";
    return joinUrl(normalized.base, endpointPath);
  }, [normalized.base, endpointPath]);

  const testApi = async () => {
    setError(null);
    setLoading(true);
    try {
      if (normalized.error) throw new Error(normalized.error);
      const data = await fetchJson(`${normalized.base}/`, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "omit",
      });
      alert(`Health OK ✅\n${JSON.stringify(data, null, 2).slice(0, 1500)}`);
    } catch (e: any) {
      setError(e?.message ?? "Health check failed");
    } finally {
      setLoading(false);
    }
  };

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      if (normalized.error) throw new Error(normalized.error);
      if (!endpointUrl) throw new Error("Missing endpoint URL.");

      const auth = await getAuthHeaders();

      const data = await fetchJson(endpointUrl, {
        method: "GET",
        headers: { accept: "application/json", ...auth },
        credentials: "omit",
      });

      setActiveEndpoint(endpointUrl);
      setJsonText(JSON.stringify(data ?? {}, null, 2));
    } catch (e: any) {
      setActiveEndpoint("");
      setError(e?.message ?? "Load failed");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const target = activeEndpoint || endpointUrl;
      if (!target) throw new Error("Missing endpoint URL.");

      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e: any) {
        throw new Error("Invalid JSON.\n" + (e?.message || ""));
      }

      const auth = await getAuthHeaders();

      const attempt = async (method: "PUT" | "POST") => {
        return fetchJson(target, {
          method,
          headers: { "content-type": "application/json", accept: "application/json", ...auth },
          body: JSON.stringify(parsed),
          credentials: "omit",
        });
      };

      try {
        await attempt("PUT");
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (msg.includes("HTTP 405")) {
          await attempt("POST");
        } else {
          throw e;
        }
      }

      alert("Runtime config saved ✅");
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    // Don’t auto-load until user sets correct path
    // If you want auto-load, uncomment:
    // void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-grid">
      <section className="admin-section">
        <header>
          <div className="admin-section-title">Runtime Config (Live backend)</div>
          <p className="admin-section-desc">
            Your backend must expose a GET endpoint for runtime config. Right now it returns 404, so you need the correct route path.
          </p>
        </header>

        <div className="admin-inline" style={{ alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            <strong>API Base URL</strong>
            <input
              value={baseInput}
              onChange={(e) => setBaseInput(e.target.value)}
              placeholder="https://mina-editorial-ai-api.onrender.com"
            />
          </label>

          <button className="admin-button ghost" type="button" onClick={() => setBaseInput("")}>
            Use same domain
          </button>

          <button className="admin-button ghost" type="button" onClick={() => void testApi()} disabled={loading}>
            Test API
          </button>
        </div>

        <div className="admin-inline" style={{ marginTop: 10, alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            <strong>Runtime Config Endpoint Path</strong>
            <input
              value={endpointPath}
              onChange={(e) => setEndpointPath(e.target.value)}
              placeholder="/runtime-config (or /api/admin/runtime-config etc)"
            />
          </label>

          <label>
            <strong>Common paths</strong>
            <select value={endpointPath} onChange={(e) => setEndpointPath(e.target.value)}>
              {commonPaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <button className="admin-button ghost" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading..." : "Retry"}
          </button>

          <button className="admin-button" type="button" onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="admin-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Full endpoint URL: <strong>{endpointUrl || "—"}</strong>
        </div>

        {activeEndpoint && (
          <div className="admin-muted" style={{ fontSize: 12, marginTop: 6 }}>
            Loaded from: <strong>{activeEndpoint}</strong>
          </div>
        )}

        {normalized.error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            {normalized.error}
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
          <strong>AI Runtime Config JSON</strong>
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

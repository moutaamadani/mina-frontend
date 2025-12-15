import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = { apiBase: string };

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
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text.slice(0, 1500)}`);
  }
  if (!ct.toLowerCase().includes("application/json")) {
    throw new Error(`Expected JSON but got "${ct || "unknown"}"\n${text.slice(0, 1500)}`);
  }
  return JSON.parse(text);
}

export default function RuntimeConfigEditor({ apiBase }: Props) {
  const [baseInput, setBaseInput] = useState(apiBase || "");
  const [jsonText, setJsonText] = useState("{}");
  const [activeEndpoint, setActiveEndpoint] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = useMemo(() => normalizeBase(baseInput), [baseInput]);

  const candidates = useMemo(() => {
    if (!normalized.base) return [];
    return [
      `${normalized.base}/api/admin/runtime-config`,
      `${normalized.base}/api/runtime-config`,
      `${normalized.base}/runtime-config`,
    ];
  }, [normalized.base]);

  const testHealth = async () => {
    setError(null);
    setLoading(true);
    try {
      if (normalized.error) throw new Error(normalized.error);
      const data = await fetchJson(`${normalized.base}/`, { method: "GET" });
      alert(`Health OK ✅\n${JSON.stringify(data, null, 2).slice(0, 1200)}`);
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

      const auth = await getAuthHeaders();

      let lastErr: any = null;
      for (const url of candidates) {
        try {
          const data = await fetchJson(url, {
            method: "GET",
            headers: { ...auth },
            // important: cross-domain usually works better without cookies
            credentials: "omit",
          });
          setActiveEndpoint(url);
          setJsonText(JSON.stringify(data, null, 2));
          return;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("Failed to load runtime config (no endpoint matched).");
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
      if (!activeEndpoint) throw new Error("Click Retry first (load config before saving).");

      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e: any) {
        throw new Error("Invalid JSON.\n" + (e?.message || ""));
      }

      const auth = await getAuthHeaders();

      await fetchJson(activeEndpoint, {
        method: "PUT",
        headers: { "content-type": "application/json", ...auth },
        body: JSON.stringify(parsed),
        credentials: "omit",
      });

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
            Loads/saves backend runtime config. Shows full errors (HTTP status/body) if something is wrong.
          </p>
        </header>

        <div className="admin-inline">
          <label style={{ flex: 1 }}>
            <strong>API Base URL (optional)</strong>
            <input
              value={baseInput}
              onChange={(e) => setBaseInput(e.target.value)}
              placeholder="https://mina-editorial-ai-api.onrender.com (leave empty if same domain)"
            />
          </label>

          <button className="admin-button ghost" type="button" onClick={() => setBaseInput("")}>
            Use same domain
          </button>

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

        {normalized.error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            {normalized.error}
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
          <strong>AI Runtime Config</strong>
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

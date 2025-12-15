import React, { useEffect, useMemo, useState } from "react";

type Props = {
  apiBase: string; // "" means same domain
};

function normalizeBase(input: string): { base: string; error: string | null } {
  const raw = (input || "").trim();

  if (!raw) return { base: window.location.origin, error: null };

  // allow users to paste "my-api.onrender.com" without protocol
  const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const u = new URL(withProto);
    // remove trailing slash
    const base = `${u.protocol}//${u.host}`;
    return { base, error: null };
  } catch {
    return { base: "", error: "Invalid URL. Example: https://your-api.onrender.com" };
  }
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);

  const ct = res.headers.get("content-type") || "";
  const bodyText = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${bodyText.slice(0, 1200)}`);
  }

  // if server returned HTML/text by mistake, make it obvious
  if (!ct.toLowerCase().includes("application/json")) {
    throw new Error(`Expected JSON but got "${ct || "unknown content-type"}"\n${bodyText.slice(0, 1200)}`);
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error(`Failed to parse JSON\n${bodyText.slice(0, 1200)}`);
  }
}

export default function RuntimeConfigEditor({ apiBase }: Props) {
  const [baseInput, setBaseInput] = useState(apiBase || "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // raw JSON editor (works for Seedream params too)
  const [jsonText, setJsonText] = useState<string>("{}");

  const normalized = useMemo(() => normalizeBase(baseInput), [baseInput]);

  // Try a few likely endpoints (so you don’t have to match my exact path)
  const endpoints = useMemo(() => {
    if (!normalized.base) return [];
    return [
      `${normalized.base}/api/admin/runtime-config`,
      `${normalized.base}/api/runtime-config`,
      `${normalized.base}/runtime-config`,
    ];
  }, [normalized.base]);

  const [activeEndpoint, setActiveEndpoint] = useState<string>("");

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      if (normalized.error) throw new Error(normalized.error);
      if (!endpoints.length) throw new Error("Missing API base.");

      let lastErr: any = null;
      for (const ep of endpoints) {
        try {
          const data = await fetchJson(ep, { method: "GET", credentials: "include" });
          setActiveEndpoint(ep);
          setJsonText(JSON.stringify(data, null, 2));
          setLoading(false);
          return;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("Failed to load runtime config.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load runtime config");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      if (!activeEndpoint) throw new Error("Load runtime config first (Retry).");

      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e: any) {
        throw new Error("Your JSON is invalid. Fix it then Save.\n" + (e?.message || ""));
      }

      await fetchJson(activeEndpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
        credentials: "include",
      });

      alert("Runtime config saved ✅");
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    // initial load
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-grid">
      <section className="admin-section">
        <header>
          <div className="admin-section-title">Runtime Config (Live backend)</div>
          <p className="admin-section-desc">
            Edit live backend runtime config (models, replicate params, GPT temp/tokens, system/user append).
          </p>
        </header>

        <div className="admin-inline">
          <label style={{ flex: 1 }}>
            <strong>API Base URL (optional)</strong>
            <input
              value={baseInput}
              onChange={(e) => setBaseInput(e.target.value)}
              placeholder="Example: https://your-api.onrender.com (leave empty if same domain)"
            />
          </label>

          <button
            className="admin-button ghost"
            type="button"
            onClick={() => setBaseInput("")}
            title="Use current site domain"
          >
            Use same domain
          </button>

          <button className="admin-button ghost" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading..." : "Retry"}
          </button>

          <button className="admin-button" type="button" onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Saving..." : "Save runtime config"}
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
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8, whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <strong>AI Runtime Config</strong>
          <textarea
            className="admin-textarea"
            style={{ minHeight: 340 }}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
          <div className="admin-muted" style={{ fontSize: 12, marginTop: 6 }}>
            Tip: put your Seedream defaults here (size, aspect_ratio, width/height, enhance_prompt, max_images…).
            Prompt/image_input remain per-request.
          </div>
        </div>
      </section>
    </div>
  );
}

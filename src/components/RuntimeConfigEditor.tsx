import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const ADMIN_TABLE = "mega_admin";
const CONFIG_RECORD_TYPE = "runtime_config";

type Props = {
  /** optional: default key to load (ex: "prod", "dev") */
  defaultKey?: string;
};

function safePretty(obj: any) {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export default function RuntimeConfigEditor({ defaultKey }: Props) {
  const [configKey, setConfigKey] = useState(() => {
    try {
      return localStorage.getItem("MINA_RUNTIME_CONFIG_KEY") || defaultKey || "default";
    } catch {
      return defaultKey || "default";
    }
  });

  const [jsonText, setJsonText] = useState("{}");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keyNormalized = useMemo(() => (configKey || "").trim() || "default", [configKey]);

  const persistKey = (k: string) => {
    try {
      localStorage.setItem("MINA_RUNTIME_CONFIG_KEY", k);
    } catch {}
  };

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      // maybeSingle: returns null if not found (no error)
      const { data, error } = await supabase
        .from(ADMIN_TABLE)
        .select("mg_value, mg_updated_at, mg_created_at, mg_key, mg_record_type, mg_meta")
        .eq("mg_record_type", CONFIG_RECORD_TYPE)
        .eq("mg_key", keyNormalized)
        .maybeSingle();

      if (error) throw new Error(error.message);

      const payload = (data?.mg_value as any) ?? {};
      setJsonText(safePretty(payload));
      setLastUpdated((data?.mg_updated_at as string | null) ?? (data?.mg_created_at as string | null) ?? null);
    } catch (e: any) {
      setError(
        e?.message ||
          `Failed to load from Supabase table "${ADMIN_TABLE}" (mg_record_type=${CONFIG_RECORD_TYPE}). Make sure the table exists and RLS allows your admin user.`
      );
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(jsonText || "{}");
      } catch (e: any) {
        throw new Error("Invalid JSON:\n" + (e?.message || ""));
      }

      const mgId = `${CONFIG_RECORD_TYPE}:${keyNormalized}`;
      const { error } = await supabase
        .from(ADMIN_TABLE)
        .upsert(
          {
            mg_id: mgId,
            mg_record_type: CONFIG_RECORD_TYPE,
            mg_key: keyNormalized,
            mg_value: parsed,
            mg_meta: {},
            mg_updated_at: new Date().toISOString(),
          },
          { onConflict: "mg_id" }
        );

      if (error) throw new Error(error.message);

      await load();
      alert("Runtime config saved ✅");
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    persistKey(keyNormalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyNormalized]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-grid">
      <section className="admin-section">
        <header>
          <div className="admin-section-title">Runtime Config (Supabase)</div>
          <p className="admin-section-desc">
            This editor reads/writes JSON to Supabase table <strong>{ADMIN_TABLE}</strong> using
            mg_record_type=<strong>{CONFIG_RECORD_TYPE}</strong>. No backend endpoint needed.
          </p>
        </header>

        <div className="admin-inline" style={{ alignItems: "end" }}>
          <label style={{ flex: 1, minWidth: 320 }}>
            <strong>Config key</strong>
            <input
              value={configKey}
              onChange={(e) => setConfigKey(e.target.value)}
              placeholder='Example: "default" or "prod"'
            />
          </label>

          <button
            className="admin-button ghost"
            type="button"
            onClick={() => {
              setConfigKey("default");
            }}
            disabled={loading || saving}
          >
            Use "default"
          </button>

          <button className="admin-button ghost" type="button" onClick={() => void load()} disabled={loading || saving}>
            {loading ? "Loading..." : "Reload"}
          </button>

          <button className="admin-button" type="button" onClick={() => void save()} disabled={loading || saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {lastUpdated && (
          <div className="admin-muted" style={{ fontSize: 12, marginTop: 8 }}>
            Last updated: <strong>{lastUpdated}</strong> (key: <strong>{keyNormalized}</strong>)
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
          <strong>Runtime JSON</strong>
          <textarea
            className="admin-textarea"
            style={{ minHeight: 360 }}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="admin-inline" style={{ marginTop: 10 }}>
          <button
            className="admin-button ghost"
            type="button"
            onClick={() => navigator.clipboard?.writeText(jsonText)}
          >
            Copy JSON
          </button>

          <button
            className="admin-button ghost"
            type="button"
            onClick={() => setJsonText("{}")}
          >
            Reset {}
          </button>
        </div>
      </section>
    </div>
  );
}

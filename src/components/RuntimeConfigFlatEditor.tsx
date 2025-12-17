//RuntimeConfigFlatEditor.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const ADMIN_TABLE = "mega_admin";
const FLAT_RECORD_TYPE = "runtime_config_flat";
const EFFECTIVE_RECORD_TYPE = "runtime_config_effective";

type FlatRow = {
  id: boolean;

  models_seadream: string | null;
  models_kling: string | null;

  credits_image_cost: number | null;
  credits_motion_cost: number | null;

  kling_mode: string | null;
  kling_negative_prompt: string | null;

  gpt_editorial_temperature: number | null;
  gpt_editorial_max_tokens: number | null;

  prompt_system: string | null;
  prompt_append_system: string | null;
  prompt_append_user: string | null;

  updated_at?: string | null;
};

const DEFAULT_ROW: FlatRow = {
  id: true,

  models_seadream: null,
  models_kling: null,

  credits_image_cost: null,
  credits_motion_cost: null,

  kling_mode: null,
  kling_negative_prompt: null,

  gpt_editorial_temperature: null,
  gpt_editorial_max_tokens: null,

  prompt_system: null,
  prompt_append_system: null,
  prompt_append_user: null,
};

function toNumOrNull(v: string): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function RuntimeConfigFlatEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<FlatRow>(DEFAULT_ROW);
  const [baseline, setBaseline] = useState<string>("");

  const [effectiveJson, setEffectiveJson] = useState<any>(null);
  const [effectiveMeta, setEffectiveMeta] = useState<{ updated_at?: string; updated_by?: string } | null>(null);
  const [effectiveLoading, setEffectiveLoading] = useState(false);

  const dirty = useMemo(() => {
    const cur = JSON.stringify(row);
    return baseline && cur !== baseline;
  }, [row, baseline]);

  const loadFlat = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(ADMIN_TABLE)
        .select("mg_value, mg_updated_at, mg_meta")
        .eq("mg_record_type", FLAT_RECORD_TYPE)
        .eq("mg_key", "singleton")
        .maybeSingle();

      if (error) throw new Error(error.message);

      const merged = { ...DEFAULT_ROW, ...((data?.mg_value as any) ?? { id: true }) } as FlatRow;
      setRow(merged);
      setBaseline(JSON.stringify(merged));
    } finally {
      setLoading(false);
    }
  };

  const loadEffective = async () => {
    setEffectiveLoading(true);
    try {
      const { data, error } = await supabase
        .from(ADMIN_TABLE)
        .select("mg_value, mg_updated_at, mg_meta")
        .eq("mg_record_type", EFFECTIVE_RECORD_TYPE)
        .eq("mg_key", "runtime")
        .maybeSingle();

      if (error) throw new Error(error.message);

      setEffectiveJson(data?.mg_value ?? null);
      setEffectiveMeta({ updated_at: data?.mg_updated_at, updated_by: (data?.mg_meta as any)?.updated_by });
    } finally {
      setEffectiveLoading(false);
    }
  };

  useEffect(() => {
    void loadFlat().then(loadEffective);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload: FlatRow = { ...row, id: true };

      const mgId = `${FLAT_RECORD_TYPE}:singleton`;
      const { error } = await supabase
        .from(ADMIN_TABLE)
        .upsert({
          mg_id: mgId,
          mg_record_type: FLAT_RECORD_TYPE,
          mg_key: "singleton",
          mg_value: payload,
          mg_meta: {},
          mg_updated_at: new Date().toISOString(),
        } as any, { onConflict: "mg_id" });

      if (error) throw new Error(error.message);

      const effectiveId = `${EFFECTIVE_RECORD_TYPE}:runtime`;
      const { error: effErr } = await supabase
        .from(ADMIN_TABLE)
        .upsert({
          mg_id: effectiveId,
          mg_record_type: EFFECTIVE_RECORD_TYPE,
          mg_key: "runtime",
          mg_value: payload,
          mg_meta: {},
          mg_updated_at: new Date().toISOString(),
        } as any, { onConflict: "mg_id" });

      if (effErr) throw new Error(effErr.message);

      setBaseline(JSON.stringify(payload));
      await loadEffective();
      alert("Runtime flat config saved ✅ (app_config.runtime updated)");
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="admin-muted">Loading flat runtime config…</div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="admin-inline" style={{ alignItems: "center" }}>
        <button className="admin-button" type="button" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? "Saving…" : dirty ? "Save flat runtime" : "Saved"}
        </button>

        <button className="admin-button ghost" type="button" onClick={() => void loadFlat()} disabled={saving}>
          Reload
        </button>

        <button className="admin-button ghost" type="button" onClick={() => void loadEffective()} disabled={effectiveLoading}>
          {effectiveLoading ? "Refreshing…" : "Refresh effective JSON"}
        </button>

        {dirty && <span className="admin-muted">Unsaved changes.</span>}
      </div>

      {/* MODELS */}
      <div className="admin-card">
        <div className="admin-card-title">Models</div>
        <div className="admin-inline">
          <label>
            <strong>Seedream model</strong>
            <input
              value={row.models_seadream ?? ""}
              onChange={(e) => setRow((r) => ({ ...r, models_seadream: e.target.value || null }))}
              placeholder="e.g. seedream-v3"
            />
          </label>

          <label>
            <strong>Kling model</strong>
            <input
              value={row.models_kling ?? ""}
              onChange={(e) => setRow((r) => ({ ...r, models_kling: e.target.value || null }))}
              placeholder="e.g. kling-1.6"
            />
          </label>
        </div>
      </div>

      {/* CREDITS */}
      <div className="admin-card">
        <div className="admin-card-title">Credits (runtime)</div>
        <div className="admin-inline">
          <label>
            <strong>Image cost</strong>
            <input
              type="number"
              value={row.credits_image_cost ?? ""}
              onChange={(e) => setRow((r) => ({ ...r, credits_image_cost: toNumOrNull(e.target.value) }))}
              placeholder="e.g. 4"
            />
          </label>

          <label>
            <strong>Motion cost</strong>
            <input
              type="number"
              value={row.credits_motion_cost ?? ""}
              onChange={(e) => setRow((r) => ({ ...r, credits_motion_cost: toNumOrNull(e.target.value) }))}
              placeholder="e.g. 30"
            />
          </label>
        </div>

        <div className="admin-muted" style={{ marginTop: 8 }}>
          Note: Your backend must **use runtime cfg** when charging. If an endpoint still returns hardcoded consts, it won’t reflect changes.
        </div>
      </div>

      {/* KLING */}
      <div className="admin-card">
        <div className="admin-card-title">Kling (Replicate params)</div>
        <div className="admin-inline">
          <label>
            <strong>Mode</strong>
            <input
              value={row.kling_mode ?? ""}
              onChange={(e) => setRow((r) => ({ ...r, kling_mode: e.target.value || null }))}
              placeholder="e.g. standard / pro"
            />
          </label>
        </div>

        <label>
          <strong>Negative prompt</strong>
          <textarea
            className="admin-textarea"
            value={row.kling_negative_prompt ?? ""}
            onChange={(e) => setRow((r) => ({ ...r, kling_negative_prompt: e.target.value || null }))}
            placeholder="What you want the model to avoid…"
          />
        </label>
      </div>

      {/* GPT */}
      <div className="admin-card">
        <div className="admin-card-title">GPT Editorial</div>
        <div className="admin-inline">
          <label>
            <strong>Temperature</strong>
            <input
              type="number"
              step="0.1"
              value={row.gpt_editorial_temperature ?? ""}
              onChange={(e) => setRow((r) => ({ ...r, gpt_editorial_temperature: toNumOrNull(e.target.value) }))}
              placeholder="e.g. 0.7"
            />
          </label>

          <label>
            <strong>Max tokens</strong>
            <input
              type="number"
              value={row.gpt_editorial_max_tokens ?? ""}
              onChange={(e) => setRow((r) => ({ ...r, gpt_editorial_max_tokens: toNumOrNull(e.target.value) }))}
              placeholder="e.g. 900"
            />
          </label>
        </div>
      </div>

      {/* PROMPTS */}
      <div className="admin-card">
        <div className="admin-card-title">Prompts</div>

        <label>
          <strong>System prompt override</strong>
          <textarea
            className="admin-textarea"
            value={row.prompt_system ?? ""}
            onChange={(e) => setRow((r) => ({ ...r, prompt_system: e.target.value || null }))}
            placeholder="If empty -> backend default stays"
          />
        </label>

        <label>
          <strong>Append to system (after default)</strong>
          <textarea
            className="admin-textarea"
            value={row.prompt_append_system ?? ""}
            onChange={(e) => setRow((r) => ({ ...r, prompt_append_system: e.target.value || null }))}
          />
        </label>

        <label>
          <strong>Append to user message</strong>
          <textarea
            className="admin-textarea"
            value={row.prompt_append_user ?? ""}
            onChange={(e) => setRow((r) => ({ ...r, prompt_append_user: e.target.value || null }))}
          />
        </label>
      </div>

      {/* EFFECTIVE JSON */}
      <div className="admin-card">
        <div className="admin-card-title">Effective runtime JSON (app_config.key='runtime')</div>
        <div className="admin-muted" style={{ marginBottom: 8 }}>
          {effectiveMeta?.updated_at ? `updated_at: ${effectiveMeta.updated_at}` : ""}
          {effectiveMeta?.updated_by ? ` • updated_by: ${effectiveMeta.updated_by}` : ""}
        </div>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
          {JSON.stringify(effectiveJson ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";

type SchemaField = {
  path: string;
  type: "string" | "number" | "boolean";
  description: string;
};

type RuntimeConfigResponse = {
  ok: boolean;
  defaults: any;
  override: any;
  effective: any;
  meta: { updatedAt: string | null; updatedBy: string | null; ttlMs: number };
  schema: SchemaField[];
};

function getDeep(obj: any, path: string) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function hasOverride(overrideObj: any, path: string) {
  const v = getDeep(overrideObj, path);
  return v !== undefined;
}

function groupName(path: string) {
  if (path.startsWith("models.")) return "Models";
  if (path.startsWith("credits.")) return "Credits";
  if (path.startsWith("replicate.seadream.")) return "Replicate: SeaDream";
  if (path.startsWith("replicate.kling.")) return "Replicate: Kling";
  if (path.startsWith("gpt.editorial.")) return "GPT: Editorial";
  if (path.startsWith("gpt.motion_prompt.")) return "GPT: Motion Prompt";
  if (path.startsWith("gpt.motion_suggest.")) return "GPT: Motion Suggest";
  return "Other";
}

function isLongText(path: string) {
  return path.endsWith("system_text") || path.endsWith("user_extra") || path.endsWith("negative_prompt");
}

export default function RuntimeConfigEditor({
  apiBase = "",
}: {
  apiBase?: string; // pass your API base if needed, otherwise leave ""
}) {
  const [loading, setLoading] = useState(true);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<RuntimeConfigResponse | null>(null);

  // local editable values (by path)
  const [draft, setDraft] = useState<Record<string, any>>({});

  const endpoint = (p: string) => `${apiBase}${p}`;

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(endpoint("/admin/config/runtime"), {
        method: "GET",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
      const j = (await r.json()) as RuntimeConfigResponse;
      if (!j.ok) throw new Error(j as any);
      setData(j);

      // init draft with effective values so you SEE the hardcoded defaults
      const nextDraft: Record<string, any> = {};
      for (const f of j.schema || []) {
        nextDraft[f.path] = getDeep(j.effective, f.path);
      }
      setDraft(nextDraft);
    } catch (e: any) {
      setErr(e?.message || "Failed to load runtime config");
    } finally {
      setLoading(false);
    }
  }

  async function setField(path: string, value: any) {
    setSavingPath(path);
    setErr(null);
    try {
      const r = await fetch(endpoint("/admin/config/runtime/set"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, value }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j?.message || "Save failed");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSavingPath(null);
    }
  }

  async function unsetField(path: string) {
    setSavingPath(path);
    setErr(null);
    try {
      const r = await fetch(endpoint("/admin/config/runtime/unset"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j?.message || "Reset failed");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Reset failed");
    } finally {
      setSavingPath(null);
    }
  }

  async function reloadServerCache() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(endpoint("/admin/config/runtime/reload"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j?.message || "Reload failed");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Reload failed");
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  const grouped = useMemo(() => {
    const fields = data?.schema || [];
    const map = new Map<string, SchemaField[]>();
    for (const f of fields) {
      const g = groupName(f.path);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(f);
    }
    // stable ordering inside groups
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.path.localeCompare(b.path));
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>AI Runtime Config</div>
        <div>Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>AI Runtime Config</div>
        <div style={{ color: "crimson", marginBottom: 8 }}>{err}</div>
        <button onClick={load}>Retry</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>AI Runtime Config</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Updated: {data.meta?.updatedAt || "—"} {data.meta?.updatedBy ? `by ${data.meta.updatedBy}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load}>Refresh</button>
          <button onClick={reloadServerCache}>Reload Server Cache</button>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
        You can edit these values here. Changes apply live (server reads config from Supabase).
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
        {grouped.map(([group, fields]) => (
          <div key={group} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>{group}</div>

            <div style={{ display: "grid", gap: 12 }}>
              {fields.map((f) => {
                const effectiveVal = getDeep(data.effective, f.path);
                const defaultVal = getDeep(data.defaults, f.path);
                const overridden = hasOverride(data.override, f.path);

                const val = draft[f.path];

                const busy = savingPath === f.path;

                return (
                  <div key={f.path} style={{ padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <div style={{ fontWeight: 700 }}>
                        {f.path}{" "}
                        {overridden ? <span style={{ fontSize: 12, color: "orange" }}>(overridden)</span> : null}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.65 }}>{f.type}</div>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>{f.description}</div>

                    <div style={{ marginTop: 10 }}>
                      {f.type === "boolean" ? (
                        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={Boolean(val)}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.checked }))}
                          />
                          <span>Enabled</span>
                        </label>
                      ) : isLongText(f.path) ? (
                        <textarea
                          value={val ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.path]: e.target.value }))}
                          rows={f.path.endsWith("system_text") ? 8 : 3}
                          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                        />
                      ) : (
                        <input
                          type={f.type === "number" ? "number" : "text"}
                          value={val ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const next = f.type === "number" ? (raw === "" ? "" : Number(raw)) : raw;
                            setDraft((d) => ({ ...d, [f.path]: next }));
                          }}
                          style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                        />
                      )}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        disabled={busy}
                        onClick={() => setField(f.path, draft[f.path])}
                        style={{ fontWeight: 700 }}
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>

                      <button disabled={busy} onClick={() => unsetField(f.path)}>
                        Reset to default
                      </button>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                      <div>Effective now: <b>{String(effectiveVal ?? "")}</b></div>
                      <div>Default: <span>{String(defaultVal ?? "")}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

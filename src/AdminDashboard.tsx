// src/AdminDashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { isAdmin } from "./lib/adminConfig"; // ✅ if you want admin-only. Remove if not needed.

/**
 * Mina Admin — CONFIG ONLY (Full Screen)
 * Reads/Writes: public.app_config where key='runtime' and value is jsonb.
 *
 * What you get:
 * - Fullscreen config editor
 * - Each param is a row (auto-detected types)
 * - Add/remove params
 * - JSON objects editable in a textarea
 * - Autosave (debounced)
 * - Realtime sync (postgres_changes) when Supabase row changes
 *
 * IMPORTANT:
 * - In Supabase, click "Enable Realtime" for app_config table (or enable in Database → Replication).
 * - If RLS is enabled, your admin must have SELECT/UPDATE on app_config.
 */

const TABLE = "app_config";
const CONFIG_KEY = "runtime";

// Optional: "Pinned" keys shown at top (nice UX). You can rename/add keys freely.
// These are just SUGGESTIONS: if a key doesn't exist in DB, it will appear empty until you type.
const PINNED_KEYS: Array<{
  key: string;
  label: string;
  hint?: string;
}> = [
  { key: "ai_default_provider", label: "AI: Default provider", hint: "ex: openai / anthropic / replicate" },
  { key: "ai_default_model", label: "AI: Default model", hint: "ex: gpt-4.1-mini / claude-3.5-sonnet" },
  { key: "ai_temperature", label: "AI: Temperature", hint: "number (0-2)" },
  { key: "ai_top_p", label: "AI: top_p", hint: "number (0-1)" },
  { key: "ai_max_tokens", label: "AI: Max tokens", hint: "number" },
  { key: "ai_context", label: "AI: System context", hint: "system prompt / context" },

  { key: "seedream_model", label: "Image: Seedream model", hint: "replicate model id or alias" },
  { key: "seedream_params", label: "Image: Seedream params", hint: "JSON object" },

  { key: "kling_model", label: "Video: Kling model", hint: "model id or alias" },
  { key: "kling_params", label: "Video: Kling params", hint: "JSON object" },

  { key: "pricing_image_cost", label: "Pricing: Image cost", hint: "credits" },
  { key: "pricing_motion_cost", label: "Pricing: Motion cost", hint: "credits" },
];

type AppConfigRow = {
  key: string;
  value: any; // jsonb
  updated_at?: string | null;
  updated_by?: string | null;
};

function safeJsonString(v: any) {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v);
  }
}

function inferKind(v: any): "boolean" | "number" | "text" | "textarea" | "json" {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number" && Number.isFinite(v)) return "number";
  if (v && typeof v === "object") return "json";
  if (typeof v === "string") {
    if (v.length > 90 || v.includes("\n")) return "textarea";
    return "text";
  }
  return "text";
}

function truncateMiddle(s: string, max = 28) {
  if (!s) return s;
  if (s.length <= max) return s;
  const head = Math.ceil((max - 3) / 2);
  const tail = Math.floor((max - 3) / 2);
  return `${s.slice(0, head)}...${s.slice(s.length - tail)}`;
}

function FullscreenShell({ children }: React.PropsWithChildren) {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "#0b0b0e",
        color: "white",
        padding: 18,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

function Card({ children }: React.PropsWithChildren) {
  return (
    <div
      style={{
        background: "#121218",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      {children}
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  kind = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "default" | "ghost" | "danger";
}) {
  const base: React.CSSProperties = {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "#1a1a24",
    color: "white",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontWeight: 700,
  };
  if (kind === "ghost") {
    base.background = "transparent";
  }
  if (kind === "danger") {
    base.background = "#2a1313";
    base.border = "1px solid rgba(255,80,80,0.35)";
  }
  return (
    <button style={base} onClick={disabled ? undefined : onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** If you DON'T want admin-only guard:
 *  - delete useAdminGuard() and just return true.
 *  - remove import { isAdmin }.
 */
function useAdminGuard() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const email = data.user?.email?.toLowerCase() || "";
        if (!email) {
          window.location.replace("/profile");
          return;
        }
        const ok = await isAdmin();
        if (!mounted) return;
        setAllowed(ok);
        if (!ok) window.location.replace("/");
      } catch {
        if (mounted) setAllowed(false);
        window.location.replace("/");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return allowed;
}

export default function AdminDashboard() {
  const allowed = useAdminGuard();

  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<AppConfigRow | null>(null);

  // draft value (what user edits)
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [filter, setFilter] = useState("");

  // json text drafts for object fields (so typing doesn't break parsing)
  const [jsonText, setJsonText] = useState<Record<string, string>>({});

  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState<string>("");

  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const load = async () => {
    setLoading(true);
    setStatus("idle");
    setStatusMsg("");

    try {
      const { data, error } = await supabase.from(TABLE).select("*").eq("key", CONFIG_KEY).limit(1);
      if (error) throw new Error(error.message);

      let r = (data?.[0] as AppConfigRow) || null;

      // If missing, create it
      if (!r) {
        const { data: created, error: insErr } = await supabase
          .from(TABLE)
          .insert({ key: CONFIG_KEY, value: {} })
          .select("*")
          .single();
        if (insErr) throw new Error(insErr.message);
        r = created as AppConfigRow;
      }

      setRow(r);
      const nextValue = (r.value && typeof r.value === "object") ? r.value : {};
      setDraft(nextValue);
      setDirty(false);
      setJsonText({});
      setStatus("idle");
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(e?.message ?? "Failed to load config");
    } finally {
      setLoading(false);
    }
  };

  const save = async (nextValue: Record<string, any>) => {
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }

    savingRef.current = true;
    setStatus("saving");
    setStatusMsg("Saving…");

    try {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email ?? null;

      const payload: any = {
        key: CONFIG_KEY,
        value: nextValue,
      };

      // Only set updated_by if you actually want to track it
      if (email) payload.updated_by = email;

      const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: "key" });

      if (error) throw new Error(error.message);

      setStatus("saved");
      setStatusMsg("Saved ✅");
      setDirty(false);

      // after a short while, go back to idle
      setTimeout(() => {
        setStatus((s) => (s === "saved" ? "idle" : s));
        setStatusMsg((m) => (m === "Saved ✅" ? "" : m));
      }, 900);
    } catch (e: any) {
      setStatus("error");
      setStatusMsg(e?.message ?? "Save failed");
    } finally {
      savingRef.current = false;

      if (queuedRef.current) {
        queuedRef.current = false;
        // if user changed again while saving, save latest
        if (dirtyRef.current) {
          void save(draft);
        }
      }
    }
  };

  // Initial load
  useEffect(() => {
    if (allowed !== true) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  // Realtime subscription
  useEffect(() => {
    if (allowed !== true) return;

    const channel = supabase
      .channel(`realtime:${TABLE}:${CONFIG_KEY}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `key=eq.${CONFIG_KEY}` },
        (payload) => {
          const nextRow = (payload.new || null) as any;
          if (!nextRow) return;

          const nextValue = (nextRow.value && typeof nextRow.value === "object") ? nextRow.value : {};

          setRow((prev) => ({
            ...(prev || { key: CONFIG_KEY, value: {} }),
            ...nextRow,
          }));

          // Only overwrite editor if user is not currently editing unsaved changes
          if (!dirtyRef.current) {
            setDraft(nextValue);
            setJsonText({});
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [allowed]);

  // Autosave debounce
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      void save(draft);
    }, 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draft]);

  const allKeys = useMemo(() => {
    const keys = Object.keys(draft || {});
    keys.sort((a, b) => a.localeCompare(b));
    return keys;
  }, [draft]);

  const pinnedSet = useMemo(() => new Set(PINNED_KEYS.map((x) => x.key)), []);
  const otherKeys = useMemo(() => allKeys.filter((k) => !pinnedSet.has(k)), [allKeys, pinnedSet]);

  const visibleOtherKeys = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return otherKeys;
    return otherKeys.filter((k) => k.toLowerCase().includes(f));
  }, [filter, otherKeys]);

  const setValue = (k: string, v: any) => {
    setDraft((prev) => ({ ...(prev || {}), [k]: v }));
    setDirty(true);
    setStatus("idle");
    setStatusMsg("");
  };

  const removeKey = (k: string) => {
    setDraft((prev) => {
      const copy = { ...(prev || {}) };
      delete copy[k];
      return copy;
    });
    setJsonText((prev) => {
      const copy = { ...(prev || {}) };
      delete copy[k];
      return copy;
    });
    setDirty(true);
    setStatus("idle");
    setStatusMsg("");
  };

  const statusBadge = (() => {
    if (loading) return "⏳ Loading…";
    if (status === "saving") return "💾 Saving…";
    if (status === "saved") return "✅ Saved";
    if (status === "error") return `🔴 ${statusMsg || "Error"}`;
    return dirty ? "🟡 Unsaved edits" : "🟢 Live";
  })();

  if (allowed === null) {
    return (
      <FullscreenShell>
        <div style={{ padding: 16 }}>Loading admin…</div>
      </FullscreenShell>
    );
  }
  if (allowed === false) return null;

  return (
    <FullscreenShell>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Mina Admin — Config</div>
          <div style={{ opacity: 0.8, fontSize: 13 }}>
            Editing <strong>public.{TABLE}</strong> where <strong>key = "{CONFIG_KEY}"</strong> (jsonb). Changes autosave + realtime.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              padding: "8px 10px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.10)",
              maxWidth: 320,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={statusMsg}
          >
            {statusBadge}
          </div>

          <Button kind="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>

          <Button
            kind="ghost"
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(draft ?? {}, null, 2))}
            disabled={loading}
          >
            Copy JSON
          </Button>

          <Button
            kind="danger"
            onClick={() => {
              if (!window.confirm("Reset editor to DB value? Unsaved edits will be lost.")) return;
              const nextValue = (row?.value && typeof row.value === "object") ? row.value : {};
              setDraft(nextValue);
              setJsonText({});
              setDirty(false);
              setStatus("idle");
              setStatusMsg("");
            }}
            disabled={loading}
          >
            Reset
          </Button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.25fr 0.75fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>Pinned (important)</div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>
              updated_at: {row?.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {PINNED_KEYS.map((p) => {
              const v = draft?.[p.key];
              const kind = inferKind(v);

              // JSON editor drafts
              const jsonDraft = jsonText[p.key] ?? (kind === "json" ? safeJsonString(v) : "");

              return (
                <div
                  key={p.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "260px 1fr 120px",
                    gap: 10,
                    alignItems: "start",
                    padding: 10,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontWeight: 900 }}>{p.label}</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      <span style={{ opacity: 0.9 }}>key:</span> <code style={{ opacity: 0.9 }}>{p.key}</code>
                    </div>
                    {p.hint && <div style={{ opacity: 0.7, fontSize: 12 }}>{p.hint}</div>}
                  </div>

                  <div>
                    {kind === "boolean" ? (
                      <label style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 6 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(v)}
                          onChange={(e) => setValue(p.key, e.target.checked)}
                        />
                        <span style={{ opacity: 0.9 }}>{Boolean(v) ? "true" : "false"}</span>
                      </label>
                    ) : kind === "number" ? (
                      <input
                        style={inputStyle}
                        type="number"
                        value={Number.isFinite(v) ? v : (v ?? "")}
                        onChange={(e) => {
                          const n = e.target.value === "" ? null : Number(e.target.value);
                          setValue(p.key, Number.isFinite(n as any) ? n : null);
                        }}
                        placeholder="number"
                      />
                    ) : kind === "textarea" ? (
                      <textarea
                        style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                        value={typeof v === "string" ? v : (v ?? "")}
                        onChange={(e) => setValue(p.key, e.target.value)}
                        placeholder="text…"
                      />
                    ) : kind === "json" ? (
                      <textarea
                        style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
                        value={jsonDraft}
                        onChange={(e) => {
                          const t = e.target.value;
                          setJsonText((prev) => ({ ...(prev || {}), [p.key]: t }));
                          setDirty(true);
                          setStatus("idle");
                          setStatusMsg("");
                        }}
                        onBlur={() => {
                          const t = (jsonText[p.key] ?? safeJsonString(v)).trim();
                          if (!t) {
                            setValue(p.key, {});
                            setJsonText((prev) => {
                              const copy = { ...(prev || {}) };
                              delete copy[p.key];
                              return copy;
                            });
                            return;
                          }
                          try {
                            const parsed = JSON.parse(t);
                            setValue(p.key, parsed);
                            setJsonText((prev) => {
                              const copy = { ...(prev || {}) };
                              delete copy[p.key];
                              return copy;
                            });
                          } catch (err: any) {
                            setStatus("error");
                            setStatusMsg(`JSON error in "${p.key}": ${err?.message ?? "invalid json"}`);
                          }
                        }}
                        placeholder='JSON… e.g. { "steps": 30, "cfg": 7 }'
                      />
                    ) : (
                      <input
                        style={inputStyle}
                        value={typeof v === "string" ? v : (v ?? "")}
                        onChange={(e) => setValue(p.key, e.target.value)}
                        placeholder="text"
                      />
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Button kind="danger" onClick={() => removeKey(p.key)} disabled={loading}>
                      Delete
                    </Button>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>
                      type: <strong>{kind}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 900 }}>Other params</div>
            <input
              style={{ ...inputStyle, maxWidth: 320 }}
              placeholder="Filter keys…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {visibleOtherKeys.length === 0 ? (
              <div style={{ opacity: 0.7, padding: 10 }}>No other keys.</div>
            ) : (
              visibleOtherKeys.map((k) => {
                const v = draft?.[k];
                const kind = inferKind(v);
                const jsonDraft = jsonText[k] ?? (kind === "json" ? safeJsonString(v) : "");

                return (
                  <div
                    key={k}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "260px 1fr 120px",
                      gap: 10,
                      alignItems: "start",
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontWeight: 900 }} title={k}>
                        {truncateMiddle(k, 30)}
                      </div>
                      <div style={{ opacity: 0.7, fontSize: 12 }}>
                        key: <code>{k}</code>
                      </div>
                    </div>

                    <div>
                      {kind === "boolean" ? (
                        <label style={{ display: "flex", gap: 10, alignItems: "center", paddingTop: 6 }}>
                          <input
                            type="checkbox"
                            checked={Boolean(v)}
                            onChange={(e) => setValue(k, e.target.checked)}
                          />
                          <span style={{ opacity: 0.9 }}>{Boolean(v) ? "true" : "false"}</span>
                        </label>
                      ) : kind === "number" ? (
                        <input
                          style={inputStyle}
                          type="number"
                          value={Number.isFinite(v) ? v : (v ?? "")}
                          onChange={(e) => {
                            const n = e.target.value === "" ? null : Number(e.target.value);
                            setValue(k, Number.isFinite(n as any) ? n : null);
                          }}
                          placeholder="number"
                        />
                      ) : kind === "textarea" ? (
                        <textarea
                          style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                          value={typeof v === "string" ? v : (v ?? "")}
                          onChange={(e) => setValue(k, e.target.value)}
                          placeholder="text…"
                        />
                      ) : kind === "json" ? (
                        <textarea
                          style={{ ...inputStyle, minHeight: 120, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
                          value={jsonDraft}
                          onChange={(e) => {
                            const t = e.target.value;
                            setJsonText((prev) => ({ ...(prev || {}), [k]: t }));
                            setDirty(true);
                            setStatus("idle");
                            setStatusMsg("");
                          }}
                          onBlur={() => {
                            const t = (jsonText[k] ?? safeJsonString(v)).trim();
                            if (!t) {
                              setValue(k, {});
                              setJsonText((prev) => {
                                const copy = { ...(prev || {}) };
                                delete copy[k];
                                return copy;
                              });
                              return;
                            }
                            try {
                              const parsed = JSON.parse(t);
                              setValue(k, parsed);
                              setJsonText((prev) => {
                                const copy = { ...(prev || {}) };
                                delete copy[k];
                                return copy;
                              });
                            } catch (err: any) {
                              setStatus("error");
                              setStatusMsg(`JSON error in "${k}": ${err?.message ?? "invalid json"}`);
                            }
                          }}
                          placeholder='JSON… e.g. { "steps": 30 }'
                        />
                      ) : (
                        <input
                          style={inputStyle}
                          value={typeof v === "string" ? v : (v ?? "")}
                          onChange={(e) => setValue(k, e.target.value)}
                          placeholder="text"
                        />
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <Button kind="danger" onClick={() => removeKey(k)} disabled={loading}>
                        Delete
                      </Button>
                      <div style={{ opacity: 0.7, fontSize: 12 }}>
                        type: <strong>{kind}</strong>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <AddKeyRow
            onAdd={(k, v) => {
              if (!k.trim()) return;
              setValue(k.trim(), v);
            }}
          />

          <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
            ⚠️ If your server still uses hardcoded <code>const</code> values, DB edits won’t change behavior.
            Your server must read <code>app_config.runtime</code> at runtime.
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10 }}>Live JSON Preview</div>
          <pre
            style={{
              background: "#0b0b0e",
              borderRadius: 14,
              padding: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "70vh",
              overflow: "auto",
              fontSize: 12.5,
            }}
          >
            {safeJsonString(draft ?? {})}
          </pre>

          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
            Realtime updates work only if you enabled Realtime for <strong>{TABLE}</strong>.
          </div>
        </Card>
      </div>
    </FullscreenShell>
  );
}

function AddKeyRow({ onAdd }: { onAdd: (k: string, v: any) => void }) {
  const [k, setK] = useState("");
  const [type, setType] = useState<"text" | "number" | "boolean" | "json">("text");
  const [raw, setRaw] = useState("");

  const parseValue = () => {
    if (type === "boolean") return raw.trim().toLowerCase() === "true";
    if (type === "number") return raw.trim() === "" ? null : Number(raw);
    if (type === "json") {
      const t = raw.trim();
      if (!t) return {};
      return JSON.parse(t);
    }
    return raw;
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 8 }}>Add new param</div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 140px 1fr 120px", gap: 10, alignItems: "center" }}>
        <input style={inputStyle} placeholder="key name" value={k} onChange={(e) => setK(e.target.value)} />

        <select
          style={inputStyle}
          value={type}
          onChange={(e) => setType(e.target.value as any)}
        >
          <option value="text">text</option>
          <option value="number">number</option>
          <option value="boolean">boolean</option>
          <option value="json">json</option>
        </select>

        {type === "json" ? (
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            placeholder='JSON… e.g. { "steps": 30 }'
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        ) : (
          <input
            style={inputStyle}
            placeholder={type === "boolean" ? "true / false" : "value"}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        )}

        <button
          style={{
            borderRadius: 12,
            padding: "10px 12px",
            border: "1px solid rgba(255,255,255,0.14)",
            background: "#2a2a3b",
            color: "white",
            cursor: "pointer",
            fontWeight: 900,
          }}
          onClick={() => {
            try {
              const v = parseValue();
              onAdd(k, v);
              setK("");
              setRaw("");
              setType("text");
            } catch (e: any) {
              alert(e?.message ?? "Invalid value");
            }
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 12,
  padding: "10px 12px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#0b0b0e",
  color: "white",
  outline: "none",
};

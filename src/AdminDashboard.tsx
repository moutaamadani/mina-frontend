import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import RuntimeConfigEditor from "./components/RuntimeConfigEditor";
import {
  AdminConfig,
  AdminStyleAsset,
  isAdmin,
  upsertAdminSecret,
  useAdminConfigState,
} from "./lib/adminConfig";
import "./admin.css";

/**
 * What this dashboard does:
 * - Config: stored in mina_admin_config + mina_admin_secrets (same as before)
 * - Live data: reads from Supabase tables:
 *   - customers
 *   - generations
 *   - credit_transactions
 *   - sessions
 *   - feedback
 *
 * IMPORTANT SECURITY:
 * - If RLS is enabled, your admin user must have policies allowing select/update.
 * - Do NOT put Supabase service_role key in frontend.
 */

type TabKey =
  | "runtime"
  | "ai"
  | "pricing"
  | "styles"
  | "assets"
  | "architecture"
  | "customers"
  | "generations"
  | "transactions"
  | "sessions"
  | "feedback"
  | "logs";


const TAB_LABELS: Record<TabKey, string> = {
  runtime: "Runtime Config",
  ai: "AI Settings",
  pricing: "Credits & Pricing",
  styles: "Styles",
  assets:  "Assets",
  architecture: "Architecture",
  customers: "Customers",
  generations: "Generations",
  transactions: "Credit Transactions",
  sessions: "Sessions",
  feedback: "Feedback",
  logs: "Logs",
};

function AdminHeader({
  onSave,
  rightStatus,
}: {
  onSave: () => Promise<void>;
  rightStatus?: React.ReactNode;
}) {
  return (
    <header className="admin-header">
      <div>
        <div className="admin-title">Mina Admin</div>
        <div className="admin-subtitle">Editorial dashboard (Supabase live data)</div>
      </div>
      <div className="admin-actions">
        {rightStatus}
        <button className="admin-button" onClick={() => void onSave()}>
          Save
        </button>
      </div>
    </header>
  );
}

function Section({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description?: string }>) {
  return (
    <section className="admin-section">
      <header>
        <div className="admin-section-title">{title}</div>
        {description && <p className="admin-section-desc">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Table({ headers, children }: React.PropsWithChildren<{ headers: string[] }>) {
  return (
    <div className="admin-table">
      <div className="admin-table-head">
        {headers.map((h) => (
          <div key={h}>{h}</div>
        ))}
      </div>
      <div className="admin-table-body">{children}</div>
    </div>
  );
}

function StickyTabs({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <nav className="admin-tabs">
      {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
        <button
          key={key}
          className={`admin-tab ${active === key ? "active" : ""}`}
          onClick={() => onChange(key)}
        >
          {TAB_LABELS[key]}
        </button>
      ))}
    </nav>
  );
}

function useAdminGuard() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
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
    };

    void check();
    return () => {
      mounted = false;
    };
  }, []);

  return allowed;
}

/* -----------------------------
   Helpers
------------------------------ */

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function pickFirstKey(row: any, keys: string[]) {
  for (const k of keys) {
    if (row && Object.prototype.hasOwnProperty.call(row, k)) return k;
  }
  return null;
}

function pickString(row: any, keys: string[], fallback = ""): string {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback;
}

function pickNumber(row: any, keys: string[], fallback = 0): number {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return fallback;
}

function formatMoneyMaybeCents(amount: number, currency = "usd") {
  if (!Number.isFinite(amount)) return "—";
  // heuristics: if it's very large assume cents
  const isCents = Math.abs(amount) >= 1000 && Math.abs(amount) % 1 === 0;
  const value = isCents ? amount / 100 : amount;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj ?? {}, null, 2);
  } catch {
    return String(obj);
  }
}

function extractLikelyImageUrl(row: any): string | null {
  const keys = Object.keys(row || {});
  const urlKey =
    keys.find((k) => /^(url|image_url|output_url|result_url|asset_url)$/i.test(k)) ||
    keys.find((k) => /(url|image|output|result)/i.test(k) && typeof row?.[k] === "string");
  const val = urlKey ? row?.[urlKey] : null;
  return typeof val === "string" && val.startsWith("http") ? val : null;
}

function highlightTraceFields(row: any) {
  const keys = Object.keys(row || {});
  const candidates = [
    // GPT / LLM
    "gpt_input",
    "gpt_prompt",
    "llm_input",
    "llm_prompt",
    "system_prompt",
    "messages",
    "gpt_output",
    "llm_output",
    "caption",
    "text_output",
    // seedream / image gen
    "seedream_prompt",
    "image_prompt",
    "seedream_input",
    "seedream_output",
    "image_url",
    "output_url",
    "url",
    // generic params
    "params",
    "meta",
    "metadata",
    "trace",
    "debug",
  ];

  const present = candidates
    .map((k) => {
      const hit = keys.find((kk) => kk.toLowerCase() === k.toLowerCase());
      return hit || null;
    })
    .filter(Boolean) as string[];

  // Also add any key containing these substrings
  for (const k of keys) {
    if (/gpt|llm|seedream|prompt|output|trace|debug/i.test(k) && !present.includes(k)) {
      present.push(k);
    }
  }

  return present.slice(0, 18);
}

/* -----------------------------
   Config Tabs (same idea as before)
------------------------------ */

function EditableKeyValue({
  params,
  onChange,
}: {
  params: { key: string; value: string }[];
  onChange: (next: { key: string; value: string }[]) => void;
}) {
  return (
    <div className="admin-kv-list">
      {params.map((row, idx) => (
        <div className="admin-kv-row" key={`${row.key}-${idx}`}>
          <input
            value={row.key}
            onChange={(e) => {
              const next = [...params];
              next[idx] = { ...row, key: e.target.value };
              onChange(next);
            }}
            placeholder="key"
          />
          <input
            value={row.value}
            onChange={(e) => {
              const next = [...params];
              next[idx] = { ...row, value: e.target.value };
              onChange(next);
            }}
            placeholder="value"
          />
          <button
            className="admin-button ghost"
            type="button"
            onClick={() => onChange(params.filter((_, i) => i !== idx))}
          >
            Remove
          </button>
        </div>
      ))}
      <button className="admin-button ghost" type="button" onClick={() => onChange([...params, { key: "", value: "" }])}>
        Add param
      </button>
    </div>
  );
}

function AISettingsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  const ai = config.ai;

  return (
    <div className="admin-grid">
      <Section title="Providers" description="Keys stored in Supabase (mina_admin_secrets).">
        <Table headers={["Provider", "Model", "Key", "Actions"]}>
          {ai.providerKeys.map((row, idx) => (
            <div className="admin-table-row" key={`${row.provider}-${idx}`}>
              <div>
                <input
                  value={row.provider}
                  onChange={(e) => {
                    const next = [...ai.providerKeys];
                    next[idx] = { ...row, provider: e.target.value };
                    setConfig({ ...config, ai: { ...ai, providerKeys: next } });
                  }}
                />
              </div>

              <div>
                <input
                  value={ai.defaultModel}
                  onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultModel: e.target.value } })}
                  placeholder="model"
                />
              </div>

              <div className="admin-masked">{row.masked ? row.masked : <span className="admin-muted">not set</span>}</div>

              <div className="admin-row-actions">
                <button
                  className="admin-button ghost"
                  type="button"
                  onClick={() => {
                    const next = [...ai.providerKeys];
                    next.splice(idx, 1);
                    setConfig({ ...config, ai: { ...ai, providerKeys: next } });
                  }}
                >
                  Remove
                </button>

                <button
                  className="admin-button ghost"
                  type="button"
                  onClick={async () => {
                    const replacement = window.prompt(`Paste new secret for "${row.provider}"`);
                    if (replacement === null) return;

                    try {
                      const masked = await upsertAdminSecret(row.provider, replacement);
                      const next = [...ai.providerKeys];
                      next[idx] = { ...row, masked, secret: undefined };
                      setConfig({ ...config, ai: { ...ai, providerKeys: next } });
                      alert(`Saved secret for ${row.provider}: ${masked}`);
                    } catch (e: any) {
                      alert(e?.message ?? "Failed to save secret");
                    }
                  }}
                >
                  Replace
                </button>
              </div>
            </div>
          ))}
        </Table>

        <div className="admin-inline">
          <label>
            <strong>Default provider</strong>
            <input value={ai.defaultProvider} onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultProvider: e.target.value } })} />
          </label>
          <label>
            <strong>Default model</strong>
            <input value={ai.defaultModel} onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultModel: e.target.value } })} />
          </label>
          <label>
            <strong>Temperature</strong>
            <input type="number" step="0.1" value={ai.temperature} onChange={(e) => setConfig({ ...config, ai: { ...ai, temperature: parseFloat(e.target.value) || 0 } })} />
          </label>
          <label>
            <strong>top_p</strong>
            <input type="number" step="0.05" value={ai.topP} onChange={(e) => setConfig({ ...config, ai: { ...ai, topP: parseFloat(e.target.value) || 0 } })} />
          </label>
          <label>
            <strong>Max tokens</strong>
            <input type="number" value={ai.maxTokens} onChange={(e) => setConfig({ ...config, ai: { ...ai, maxTokens: Number(e.target.value) || 0 } })} />
          </label>
        </div>
      </Section>

      <Section title="Context" description="Overrides the baked system prompt across pipelines.">
        <textarea className="admin-textarea" value={ai.context} onChange={(e) => setConfig({ ...config, ai: { ...ai, context: e.target.value } })} />
      </Section>

      <Section title="Provider parameters" description="Expose low-level flags (e.g. seedream params)">
        <EditableKeyValue params={ai.providerParams} onChange={(next) => setConfig({ ...config, ai: { ...ai, providerParams: next } })} />
      </Section>

      <Section title="Future models" description="Drop replicate snippets for SVG/audio ahead of time.">
        <textarea className="admin-textarea" value={ai.futureReplicateNotes} onChange={(e) => setConfig({ ...config, ai: { ...ai, futureReplicateNotes: e.target.value } })} placeholder="Copy/paste replicate code blocks" />
      </Section>
    </div>
  );
}

function PricingTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  const pricing = config.pricing;
  return (
    <div className="admin-grid">
      <Section title="Credits" description="Free credits, expiry and unit cost">
        <div className="admin-inline">
          <label>
            <strong>Default free credits</strong>
            <input type="number" value={pricing.defaultCredits} onChange={(e) => setConfig({ ...config, pricing: { ...pricing, defaultCredits: Number(e.target.value) || 0 } })} />
          </label>
          <label>
            <strong>Expiration (days)</strong>
            <input type="number" value={pricing.expirationDays} onChange={(e) => setConfig({ ...config, pricing: { ...pricing, expirationDays: Number(e.target.value) || 0 } })} />
          </label>
          <label>
            <strong>Still cost</strong>
            <input type="number" value={pricing.imageCost} onChange={(e) => setConfig({ ...config, pricing: { ...pricing, imageCost: Number(e.target.value) || 0 } })} />
          </label>
          <label>
            <strong>Motion cost</strong>
            <input type="number" value={pricing.motionCost} onChange={(e) => setConfig({ ...config, pricing: { ...pricing, motionCost: Number(e.target.value) || 0 } })} />
          </label>
        </div>
      </Section>
    </div>
  );
}

function StylesTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  const [draftStyle, setDraftStyle] = useState<AdminStyleAsset>({
    id: String(Date.now()),
    name: "Untitled",
    images: [],
    trainingText: "",
    status: "draft",
  });

  const styles = config.styles;

  const updatePreset = (index: number, next: AdminStyleAsset) => {
    const presets = [...styles.presets];
    presets[index] = next;
    setConfig({ ...config, styles: { ...styles, presets } });
  };

  const handleUpload = (files: FileList | null, cb: (url: string) => void) => {
    if (!files?.length) return;
    const file = files[0];
    const maxSize = 3 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("File too large (max 3MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="admin-grid">
      <Section title="Predefined styles" description="Draft/publish presets shown to users.">
        <Table headers={["Name", "Training text", "Hero", "Images", "Status", "Actions"]}>
          {styles.presets.map((preset, idx) => (
            <div className="admin-table-row" key={preset.id}>
              <div>
                <input value={preset.name} onChange={(e) => updatePreset(idx, { ...preset, name: e.target.value })} />
              </div>
              <div>
                <textarea className="admin-textarea" value={preset.trainingText} onChange={(e) => updatePreset(idx, { ...preset, trainingText: e.target.value })} />
              </div>
              <div className="admin-thumb-col">
                {preset.heroImage ? <img src={preset.heroImage} alt="hero" /> : <span>—</span>}
                <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files, (url) => updatePreset(idx, { ...preset, heroImage: url }))} />
              </div>
              <div>
                <div className="admin-image-grid">
                  {preset.images.slice(0, 10).map((img, i) => (
                    <img key={`${preset.id}-${i}`} src={img} alt="style" />
                  ))}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) =>
                    handleUpload(e.target.files, (url) => {
                      const merged = [...preset.images, url].slice(-10);
                      updatePreset(idx, { ...preset, images: merged });
                    })
                  }
                />
              </div>
              <div>
                <select value={preset.status} onChange={(e) => updatePreset(idx, { ...preset, status: e.target.value as AdminStyleAsset["status"] })}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <div className="admin-row-actions">
                <button
                  className="admin-button ghost"
                  onClick={() => {
                    const presets = styles.presets.filter((_, i) => i !== idx);
                    setConfig({ ...config, styles: { ...styles, presets } });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </Table>

        <div className="admin-inline">
          <label>
            <strong>Movement keywords</strong>
            <input
              value={styles.movementKeywords.join(", ")}
              onChange={(e) =>
                setConfig({
                  ...config,
                  styles: {
                    ...styles,
                    movementKeywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  },
                })
              }
            />
          </label>
        </div>

        <div className="admin-card">
          <div className="admin-card-title">Add style</div>
          <div className="admin-inline">
            <label>
              <strong>Name</strong>
              <input value={draftStyle.name} onChange={(e) => setDraftStyle({ ...draftStyle, name: e.target.value })} />
            </label>
            <label>
              <strong>Status</strong>
              <select value={draftStyle.status} onChange={(e) => setDraftStyle({ ...draftStyle, status: e.target.value as AdminStyleAsset["status"] })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
          </div>

          <label>
            <strong>Training text</strong>
            <textarea className="admin-textarea" value={draftStyle.trainingText} onChange={(e) => setDraftStyle({ ...draftStyle, trainingText: e.target.value })} />
          </label>

          <div className="admin-inline">
            <div>
              <strong>Hero image</strong>
              <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files, (url) => setDraftStyle({ ...draftStyle, heroImage: url }))} />
            </div>
            <div>
              <strong>Gallery</strong>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) =>
                  handleUpload(e.target.files, (url) => setDraftStyle({ ...draftStyle, images: [...draftStyle.images, url].slice(-10) }))
                }
              />
            </div>
          </div>

          <button
            className="admin-button"
            type="button"
            onClick={() => {
              setConfig({ ...config, styles: { ...styles, presets: [draftStyle, ...styles.presets].slice(0, 20) } });
              setDraftStyle({ id: String(Date.now()), name: "Untitled", images: [], trainingText: "", status: "draft" });
            }}
          >
            Add style
          </button>
        </div>
      </Section>
    </div>
  );
}

function ArchitectureTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  return (
    <div className="admin-grid">
      <Section title="Architecture map" description="Editable description of the pipeline">
        <textarea className="admin-textarea" value={config.architecture} onChange={(e) => setConfig({ ...config, architecture: e.target.value })} />
      </Section>
    </div>
  );
}

function AssetsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  const assets = config.assets;

  const handleUpload = (files: FileList | null, cb: (url: string) => void) => {
    if (!files?.length) return;
    const file = files[0];
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("Too large (2MB max)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="admin-grid">
      <Section title="Brand assets" description="Colors, fonts, logo and misc images">
        <div className="admin-inline">
          <label>
            <strong>Primary color</strong>
            <input value={assets.primaryColor} onChange={(e) => setConfig({ ...config, assets: { ...assets, primaryColor: e.target.value } })} />
          </label>
          <label>
            <strong>Secondary color</strong>
            <input value={assets.secondaryColor} onChange={(e) => setConfig({ ...config, assets: { ...assets, secondaryColor: e.target.value } })} />
          </label>
          <label>
            <strong>Font</strong>
            <input value={assets.fontFamily} onChange={(e) => setConfig({ ...config, assets: { ...assets, fontFamily: e.target.value } })} />
          </label>
        </div>

        <div className="admin-inline">
          <div>
            <strong>Logo</strong>
            {assets.logo && <img className="admin-logo" src={assets.logo} alt="logo" />}
            <input type="file" accept="image/*" onChange={(e) => handleUpload(e.target.files, (url) => setConfig({ ...config, assets: { ...assets, logo: url } }))} />
          </div>

          <div>
            <strong>Other assets</strong>
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                handleUpload(e.target.files, (url) =>
                  setConfig({
                    ...config,
                    assets: {
                      ...assets,
                      otherAssets: [...assets.otherAssets, { id: String(Date.now()), name: `asset-${assets.otherAssets.length + 1}`, url }],
                    },
                  })
                )
              }
            />
            <div className="admin-image-grid">
              {assets.otherAssets.map((a) => (
                <div key={a.id} className="admin-thumb-col">
                  <img src={a.url} alt={a.name} />
                  <div className="admin-grid-sub">{a.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* -----------------------------
   Generic RAW Viewer
------------------------------ */

function RawViewer({ row }: { row: any }) {
  const url = extractLikelyImageUrl(row);
  const highlights = highlightTraceFields(row);

  return (
    <div className="admin-detail">
      {url && (
        <div style={{ marginBottom: 12 }}>
          <strong>Preview</strong>
          <div style={{ marginTop: 8 }}>
            <img src={url} alt="output" style={{ maxWidth: "100%", borderRadius: 12 }} />
          </div>
        </div>
      )}

      {highlights.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <strong>Important fields (auto-detected)</strong>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {highlights.map((k) => (
              <div key={k} style={{ border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{k}</div>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{safeJson(row?.[k])}</pre>
              </div>
            ))}
          </div>
        </div>
      )}

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Raw JSON (everything)</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{safeJson(row)}</pre>
      </details>
    </div>
  );
}

/* -----------------------------
   Live Data Tabs
------------------------------ */

type LiveRow = { id: string; label: string; createdAt?: string; raw: any };

async function loadTable(table: string, limit = 500, orderCol = "created_at") {
  // order may fail if column doesn't exist; we fallback to no ordering
  const attempt = await supabase.from(table).select("*").order(orderCol, { ascending: false }).limit(limit);
  if (!attempt.error) return attempt.data ?? [];

  const fallback = await supabase.from(table).select("*").limit(limit);
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data ?? [];
}

function makeRowsFromAny(table: string, rows: any[]): LiveRow[] {
  return rows.map((r, idx) => {
    const id =
      pickString(r, ["id", "uuid", "generation_id", "session_id", "tx_id"], "") ||
      pickString(r, ["user_id", "customer_id", "shopify_customer_id", "email"], "") ||
      `${table}-${idx}`;

    const createdAt = pickString(r, ["created_at", "inserted_at", "at", "timestamp"], "");

    const label =
      pickString(r, ["email", "user_email"], "") ||
      pickString(r, ["shopify_customer_id", "customer_id"], "") ||
      pickString(r, ["user_id"], "") ||
      pickString(r, ["status"], "") ||
      id;

    return { id, label, createdAt: createdAt || undefined, raw: r };
  });
}

function LiveTableTab({
  title,
  description,
  rows,
  loading,
  error,
  onRefresh,
  filterLabel,
}: {
  title: string;
  description: string;
  rows: LiveRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  filterLabel?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<LiveRow | null>(null);

  useEffect(() => {
    if (selected && !rows.find((x) => x.id === selected.id)) setSelected(null);
  }, [rows, selected]);

  return (
    <div className="admin-grid admin-split">
      <Section title={title} description={description}>
        <div className="admin-inline">
          {filterLabel}
          <button className="admin-button ghost" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className="admin-button ghost"
            type="button"
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(rows.map((r) => r.raw), null, 2))}
          >
            Copy JSON
          </button>
        </div>

        {error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Load error:</strong> {error}
            <div style={{ marginTop: 6, color: "#333" }}>
              Usually: wrong table name, missing columns in order(), or RLS blocked your admin.
            </div>
          </div>
        )}

        {!error && !loading && rows.length === 0 && <div className="admin-muted" style={{ padding: 12 }}>No rows found.</div>}

        <div className="admin-grid-gallery">
          {rows.slice(0, 250).map((r) => {
            const url = extractLikelyImageUrl(r.raw);
            return (
              <button
                key={r.id}
                className={`admin-grid-card ${selected?.id === r.id ? "active" : ""}`}
                onClick={() => setSelected(r)}
              >
                {url ? <img src={url} alt={r.label} loading="lazy" /> : <div className="admin-placeholder">no preview</div>}
                <div className="admin-grid-meta">
                  <div className="admin-grid-prompt">{r.label || <span className="admin-muted">—</span>}</div>
                  <div className="admin-grid-sub">{r.createdAt || "—"}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Details" description="Everything stored for this row">
        {selected ? <RawViewer row={selected.raw} /> : <p className="admin-muted">Select a row to inspect.</p>}
      </Section>
    </div>
  );
}

/* -----------------------------
   Customers (editable credits + show payments)
------------------------------ */

type CustomerRow = {
  pkCol: string;
  pkVal: string;
  email: string;
  userId: string | null;
  shopifyCustomerId: string | null;
  credits: number;
  expiresAt: string | null;
  lastActive: string | null;
  raw: any;
};

function normalizeCustomers(rows: any[]): CustomerRow[] {
  return rows.map((r) => {
    const userId = pickString(r, ["user_id", "uid"], "") || null;
    const shopifyCustomerId = pickString(r, ["shopify_customer_id", "shopify_id", "customer_id"], "") || null;
    const email = pickString(r, ["email", "user_email"], "") || (shopifyCustomerId?.includes("@") ? shopifyCustomerId : "(no email)");

    const credits = pickNumber(r, ["credits", "credit", "balance"], 0);
    const expiresAt = pickString(r, ["expires_at", "expiresAt"], "") || null;
    const lastActive = pickString(r, ["last_active", "lastActive", "updated_at"], "") || null;

    // pick best PK
    let pkCol = "shopify_customer_id";
    let pkVal = shopifyCustomerId || email;

    if (userId) {
      pkCol = "user_id";
      pkVal = userId;
    } else if (pickString(r, ["id"], "")) {
      pkCol = "id";
      pkVal = String(r.id);
    } else if (shopifyCustomerId) {
      pkCol = "shopify_customer_id";
      pkVal = shopifyCustomerId;
    } else if (email) {
      pkCol = "email";
      pkVal = email;
    }

    return { pkCol, pkVal, email, userId, shopifyCustomerId, credits, expiresAt, lastActive, raw: r };
  });
}

async function updateCustomerCreditsAndExpiry(opts: {
  table: string;
  customer: CustomerRow;
  nextCredits: number;
  nextExpiresAt: string | null;
  note?: string;
}) {
  const { table, customer, nextCredits, nextExpiresAt, note } = opts;

  // build update patch only for existing cols
  const patch: any = {};
  const creditCol = pickFirstKey(customer.raw, ["credits", "credit", "balance"]) || "credits";
  patch[creditCol] = nextCredits;

  if (pickFirstKey(customer.raw, ["expires_at", "expiresAt"])) {
    patch[pickFirstKey(customer.raw, ["expires_at", "expiresAt"]) as string] = nextExpiresAt;
  } else if (nextExpiresAt !== null) {
    // optional: only set if exists
  }

  // update customer
  const q = supabase.from(table).update(patch).eq(customer.pkCol, customer.pkVal);
  const { error } = await q;
  if (error) throw new Error(error.message);

  // OPTIONAL audit in credit_transactions if table/cols exist
  // (best effort — it’s okay if it fails)
  try {
    const delta = nextCredits - customer.credits;
    if (delta !== 0) {
      const { data: u } = await supabase.auth.getUser();
      const adminUid = u.user?.id ?? null;

      const tx: any = {
        created_at: new Date().toISOString(),
        type: "admin_adjust",
        delta,
        note: note || "admin adjust",
      };

      // attach identifiers if present
      if (customer.userId) tx.user_id = customer.userId;
      if (customer.shopifyCustomerId) tx.shopify_customer_id = customer.shopifyCustomerId;
      if (customer.email && customer.email.includes("@")) tx.email = customer.email;
      if (adminUid) tx.created_by = adminUid;

      await supabase.from("credit_transactions").insert(tx);
    }
  } catch {
    // ignore audit failure
  }
}

async function loadTransactionsForCustomer(customer: CustomerRow) {
  // Fetch latest 300 transactions then filter in JS (works across schema differences)
  const rows = await loadTable("credit_transactions", 300, "created_at");
  const raw = rows as any[];

  const match = (r: any) => {
    const email = pickString(r, ["email", "user_email"], "");
    const userId = pickString(r, ["user_id", "uid"], "");
    const shopify = pickString(r, ["shopify_customer_id", "customer_id"], "");
    return (
      (customer.userId && userId === customer.userId) ||
      (customer.shopifyCustomerId && shopify === customer.shopifyCustomerId) ||
      (customer.email && email && email.toLowerCase() === customer.email.toLowerCase())
    );
  };

  return raw.filter(match);
}

function CustomersTab({
  customers,
  loading,
  error,
  onRefresh,
  customersTable,
}: {
  customers: CustomerRow[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  customersTable: string;
}) {
  const [selected, setSelected] = useState<CustomerRow | null>(null);
  const [local, setLocal] = useState<CustomerRow[]>([]);
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [txRows, setTxRows] = useState<any[] | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    setLocal(customers);
    setDirtyMap({});
  }, [customers]);

  useEffect(() => {
    setTxRows(null);
    if (!selected) return;
    setTxLoading(true);
    void (async () => {
      try {
        const rows = await loadTransactionsForCustomer(selected);
        setTxRows(rows);
      } catch {
        setTxRows([]);
      } finally {
        setTxLoading(false);
      }
    })();
  }, [selected?.pkCol, selected?.pkVal]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (idx: number, next: CustomerRow) => {
    const copy = [...local];
    copy[idx] = next;
    setLocal(copy);
    setDirtyMap((m) => ({ ...m, [next.pkCol + ":" + next.pkVal]: true }));
  };

  const anyDirty = Object.values(dirtyMap).some(Boolean);

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const c of local) {
        const key = c.pkCol + ":" + c.pkVal;
        if (!dirtyMap[key]) continue;
        // eslint-disable-next-line no-await-in-loop
        await updateCustomerCreditsAndExpiry({
          table: customersTable,
          customer: customers.find((x) => x.pkCol === c.pkCol && x.pkVal === c.pkVal) || c,
          nextCredits: c.credits,
          nextExpiresAt: c.expiresAt,
          note: "admin dashboard edit",
        });
      }
      alert("Customers saved ✅");
      setDirtyMap({});
      onRefresh();
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const totalPaid = useMemo(() => {
    if (!txRows) return null;

    // Heuristic: try multiple columns
    const sum = txRows.reduce((acc, r) => {
      const amt =
        pickNumber(r, ["amount_cents", "amount", "paid_amount", "price_cents", "usd_cents"], 0) || 0;
      // only count purchases if we can detect
      const type = pickString(r, ["type", "kind", "source"], "").toLowerCase();
      const isPurchase = !type || type.includes("purchase") || type.includes("stripe") || type.includes("payment");
      return acc + (isPurchase ? amt : 0);
    }, 0);

    const currency = pickString(txRows[0], ["currency"], "usd") || "usd";
    return formatMoneyMaybeCents(sum, currency);
  }, [txRows]);

  return (
    <div className="admin-grid admin-split">
      <Section title="Customers" description={`Live data from Supabase table "${customersTable}" (edit credits).`}>
        <div className="admin-inline">
          <button className="admin-button ghost" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="admin-button" type="button" onClick={saveAll} disabled={!anyDirty || saving}>
            {saving ? "Saving..." : "Save edits"}
          </button>
          {anyDirty && <span className="admin-muted">Unsaved changes.</span>}
        </div>

        {error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Customers load error:</strong> {error}
          </div>
        )}

        <Table headers={["Email / ID", "Credits", "Expires", "Last active", "Pick"]}>
          {local.map((c, idx) => (
            <div className="admin-table-row" key={`${c.pkCol}:${c.pkVal}`}>
              <div style={{ display: "grid" }}>
                <div style={{ fontWeight: 700 }}>{c.email}</div>
                <div className="admin-muted" style={{ fontSize: 12 }}>
                  {c.userId ? `user_id: ${c.userId}` : c.shopifyCustomerId ? `shopify: ${c.shopifyCustomerId}` : `${c.pkCol}: ${c.pkVal}`}
                </div>
              </div>

              <div>
                <input
                  type="number"
                  value={c.credits}
                  onChange={(e) => updateRow(idx, { ...c, credits: Number(e.target.value) || 0 })}
                />
              </div>

              <div>
                <input
                  type="date"
                  value={(c.expiresAt || "").slice(0, 10)}
                  onChange={(e) => updateRow(idx, { ...c, expiresAt: e.target.value || null })}
                />
              </div>

              <div>{c.lastActive || "—"}</div>

              <div>
                <button className="admin-button ghost" type="button" onClick={() => setSelected(c)}>
                  View
                </button>
              </div>
            </div>
          ))}
        </Table>
      </Section>

      <Section title="Customer details" description="Raw data + recent transactions">
        {selected ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 800 }}>{selected.email}</div>
              <div className="admin-muted" style={{ fontSize: 12 }}>
                {selected.userId ? `user_id: ${selected.userId}` : `${selected.pkCol}: ${selected.pkVal}`}
              </div>
            </div>

            <div style={{ marginBottom: 12, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <strong>Payments / Purchases (heuristic)</strong>
              <div style={{ marginTop: 8 }}>
                {txLoading ? "Loading..." : txRows ? <>Total paid (from latest 300 tx): <strong>{totalPaid ?? "—"}</strong></> : "—"}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <strong>Recent credit transactions</strong>
              {txLoading ? (
                <div className="admin-muted" style={{ marginTop: 8 }}>Loading...</div>
              ) : (
                <pre style={{ whiteSpace: "pre-wrap" }}>{safeJson(txRows ?? [])}</pre>
              )}
            </div>

            <RawViewer row={selected.raw} />
          </>
        ) : (
          <p className="admin-muted">Select a customer.</p>
        )}
      </Section>
    </div>
  );
}

/* -----------------------------
   Logs tab (same idea)
------------------------------ */

function LogsTab({ config }: { config: AdminConfig }) {
  const [filter, setFilter] = useState<string>("");

  return (
    <div className="admin-grid">
      <Section title="Logs (local)" description="Local logs stored in config (if you keep them).">
        <div className="admin-inline">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <button className="admin-button ghost" onClick={() => navigator.clipboard?.writeText(JSON.stringify(config.logs, null, 2))}>
            Copy JSON
          </button>
        </div>

        <div className="admin-log-shell">
          {config.logs
            .filter((l) => !filter || l.level === filter)
            .slice(-300)
            .reverse()
            .map((log) => (
              <div key={log.id} className={`admin-log-row level-${log.level}`}>
                <div className="admin-log-meta">
                  <span>{log.level.toUpperCase()}</span>
                  <span>{log.at}</span>
                  <span>{log.source}</span>
                </div>
                <div>{log.message}</div>
              </div>
            ))}
        </div>
      </Section>
    </div>
  );
}

/* -----------------------------
   MAIN
------------------------------ */

export default function AdminDashboard() {
  const allowed = useAdminGuard();
  const { config, updateConfig, loading, error } = useAdminConfigState();
  const [draft, setDraft] = useState<AdminConfig | null>(null);
  const [tab, setTab] = useState<TabKey>("customers");
  // ✅ API base for backend calls (stored in this browser)
  // Leave empty "" if admin frontend and backend are on same domain.
  const [apiBase, setApiBase] = useState<string>(() => {
    try {
      return localStorage.getItem("MINA_API_BASE") || "";
    } catch {
      return "";
    }
  });

  // live state
  const [customersTable] = useState("customers");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);

  const [generations, setGenerations] = useState<LiveRow[]>([]);
  const [generationsLoading, setGenerationsLoading] = useState(false);
  const [generationsError, setGenerationsError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<LiveRow[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<LiveRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<LiveRow[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // filters
  const [userFilter, setUserFilter] = useState<string>("");

  const firstLoadRef = useRef(false);

  useEffect(() => {
    if (!loading) setDraft(config);
  }, [loading, config]);

  const refreshCustomers = async () => {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      let rows = await loadTable("customers", 800, "updated_at");
      // filter client-side (works even if schema is inconsistent)
      const f = userFilter.trim().toLowerCase();
      if (f) {
        rows = (rows as any[]).filter((r) => {
          const email = pickString(r, ["email", "user_email", "shopify_customer_id"], "").toLowerCase();
          const userId = pickString(r, ["user_id", "uid"], "").toLowerCase();
          const shopify = pickString(r, ["shopify_customer_id", "customer_id"], "").toLowerCase();
          return email.includes(f) || userId === f || shopify.includes(f) || String(r?.id ?? "").toLowerCase() === f;
        });
      }
      setCustomers(normalizeCustomers(rows as any[]));
    } catch (e: any) {
      setCustomersError(e?.message ?? "Failed to load customers");
      setCustomers([]);
    } finally {
      setCustomersLoading(false);
    }
  };

  const refreshGenerations = async () => {
    setGenerationsLoading(true);
    setGenerationsError(null);
    try {
      let rows = await loadTable("generations", 900, "created_at");
      const f = userFilter.trim().toLowerCase();
      if (f) {
        rows = (rows as any[]).filter((r) => {
          const email = pickString(r, ["email", "user_email"], "").toLowerCase();
          const userId = pickString(r, ["user_id", "uid"], "").toLowerCase();
          const shopify = pickString(r, ["shopify_customer_id", "customer_id"], "").toLowerCase();
          const prompt = pickString(r, ["prompt", "input_prompt", "caption", "text"], "").toLowerCase();
          return email.includes(f) || userId === f || shopify.includes(f) || prompt.includes(f);
        });
      }
      setGenerations(makeRowsFromAny("generations", rows as any[]));
    } catch (e: any) {
      setGenerationsError(e?.message ?? "Failed to load generations");
      setGenerations([]);
    } finally {
      setGenerationsLoading(false);
    }
  };

  const refreshTransactions = async () => {
    setTransactionsLoading(true);
    setTransactionsError(null);
    try {
      let rows = await loadTable("credit_transactions", 900, "created_at");
      const f = userFilter.trim().toLowerCase();
      if (f) {
        rows = (rows as any[]).filter((r) => {
          const email = pickString(r, ["email", "user_email"], "").toLowerCase();
          const userId = pickString(r, ["user_id", "uid"], "").toLowerCase();
          const shopify = pickString(r, ["shopify_customer_id", "customer_id"], "").toLowerCase();
          const type = pickString(r, ["type", "kind", "source"], "").toLowerCase();
          return email.includes(f) || userId === f || shopify.includes(f) || type.includes(f);
        });
      }
      setTransactions(makeRowsFromAny("credit_transactions", rows as any[]));
    } catch (e: any) {
      setTransactionsError(e?.message ?? "Failed to load credit_transactions");
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const refreshSessions = async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      let rows = await loadTable("sessions", 800, "created_at");
      const f = userFilter.trim().toLowerCase();
      if (f) {
        rows = (rows as any[]).filter((r) => {
          const email = pickString(r, ["email", "user_email"], "").toLowerCase();
          const userId = pickString(r, ["user_id", "uid"], "").toLowerCase();
          const customer = pickString(r, ["shopify_customer_id", "customer_id"], "").toLowerCase();
          return email.includes(f) || userId === f || customer.includes(f);
        });
      }
      setSessions(makeRowsFromAny("sessions", rows as any[]));
    } catch (e: any) {
      setSessionsError(e?.message ?? "Failed to load sessions");
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  const refreshFeedback = async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      let rows = await loadTable("feedback", 800, "created_at");
      const f = userFilter.trim().toLowerCase();
      if (f) {
        rows = (rows as any[]).filter((r) => {
          const email = pickString(r, ["email", "user_email"], "").toLowerCase();
          const userId = pickString(r, ["user_id", "uid"], "").toLowerCase();
          const genId = pickString(r, ["generation_id", "gen_id"], "").toLowerCase();
          return email.includes(f) || userId === f || genId.includes(f);
        });
      }
      setFeedback(makeRowsFromAny("feedback", rows as any[]));
    } catch (e: any) {
      setFeedbackError(e?.message ?? "Failed to load feedback");
      setFeedback([]);
    } finally {
      setFeedbackLoading(false);
    }
  };

  useEffect(() => {
    if (allowed !== true) return;
    if (firstLoadRef.current) return;
    firstLoadRef.current = true;

    void refreshCustomers();
    void refreshGenerations();
    void refreshTransactions();
    void refreshSessions();
    void refreshFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  // refresh on filter apply (manual button only; avoids spamming)
  const applyFilter = () => {
    void refreshCustomers();
    void refreshGenerations();
    void refreshTransactions();
    void refreshSessions();
    void refreshFeedback();
  };

  if (allowed === null || loading || !draft) return <div style={{ padding: 24 }}>Loading admin…</div>;
  if (allowed === false) return null;

  const setConfig = (next: AdminConfig) => setDraft(next);

  const handleSave = async () => {
    try {
      // Keep config clean (do not embed live tables)
      await updateConfig(draft);
      alert("Saved ✅");
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    }
  };

  const rightStatus = (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Customers: <strong>{customers.length}</strong>
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Generations: <strong>{generations.length}</strong>
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Tx: <strong>{transactions.length}</strong>
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Sessions: <strong>{sessions.length}</strong>
      </span>
    </div>
  );

  const filterBar = (
    <>
      <input
        placeholder="Filter by email / user_id / customer_id / prompt…"
        value={userFilter}
        onChange={(e) => setUserFilter(e.target.value)}
        style={{ minWidth: 340 }}
      />
      <button className="admin-button ghost" type="button" onClick={applyFilter}>
        Apply filter
      </button>
      <button
        className="admin-button ghost"
        type="button"
        onClick={() => {
          setUserFilter("");
          setTimeout(() => applyFilter(), 0);
        }}
      >
        Clear
      </button>
    </>
  );

  return (
    <div className="admin-shell">
      <AdminHeader onSave={handleSave} rightStatus={rightStatus} />
      <StickyTabs active={tab} onChange={setTab} />

      {error && <div style={{ padding: 12, color: "crimson" }}>{error}</div>}

      <div className="admin-content">
                {tab === "runtime" && (
          <div className="admin-grid">
            <Section
              title="Runtime Config (Live backend)"
              description="Edit the live backend runtime config (models, replicate params, GPT temp/tokens, system/user append)."
            >
              <div className="admin-inline">
                <label style={{ minWidth: 420 }}>
                  <strong>API Base URL (optional)</strong>
                  <input
                    value={apiBase}
                    onChange={(e) => {
                      const v = e.target.value;
                      setApiBase(v);
                      try {
                        localStorage.setItem("MINA_API_BASE", v);
                      } catch {}
                    }}
                    placeholder='Example: https://your-api.onrender.com  (leave empty if same domain)'
                  />
                </label>

                <button
                  className="admin-button ghost"
                  type="button"
                  onClick={() => {
                    setApiBase("");
                    try {
                      localStorage.removeItem("MINA_API_BASE");
                    } catch {}
                  }}
                >
                  Use same domain
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <RuntimeConfigEditor apiBase={apiBase} />
              </div>
            </Section>
          </div>
        )}

        {tab === "ai" && <AISettingsTab config={draft} setConfig={setConfig} />}
        {tab === "pricing" && <PricingTab config={draft} setConfig={setConfig} />}
        {tab === "styles" && <StylesTab config={draft} setConfig={setConfig} />}
        {tab === "assets" && <AssetsTab config={draft} setConfig={setConfig} />}
        {tab === "architecture" && <ArchitectureTab config={draft} setConfig={setConfig} />}

        {tab === "customers" && (
          <CustomersTab
            customers={customers}
            loading={customersLoading}
            error={customersError}
            onRefresh={() => void refreshCustomers()}
            customersTable={customersTable}
          />
        )}

        {tab === "generations" && (
          <LiveTableTab
            title="Generations"
            description="Shows ALL stored columns. If you want GPT input/output + seedream input visible, your backend must store it in this row (columns or JSON)."
            rows={generations}
            loading={generationsLoading}
            error={generationsError}
            onRefresh={() => void refreshGenerations()}
            filterLabel={filterBar}
          />
        )}

        {tab === "transactions" && (
          <LiveTableTab
            title="Credit transactions"
            description="Your Stripe/webhook should write here. Dashboard shows everything stored."
            rows={transactions}
            loading={transactionsLoading}
            error={transactionsError}
            onRefresh={() => void refreshTransactions()}
            filterLabel={filterBar}
          />
        )}

        {tab === "sessions" && (
          <LiveTableTab
            title="Sessions"
            description="Track session start / usage. Shows everything stored."
            rows={sessions}
            loading={sessionsLoading}
            error={sessionsError}
            onRefresh={() => void refreshSessions()}
            filterLabel={filterBar}
          />
        )}

        {tab === "feedback" && (
          <LiveTableTab
            title="Feedback"
            description="Likes / feedback rows."
            rows={feedback}
            loading={feedbackLoading}
            error={feedbackError}
            onRefresh={() => void refreshFeedback()}
            filterLabel={filterBar}
          />
        )}

        {tab === "logs" && <LogsTab config={draft} />}
      </div>

      <div className="admin-footer">
        Config saved in Supabase: mina_admin_config + mina_admin_secrets
        <span className="admin-muted" style={{ marginLeft: 10 }}>
          Live tables are read/update directly.
        </span>
      </div>
    </div>
  );
}

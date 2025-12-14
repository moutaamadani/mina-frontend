import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import {
  AdminConfig,
  AdminStyleAsset,
  isAdmin,
  upsertAdminSecret,
  useAdminConfigState,
} from "./lib/adminConfig";
import "./admin.css";

/**
 * IMPORTANT:
 * - Config (AI/Pricing/Styles/Assets/Architecture) is stored in mina_admin_config (singleton).
 * - Users + Generations should NOT be stored in config (too heavy + not "config").
 *
 * So:
 * - We load clients + generations LIVE from Supabase tables (read-only here).
 * - We show them in tabs.
 * - Save button saves ONLY config parts (and skips live data).
 */

type TabKey =
  | "ai"
  | "pricing"
  | "styles"
  | "generations"
  | "clients"
  | "logs"
  | "architecture"
  | "assets";

const TAB_LABELS: Record<TabKey, string> = {
  ai: "AI Settings",
  pricing: "Credits & Pricing",
  styles: "Styles",
  generations: "Generations",
  clients: "Clients",
  logs: "Logs",
  architecture: "Architecture",
  assets: "Assets",
};

type LiveClient = {
  id: string;
  email: string;
  credits: number;
  expiresAt?: string | null;
  lastActive?: string | null;
  disabled?: boolean | null;
};

type LiveGeneration = {
  id: string;
  user: string; // email or user_id
  prompt: string;
  model: string;
  status: string;
  url?: string | null;
  cost?: number | null;
  liked?: boolean | null;
  createdAt: string;
  params?: any;
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
        <div className="admin-subtitle">Editorial dashboard (Supabase live config)</div>
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
      <button
        className="admin-button ghost"
        type="button"
        onClick={() => onChange([...params, { key: "", value: "" }])}
      >
        Add param
      </button>
    </div>
  );
}

/* -----------------------------
   LIVE DATA LOADERS (REAL DB)
------------------------------ */

/**
 * We try multiple possible table names because your project naming might differ.
 * The first one that works is used.
 */
async function trySelectFirstWorkingTable(
  candidates: string[],
  select: string,
  options?: { limit?: number; orderBy?: { col: string; asc?: boolean } }
): Promise<{ table: string; rows: any[] }> {
  let lastError: any = null;

  for (const table of candidates) {
    // eslint-disable-next-line no-await-in-loop
    let q = supabase.from(table).select(select);

    if (options?.orderBy?.col) {
      q = q.order(options.orderBy.col, { ascending: options.orderBy.asc ?? false });
    }
    if (options?.limit) {
      q = q.limit(options.limit);
    }

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await q;

    if (!error && Array.isArray(data)) {
      return { table, rows: data };
    }

    // If table doesn't exist or access is denied, keep trying.
    lastError = error ?? lastError;
  }

  const msg =
    lastError?.message ||
    "No candidate table worked (table missing OR blocked by RLS).";
  throw new Error(msg);
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

function pickBool(row: any, keys: string[], fallback = false): boolean {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return Boolean(v);
    if (typeof v === "string") {
      const s = v.toLowerCase();
      if (s === "true") return true;
      if (s === "false") return false;
    }
  }
  return fallback;
}

function normalizeClients(rows: any[]): LiveClient[] {
  return rows.map((r) => {
    const id = pickString(r, ["id", "user_id", "uid", "profile_id"], String(Math.random()));
    const email = pickString(r, ["email", "user_email", "mail"], "(no email)");
    const credits = pickNumber(r, ["credits", "credit", "balance", "matchas", "tokens"], 0);
    const expiresAt = pickString(r, ["expires_at", "expiresAt", "credit_expires_at"], "") || null;
    const lastActive = pickString(r, ["last_active", "lastActive", "updated_at", "last_seen_at"], "") || null;
    const disabled = pickBool(r, ["disabled", "is_disabled", "blocked", "banned"], false);
    return { id, email, credits, expiresAt, lastActive, disabled };
  });
}

function normalizeGenerations(rows: any[]): LiveGeneration[] {
  return rows.map((r) => {
    const id = pickString(r, ["id", "generation_id", "gid"], String(Math.random()));
    const prompt = pickString(r, ["prompt", "input_prompt", "text", "caption"], "");
    const model = pickString(r, ["model", "model_name", "provider_model"], "");
    const status = pickString(r, ["status", "state"], "unknown");
    const url =
      pickString(r, ["url", "image_url", "output_url", "result_url", "asset_url"], "") || null;

    const createdAt =
      pickString(r, ["created_at", "createdAt", "inserted_at", "started_at"], new Date().toISOString()) ||
      new Date().toISOString();

    const user =
      pickString(r, ["user_email", "email"], "") ||
      pickString(r, ["user_id", "uid", "owner_id"], "") ||
      "(unknown user)";

    const cost = (() => {
      const n = pickNumber(r, ["cost", "credits_cost", "credit_cost", "matchas_cost"], NaN);
      return Number.isNaN(n) ? null : n;
    })();

    const liked = (() => {
      if (r?.liked === undefined && r?.is_liked === undefined) return null;
      return pickBool(r, ["liked", "is_liked"], false);
    })();

    const params = r?.params ?? r?.parameters ?? r?.meta ?? r?.metadata ?? null;

    return { id, user, prompt, model, status, url, cost, liked, createdAt, params };
  });
}

/* -----------------------------
   TABS
------------------------------ */

function AISettingsTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  const ai = config.ai;

  return (
    <div className="admin-grid">
      <Section title="Providers" description="Keys are stored in Supabase (mina_admin_secrets).">
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

              <div className="admin-masked">
                {row.masked ? row.masked : <span className="admin-muted">not set</span>}
              </div>

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
                    const replacement = window.prompt(`Paste new secret for "${row.provider}" (stored in Supabase)`);
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
            <input
              value={ai.defaultProvider}
              onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultProvider: e.target.value } })}
            />
          </label>
          <label>
            <strong>Default model</strong>
            <input
              value={ai.defaultModel}
              onChange={(e) => setConfig({ ...config, ai: { ...ai, defaultModel: e.target.value } })}
            />
          </label>
          <label>
            <strong>Temperature</strong>
            <input
              type="number"
              step="0.1"
              value={ai.temperature}
              onChange={(e) =>
                setConfig({ ...config, ai: { ...ai, temperature: parseFloat(e.target.value) || 0 } })
              }
            />
          </label>
          <label>
            <strong>top_p</strong>
            <input
              type="number"
              step="0.05"
              value={ai.topP}
              onChange={(e) => setConfig({ ...config, ai: { ...ai, topP: parseFloat(e.target.value) || 0 } })}
            />
          </label>
          <label>
            <strong>Max tokens</strong>
            <input
              type="number"
              value={ai.maxTokens}
              onChange={(e) => setConfig({ ...config, ai: { ...ai, maxTokens: Number(e.target.value) || 0 } })}
            />
          </label>
        </div>
      </Section>

      <Section title="Context" description="Overrides the baked system prompt across pipelines.">
        <textarea
          className="admin-textarea"
          value={ai.context}
          onChange={(e) => setConfig({ ...config, ai: { ...ai, context: e.target.value } })}
        />
      </Section>

      <Section title="Provider parameters" description="Expose low-level flags (e.g. seedream params)">
        <EditableKeyValue
          params={ai.providerParams}
          onChange={(next) => setConfig({ ...config, ai: { ...ai, providerParams: next } })}
        />
      </Section>

      <Section title="Future models" description="Drop replicate snippets for SVG/audio ahead of time.">
        <textarea
          className="admin-textarea"
          value={ai.futureReplicateNotes}
          onChange={(e) => setConfig({ ...config, ai: { ...ai, futureReplicateNotes: e.target.value } })}
          placeholder="Copy/paste replicate code blocks"
        />
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
            <input
              type="number"
              value={pricing.defaultCredits}
              onChange={(e) =>
                setConfig({ ...config, pricing: { ...pricing, defaultCredits: Number(e.target.value) || 0 } })
              }
            />
          </label>
          <label>
            <strong>Expiration (days)</strong>
            <input
              type="number"
              value={pricing.expirationDays}
              onChange={(e) =>
                setConfig({ ...config, pricing: { ...pricing, expirationDays: Number(e.target.value) || 0 } })
              }
            />
          </label>
          <label>
            <strong>Still cost (Matchas)</strong>
            <input
              type="number"
              value={pricing.imageCost}
              onChange={(e) =>
                setConfig({ ...config, pricing: { ...pricing, imageCost: Number(e.target.value) || 0 } })
              }
            />
          </label>
          <label>
            <strong>Motion cost (Matchas)</strong>
            <input
              type="number"
              value={pricing.motionCost}
              onChange={(e) =>
                setConfig({ ...config, pricing: { ...pricing, motionCost: Number(e.target.value) || 0 } })
              }
            />
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
                <textarea
                  className="admin-textarea"
                  value={preset.trainingText}
                  onChange={(e) => updatePreset(idx, { ...preset, trainingText: e.target.value })}
                />
              </div>
              <div className="admin-thumb-col">
                {preset.heroImage ? <img src={preset.heroImage} alt="hero" /> : <span>—</span>}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files, (url) => updatePreset(idx, { ...preset, heroImage: url }))}
                />
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
                <select
                  value={preset.status}
                  onChange={(e) => updatePreset(idx, { ...preset, status: e.target.value as AdminStyleAsset["status"] })}
                >
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
              <select
                value={draftStyle.status}
                onChange={(e) => setDraftStyle({ ...draftStyle, status: e.target.value as AdminStyleAsset["status"] })}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
          </div>

          <label>
            <strong>Training text</strong>
            <textarea
              className="admin-textarea"
              value={draftStyle.trainingText}
              onChange={(e) => setDraftStyle({ ...draftStyle, trainingText: e.target.value })}
            />
          </label>

          <div className="admin-inline">
            <div>
              <strong>Hero image</strong>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleUpload(e.target.files, (url) => setDraftStyle({ ...draftStyle, heroImage: url }))}
              />
            </div>
            <div>
              <strong>Gallery</strong>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) =>
                  handleUpload(e.target.files, (url) =>
                    setDraftStyle({ ...draftStyle, images: [...draftStyle.images, url].slice(-10) })
                  )
                }
              />
            </div>
          </div>

          <button
            className="admin-button"
            type="button"
            onClick={() => {
              setConfig({
                ...config,
                styles: { ...styles, presets: [draftStyle, ...styles.presets].slice(0, 20) },
              });
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

function GenerationsTab({
  records,
  loading,
  error,
  onRefresh,
}: {
  records: LiveGeneration[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 28;

  const [filters, setFilters] = useState({ status: "", model: "", query: "" });

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const matchStatus = !filters.status || r.status === filters.status;
      const matchModel = !filters.model || r.model === filters.model;
      const matchQuery = !filters.query || `${r.prompt} ${r.user}`.toLowerCase().includes(filters.query.toLowerCase());
      return matchStatus && matchModel && matchQuery;
    });
  }, [records, filters]);

  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const [selected, setSelected] = useState<LiveGeneration | null>(null);

  useEffect(() => {
    if (selected && !filtered.find((x) => x.id === selected.id)) setSelected(null);
  }, [filtered, selected]);

  useEffect(() => {
    setPage(0);
  }, [filters.status, filters.model, filters.query]);

  return (
    <div className="admin-grid admin-split">
      <Section title="Generations" description="Live data from Supabase (not stored in config).">
        <div className="admin-inline">
          <input
            placeholder="Search prompt/user"
            value={filters.query}
            onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
          />
          <input
            placeholder="Model"
            value={filters.model}
            onChange={(e) => setFilters((p) => ({ ...p, model: e.target.value }))}
          />
          <input
            placeholder="Status"
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
          />
          <button className="admin-button ghost" type="button" onClick={() => setFilters({ status: "", model: "", query: "" })}>
            Clear filters
          </button>
          <button className="admin-button ghost" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Generations load error:</strong> {error}
            <div style={{ marginTop: 6, color: "#333" }}>
              This usually means: wrong table name OR RLS blocks access for your admin user.
            </div>
          </div>
        )}

        {!error && !loading && records.length === 0 && (
          <div style={{ padding: 12, marginTop: 10 }} className="admin-muted">
            No generations found (table exists but empty).
          </div>
        )}

        <div className="admin-grid-gallery">
          {visible.map((g) => (
            <button
              key={g.id}
              className={`admin-grid-card ${selected?.id === g.id ? "active" : ""}`}
              onClick={() => setSelected(g)}
            >
              {g.url ? (
                <img src={g.url} alt={g.prompt} loading="lazy" />
              ) : (
                <div className="admin-placeholder">no image</div>
              )}
              <div className="admin-grid-meta">
                <div className="admin-grid-prompt">{g.prompt || <span className="admin-muted">no prompt</span>}</div>
                <div className="admin-grid-sub">{g.model || <span className="admin-muted">no model</span>}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="admin-pagination">
          <span>
            Page {page + 1} / {Math.max(1, Math.ceil(filtered.length / pageSize))} —{" "}
            <strong>{filtered.length}</strong> result(s)
          </span>
          <div>
            <button className="admin-button ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Prev
            </button>
            <button
              className="admin-button ghost"
              disabled={(page + 1) * pageSize >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </Section>

      <Section title="Details" description="Metadata surface">
        {selected ? (
          <div className="admin-detail">
            <div className="admin-detail-row">
              <strong>Prompt</strong>
              <span>{selected.prompt}</span>
            </div>
            <div className="admin-detail-row">
              <strong>User</strong>
              <span>{selected.user}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Model</strong>
              <span>{selected.model}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Status</strong>
              <span>{selected.status}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Cost</strong>
              <span>{selected.cost ?? "—"}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Liked</strong>
              <span>{selected.liked === null ? "—" : selected.liked ? "Yes" : "No"}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Created</strong>
              <span>{selected.createdAt}</span>
            </div>
            <div className="admin-detail-row">
              <strong>Params</strong>
              <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(selected.params ?? {}, null, 2)}</pre>
            </div>
          </div>
        ) : (
          <p className="admin-muted">Select a generation to inspect.</p>
        )}
      </Section>
    </div>
  );
}

function ClientsTab({
  clients,
  loading,
  error,
  onRefresh,
}: {
  clients: LiveClient[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [local, setLocal] = useState<LiveClient[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocal(clients);
    setDirty(false);
  }, [clients]);

  const updateRow = (idx: number, next: LiveClient) => {
    const copy = [...local];
    copy[idx] = next;
    setLocal(copy);
    setDirty(true);
  };

  const saveEditsToSupabase = async () => {
    // This does a best-effort update to common table candidates.
    // If your RLS blocks it, you'll see an error.
    const candidates = ["profiles", "clients", "mina_clients", "user_profiles"];

    // try detect original table by checking a working select of 1 row.
    let table = "";
    try {
      const found = await trySelectFirstWorkingTable(candidates, "*", { limit: 1 });
      table = found.table;
    } catch (e: any) {
      alert(`Cannot detect clients table: ${e?.message ?? "unknown"}`);
      return;
    }

    // Build payloads (try common columns)
    const payloads = local.map((c) => ({
      // primary key possibilities
      id: c.id,
      user_id: c.id,
      email: c.email,
      credits: c.credits,
      expires_at: c.expiresAt ?? null,
      disabled: c.disabled ?? false,
      last_active: c.lastActive ?? null,
      updated_at: new Date().toISOString(),
    }));

    // We do upsert to be robust (if row doesn't exist yet).
    const { error } = await supabase.from(table).upsert(payloads as any, { onConflict: "id" });

    if (error) {
      alert(`Save clients failed: ${error.message}`);
      return;
    }

    setDirty(false);
    alert("Clients saved ✅");
    onRefresh();
  };

  return (
    <div className="admin-grid">
      <Section title="Clients" description="Live data from Supabase (edit credits/disable).">
        <div className="admin-inline">
          <button className="admin-button ghost" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="admin-button" type="button" onClick={saveEditsToSupabase} disabled={!dirty}>
            Save clients edits
          </button>
          {dirty && <span className="admin-muted">You have unsaved changes.</span>}
        </div>

        {error && (
          <div style={{ padding: 12, marginTop: 10, border: "1px solid crimson", color: "crimson", borderRadius: 8 }}>
            <strong>Clients load error:</strong> {error}
            <div style={{ marginTop: 6, color: "#333" }}>
              This usually means: wrong table name OR RLS blocks access for your admin user.
            </div>
          </div>
        )}

        <Table headers={["Client", "Credits", "Expires", "Last active", "Status", "Actions"]}>
          {local.map((c, idx) => (
            <div className="admin-table-row" key={c.id}>
              <div>{c.email}</div>
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
              <div>{c.disabled ? "Disabled" : "Active"}</div>
              <div className="admin-row-actions">
                <button
                  className="admin-button ghost"
                  onClick={() => updateRow(idx, { ...c, disabled: !c.disabled })}
                >
                  {c.disabled ? "Enable" : "Disable"}
                </button>
              </div>
            </div>
          ))}
        </Table>

        {!error && !loading && clients.length === 0 && (
          <div style={{ padding: 12 }} className="admin-muted">
            No clients found (table exists but empty).
          </div>
        )}
      </Section>
    </div>
  );
}

function LogsTab({ config }: { config: AdminConfig }) {
  const [filter, setFilter] = useState<string>("");

  return (
    <div className="admin-grid">
      <Section title="Logs (local)" description="This tab is local-only for now.">
        <div className="admin-inline">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <button
            className="admin-button ghost"
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(config.logs, null, 2))}
          >
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

function ArchitectureTab({ config, setConfig }: { config: AdminConfig; setConfig: (next: AdminConfig) => void }) {
  return (
    <div className="admin-grid">
      <Section title="Architecture map" description="Editable description of the pipeline">
        <textarea
          className="admin-textarea"
          value={config.architecture}
          onChange={(e) => setConfig({ ...config, architecture: e.target.value })}
        />
        <ol className="admin-steps">
          {config.architecture
            .split(/\n|\d\)/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((line, idx) => (
              <li key={`${line}-${idx}`}>{line}</li>
            ))}
        </ol>
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
            <input
              value={assets.primaryColor}
              onChange={(e) => setConfig({ ...config, assets: { ...assets, primaryColor: e.target.value } })}
            />
          </label>
          <label>
            <strong>Secondary color</strong>
            <input
              value={assets.secondaryColor}
              onChange={(e) => setConfig({ ...config, assets: { ...assets, secondaryColor: e.target.value } })}
            />
          </label>
          <label>
            <strong>Font</strong>
            <input
              value={assets.fontFamily}
              onChange={(e) => setConfig({ ...config, assets: { ...assets, fontFamily: e.target.value } })}
            />
          </label>
        </div>

        <div className="admin-inline">
          <div>
            <strong>Logo</strong>
            {assets.logo && <img className="admin-logo" src={assets.logo} alt="logo" />}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e.target.files, (url) => setConfig({ ...config, assets: { ...assets, logo: url } }))}
            />
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
                      otherAssets: [
                        ...assets.otherAssets,
                        { id: String(Date.now()), name: `asset-${assets.otherAssets.length + 1}`, url },
                      ],
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
   MAIN
------------------------------ */

export default function AdminDashboard() {
  const allowed = useAdminGuard();
  const { config, updateConfig, loading, error } = useAdminConfigState();
  const [draft, setDraft] = useState<AdminConfig | null>(null);
  const [tab, setTab] = useState<TabKey>("ai");

  // Live data state
  const [clients, setClients] = useState<LiveClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [clientsTable, setClientsTable] = useState<string>("");

  const [generations, setGenerations] = useState<LiveGeneration[]>([]);
  const [gensLoading, setGensLoading] = useState(false);
  const [gensError, setGensError] = useState<string | null>(null);
  const [gensTable, setGensTable] = useState<string>("");

  const firstLoadRef = useRef(false);

  useEffect(() => {
    if (!loading) setDraft(config);
  }, [loading, config]);

  const refreshClients = async () => {
    setClientsLoading(true);
    setClientsError(null);
    try {
      // candidates for "users" table
      const candidates = ["profiles", "clients", "mina_clients", "user_profiles", "users_profile"];
      // select common fields (we try "*" to avoid "column not found" issues across schemas)
      const result = await trySelectFirstWorkingTable(candidates, "*", {
        limit: 500,
        orderBy: { col: "updated_at", asc: false },
      });
      setClientsTable(result.table);
      setClients(normalizeClients(result.rows));
    } catch (e: any) {
      setClientsError(e?.message ?? "Failed to load clients");
      setClients([]);
      setClientsTable("");
    } finally {
      setClientsLoading(false);
    }
  };

  const refreshGenerations = async () => {
    setGensLoading(true);
    setGensError(null);
    try {
      // candidates for generations table
      const candidates = ["generations", "mina_generations", "image_generations", "ai_generations", "runs"];
      const result = await trySelectFirstWorkingTable(candidates, "*", {
        limit: 800,
        orderBy: { col: "created_at", asc: false },
      });
      setGensTable(result.table);
      setGenerations(normalizeGenerations(result.rows));
    } catch (e: any) {
      setGensError(e?.message ?? "Failed to load generations");
      setGenerations([]);
      setGensTable("");
    } finally {
      setGensLoading(false);
    }
  };

  // Auto load live tables once admin is allowed (so tab isn't empty)
  useEffect(() => {
    if (allowed !== true) return;
    if (firstLoadRef.current) return;
    firstLoadRef.current = true;

    void refreshClients();
    void refreshGenerations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  if (allowed === null || loading || !draft) return <div style={{ padding: 24 }}>Loading admin…</div>;
  if (allowed === false) return null;

  const setConfig = (next: AdminConfig) => setDraft(next);

  const handleSave = async () => {
    try {
      /**
       * IMPORTANT:
       * We DO NOT want to store live clients/generations inside config table.
       * So we save a "clean" config payload.
       */
      const clean: AdminConfig = {
        ...draft,
        // optional: keep logs local; if your AdminConfig includes logs, keep as-is or empty
        // @ts-ignore
        clients: Array.isArray((draft as any).clients) ? (draft as any).clients : [],
        // @ts-ignore
        generations: (draft as any).generations ? { ...(draft as any).generations, records: [] } : (draft as any).generations,
      };

      await updateConfig(clean);
      alert("Saved ✅");
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    }
  };

  const rightStatus = (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Clients: <strong>{clients.length}</strong>
        {clientsTable ? <span> ({clientsTable})</span> : ""}
      </span>
      <span className="admin-muted" style={{ fontSize: 12 }}>
        Generations: <strong>{generations.length}</strong>
        {gensTable ? <span> ({gensTable})</span> : ""}
      </span>
    </div>
  );

  return (
    <div className="admin-shell">
      <AdminHeader onSave={handleSave} rightStatus={rightStatus} />
      <StickyTabs active={tab} onChange={setTab} />

      {error && <div style={{ padding: 12, color: "crimson" }}>{error}</div>}

      <div className="admin-content">
        {tab === "ai" && <AISettingsTab config={draft} setConfig={setConfig} />}
        {tab === "pricing" && <PricingTab config={draft} setConfig={setConfig} />}
        {tab === "styles" && <StylesTab config={draft} setConfig={setConfig} />}

        {tab === "generations" && (
          <GenerationsTab
            records={generations}
            loading={gensLoading}
            error={gensError}
            onRefresh={() => void refreshGenerations()}
          />
        )}

        {tab === "clients" && (
          <ClientsTab
            clients={clients}
            loading={clientsLoading}
            error={clientsError}
            onRefresh={() => void refreshClients()}
          />
        )}

        {tab === "logs" && <LogsTab config={draft} />}

        {tab === "architecture" && <ArchitectureTab config={draft} setConfig={setConfig} />}
        {tab === "assets" && <AssetsTab config={draft} setConfig={setConfig} />}
      </div>

      <div className="admin-footer">
        Saved in Supabase: mina_admin_config + mina_admin_secrets
        <span className="admin-muted" style={{ marginLeft: 10 }}>
          (live data not saved)
        </span>
      </div>
    </div>
  );
}

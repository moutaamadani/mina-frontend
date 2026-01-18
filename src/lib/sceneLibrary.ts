// FILE: src/lib/sceneLibrary.ts

export type SceneLibraryItem = {
  id: string;
  title: string;
  url: string;
  keywords: string[];
};

// ✅ Hard fallback (used only if env is missing/empty)
export const FALLBACK_SCENE_LIBRARY_RAW =
  "1,Fostered glass bottle,https://assets.faltastudio.com/mma/still/12656216-f4ae-44a2-8416-e9b98875f024.png,editorial;balck;gradient;luxury;blur;soft|" +
  "2,Perfume bottle 1,https://assets.faltastudio.com/mma/still/88a1569d-0e9f-486e-b664-ac4d3cc8dce0.png,editorial;warm;beige;muted tone;luxury;calm;perfume;soft";

function clean(s: any) {
  let t = String(s ?? "").trim();

  // Strip nested quotes repeatedly:  '"... "'  or  "'...'"
  while (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }

  return t;
}

function tryJson(raw: string) {
  const s = clean(raw);
  if (!s) return null;
  if (!(s.startsWith("[") || s.startsWith("{"))) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Supports:
 * 1) JSON: [{"id":"1","title":"...","url":"...","keywords":["a","b"]}]
 * 2) Pipe: ID,title,url,kw1;kw2;kw3|ID,title,url,kw1;kw2|
 */
export function parseSceneLibraryEnv(raw: any): SceneLibraryItem[] {
  const input = clean(raw);
  if (!input) return [];

  const j = tryJson(input);
  if (Array.isArray(j)) {
    return j
      .map((x: any) => ({
        id: clean(x?.id ?? x?.ID),
        title: clean(x?.title ?? x?.name),
        url: clean(x?.url ?? x?.imageUrl),
        keywords: Array.isArray(x?.keywords)
          ? x.keywords.map(clean).filter(Boolean)
          : clean(x?.keywords)
              .split(/[;,\s]+/)
              .map(clean)
              .filter(Boolean),
      }))
      .filter((x) => x.id && x.title && x.url);
  }

  // Pipe format
  const rows = input.split("|").map((r) => clean(r)).filter(Boolean);

  const out: SceneLibraryItem[] = [];

  for (const row of rows) {
    // Robust parsing: find the token that starts with http(s) -> that's the URL
    const parts = row.split(",").map((p) => clean(p)).filter((p) => p !== "");
    if (parts.length < 3) continue;

    const id = parts[0];

    const urlIdx = parts.findIndex((p) => /^https?:\/\//i.test(p));
    if (urlIdx === -1) continue;

    const title = parts.slice(1, urlIdx).join(",").trim();
    const url = parts[urlIdx];

    const kwRaw = parts.slice(urlIdx + 1).join(",").trim();
    const keywords = kwRaw ? kwRaw.split(";").map(clean).filter(Boolean) : [];

    if (!id || !title || !url) continue;
    out.push({ id, title, url, keywords });
  }

  return out;
}

/**
 * ✅ Single helper: returns env if present, otherwise fallback.
 */
export function getSceneLibraryRawFromViteEnv(): string {
  const raw = (import.meta as any)?.env?.VITE_SCENE_LIBRARY_JSON;
  const cleaned = clean(raw);
  return cleaned ? cleaned : FALLBACK_SCENE_LIBRARY_RAW;
}

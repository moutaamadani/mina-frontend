// FILE: src/lib/sceneLibrary.ts

export type SceneLibraryItem = {
  id: string;
  title: string;
  url: string;
  keywords: string[];
};

// ✅ Hard fallback (used only if env is missing/empty)
export const FALLBACK_SCENE_LIBRARY_RAW =
  "1,Frosted glass vessel with amber liquid,https://assets.faltastudio.com/mma/still/12656216-f4ae-44a2-8416-e9b98875f024.png,editorial;frosted glass;glass sculpture;amber liquid;macro;still life;luxury;soft light;minimal;industry perfumery;industry luxury;background black;gradient|" +
  "2,Amouage perfume with red anthurium,https://assets.faltastudio.com/mma/still/88a1569d-0e9f-486e-b664-ac4d3cc8dce0.png,editorial;perfume;amouage;jubilation 40;anthurium;red flower;still life;luxury;warm light;muted tone;industry perfumery;industry beauty;background beige|" +
  "3,Ceramic bow cuff bracelet still life,https://assets.faltastudio.com/mma/still/53005a7d-7e05-41e5-9bab-bae2498a3af7.png,editorial;ceramic;bow;bracelet;cuff;jewelry;sculpture;still life;minimal;handmade;industry fashion;industry accessories;background blue|" +
  "4,Hermes leather mushroom pouch,https://assets.faltastudio.com/mma/still/6ba951cb-457f-4276-832f-b3f9e58e39ef.png,editorial;hermes;leather;pouch;zipper;accessories;luxury;product shot;industry fashion;industry luxury;background blue;dark gradient|" +
  "5,Influencer lifestyle bedroom iPhone photo,https://assets.faltastudio.com/mma/still/268f50ef-5633-4a08-b325-9d1c80d07d91.png,lifestyle;influencer;iphone photo;bedroom;woman;dog;home interior;natural light;ugc;social media;industry lifestyle;industry fashion;background beige|" +
  "6,Perfume bottle wrapped by green snake,https://assets.faltastudio.com/mma/still/22f2c4b7-60dd-4e9b-a622-6f3530d16af1.png,editorial;perfume;fragrance;snake;green snake;still life;glass bottle;dark luxury;surreal;industry perfumery;industry beauty;background red|" +
  "7,Red loafers with eggplants and glazed donut,https://assets.faltastudio.com/mma/still/da8e364c-950c-47fb-87ea-9ffe191c8699.png,fashion;still life;shoes;loafers;red shoes;eggplant;aubergine;donut;food styling;editorial;industry fashion;industry luxury;background beige|" +
  "8,Bather soothing body cleanser tube,https://assets.faltastudio.com/mma/still/dedf0568-e47b-4beb-a2b9-53b76667db98.png,editorial;body cleanser;skincare;cosmetics;tube;black packaging;minimal;product shot;still life;luxury;soft light;studio lighting;industry beauty;industry skincare;background navy blue;blue;gradient;background beige;cream|" +
  "9,Editorial portrait with gold jewelry,https://assets.faltastudio.com/mma/still/22d25022-90b5-4584-8b20-76d1af650691.png,editorial;portrait;beauty;fashion;model;woman;slick hair;blonde;gold jewelry;earrings;necklace;chain;charms;luxury;soft light;muted tones;close-up;studio portrait;industry fashion;industry jewelry;industry beauty;background olive green;background green;gradient";

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

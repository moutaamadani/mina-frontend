import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const table = process.env.MINA_GENERATIONS_TABLE || "generations";
const fullCol = process.env.MINA_FULL_URL_COLUMN || "full_url";
const smallCol = process.env.MINA_SMALL_URL_COLUMN || "small_url";
const outputCol = process.env.MINA_OUTPUT_URL_COLUMN || "output_url";
const widthCol = process.env.MINA_WIDTH_COLUMN || "";
const heightCol = process.env.MINA_HEIGHT_COLUMN || "";

const columns = ["id", fullCol, smallCol, outputCol, widthCol, heightCol].filter(Boolean).join(", ");

function buildSmallImageUrl(url, targetWidth = 720) {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("w", String(targetWidth));
    parsed.searchParams.set("q", "70");
    parsed.searchParams.set("auto", "format,compress");
    parsed.searchParams.set("format", "webp");
    return parsed.toString();
  } catch (err) {
    console.warn("Could not build resized URL for", url, err?.message);
    return url;
  }
}

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log(`Scanning ${table} for rows missing ${smallCol}…`);

  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .is(smallCol, null);

  if (error) {
    console.error("Failed to fetch rows:", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("No rows to backfill.");
    return;
  }

  let updatedCount = 0;
  for (const row of data) {
    const fullUrl = row[fullCol] || row[outputCol];
    if (!fullUrl) {
      console.warn(`Skipping row ${row.id}: missing ${fullCol}/${outputCol}`);
      continue;
    }

    const smallUrl = buildSmallImageUrl(fullUrl);
    const payload = { [smallCol]: smallUrl };

    if (widthCol && row[widthCol]) payload[widthCol] = row[widthCol];
    if (heightCol && row[heightCol]) payload[heightCol] = row[heightCol];

    const { error: updateError } = await supabase.from(table).update(payload).eq("id", row.id);
    if (updateError) {
      console.error(`Failed to update row ${row.id}:`, updateError.message);
      continue;
    }

    updatedCount += 1;
  }

  console.log(`Backfill complete. Updated ${updatedCount} rows.`);
}

main().catch((err) => {
  console.error("Unexpected backfill error:", err);
  process.exit(1);
});

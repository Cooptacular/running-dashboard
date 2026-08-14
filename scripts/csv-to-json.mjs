import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const CSV_PATH = resolve(ROOT, "../Activities.csv");
const OUT_PATH = resolve(ROOT, "src/data/runsHistory.json");

const MI_TO_KM = 1.60934;
const FT_TO_M  = 0.3048;

const RUNNING_TYPES = new Set(["Running", "Trail Running"]);

function parseTime(hms) {
  if (!hms || hms === "--") return null;
  const parts = hms.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return null;
}

function clean(val) {
  if (!val || val.trim() === "--") return null;
  return val.replace(/,/g, "").trim();
}

const raw = readFileSync(CSV_PATH, "utf8");
const lines = raw.split("\n").filter(Boolean);
const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

const runs = [];

for (let i = 1; i < lines.length; i++) {
  // Respect quoted fields that may contain commas
  const cols = [];
  let cur = "", inQuote = false;
  for (const ch of lines[i]) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === "," && !inQuote) { cols.push(cur); cur = ""; }
    else { cur += ch; }
  }
  cols.push(cur);

  const row = Object.fromEntries(headers.map((h, j) => [h, (cols[j] ?? "").trim()]));

  if (!RUNNING_TYPES.has(row["Activity Type"])) continue;

  const distMi  = parseFloat(clean(row["Distance"]));
  const durationMin = parseTime(clean(row["Time"]));
  const ascentFt = parseFloat(clean(row["Total Ascent"]));
  const hr = parseFloat(clean(row["Avg HR"]));
  const dateStr = row["Date"]?.slice(0, 10) ?? null;

  if (!dateStr || isNaN(distMi) || distMi <= 0 || durationMin == null) continue;

  runs.push({
    id:               i,
    date:             dateStr,
    activity_type:    row["Activity Type"] === "Trail Running" ? "trail_running" : "running",
    distance_km:      Math.round(distMi * MI_TO_KM * 100) / 100,
    duration_min:     Math.round(durationMin * 10) / 10,
    avg_hr:           isNaN(hr) ? null : hr,
    elevation_gain_m: isNaN(ascentFt) ? null : Math.round(ascentFt * FT_TO_M),
  });
}

runs.sort((a, b) => a.date.localeCompare(b.date));

writeFileSync(OUT_PATH, JSON.stringify(runs, null, 2));
console.log(`Wrote ${runs.length} runs to src/data/runsHistory.json`);

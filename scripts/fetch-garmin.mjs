import "dotenv/config";
import pkg from "@flow-js/garmin-connect";
const { GarminConnect, ActivityType, ActivitySubType } = pkg;
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TOKEN_DIR = resolve(ROOT, ".garmin-tokens");
const OUTPUT = resolve(ROOT, "src/data/runs.json");
const ACTIVITY_LIMIT = Number(process.env.GARMIN_ACTIVITY_LIMIT) || 50;

// ── Auth ──────────────────────────────────────────────────────────────────────

const email = process.env.GARMIN_EMAIL;
const password = process.env.GARMIN_PASSWORD;

if (!email || !password) {
  console.error("Missing GARMIN_EMAIL or GARMIN_PASSWORD in .env");
  process.exit(1);
}

const client = new GarminConnect({ username: email, password });

if (!existsSync(TOKEN_DIR)) mkdirSync(TOKEN_DIR, { recursive: true });

// Try cached tokens first so we don't hammer Garmin's login endpoint.
const tokenFile = resolve(TOKEN_DIR, "oauth2.json");
let loggedIn = false;

if (existsSync(tokenFile)) {
  try {
    client.loadTokenByFile(TOKEN_DIR);
    // Lightweight check: fetch profile to verify token is still valid.
    await client.getUserProfile();
    loggedIn = true;
    console.log("Using cached OAuth tokens.");
  } catch {
    console.log("Cached tokens expired — logging in fresh.");
  }
}

if (!loggedIn) {
  await client.login();
  client.exportTokenToFile(TOKEN_DIR);
  console.log("Logged in and tokens cached.");
}

// ── Fetch activities ──────────────────────────────────────────────────────────

console.log(`Fetching last ${ACTIVITY_LIMIT} running activities…`);

// Fetch more than we need unfiltered, then keep only running sub-types client-side.
// Passing ActivityType.Running directly causes a 400 because Garmin treats
// "street_running" as a sub-type, not a top-level type.
const RUNNING_TYPES = new Set([
  "street_running", "trail_running", "treadmill_running", "track_running", "running",
]);
const raw = await client.getActivities(0, ACTIVITY_LIMIT * 3);
const activities = raw
  .filter((a) => RUNNING_TYPES.has(a.activityType?.typeKey ?? a.activityType))
  .slice(0, ACTIVITY_LIMIT);

if (!activities?.length) {
  console.warn("No running activities returned. Check your credentials and that you have runs logged.");
  process.exit(0);
}

// ── Transform ─────────────────────────────────────────────────────────────────
// Garmin's API returns distances in metres and durations in seconds.

function isoDate(ts) {
  // startTimeLocal is "YYYY-MM-DD HH:MM:SS", startTimeGMT is similar.
  if (!ts) return null;
  return ts.slice(0, 10);
}

const runs = activities
  .map((a, i) => ({
    id: a.activityId ?? i + 1,
    date: isoDate(a.startTimeLocal ?? a.startTimeGMT),
    activity_type: a.activityType?.typeKey ?? a.activityType ?? "running",
    distance_km: a.distance != null ? Math.round((a.distance / 1000) * 100) / 100 : null,
    duration_min: a.duration != null ? Math.round((a.duration / 60) * 10) / 10 : null,
    avg_hr: a.averageHR ?? null,
    elevation_gain_m: a.elevationGain != null ? Math.round(a.elevationGain) : null,
  }))
  .filter((r) => r.date && r.distance_km != null && r.duration_min != null)
  .sort((a, b) => a.date.localeCompare(b.date));

// ── Write ─────────────────────────────────────────────────────────────────────

writeFileSync(OUTPUT, JSON.stringify(runs, null, 2));
console.log(`Wrote ${runs.length} runs to src/data/runs.json`);

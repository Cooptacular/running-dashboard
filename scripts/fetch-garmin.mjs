import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { lookup } from "node:dns/promises";

const GARMIN_HOST = "thegarth.s3.amazonaws.com";
const activeProxyVars = Object.entries(process.env)
  .filter(([key, value]) => /proxy/i.test(key) && value)
  .map(([key, value]) => `${key}=${value}`);

if (activeProxyVars.length) {
  console.warn("Detected proxy environment variables that can block Garmin OAuth:");
  for (const entry of activeProxyVars) {
    console.warn(`  ${entry}`);
  }
}

for (const key of [
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
]) {
  delete process.env[key];
}

const { default: pkg } = await import("@flow-js/garmin-connect");
const { GarminConnect, ActivityType, ActivitySubType } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TOKEN_DIR = resolve(ROOT, ".garmin-tokens");
const OUTPUT = resolve(ROOT, "src/data/runs.json");
const ACTIVITY_LIMIT = Number(process.env.GARMIN_ACTIVITY_LIMIT) || 50;

async function ensureGarminReachable() {
  try {
    await lookup(GARMIN_HOST);
    return;
  } catch (error) {
    console.error("Garmin OAuth host is not reachable from this environment before login begins.");
    console.error(`Host checked: ${GARMIN_HOST}`);
    console.error("This usually means a proxy, VPN, firewall, or restricted outbound network is blocking Garmin.");
    if (activeProxyVars.length) {
      console.error("Proxy variables were detected and cleared for this run to avoid forcing the request through the blocked proxy.");
    }
    console.error(error?.message || error);
    process.exit(1);
  }
}

await ensureGarminReachable();

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
  try {
    await client.login();
    client.exportTokenToFile(TOKEN_DIR);
    console.log("Logged in and tokens cached.");
  } catch (error) {
    console.error("Garmin login failed. This is typically caused by a blocked outbound proxy or network restriction.");
    console.error("The OAuth request to https://thegarth.s3.amazonaws.com/oauth_consumer.json is being denied.");
    console.error(error?.response?.data || error?.message || error);
    process.exit(1);
  }
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

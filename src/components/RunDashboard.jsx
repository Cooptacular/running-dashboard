import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

// --- Sample data -----------------------------------------------------------
// This is baked in ONLY so the component renders on its own in preview.
// In your Astro project you'll delete this and pass real data in as a prop
// (see the dashboard.astro file). The shape mirrors what a fitness API
// (e.g. Strava) hands back, so swapping static -> live later is painless.
const defaultRuns = [
  { id: 1, date: "2026-04-20", distance_km: 5.1, duration_min: 28.3, avg_hr: 148, elevation_gain_m: 32 },
  { id: 2, date: "2026-04-22", distance_km: 8.0, duration_min: 44.1, avg_hr: 156, elevation_gain_m: 60 },
  { id: 3, date: "2026-04-25", distance_km: 16.2, duration_min: 95.4, avg_hr: 151, elevation_gain_m: 180 },
  { id: 4, date: "2026-04-27", distance_km: 5.0, duration_min: 27.0, avg_hr: 145, elevation_gain_m: 28 },
  { id: 5, date: "2026-04-29", distance_km: 10.1, duration_min: 54.8, avg_hr: 159, elevation_gain_m: 90 },
  { id: 6, date: "2026-05-02", distance_km: 6.4, duration_min: 34.2, avg_hr: 150, elevation_gain_m: 41 },
  { id: 7, date: "2026-05-04", distance_km: 8.2, duration_min: 43.0, avg_hr: 162, elevation_gain_m: 55 },
  { id: 8, date: "2026-05-06", distance_km: 5.0, duration_min: 26.5, avg_hr: 144, elevation_gain_m: 30 },
  { id: 9, date: "2026-05-09", distance_km: 18.5, duration_min: 108.7, avg_hr: 153, elevation_gain_m: 210 },
  { id: 10, date: "2026-05-11", distance_km: 6.0, duration_min: 32.1, avg_hr: 147, elevation_gain_m: 38 },
  { id: 11, date: "2026-05-13", distance_km: 9.3, duration_min: 48.9, avg_hr: 160, elevation_gain_m: 72 },
  { id: 12, date: "2026-05-16", distance_km: 5.2, duration_min: 27.4, avg_hr: 143, elevation_gain_m: 26 },
  { id: 13, date: "2026-05-18", distance_km: 11.0, duration_min: 58.5, avg_hr: 158, elevation_gain_m: 98 },
  { id: 14, date: "2026-05-21", distance_km: 21.1, duration_min: 122.3, avg_hr: 155, elevation_gain_m: 245 },
  { id: 15, date: "2026-05-24", distance_km: 6.1, duration_min: 33.0, avg_hr: 149, elevation_gain_m: 35 },
];

// --- Small helpers ---------------------------------------------------------
// Turn a decimal pace (e.g. 5.5 min/km) into a clock-style label "5:30".
function formatPace(minPerKm) {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// Short label like "Apr 20" for chart axes.
function shortDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Find the Monday that starts the week for a given date (used to group runs).
function weekStart(iso) {
  const d = new Date(iso);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export default function RunDashboard({ runs = defaultRuns }) {
  // useMemo just means "only recompute this when `runs` changes" — a small
  // performance habit. For 15 runs it's irrelevant; for thousands it matters.
  const sorted = useMemo(
    () => [...runs].sort((a, b) => a.date.localeCompare(b.date)),
    [runs]
  );

  // Per-run data for the line chart, with pace derived on the fly.
  const perRun = useMemo(
    () =>
      sorted.map((r) => ({
        label: shortDate(r.date),
        distance: r.distance_km,
        pace: r.duration_min / r.distance_km, // minutes per km
      })),
    [sorted]
  );

  // Weekly totals for the bar chart: sum distance by week.
  const weekly = useMemo(() => {
    const buckets = {};
    for (const r of sorted) {
      const wk = weekStart(r.date);
      buckets[wk] = (buckets[wk] || 0) + r.distance_km;
    }
    return Object.entries(buckets).map(([wk, km]) => ({
      label: shortDate(wk),
      km: Math.round(km * 10) / 10,
    }));
  }, [sorted]);

  // The four headline numbers.
  const stats = useMemo(() => {
    const totalKm = sorted.reduce((s, r) => s + r.distance_km, 0);
    const totalMin = sorted.reduce((s, r) => s + r.duration_min, 0);
    const longest = sorted.reduce((m, r) => Math.max(m, r.distance_km), 0);
    return {
      totalKm: totalKm.toFixed(1),
      runs: sorted.length,
      avgPace: formatPace(totalMin / totalKm),
      longest: longest.toFixed(1),
    };
  }, [sorted]);

  const cards = [
    { label: "Total distance", value: stats.totalKm, unit: "km" },
    { label: "Runs logged", value: stats.runs, unit: "" },
    { label: "Avg pace", value: stats.avgPace, unit: "/km" },
    { label: "Longest run", value: stats.longest, unit: "km" },
  ];

  return (
    <div className="min-h-screen w-full bg-stone-50 text-stone-900 p-6 sm:p-10">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">
            Training log
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Running Dashboard</h1>
          <p className="mt-2 text-stone-500">
            Last {stats.runs} runs &middot; {stats.totalKm} km total
          </p>
        </header>

        {/* Stat cards */}
        <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
                {c.label}
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums">
                {c.value}
                <span className="ml-1 text-base font-medium text-stone-400">{c.unit}</span>
              </p>
            </div>
          ))}
        </section>

        {/* Distance + pace over time */}
        <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">Distance per run</h2>
          <p className="mb-4 text-sm text-stone-500">Each point is one run, oldest to newest.</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={perRun} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#78716c" }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#78716c" }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v) => [`${v} km`, "Distance"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4" }}
                />
                <Line
                  type="monotone"
                  dataKey="distance"
                  stroke="#ea580c"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#ea580c" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Weekly mileage */}
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">Weekly mileage</h2>
          <p className="mb-4 text-sm text-stone-500">Total distance grouped by week.</p>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#78716c" }} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#78716c" }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v) => [`${v} km`, "Weekly total"]}
                  cursor={{ fill: "#fafaf9" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4" }}
                />
                <Bar dataKey="km" fill="#0d9488" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

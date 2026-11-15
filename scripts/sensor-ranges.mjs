// scripts/sensor-ranges.mjs
// Copies the fixed sensor alert ranges from the settings file
//   apps/shared/config/sensorStableRanges.json
// into the database table public.sensor_stable_ranges, which the alert rule
// (check_reading_stable_range) and the Monitoring page read.
//
//   npm run sensor-ranges          check the file and print the SQL to paste into
//                                  the Supabase SQL editor (no keys needed)
//   npm run sensor-ranges:push     check the file and write it to the database with
//                                  SUPABASE_URL and SUPABASE_SECRET_KEY (read from
//                                  services/api/.env when present)
import { readFileSync } from "node:fs";
import process from "node:process";

const FILE = new URL("../apps/shared/config/sensorStableRanges.json", import.meta.url);
const FIELDS = ["temperature", "humidity", "soil_moisture"];
// What a sensor can physically send (POST /telemetry validation in services/api/src/sensors.js).
const SENSOR_LIMITS = { temperature: [-50, 80], humidity: [0, 100], soil_moisture: [0, 100] };

// The rows to store, or throws with every problem in the file.
export function readRanges(text) {
  let settings;
  try {
    settings = JSON.parse(text);
  } catch (e) {
    throw new Error(`The settings file is not valid JSON: ${e.message}`);
  }
  const problems = [];
  const unknown = Object.keys(settings).filter((k) => !k.startsWith("$") && !FIELDS.includes(k));
  if (unknown.length) problems.push(`Unknown reading(s): ${unknown.join(", ")}. Use ${FIELDS.join(", ")}.`);
  const rows = [];
  for (const field of FIELDS) {
    const r = settings[field];
    const [lo, hi] = SENSOR_LIMITS[field];
    if (!r || typeof r.min !== "number" || typeof r.max !== "number") {
      problems.push(`${field}: needs a number "min" and "max".`);
      continue;
    }
    if (r.min >= r.max) problems.push(`${field}: min (${r.min}) must be below max (${r.max}).`);
    if (r.min < lo || r.max > hi) problems.push(`${field}: keep the range within what the sensor sends (${lo} to ${hi}).`);
    rows.push({ field, min_value: r.min, max_value: r.max });
  }
  if (problems.length) throw new Error(problems.join("\n"));
  return rows;
}

const toSql = (rows) => [
  "insert into public.sensor_stable_ranges (field, min_value, max_value, updated_at) values",
  rows.map((r) => `  ('${r.field}', ${r.min_value}, ${r.max_value}, now())`).join(",\n"),
  "on conflict (field) do update set min_value = excluded.min_value, max_value = excluded.max_value, updated_at = now();",
].join("\n");

async function push(rows) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (services/api/.env), or run `npm run sensor-ranges` and paste the SQL into the Supabase SQL editor.");
  }
  const headers = {
    apikey: key,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`; // an older JWT service_role key
  const body = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/sensor_stable_ranges?on_conflict=field`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 404 || text.includes("PGRST205") ? " Has migration 20261115000000 been applied?" : "";
    throw new Error(`Supabase answered ${res.status}: ${text.slice(0, 300)}${hint}`);
  }
  return JSON.parse(text);
}

async function main() {
  const rows = readRanges(readFileSync(FILE, "utf8"));
  console.log("Stable ranges in apps/shared/config/sensorStableRanges.json:");
  for (const r of rows) console.log(`  ${r.field.padEnd(14)} ${r.min_value} to ${r.max_value}`);
  if (!process.argv.includes("--push")) {
    console.log("\nSQL for the Supabase SQL editor (or run `npm run sensor-ranges:push`):\n");
    console.log(toSql(rows));
    return;
  }
  const saved = await push(rows);
  console.log(`\nSaved ${saved.length} range(s) to the database. New readings are checked against them now;`);
  console.log("open Monitoring pages show them on their next refresh.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\n${e.message}`);
    process.exit(1);
  });
}

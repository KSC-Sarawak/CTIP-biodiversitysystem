// apps/shared/sensorLimits.js
// The rule-based alert ranges for sensor readings (team decision, 2026-11-15).
//
// The numbers live in one settings file: apps/shared/config/sensorStableRanges.json.
// `npm run sensor-ranges:push` copies them into the sensor_stable_ranges table,
// which the database alert rule reads (check_reading_stable_range, migration
// 20261116000000). The apps show what that table holds (db.stableRanges, from the
// workspace load), and fall back to the file when the table could not be loaded.
//
// Every node uses this one preset range. Per-node ranges (node.thresholds) are not
// used for now: the team has not decided on that feature (2026-11-16).
import SETTINGS from "./config/sensorStableRanges.json";

// What each reading is called and its unit.
export const SENSOR_FIELDS = {
  temperature: { label: "Temperature", unit: "°C" },
  humidity: { label: "Air humidity", unit: "%" },
  soil_moisture: { label: "Soil moisture", unit: "%" },
};

const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

// The preset ranges from the settings file: { temperature: { min, max }, ... }.
export const FILE_RANGES = Object.fromEntries(
  Object.keys(SENSOR_FIELDS).map((f) => [f, { min: num(SETTINGS[f]?.min), max: num(SETTINGS[f]?.max) }]),
);

// The preset ranges in use: the database's copy where it has one, else the file's.
export function fixedRanges(db) {
  const fromDb = db?.stableRanges || {};
  return Object.fromEntries(Object.keys(SENSOR_FIELDS).map((f) => {
    const d = fromDb[f];
    return [f, d && num(d.min) != null && num(d.max) != null ? { min: num(d.min), max: num(d.max) } : FILE_RANGES[f]];
  }));
}

// "low", "high", or null when the reading is in range, missing, or has no range.
export function rangeState(reading, field, ranges) {
  const v = num(reading?.[field]);
  const l = ranges?.[field];
  if (v == null || !l) return null;
  if (l.min != null && v < l.min) return "low";
  if (l.max != null && v > l.max) return "high";
  return null;
}

export const outOfRange = (reading, ranges) =>
  Object.keys(SENSOR_FIELDS).some((f) => rangeState(reading, f, ranges));

// "18 to 35 °C", "40 to 100%".
export const rangeText = (r, unit) => (r?.min == null || r?.max == null ? "not set" : `${r.min} to ${r.max}${unit === "%" ? "%" : ` ${unit}`}`);

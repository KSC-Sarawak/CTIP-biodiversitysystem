// apps/shared/offline/captureTimings.js
// Time per record (CTIP-146, innovation CTIP-51): how long a botanist takes from
// opening Add plant for a tag to the record being saved (on the phone or sent).
// The rows stay on the phone (capture_timings, schema v6) and are exported as
// CSV for the field evaluation (CTIP-148). A row never holds a location, tag,
// species or notes: only times, counts and yes/no flags (threat model: no
// location leaks).
//
// No React or Expo import, so node can load it in the tests.
import { toCsv } from "../utils.js";

/** A form open longer than this was left and picked up later: kept, not summarised. */
export const ABANDONED_MS = 4 * 60 * 60 * 1000;

const validIso = (v) => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** The draft's start if it has a valid one (a resumed draft keeps its start), else now. */
export function firstStart(draft, nowIso) {
  return validIso(draft?.started_at) ? draft.started_at : nowIso;
}

/**
 * One timing row, built only from the named fields so nothing else can slip in.
 * null when a time is not a date or the save is before the start.
 */
export function timingRow({ id, userId, surveyId = null, startedAt, savedAt, offline, photos, located }) {
  if (!validIso(startedAt) || !validIso(savedAt)) return null;
  const start = new Date(startedAt);
  const saved = new Date(savedAt);
  const duration = saved.getTime() - start.getTime();
  if (duration < 0) return null;
  return {
    id,
    user_id: userId,
    survey_id: surveyId ?? null,
    started_at: start.toISOString(),
    saved_at: saved.toISOString(),
    duration_ms: duration,
    offline: offline ? 1 : 0,
    photos: Number.isInteger(photos) && photos > 0 ? photos : 0,
    located: located ? 1 : 0,
  };
}

// Nearest-rank percentile of sorted numbers (p in 0..100).
const nearestRank = (sorted, p) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];

/** How many rows, how many count (not abandoned), and their median and 90th percentile. */
export function summarizeTimings(rows = []) {
  const kept = rows.map((r) => r.duration_ms).filter((ms) => ms <= ABANDONED_MS).sort((a, b) => a - b);
  return {
    count: rows.length,
    counted: kept.length,
    medianMs: kept.length ? nearestRank(kept, 50) : null,
    p90Ms: kept.length ? nearestRank(kept, 90) : null,
  };
}

export const TIMING_CSV_COLUMNS = ["started_at", "saved_at", "duration_s", "offline", "photos", "located", "survey_id"];

/** The rows as CSV for the field evaluation, one line per record. */
export function timingsCsv(rows = []) {
  return toCsv([
    TIMING_CSV_COLUMNS,
    ...rows.map((r) => [
      r.started_at, r.saved_at, (r.duration_ms / 1000).toFixed(1), r.offline, r.photos, r.located, r.survey_id ?? "",
    ]),
  ]);
}

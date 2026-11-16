// apps/shared/test/capture-timings.test.js
// Time per record (CTIP-146): measured on the phone from opening Add plant to
// the record being saved, kept only on the phone, never with a location.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ABANDONED_MS, firstStart, timingRow, summarizeTimings, timingsCsv } from "../offline/captureTimings.js";

const base = { id: "a", userId: "u", startedAt: "2026-11-16T01:00:00Z" };
const at = (s) => new Date(Date.parse("2026-11-16T01:00:00Z") + s * 1000).toISOString();
const rowOf = (seconds, extra = {}) =>
  timingRow({ ...base, id: `r${seconds}`, savedAt: at(seconds), offline: false, photos: 1, located: true, ...extra });

test("firstStart keeps a resumed draft's start", () => {
  assert.equal(firstStart({ started_at: "2026-11-16T01:00:00.000Z" }, "2026-11-16T02:00:00.000Z"), "2026-11-16T01:00:00.000Z");
  assert.equal(firstStart({}, "2026-11-16T02:00:00.000Z"), "2026-11-16T02:00:00.000Z");
  assert.equal(firstStart({ started_at: "not a date" }, "2026-11-16T02:00:00.000Z"), "2026-11-16T02:00:00.000Z");
  assert.equal(firstStart(null, "2026-11-16T02:00:00.000Z"), "2026-11-16T02:00:00.000Z");
});

test("timingRow measures start to save, and refuses a save before the start", () => {
  const row = timingRow({ ...base, savedAt: "2026-11-16T01:02:30Z", offline: true, photos: 2, located: true });
  assert.equal(row.duration_ms, 150000);
  assert.equal(row.offline, 1);
  assert.equal(row.photos, 2);
  assert.equal(row.located, 1);
  assert.equal(row.survey_id, null);
  assert.equal(timingRow({ ...base, id: "b", savedAt: "2026-11-16T00:59:00Z" }), null);
  assert.equal(timingRow({ ...base, id: "c", startedAt: "garbage", savedAt: "2026-11-16T01:00:00Z" }), null);
});

test("a timing row never holds a location, tag, species or notes", () => {
  const row = timingRow({
    ...base, savedAt: "2026-11-16T01:01:00Z", offline: false, photos: 1, located: true,
    lat: 3.8, lng: 113.7, qr_id: "NIAH-1", proposed_species: "X", notes: "near the river",
  });
  assert.deepEqual(Object.keys(row).sort(),
    ["duration_ms", "id", "located", "offline", "photos", "saved_at", "started_at", "survey_id", "user_id"]);
});

test("summary leaves out forms open over 4 hours; median and p90 by nearest rank", () => {
  assert.equal(ABANDONED_MS, 4 * 60 * 60 * 1000);
  const rows = [rowOf(60), rowOf(120), rowOf(180), rowOf(5 * 3600)];
  assert.deepEqual(summarizeTimings(rows), { count: 4, counted: 3, medianMs: 120000, p90Ms: 180000 });
  assert.deepEqual(summarizeTimings([]), { count: 0, counted: 0, medianMs: null, p90Ms: null });
  assert.deepEqual(summarizeTimings([rowOf(5 * 3600)]), { count: 1, counted: 0, medianMs: null, p90Ms: null });
});

test("timingsCsv has the agreed columns", () => {
  const csv = timingsCsv([rowOf(90, { surveyId: "s1", offline: true })]);
  const [head, line] = csv.split("\n");
  assert.equal(head, '"started_at","saved_at","duration_s","offline","photos","located","survey_id"');
  assert.equal(line, `"2026-11-16T01:00:00.000Z","${at(90)}","90.0","1","1","1","s1"`);
});

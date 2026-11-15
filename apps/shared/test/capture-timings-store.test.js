// apps/shared/test/capture-timings-store.test.js
// The phone's store of time-per-record rows (CTIP-146), on Node's SQLite with the
// same migrations the phone runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../offline/schema.js";
import { timingRow } from "../offline/captureTimings.js";
import { createTimingStore } from "../../mobile/offline/timingStore.js";

function sqliteDb() {
  const raw = new DatabaseSync(":memory:");
  const db = {
    raw,
    execSync: (sql) => raw.exec(sql),
    runSync: (sql, params = []) => raw.prepare(sql).run(...params),
    getFirstSync: (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    getAllSync: (sql, params = []) => raw.prepare(sql).all(...params),
  };
  migrate(db);
  return db;
}
const row = (id, userId, savedAt) =>
  timingRow({ id, userId, startedAt: "2026-11-16T01:00:00Z", savedAt, offline: true, photos: 1, located: true });

test("rows are listed per botanist, oldest first", async () => {
  const store = createTimingStore(async () => sqliteDb());
  const db = sqliteDb();
  const s = createTimingStore(async () => db);
  await s.recordTiming(row("b", "me", "2026-11-16T01:05:00Z"));
  await s.recordTiming(row("a", "me", "2026-11-16T01:02:00Z"));
  await s.recordTiming(row("c", "someone-else", "2026-11-16T01:03:00Z"));
  assert.deepEqual((await s.listTimings("me")).map((r) => r.id), ["a", "b"]);
  assert.deepEqual((await store.listTimings("me")), []);
});

test("clear removes only that botanist's rows and says how many", async () => {
  const db = sqliteDb();
  const s = createTimingStore(async () => db);
  await s.recordTiming(row("a", "me", "2026-11-16T01:02:00Z"));
  await s.recordTiming(row("b", "me", "2026-11-16T01:04:00Z"));
  await s.recordTiming(row("c", "someone-else", "2026-11-16T01:03:00Z"));
  assert.equal(await s.clearTimings("me"), 2);
  assert.deepEqual(await s.listTimings("me"), []);
  assert.equal((await s.listTimings("someone-else")).length, 1);
});

test("a lost timing never stops a plant being saved: no database, a bad row or a failing write do not throw", async () => {
  const none = createTimingStore(async () => null);
  await none.recordTiming(row("a", "me", "2026-11-16T01:02:00Z"));
  assert.deepEqual(await none.listTimings("me"), []);
  assert.equal(await none.clearTimings("me"), 0);
  const broken = createTimingStore(async () => ({ runSync() { throw new Error("disk full"); } }));
  await broken.recordTiming(row("a", "me", "2026-11-16T01:02:00Z"));
  const db = sqliteDb();
  await createTimingStore(async () => db).recordTiming(null);
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM capture_timings;").get().n, 0);
});

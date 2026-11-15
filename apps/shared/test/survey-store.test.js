// apps/shared/test/survey-store.test.js
// Survey sessions on the phone (CTIP-147), on Node's SQLite with the phone's migrations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../offline/schema.js";
import { createSurveyStore } from "../../mobile/offline/surveyStore.js";

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

test("a started survey is the botanist's active one until it ends, and survives a restart", async () => {
  const db = sqliteDb();
  const store = createSurveyStore(async () => db);
  const s = await store.startSurvey({ userId: "me", name: "  Plot 4 ", tagTarget: 10 });
  assert.equal(s.name, "Plot 4");
  assert.equal(s.tag_target, 10);
  assert.equal(s.ended_at, null);
  // A fresh store on the same file stands for the app being killed and reopened.
  const again = createSurveyStore(async () => db);
  assert.deepEqual({ ...(await again.activeSurvey("me")) }, s); // node:sqlite rows have a null prototype
  assert.equal(await again.activeSurvey("someone-else"), null);
  await again.endSurvey(s.id);
  assert.equal(await again.activeSurvey("me"), null);
});

test("starting a new survey ends the one still open", async () => {
  const db = sqliteDb();
  const store = createSurveyStore(async () => db);
  const first = await store.startSurvey({ userId: "me", name: "Plot 1", tagTarget: 5 });
  const second = await store.startSurvey({ userId: "me", name: "Plot 2", tagTarget: 5 });
  assert.equal((await store.activeSurvey("me")).id, second.id);
  const row = db.raw.prepare("SELECT ended_at FROM survey_sessions WHERE id = ?;").get(first.id);
  assert.ok(row.ended_at);
});

test("with no database a survey cannot start, and nothing is active", async () => {
  const store = createSurveyStore(async () => null);
  assert.equal(await store.startSurvey({ userId: "me", name: "Plot 4", tagTarget: 10 }), null);
  assert.equal(await store.activeSurvey("me"), null);
});

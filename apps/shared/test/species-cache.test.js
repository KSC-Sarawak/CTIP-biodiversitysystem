// apps/shared/test/species-cache.test.js
// The phone's saved species list (CTIP-84) and its refresh when the connection
// returns (CTIP-68): a forced refresh fetches the list again, but must not
// download every unchanged picture again, and must not be lost when a normal
// refresh is already running. Runs on Node's SQLite through an expo-like adapter;
// expo-file-system is not there under Node, so no picture is downloaded here.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../offline/schema.js";
import { createSpeciesCache, thumbNeedsDownload } from "../../mobile/offline/speciesCache.js";

function expoLikeDb() {
  const raw = new DatabaseSync(":memory:");
  return {
    execSync: (sql) => raw.exec(sql),
    runSync: (sql, params = []) => raw.prepare(sql).run(...params),
    getFirstSync: (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    getAllSync: (sql, params = []) => raw.prepare(sql).all(...params),
    withTransactionSync(task) {
      raw.exec("BEGIN;");
      try {
        task();
        raw.exec("COMMIT;");
      } catch (err) {
        raw.exec("ROLLBACK;");
        throw err;
      }
    },
  };
}

// GET /public/species answers one species; `calls` counts the requests.
function stubFetch(t) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    await new Promise((resolve) => setTimeout(resolve, 5)); // a request takes a moment
    return new Response(JSON.stringify({ data: [{ id: "s1", scientific_name: "Nepenthes rajah", primary_image_url: null }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  return calls;
}

test("a forced refresh asked for while a normal one runs is run after it, not dropped", async (t) => {
  const calls = stubFetch(t);
  const db = expoLikeDb();
  migrate(db);
  // Saved a minute ago, so a normal refresh skips itself.
  db.runSync("INSERT INTO meta (key, value) VALUES (?, ?);", ["species_cached_at", new Date(Date.now() - 60000).toISOString()]);
  const cache = createSpeciesCache(async () => db);

  const normal = cache.refresh();
  const forced = cache.refresh({ force: true });
  const [a, b] = await Promise.all([normal, forced]);

  assert.equal(a.skipped, true, "the normal refresh found the list fresh");
  assert.equal(b.ok, true);
  assert.equal(b.skipped, undefined, "the forced one fetched the list");
  assert.equal(calls.length, 1);
  assert.equal((await cache.all()).list.length, 1);
});

test("two forced refreshes at once share one request", async (t) => {
  const calls = stubFetch(t);
  const db = expoLikeDb();
  migrate(db);
  const cache = createSpeciesCache(async () => db);
  await Promise.all([cache.refresh({ force: true }), cache.refresh({ force: true }), cache.refresh()]);
  assert.equal(calls.length, 1);
});

test("an unchanged picture is not downloaded again, even on a forced refresh", () => {
  const old = { thumb_path: "file:///doc/species-thumbs/s1.jpg", thumb_src: "https://x/a.jpg" };
  assert.equal(thumbNeedsDownload(old, "https://x/a.jpg"), false);
  assert.equal(thumbNeedsDownload(old, "https://x/b.jpg"), true, "a new picture is fetched");
  assert.equal(thumbNeedsDownload({ thumb_path: null, thumb_src: "https://x/a.jpg" }, "https://x/a.jpg"), true, "a failed earlier download is tried again");
  assert.equal(thumbNeedsDownload(undefined, "https://x/a.jpg"), true, "a new species");
});

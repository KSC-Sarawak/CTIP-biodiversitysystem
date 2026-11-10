// Crash-safe form drafts on a shared phone (CTIP-57, case 5 of
// docs/testing/offline-mode-test.md). Under plain Node there is no SQLite or
// AsyncStorage, so apps/mobile/draftStore.js uses its in-memory fallback, which
// follows the same rules.
import test from "node:test";
import assert from "node:assert/strict";
import { saveDraft, getDraft, clearAllDrafts } from "../../mobile/draftStore.js";

test("a draft opens only for the person who started it", async () => {
  await clearAllDrafts();
  // Botanist A starts a record on a tag, then the session ends (not a sign-out,
  // so the drafts are not cleared). Botanist B signs in and scans the same tag.
  await saveDraft("TEST-TAG-1", { user_id: "user-a", notes: "near the stream", gps: { lat: 1, lng: 2 } });
  assert.equal(await getDraft("TEST-TAG-1", "user-b"), null, "B must not get A's notes, photos or GPS");
  assert.equal((await getDraft("TEST-TAG-1", "user-a"))?.notes, "near the stream");
  assert.equal(await getDraft("TEST-TAG-1"), null, "nobody signed in gets nothing");
  await clearAllDrafts();
});

test("a draft from before drafts had an owner still opens when its tag is scanned", async () => {
  await clearAllDrafts();
  await saveDraft("TEST-TAG-2", { notes: "old build" });
  assert.equal((await getDraft("TEST-TAG-2", "user-b"))?.notes, "old build");
  await clearAllDrafts();
});

// Drafts hold GPS and photos. When the encrypted database cannot be opened
// (as under Node, where there is no SQLite), they must not be written to
// AsyncStorage, which is a plain file: the draft is kept in memory instead.
test("a draft is never written to plain AsyncStorage when the encrypted database is not available", async () => {
  const plain = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (plain.has(k) ? plain.get(k) : null),
      setItem: (k, v) => plain.set(k, String(v)),
      removeItem: (k) => plain.delete(k),
      key: (i) => [...plain.keys()][i] ?? null,
      get length() { return plain.size; },
      clear: () => plain.clear(),
    },
  };
  try {
    await clearAllDrafts();
    await saveDraft("TEST-TAG-3", { user_id: "user-a", notes: "by the cave", gps: { lat: 1, lng: 2 } });
    assert.deepEqual([...plain.keys()].filter((k) => k.includes("TEST-TAG-3")), [], "nothing in plain storage");
    assert.equal((await getDraft("TEST-TAG-3", "user-a"))?.notes, "by the cave", "still kept, in memory");

    // A draft an older build left in plain storage still opens, and is cleared on sign-out.
    plain.set("daun_draft_TEST-TAG-4", JSON.stringify({ qr_id: "TEST-TAG-4", user_id: "user-a", notes: "old" }));
    assert.equal((await getDraft("TEST-TAG-4", "user-a"))?.notes, "old");
    await clearAllDrafts();
    assert.equal(plain.has("daun_draft_TEST-TAG-4"), false);
  } finally {
    delete globalThis.window;
    await clearAllDrafts();
  }
});

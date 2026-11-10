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
  await saveDraft("NIAH-0001", { user_id: "user-a", notes: "near the stream", gps: { lat: 1, lng: 2 } });
  assert.equal(await getDraft("NIAH-0001", "user-b"), null, "B must not get A's notes, photos or GPS");
  assert.equal((await getDraft("NIAH-0001", "user-a"))?.notes, "near the stream");
  assert.equal(await getDraft("NIAH-0001"), null, "nobody signed in gets nothing");
  await clearAllDrafts();
});

test("a draft from before drafts had an owner still opens when its tag is scanned", async () => {
  await clearAllDrafts();
  await saveDraft("NIAH-0002", { notes: "old build" });
  assert.equal((await getDraft("NIAH-0002", "user-b"))?.notes, "old build");
  await clearAllDrafts();
});

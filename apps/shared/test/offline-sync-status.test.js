// apps/shared/test/offline-sync-status.test.js
// What the botanist sees about records saved on the phone, and when the app
// tries to send them (CTIP-68). Design: docs/architecture/offline-sync.md, §6 and §11.
import test from "node:test";
import assert from "node:assert/strict";
import {
  backoffDelay,
  isProgress,
  withoutOutboxTwins,
  unsentCount,
  waitingCount,
  syncBarText,
  syncToast,
  STILL_OFFLINE,
  failureNotice,
  tagChangeFor,
  resetsOnManualSync,
  unsentTitle,
  outboxRowView,
  recordsToDelete,
} from "../offline/syncStatus.js";

const rec = (overrides = {}) => ({
  id: "r1",
  user_id: "u1",
  kind: "new_plant",
  qr_id: "NIAH-0001",
  specimen_id: "sp-1",
  specimen_ref: null,
  specimen: { proposed_species_name: "Nepenthes rajah" },
  observation: { observed_at: "2026-11-02T08:00:00.000Z" },
  state: "pending",
  step: "specimen",
  error: null,
  ...overrides,
});

test("the backoff waits 30 s, 60 s, 120 s, then every 300 s", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(backoffDelay), [30000, 60000, 120000, 300000, 300000, 300000]);
});

test("only a run that got through and sent something resets the backoff", () => {
  assert.equal(isProgress({ sent: 1, pending: 0, stoppedBy: null }), true);
  assert.equal(isProgress({ sent: 0, pending: 2, stoppedBy: null }), false, "a stuck record must not retry every 30 s");
  assert.equal(isProgress({ sent: 2, pending: 1, stoppedBy: "offline" }), false);
  assert.equal(isProgress(null), false);
});

test("a record still on the phone is listed once: its server twin is hidden", () => {
  const outbox = [rec({ id: "obs-1", specimen_id: "sp-1", qr_id: "niah-0001" }), rec({ id: "obs-2", kind: "revisit", specimen_id: "sp-9", qr_id: "NIAH-0009" })];
  const observations = [{ id: "obs-1", status: "queued" }, { id: "obs-2", status: "queued" }, { id: "obs-3", status: "synced" }];
  const plants = [{ id: "sp-1", qr_id: "NIAH-0001" }, { id: "sp-9", qr_id: "NIAH-0009" }];
  const drafts = [{ qr_id: "NIAH-0001" }, { qr_id: "NIAH-0005" }];
  const out = withoutOutboxTwins({ observations, plants, drafts }, outbox);
  assert.deepEqual(out.observations.map((o) => o.id), ["obs-3"]);
  // The new plant's specimen (created, observation not yet) is not an "unfinished" plant;
  // the revisited plant is a real server plant and stays.
  assert.deepEqual(out.plants.map((p) => p.id), ["sp-9"]);
  assert.deepEqual(out.drafts.map((d) => d.qr_id), ["NIAH-0005"]);
  // Once it has left the outbox, the server copy shows again.
  assert.equal(withoutOutboxTwins({ observations }, []).observations.length, 3);
});

test("counts: waiting is pending + sending; unsent is failed + conflict", () => {
  const items = ["pending", "sending", "failed", "conflict", "failed"].map((state, i) => rec({ id: `r${i}`, state }));
  assert.equal(waitingCount(items), 2);
  assert.equal(unsentCount(items), 3);
  assert.equal(unsentCount(), 0);
});

test("the sync bar says how many wait and when the last send was", () => {
  const fmt = (iso) => `at ${iso}`;
  const two = [rec({ id: "a" }), rec({ id: "b", state: "sending" })];
  assert.equal(syncBarText({ outboxItems: two, running: false, lastSyncedAt: "T" }, fmt), "2 waiting to sync · Last sent at T");
  assert.equal(syncBarText({ outboxItems: two, running: false, lastSyncedAt: null }, fmt), "2 waiting to sync");
  assert.equal(syncBarText({ outboxItems: two, running: true, lastSyncedAt: "T" }, fmt), "Sending…");
  const failed = [rec({ state: "failed" })];
  assert.equal(syncBarText({ outboxItems: failed, running: false, lastSyncedAt: null }, fmt), "0 waiting to sync");
});

test("the toast after Sync now only says offline when the store says offline", () => {
  const offlineStop = { sent: 0, pending: 1, failed: 0, conflicts: 0, stoppedBy: "offline" };
  assert.equal(syncToast(offlineStop, { offline: true }), STILL_OFFLINE);
  assert.equal(STILL_OFFLINE, "Still offline. They'll send when you're back online.");
  assert.equal(syncToast(null, { offline: true }), STILL_OFFLINE);
  // The same stop with the API answering otherwise (a 429, a timeout): no "offline" claim.
  assert.doesNotMatch(syncToast(offlineStop, { offline: false }), /offline/i);
  assert.equal(syncToast({ sent: 2, pending: 0, failed: 0, conflicts: 0, stoppedBy: null }, { offline: false }), "2 records sent for review");
  assert.equal(syncToast({ sent: 1, pending: 0, failed: 0, conflicts: 0, stoppedBy: null }, { offline: false }), "1 record sent for review");
  assert.match(syncToast({ sent: 0, pending: 0, failed: 1, conflicts: 0, stoppedBy: null }, { offline: false }), /couldn't be sent/);
  assert.match(syncToast({ sent: 0, pending: 1, failed: 0, conflicts: 0, stoppedBy: "signed_out" }, { offline: false }), /Sign in again/);
});

test("a failed record's notice follows its action, in the design's words", () => {
  const photos = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
  const pick = failureNotice(rec({ state: "failed", qr_id: "NIAH-0042", error: { action: "pick_tag", code: "TAG_IN_USE" } }), photos);
  assert.deepEqual(pick, { action: "pick_tag", body: "Tag NIAH-0042 is already on another plant. Choose another tag for this record.", button: "Choose another tag" });

  const wait = failureNotice(rec({ state: "failed", error: { action: "wait_review" } }), photos);
  assert.deepEqual(wait, { action: "wait_review", body: "This plant has a record waiting for an officer. It will be sent once they decide.", button: null });

  const photo = failureNotice(rec({ state: "failed", error: { action: "remove_photo", photo_id: "p2" } }), photos);
  assert.deepEqual(photo, {
    action: "remove_photo",
    body: "Photo 2 can't be sent: it is too large, or not a JPEG, PNG or WebP. Remove it to send the rest.",
    button: "Remove photo",
    photoId: "p2",
  });

  const retry = failureNotice(rec({ state: "failed", error: { action: "retry", message: "Height must be a number" } }), photos);
  assert.deepEqual(retry, { action: "retry", body: "Height must be a number", button: "Try again" });

  // The photo is already gone: nothing to remove, so offer to try again.
  assert.equal(failureNotice(rec({ state: "failed", error: { action: "remove_photo", photo_id: "gone" } }), photos).button, "Try again");
  assert.equal(failureNotice(rec({ state: "pending" }), photos), null);
});

test("a new tag keeps the record's ids and only goes back to the specimen step if the plant was never made", () => {
  const notMade = rec({ state: "failed", step: "specimen", error: { action: "pick_tag" }, attempts: 3 });
  assert.deepEqual(tagChangeFor(notMade, " niah-0050 "), { qr_id: "NIAH-0050", state: "pending", error: null, attempts: 0, step: "specimen" });
  const made = rec({ state: "failed", step: "observation", error: { action: "pick_tag" } });
  assert.equal(tagChangeFor(made, "NIAH-0050").step, "observation");
  assert.equal("id" in tagChangeFor(made, "NIAH-0050"), false);
  assert.equal("specimen_id" in tagChangeFor(made, "NIAH-0050"), false);
});

test("a manual sync puts only wait_review records back to pending", () => {
  assert.equal(resetsOnManualSync(rec({ state: "failed", error: { action: "wait_review" } })), true);
  assert.equal(resetsOnManualSync(rec({ state: "failed", error: { action: "pick_tag" } })), false);
  assert.equal(resetsOnManualSync(rec({ state: "pending" })), false);
});

test("deleting a plant from the phone also deletes the revisits that wait for it", () => {
  const plant = rec({ id: "p" });
  const items = [plant, rec({ id: "v1", kind: "revisit", specimen_ref: "p" }), rec({ id: "v2", kind: "revisit", specimen_ref: null, specimen_id: "sp-3" })];
  assert.deepEqual(recordsToDelete("p", items), ["p", "v1"]);
  assert.deepEqual(recordsToDelete("v2", items), ["v2"]);
});

test("the sign-out alert title counts records", () => {
  assert.equal(unsentTitle(1), "1 record not sent yet");
  assert.equal(unsentTitle(3), "3 records not sent yet");
});

test("a row on this phone has the plant's name, tag, status and a screen-reader label", () => {
  const plant = rec({ id: "plant-rec", qr_id: "NIAH-0007", specimen: { proposed_species_name: "Nepenthes" } });
  const revisitOfPhonePlant = rec({ id: "rv", kind: "revisit", specimen_ref: "plant-rec", specimen_id: null, qr_id: "NIAH-0007", state: "failed" });
  const revisitOfServerPlant = rec({ id: "rv2", kind: "revisit", specimen_id: "sp-5", qr_id: "NIAH-0005" });
  const db = { plants: [{ id: "sp-5", qr_id: "NIAH-0005", species_id: "s1", photos: [] }], species: [{ id: "s1", common_name: "Rajah pitcher" }], observations: [] };
  const items = [plant, revisitOfPhonePlant, revisitOfServerPlant];

  assert.deepEqual(outboxRowView(plant, { db, outboxItems: items }), {
    id: "plant-rec", name: "Nepenthes (unconfirmed)", qr_id: "NIAH-0007", status: "queued", revisit: false,
    observed_at: "2026-11-02T08:00:00.000Z", label: "Nepenthes (unconfirmed), tag NIAH-0007, Waiting to sync",
  });
  assert.equal(outboxRowView(revisitOfPhonePlant, { db, outboxItems: items }).name, "Nepenthes (unconfirmed)");
  assert.equal(outboxRowView(revisitOfPhonePlant, { db, outboxItems: items }).status, "sync_failed");
  assert.equal(outboxRowView(revisitOfServerPlant, { db, outboxItems: items }).name, "Rajah pitcher");
  assert.equal(outboxRowView(rec({ kind: "revisit", specimen_id: "x", qr_id: "NIAH-0100" }), { db, outboxItems: [], cached: [{ qr_id: "NIAH-0100", name: "Cached name" }] }).name, "Cached name");
});

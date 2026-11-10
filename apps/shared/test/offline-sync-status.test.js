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
  fixRecordChanges,
  resetsOnManualSync,
  unsentTitle,
  outboxRowView,
  recordsToDelete,
  conflictRows,
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

test("an edit of a record deleted on another device offers only Delete from this phone", () => {
  const notice = failureNotice(rec({ state: "failed", kind: "edit", error: { action: "record_gone", code: "NOT_FOUND", message: "Observation not found" } }));
  assert.deepEqual(notice, {
    action: "record_gone",
    body: "This record was deleted on another device, so the changes on this phone can't be sent. Delete them from this phone to clear it.",
    button: "Delete from this phone",
  });
});

test("a VALIDATION_ERROR record gets the fix_record notice", () => {
  const failed = (error) => rec({ state: "failed", error });
  const notice = failureNotice(failed({ code: "VALIDATION_ERROR", action: "fix_record", message: "Height must be at most 100000." }));
  assert.deepEqual(notice, {
    action: "fix_record",
    body: "The server can't accept this record as it is: Height must be at most 100000. Change the details below and send it again.",
    button: "Save and send",
  });
  // A message without a full stop still reads as a sentence.
  assert.equal(
    failureNotice(failed({ code: "VALIDATION_ERROR", action: "fix_record", message: "That plant does not exist" })).body,
    "The server can't accept this record as it is: That plant does not exist. Change the details below and send it again.",
  );
  // No message: that part is dropped.
  assert.equal(
    failureNotice(failed({ code: "ID_TAKEN", action: "fix_record", message: "" })).body,
    "The server can't accept this record as it is. Change the details below and send it again.",
  );
  // A record refused before this notice existed (saved with action "retry") gets it too.
  assert.equal(failureNotice(failed({ code: "VALIDATION_ERROR", action: "retry", message: "Bad" })).action, "fix_record");
});

test("fixRecord changes only the text fields and keeps the record's ids", () => {
  const observation = { observed_at: "2026-11-02T08:00:00.000Z", height_cm: 900000, morphology: "x", notes: "", lat: 6.1, lng: 116.5, gps_accuracy_m: 8 };
  const specimen = { proposed_species_name: "Nepenthes rajah", lat: 6.1, lng: 116.5, gps_accuracy_m: 8 };
  const failed = rec({
    state: "failed", step: "observation", attempts: 3, observation, specimen,
    error: { code: "VALIDATION_ERROR", action: "fix_record", message: "Too high" },
  });

  const out = fixRecordChanges(failed, {
    height_cm: "90", morphology: " Pitchers ", notes: "", proposed_species_name: " Nepenthes ampullaria ",
    id: "other-id", specimen_id: "other-plant", qr_id: "NIAH-9999", observed_at: "2026-11-09T08:00:00.000Z", lat: 1,
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.changes, {
    observation: { ...observation, height_cm: 90, morphology: "Pitchers", notes: null },
    specimen: { ...specimen, proposed_species_name: "Nepenthes ampullaria" },
    state: "pending",
    error: null,
    attempts: 0,
  });
  const fixed = { ...failed, ...out.changes };
  for (const key of ["id", "specimen_id", "qr_id", "step", "user_id", "kind"]) assert.equal(fixed[key], failed[key], key);

  // The same limits as the capture form.
  assert.deepEqual(fixRecordChanges(failed, { height_cm: "100001" }), { ok: false, message: "Height must be a number from 0 to 100000 cm." });
  assert.deepEqual(fixRecordChanges(failed, { height_cm: "1.2.3" }), { ok: false, message: "Height must be a number from 0 to 100000 cm." });
  assert.equal(fixRecordChanges(failed, { notes: "n".repeat(5001) }).ok, false);
  assert.equal(fixRecordChanges(failed, { proposed_species_name: "s".repeat(201) }).ok, false);

  // A revisit has no species name; an edit changes only the fields it already holds.
  const revisit = rec({ kind: "revisit", specimen: null, state: "failed", observation });
  assert.equal("specimen" in fixRecordChanges(revisit, { proposed_species_name: "Nepenthes" }).changes, false);
  const edit = rec({ kind: "edit", specimen: null, state: "failed", observation: { height_cm: 900000 } });
  assert.deepEqual(fixRecordChanges(edit, { height_cm: "40", notes: "new" }).changes.observation, { height_cm: 40 });
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

test("conflictRows lists only fields that differ", () => {
  const record = rec({
    kind: "edit",
    state: "conflict",
    observation: { height_cm: 40, notes: "wet" },
    server: { version: 3, height_cm: 30, morphology: "green", notes: "wet" },
  });
  assert.deepEqual(conflictRows(record), [
    { field: "height_cm", label: "Height", mine: "40 cm", theirs: "30 cm" },
  ]);

  const all = rec({
    observation: { height_cm: null, morphology: "red", notes: "dry" },
    server: { height_cm: 30, morphology: "green", notes: null },
  });
  assert.deepEqual(conflictRows(all).map((r) => [r.field, r.label, r.mine, r.theirs]), [
    ["height_cm", "Height", "-", "30 cm"],
    ["morphology", "Appearance", "red", "green"],
    ["notes", "Notes", "dry", "-"],
  ]);
  assert.deepEqual(conflictRows(rec({ observation: {}, server: { height_cm: 30 } })), [], "a field the phone did not change is not listed");
  assert.deepEqual(conflictRows(rec({ observation: { height_cm: 1 }, server: null })), []);
});

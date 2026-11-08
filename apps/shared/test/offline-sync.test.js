// apps/shared/test/offline-sync.test.js
// The sync engine (CTIP-16, CTIP-66): it replays the phone's outbox against the API.
// A record lost or sent twice is the worst failure here, so most tests cut the
// connection somewhere and check that the next run finishes the job exactly once.
// Design: docs/architecture/offline-sync.md.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createMemoryOutbox } from "../offline/memoryOutbox.js";
import { createSyncEngine, classify, actionFor, packBatches } from "../offline/syncEngine.js";
import { createFakeServer } from "./helpers/fakeServer.js";

const U = "user-1";
const MONDAY = "2026-11-02T08:00:00.000Z";

// created_at decides the order, so each new record is a second younger.
let clock = Date.parse("2026-11-02T08:00:00.000Z");
const nextTime = () => new Date((clock += 1000)).toISOString();

function plantRecord(overrides = {}) {
  const at = nextTime();
  return {
    id: randomUUID(),
    user_id: U,
    kind: "new_plant",
    qr_id: "DS-" + Math.floor(Math.random() * 1e6),
    specimen_id: randomUUID(),
    specimen_ref: null,
    specimen: { proposed_species_name: "Nepenthes rajah", lat: 6.08, lng: 116.56, gps_accuracy_m: 8 },
    observation: { observed_at: MONDAY, height_cm: 12, morphology: "pitchers", notes: "", lat: 6.08, lng: 116.56, gps_accuracy_m: 8 },
    base_version: null,
    state: "pending",
    step: "specimen",
    attempts: 0,
    error: null,
    server: null,
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}

// A revisit of a plant registered offline points at that plant's outbox record.
function revisitOf(plant, overrides = {}) {
  return plantRecord({
    kind: "revisit",
    qr_id: plant.qr_id,
    specimen_id: plant.specimen_id,
    specimen_ref: plant.id,
    specimen: null,
    step: "observation",
    ...overrides,
  });
}

function photos(n = 2) {
  return Array.from({ length: n }, (_, i) => ({
    id: randomUUID(),
    position: i,
    base64: "QUJDRA==",
    name: `photo-${i}.jpg`,
    type: "image/jpeg",
    caption: "",
    traits: ["Leaf"],
  }));
}

function setup(serverOptions) {
  const outbox = createMemoryOutbox();
  const server = createFakeServer(serverOptions);
  // The signed-in user is whoever the fake server's token belongs to.
  const engine = createSyncEngine({ outbox, api: server.api, deviceId: "phone-1", currentUserId: () => server.state.userId });
  return { outbox, server, engine };
}

// Cut the connection on the server's k-th call (0 = the first) of this engine.
// Wraps the api, so the engine sees nothing different.
function dropOnCall(server, k, options) {
  let calls = 0;
  for (const [name, fn] of Object.entries(server.api)) {
    server.api[name] = (...args) => {
      if (calls++ === k) server.dropNext(1, options);
      return fn(...args);
    };
  }
}

const callsTo = (server, name) => server.state.calls.filter((c) => c.name === name);

test("new plant goes specimen, observation, photos, submit, then leaves the outbox", async () => {
  const { outbox, server, engine } = setup();
  const rec = plantRecord();
  await outbox.add(rec, photos(2));

  const summary = await engine.run(U);

  assert.equal(server.state.specimens.length, 1);
  assert.equal(server.state.specimens[0].id, rec.specimen_id);
  assert.equal(server.state.observations.length, 1);
  assert.equal(server.state.observations[0].id, rec.id);
  assert.equal(server.state.observations[0].status, "synced");
  assert.equal(server.state.photos.length, 2);
  assert.deepEqual(await outbox.list(U), []);
  assert.deepEqual(summary, { sent: 1, pending: 0, failed: 0, conflicts: 0, stoppedBy: null });
  assert.deepEqual(
    server.state.calls.map((c) => c.name),
    ["createSpecimen", "sync", "uploadPhoto", "uploadPhoto", "submit"],
  );
});

test("observed_at sent is the capture time, not the sync time", async () => {
  const { outbox, server, engine } = setup();
  await outbox.add(plantRecord(), []);
  await engine.run(U);
  assert.equal(server.state.observations[0].observed_at, MONDAY);
  assert.equal(callsTo(server, "sync")[0].args[0].observations[0].observed_at, MONDAY);
});

test("network drop mid-photo: the next run sends only the missing photos, each stored once", async () => {
  const { outbox, server, engine } = setup();
  const rec = plantRecord();
  const pics = photos(2);
  await outbox.add(rec, pics);
  dropOnCall(server, 3); // createSpecimen, sync, photo 1, then photo 2 is cut off

  const first = await engine.run(U);
  assert.equal(first.stoppedBy, "offline");
  assert.equal(server.state.photos.length, 1);
  const halfway = await outbox.get(rec.id);
  assert.equal(halfway.step, "photos");
  assert.equal(halfway.state, "pending");
  const kept = await outbox.photos(rec.id);
  assert.equal(kept[0].uploaded, 1);
  assert.equal(kept[0].base64, undefined, "a confirmed photo's bytes are dropped");
  assert.equal(kept[1].uploaded, 0);

  const second = await engine.run(U);
  assert.equal(second.sent, 1);
  assert.equal(server.state.photos.length, 2);
  const uploads = callsTo(server, "uploadPhoto").map((c) => c.args[1].id);
  assert.equal(uploads.filter((id) => id === pics[0].id).length, 1, "photo 1 uploaded once");
  assert.equal(uploads.filter((id) => id === pics[1].id).length, 2, "photo 2 tried, then sent again");
  assert.deepEqual(await outbox.list(U), []);
});

test("drop after the server stored a step: the replay stores it once", async (t) => {
  const steps = ["createSpecimen", "sync", "uploadPhoto 1", "uploadPhoto 2", "submit"];
  for (const [k, step] of steps.entries()) {
    await t.test(`after ${step}`, async () => {
      const { outbox, server, engine } = setup();
      const rec = plantRecord();
      await outbox.add(rec, photos(2));
      dropOnCall(server, k, { afterStore: true });

      const first = await engine.run(U);
      assert.equal(first.stoppedBy, "offline");
      assert.equal((await outbox.get(rec.id)).state, "pending");

      const second = await engine.run(U);
      assert.equal(second.sent, 1);
      assert.equal(server.state.specimens.length, 1);
      assert.equal(server.state.observations.length, 1);
      assert.equal(server.state.observations[0].status, "synced");
      assert.equal(server.state.photos.length, 2);
      assert.deepEqual(await outbox.list(U), []);
    });
  }
});

test("the record stays until submit is confirmed", async () => {
  const { outbox, server, engine } = setup();
  const rec = plantRecord();
  await outbox.add(rec, photos(1));
  dropOnCall(server, 3); // createSpecimen, sync, photo, then submit is cut off

  const summary = await engine.run(U);
  const [left] = await outbox.list(U);
  assert.equal(left.id, rec.id);
  assert.equal(left.step, "submit");
  assert.equal(left.state, "pending");
  assert.equal(server.state.observations[0].status, "queued");
  assert.deepEqual(summary, { sent: 0, pending: 1, failed: 0, conflicts: 0, stoppedBy: "offline" });
});

test("server specimen id is written back and used by a queued revisit of that plant", async () => {
  const { outbox, server, engine } = setup();
  const plant = plantRecord();
  const revisit = revisitOf(plant);
  await outbox.add(plant, []);
  await outbox.add(revisit, []);

  // The API keeps the plant under an id of its own choosing.
  const serverId = randomUUID();
  const create = server.api.createSpecimen;
  server.api.createSpecimen = (body) => create({ ...body, id: serverId });

  const summary = await engine.run(U);
  assert.equal(summary.sent, 2);
  const byId = new Map(server.state.observations.map((o) => [o.id, o]));
  assert.equal(byId.get(plant.id).specimen_id, serverId);
  assert.equal(byId.get(revisit.id).specimen_id, serverId);
});

test("a revisit sent after its plant has left the outbox still uses the server's plant id", async () => {
  const { outbox, server, engine } = setup();
  const plant = plantRecord();
  // Held back (say it failed earlier, then "Try again" set it pending).
  const revisit = revisitOf(plant, { state: "failed" });
  await outbox.add(plant, []);
  await outbox.add(revisit, []);
  const serverId = randomUUID();
  const create = server.api.createSpecimen;
  server.api.createSpecimen = (body) => create({ ...body, id: serverId });

  await engine.run(U);
  assert.equal(await outbox.get(plant.id), null, "the plant has finished");
  assert.equal((await outbox.get(revisit.id)).specimen_id, serverId, "copied onto the revisit");
  await outbox.update(revisit.id, { state: "pending" });
  await engine.run(U);
  const sentFor = callsTo(server, "sync").flatMap((c) => c.args[0].observations).find((o) => o.id === revisit.id);
  assert.equal(sentFor.specimen_id, serverId);
  // The plant's first record is now with an officer, so the API holds this one back.
  assert.equal((await outbox.get(revisit.id)).error.action, "wait_review");
});

test("a revisit waits while its plant has not synced", async () => {
  const { outbox, server, engine } = setup();
  const plant = plantRecord({ state: "failed", error: { code: "TAG_IN_USE", message: "x", action: "pick_tag" } });
  const revisit = revisitOf(plant);
  await outbox.add(plant, []);
  await outbox.add(revisit, []);

  const summary = await engine.run(U);
  assert.equal(server.state.calls.length, 0, "nothing is sent for the revisit");
  const waiting = await outbox.get(revisit.id);
  assert.equal(waiting.state, "pending");
  assert.equal(waiting.attempts, 0);
  assert.deepEqual(summary, { sent: 0, pending: 1, failed: 1, conflicts: 0, stoppedBy: null });
});

test("TAG_IN_USE fails that record with pick_tag and the next record still syncs", async () => {
  const { outbox, server, engine } = setup();
  server.state.specimens.push({ id: randomUUID(), qr_id: "DS-TAKEN", registered_by: "user-2" });
  const clash = plantRecord({ qr_id: "DS-TAKEN" });
  const fine = plantRecord();
  await outbox.add(clash, photos(1));
  await outbox.add(fine, photos(1));

  const summary = await engine.run(U);
  const failed = await outbox.get(clash.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.error.code, "TAG_IN_USE");
  assert.equal(failed.error.action, "pick_tag");
  assert.ok(failed.error.message);
  assert.equal(failed.step, "specimen");
  assert.equal(await outbox.get(fine.id), null, "the next record was sent and removed");
  assert.deepEqual(summary, { sent: 1, pending: 0, failed: 1, conflicts: 0, stoppedBy: null });
});

test("401 stops the run and leaves every record pending", async () => {
  const { outbox, server, engine } = setup();
  const a = plantRecord();
  const b = plantRecord({ kind: "revisit", specimen: null, step: "observation" });
  await outbox.add(a, photos(1));
  await outbox.add(b, []);
  server.state.signedOut = true;

  const summary = await engine.run(U);
  assert.equal(summary.stoppedBy, "signed_out");
  assert.equal(summary.sent, 0);
  assert.equal(summary.pending, 2);
  for (const r of await outbox.list(U)) {
    assert.equal(r.state, "pending");
    assert.equal(r.error, null);
  }
  assert.equal(server.state.calls.length, 1, "nothing more is tried after the 401");
});

test("offline stops the run with stoppedBy offline and counts an attempt", async () => {
  const { outbox, server, engine } = setup();
  const a = plantRecord();
  const b = plantRecord();
  await outbox.add(a, []);
  await outbox.add(b, []);
  server.dropNext(1);

  const summary = await engine.run(U);
  assert.deepEqual(summary, { sent: 0, pending: 2, failed: 0, conflicts: 0, stoppedBy: "offline" });
  const first = await outbox.get(a.id);
  assert.equal(first.state, "pending");
  assert.equal(first.attempts, 1);
  assert.equal((await outbox.get(b.id)).attempts, 0, "the run stopped before the second record");
  assert.equal(server.state.calls.length, 1);
});

test("another user's records are neither sent nor listed", async () => {
  const { outbox, server, engine } = setup();
  const mine = plantRecord();
  const theirs = plantRecord({ user_id: "user-2" });
  await outbox.add(theirs, photos(1));
  await outbox.add(mine, photos(1));

  const summary = await engine.run(U);
  assert.deepEqual(summary, { sent: 1, pending: 0, failed: 0, conflicts: 0, stoppedBy: null });
  assert.deepEqual(server.state.observations.map((o) => o.id), [mine.id]);
  const left = await outbox.get(theirs.id);
  assert.equal(left.state, "pending");
  assert.equal(left.attempts, 0);
  assert.equal((await outbox.photos(theirs.id))[0].uploaded, 0);

  // user-2 signs in later on the same phone: their record sends then.
  server.state.userId = "user-2";
  const later = await engine.run("user-2");
  assert.equal(later.sent, 1);
});

test("records left sending by a killed app are sent on the next run", async () => {
  const { outbox, server, engine } = setup();
  const rec = plantRecord({ state: "sending" });
  await outbox.add(rec, photos(1));

  const summary = await engine.run(U);
  assert.equal(summary.sent, 1);
  assert.equal(server.state.observations[0].status, "synced");
  assert.deepEqual(await outbox.list(U), []);
});

test("two runs at once send nothing twice", async () => {
  const { outbox, server, engine } = setup();
  await outbox.add(plantRecord(), photos(2));
  await outbox.add(plantRecord(), photos(1));

  const one = engine.run(U);
  const two = engine.run(U);
  assert.equal(one, two, "the second run shares the first one's promise");
  const [a, b] = await Promise.all([one, two]);
  assert.equal(a.sent, 2);
  assert.deepEqual(a, b);
  assert.equal(callsTo(server, "createSpecimen").length, 2);
  assert.equal(callsTo(server, "uploadPhoto").length, 3);
  assert.equal(callsTo(server, "submit").length, 2);

  // Once it has finished, a new run starts afresh.
  const three = engine.run(U);
  assert.notEqual(three, one);
  assert.equal((await three).sent, 0);
});

test("packBatches keeps each batch at 20 items or fewer and under 80,000 characters", () => {
  const small = Array.from({ length: 45 }, (_, i) => ({ id: String(i), notes: "x" }));
  const bySize = packBatches(small, {});
  assert.deepEqual(bySize.map((b) => b.length), [20, 20, 5]);
  assert.deepEqual(bySize.flat(), small, "every item, in order");

  const big = Array.from({ length: 12 }, (_, i) => ({ id: String(i), notes: "y".repeat(15000) }));
  const byChars = packBatches(big, {});
  for (const batch of byChars) {
    assert.ok(batch.length <= 20);
    assert.ok(JSON.stringify(batch).length < 80000, `batch of ${JSON.stringify(batch).length} characters`);
  }
  assert.deepEqual(byChars.flat(), big);

  // Non-ASCII text takes more bytes than characters: it is measured in bytes, so
  // the API's 100 kB limit still holds.
  const wide = Array.from({ length: 10 }, (_, i) => ({ id: String(i), notes: "é".repeat(15000) }));
  for (const batch of packBatches(wide, {})) {
    assert.ok(new TextEncoder().encode(JSON.stringify(batch)).length < 80000);
  }

  assert.deepEqual(packBatches([], {}), []);
  assert.deepEqual(packBatches(small.slice(0, 5), { maxItems: 2 }).map((b) => b.length), [2, 2, 1]);
});

test("413 on a photo fails the record with remove_photo", async () => {
  const { outbox, server, engine } = setup({ maxPhotoBytes: 100 });
  const rec = plantRecord();
  const pics = photos(2);
  pics[1].base64 = "A".repeat(400); // 300 bytes, over this server's limit
  await outbox.add(rec, pics);

  const summary = await engine.run(U);
  const failed = await outbox.get(rec.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.step, "photos");
  assert.equal(failed.error.action, "remove_photo");
  assert.equal(failed.error.code, "FILE_TOO_LARGE");
  assert.equal(failed.error.photo_id, pics[1].id, "the app can say which photo");
  assert.equal(server.state.photos.length, 1);
  assert.equal(callsTo(server, "submit").length, 0, "never sent for review with a photo missing");
  assert.deepEqual(summary, { sent: 0, pending: 0, failed: 1, conflicts: 0, stoppedBy: null });
});

// Beyond the brief's list: rules from the design that the engine must keep.

test("a per-item DB_ERROR is retried later, and the other items of the batch go on", async () => {
  const { outbox, server, engine } = setup();
  const a = plantRecord({ kind: "revisit", specimen: null, step: "observation" });
  const b = plantRecord({ kind: "revisit", specimen: null, step: "observation" });
  server.state.specimens.push({ id: a.specimen_id, qr_id: a.qr_id }, { id: b.specimen_id, qr_id: b.qr_id });
  await outbox.add(a, []);
  await outbox.add(b, []);
  const sync = server.api.sync;
  server.api.sync = async (body) => {
    const res = await sync(body);
    res.data.results[0] = { id: a.id, result: "error", error: { code: "DB_ERROR", message: "timeout" } };
    return res;
  };

  const summary = await engine.run(U);
  // A server-side failure keeps that record for later; it does not stop the run.
  assert.deepEqual(summary, { sent: 1, pending: 1, failed: 0, conflicts: 0, stoppedBy: null });
  const retry = await outbox.get(a.id);
  assert.equal(retry.state, "pending");
  assert.equal(retry.attempts, 1);
  assert.equal(retry.step, "observation");
  assert.equal(await outbox.get(b.id), null, "b was sent and removed");
});

// Fix round 1, finding 1: every call carries the current token, so the run must
// stop as soon as someone else is signed in.

test("a user switch mid-run stops the run before anything is sent as the new user", async () => {
  const { outbox, server, engine } = setup();
  const a = plantRecord();
  const b = plantRecord();
  await outbox.add(a, photos(2));
  await outbox.add(b, photos(1));
  // user-1 signs out and user-2 signs in while photo 1 of record a is uploading
  // (that request already went out with user-1's token).
  const upload = server.api.uploadPhoto;
  server.api.uploadPhoto = async (...args) => {
    const res = await upload(...args);
    server.state.userId = "user-2";
    return res;
  };

  const summary = await engine.run(U);
  assert.equal(summary.stoppedBy, "signed_out");
  assert.equal(summary.sent, 0);
  const names = server.state.calls.map((c) => c.name);
  assert.deepEqual(names, ["createSpecimen", "createSpecimen", "sync", "uploadPhoto"], "nothing after the switch");
  for (const r of await outbox.list(U)) assert.equal(r.state, "pending");
  assert.equal(server.state.specimens.some((s) => s.registered_by === "user-2"), false);
  assert.equal(server.state.observations.some((o) => o.recorded_by === "user-2"), false);
});

test("run(B) during run(A) returns B's own summary", async () => {
  const { outbox, server, engine } = setup();
  const mineA = plantRecord();
  const mineB = plantRecord({ user_id: "user-2" });
  await outbox.add(mineA, photos(1));
  await outbox.add(mineB, photos(1));
  // A signs out and B signs in during A's first call.
  const create = server.api.createSpecimen;
  server.api.createSpecimen = async (...args) => {
    server.api.createSpecimen = create;
    const res = await create(...args);
    server.state.userId = "user-2";
    return res;
  };

  const runA = engine.run(U);
  const runB = engine.run("user-2");
  assert.notEqual(runA, runB);
  const [a, b] = await Promise.all([runA, runB]);
  assert.equal(a.stoppedBy, "signed_out");
  assert.equal(a.sent, 0);
  assert.equal(a.pending, 1);
  assert.deepEqual(b, { sent: 1, pending: 0, failed: 0, conflicts: 0, stoppedBy: null });
  assert.equal((await outbox.get(mineA.id)).state, "pending");
  assert.equal(server.state.observations.find((o) => o.id === mineB.id).recorded_by, "user-2");
});

// Fix round 1, finding 2: a resent submit must not bounce the officer's decision.

for (const decided of ["returned", "approved"]) {
  test(`a submit that landed is done when the officer has ${decided} the record meanwhile`, async () => {
    const { outbox, server, engine } = setup();
    const rec = plantRecord();
    await outbox.add(rec, []);
    dropOnCall(server, 2, { afterStore: true }); // the submit lands, its answer is lost
    await engine.run(U);
    assert.equal((await outbox.get(rec.id)).step, "submit");
    const obs = server.state.observations[0];
    obs.status = decided;
    const version = obs.version;

    const summary = await engine.run(U);
    assert.equal(summary.sent, 1);
    assert.equal(await outbox.get(rec.id), null);
    assert.equal(server.state.observations[0].status, decided, "not sent for review again");
    assert.equal(server.state.observations[0].version, version);
    assert.equal(callsTo(server, "submit").length, 1, "the submit is not resent");
  });
}

test("a WRONG_STATUS submit answer is done when the server holds a decided record", async () => {
  const { outbox, server, engine } = setup();
  const rec = plantRecord({ kind: "revisit", specimen: null, step: "photos" });
  server.state.specimens.push({ id: rec.specimen_id, qr_id: rec.qr_id });
  server.state.observations.push({ id: rec.id, specimen_id: rec.specimen_id, status: "rejected", recorded_by: U, version: 1 });
  await outbox.add(rec, []);

  const summary = await engine.run(U);
  assert.equal(summary.sent, 1);
  assert.equal(server.state.observations[0].status, "rejected");
});

test("a resumed submit of a record still queued sends it for review", async () => {
  const { outbox, server, engine } = setup();
  const rec = plantRecord({ kind: "revisit", specimen: null, step: "submit" });
  server.state.specimens.push({ id: rec.specimen_id, qr_id: rec.qr_id });
  server.state.observations.push({ id: rec.id, specimen_id: rec.specimen_id, status: "queued", recorded_by: U, version: 1 });
  await outbox.add(rec, []);

  const summary = await engine.run(U);
  assert.equal(summary.sent, 1);
  assert.equal(server.state.observations[0].status, "synced");
});

// Fix round 1, finding 3: one record the server keeps refusing must not block the rest.

test("a record that always gets 500 doesn't stop younger records from syncing", async () => {
  const { outbox, server, engine } = setup();
  const broken = plantRecord();
  const fine = plantRecord();
  await outbox.add(broken, photos(1));
  await outbox.add(fine, photos(1));
  const create = server.api.createSpecimen;
  server.api.createSpecimen = (body) =>
    body.qr_id === broken.qr_id ? Promise.resolve({ ok: false, status: 500, code: "DB_ERROR", message: "boom" }) : create(body);

  for (const round of [1, 2]) {
    const summary = await engine.run(U);
    assert.equal(summary.stoppedBy, null);
    assert.equal(summary.pending, 1);
    const kept = await outbox.get(broken.id);
    assert.equal(kept.state, "pending");
    assert.equal(kept.attempts, round);
  }
  assert.equal(await outbox.get(fine.id), null, "the younger record was sent");
});

test("a retired tag fails the record with pick_tag", async () => {
  const { outbox, server, engine } = setup({ retiredTags: ["DS-OLD"] });
  const rec = plantRecord({ qr_id: "DS-OLD" });
  const next = plantRecord();
  await outbox.add(rec, []);
  await outbox.add(next, []);

  const summary = await engine.run(U);
  const failed = await outbox.get(rec.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.error.code, "TAG_RETIRED");
  assert.equal(failed.error.action, "pick_tag");
  assert.equal(summary.sent, 1);
});

test("429 stops the run", async () => {
  const { outbox, server, engine } = setup();
  const a = plantRecord();
  const b = plantRecord();
  await outbox.add(a, []);
  await outbox.add(b, []);
  const create = server.api.createSpecimen;
  server.api.createSpecimen = (body) => {
    server.api.createSpecimen = create;
    return Promise.resolve({ ok: false, status: 429, code: "RATE_LIMITED", message: "Slow down" });
  };

  const summary = await engine.run(U);
  assert.equal(summary.stoppedBy, "offline");
  assert.equal((await outbox.get(a.id)).attempts, 1);
  assert.equal((await outbox.get(b.id)).attempts, 0, "the run stopped before the second record");
});

test("REVIEW_IN_PROGRESS fails the record with wait_review", async () => {
  const { outbox, server, engine } = setup();
  const rec = plantRecord({ kind: "revisit", specimen: null, step: "observation" });
  server.state.specimens.push({ id: rec.specimen_id, qr_id: rec.qr_id });
  server.state.observations.push({ id: randomUUID(), specimen_id: rec.specimen_id, status: "synced", recorded_by: U, version: 1 });
  await outbox.add(rec, []);

  await engine.run(U);
  const failed = await outbox.get(rec.id);
  assert.equal(failed.state, "failed");
  assert.equal(failed.error.action, "wait_review");
});

test("a conflicting edit keeps the server copy and is counted, changing nothing", async () => {
  const { outbox, server, engine } = setup();
  const obsId = randomUUID();
  const specimenId = randomUUID();
  server.state.specimens.push({ id: specimenId, qr_id: "DS-1" });
  server.state.observations.push({
    id: obsId, specimen_id: specimenId, status: "draft", recorded_by: U, version: 3, height_cm: 30, is_deleted: false,
  });
  await outbox.add(plantRecord({
    id: obsId, kind: "edit", specimen_id: specimenId, specimen: null, step: "observation", base_version: 2,
    observation: { height_cm: 40 },
  }), []);

  const summary = await engine.run(U);
  const kept = await outbox.get(obsId);
  assert.equal(kept.state, "conflict");
  assert.equal(kept.server.version, 3);
  assert.equal(kept.server.height_cm, 30);
  assert.equal(kept.observation.height_cm, 40, "the phone's copy is kept too");
  assert.equal(server.state.observations[0].height_cm, 30);
  assert.deepEqual(summary, { sent: 0, pending: 0, failed: 0, conflicts: 1, stoppedBy: null });

  // A conflict waits for the botanist: the next run does not send it again.
  const calls = server.state.calls.length;
  await engine.run(U);
  assert.equal(server.state.calls.length, calls);
});

test("an edit that is accepted leaves the outbox without a submit", async () => {
  const { outbox, server, engine } = setup();
  const obsId = randomUUID();
  const specimenId = randomUUID();
  server.state.specimens.push({ id: specimenId, qr_id: "DS-2" });
  server.state.observations.push({ id: obsId, specimen_id: specimenId, status: "draft", recorded_by: U, version: 2, height_cm: 30, is_deleted: false });
  await outbox.add(plantRecord({
    id: obsId, kind: "edit", specimen_id: specimenId, specimen: null, step: "observation", base_version: 2,
    observation: { height_cm: 40 },
  }), []);

  const summary = await engine.run(U);
  assert.equal(summary.sent, 1);
  assert.equal(server.state.observations[0].height_cm, 40);
  assert.equal(server.state.observations[0].status, "draft");
  assert.equal(callsTo(server, "submit").length, 0);
});

test("classify and actionFor follow the error rules", () => {
  assert.equal(classify({ ok: false, offline: true, status: 0, code: "NETWORK_ERROR" }), "retry");
  assert.equal(classify({ ok: false, offline: true, status: 0, code: "TIMEOUT" }), "retry");
  assert.equal(classify({ ok: false, status: 503, code: "INTERNAL_ERROR" }), "retry");
  assert.equal(classify({ ok: false, status: 429, code: "RATE_LIMITED" }), "retry");
  assert.equal(classify({ ok: false, status: 401, code: "UNAUTHORIZED" }), "signed_out");
  assert.equal(classify({ ok: false, status: 409, code: "TAG_IN_USE" }), "fail");
  assert.equal(classify({ ok: false, status: 422, code: "VALIDATION_ERROR" }), "fail");

  for (const code of ["TAG_IN_USE", "TAG_NOT_FOUND", "TAG_RESERVED", "TAG_RETIRED"]) assert.equal(actionFor(code, 409), "pick_tag");
  assert.equal(actionFor("REVIEW_IN_PROGRESS", 409), "wait_review");
  assert.equal(actionFor("FILE_TOO_LARGE", 413), "remove_photo");
  assert.equal(actionFor("UNSUPPORTED_FILE_TYPE", 415), "remove_photo");
  assert.equal(actionFor("HTTP_413", 413), "remove_photo");
  assert.equal(actionFor("PAYLOAD_TOO_LARGE", 413), "retry", "a JSON body too large is not a photo");
  assert.equal(actionFor("VALIDATION_ERROR", 422), "retry");
  assert.equal(actionFor("ID_TAKEN"), "retry");
});

// "Delete from this phone" (CTIP-68) can remove a record while a run is sending
// it. The engine must carry on with the next record, not throw on the missing row.
for (const at of ["createSpecimen", "sync", "uploadPhoto", "submit"]) {
  test(`a record deleted from the phone during its ${at} call is skipped without an error`, async () => {
    const { outbox, server, engine } = setup();
    const doomed = plantRecord();
    const next = plantRecord();
    await outbox.add(doomed, photos(1));
    await outbox.add(next, photos(1));
    const real = server.api[at];
    let deleted = false;
    server.api[at] = async (...args) => {
      const res = await real(...args);
      if (!deleted) {
        deleted = true; // the oldest record's call comes first
        await outbox.remove(doomed.id);
      }
      return res;
    };

    const summary = await engine.run(U);

    assert.deepEqual(await outbox.list(U), []);
    const sent = server.state.observations.find((o) => o.id === next.id);
    assert.equal(sent?.status, "synced", "the next record is still sent");
    assert.equal(summary.stoppedBy, null);
    assert.equal(summary.pending, 0);
  });
}

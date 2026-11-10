// apps/shared/test/offline-store.test.js
// Save-first capture (CTIP-83): the phone writes a record to the outbox before
// it tries the network, and only then starts a sync and waits a little.
// Review Focus 5: if the outbox write fails, the botanist must not see "Saved",
// and the draft must stay.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryOutbox } from "../offline/memoryOutbox.js";
import { saveFirst, waitAtMost } from "../offline/syncEngine.js";
import { newPlantRecord, revisitRecord, outboxPhotos, revisitLocation, cameraCacheFiles, photoPreview } from "../offline/records.js";

const ME = "user-1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const capture = {
  userId: ME,
  qr_id: "NIAH-0042",
  proposed_species: "Nepenthes rajah",
  morphology: "pitchers",
  height_cm: "12.5",
  notes: "",
  lat: 4.1,
  lng: 113.7,
  gps_accuracy_m: 6,
};
const camera = [{ id: "ph-1", url: "file://a.jpg", base64: "QUJDRA==", name: "a.jpg", type: "image/jpeg", caption: "Leaf", traits: ["Leaf"] }];

test("addPlant reports failure and keeps the draft when the outbox write fails", async () => {
  const outbox = createMemoryOutbox();
  outbox.add = async () => {
    throw Object.assign(new Error("database or disk is full"), { code: "SQLITE_FULL" });
  };
  let synced = 0;
  const syncNow = async () => {
    synced += 1;
    return null;
  };
  const record = newPlantRecord(capture);
  const res = await saveFirst({ outbox, record, photos: outboxPhotos(camera), syncNow });
  assert.equal(res.ok, false);
  assert.equal(res.code, "SQLITE_FULL");
  assert.match(res.message, /could not be saved on this phone/i);
  assert.equal(synced, 0, "nothing is sent when nothing was saved");
});

test("saveFirst answers queued: true when the sync is still running after waitMs", async () => {
  const outbox = createMemoryOutbox();
  const never = new Promise(() => {}); // a sync that has not finished (no signal, slow network)
  const syncNow = ({ waitMs }) => waitAtMost(never, waitMs);
  const record = newPlantRecord(capture);
  const res = await saveFirst({ outbox, record, photos: outboxPhotos(camera), syncNow, waitMs: 20 });
  assert.deepEqual({ ok: res.ok, queued: res.queued, id: res.id }, { ok: true, queued: true, id: record.id });
  assert.ok(await outbox.get(record.id), "the record is on the phone");
  assert.equal((await outbox.photos(record.id)).length, 1);
});

test("saveFirst answers queued: false when the sync sent the record in time", async () => {
  const outbox = createMemoryOutbox();
  const record = newPlantRecord(capture);
  // A sync that finished the record: it left the outbox.
  const syncNow = async () => {
    await outbox.remove(record.id);
    return { sent: 1, pending: 0, failed: 0, conflicts: 0, stoppedBy: null };
  };
  const res = await saveFirst({ outbox, record, photos: [], syncNow });
  assert.deepEqual({ ok: res.ok, queued: res.queued }, { ok: true, queued: false });
});

test("saveFirst keeps the record and answers queued when the sync throws", async () => {
  const outbox = createMemoryOutbox();
  const record = newPlantRecord(capture);
  const res = await saveFirst({ outbox, record, photos: [], syncNow: async () => { throw new Error("boom"); } });
  assert.equal(res.ok, true);
  assert.equal(res.queued, true);
  assert.ok(await outbox.get(record.id));
});

test("waitAtMost answers the result in time, or null after the wait", async () => {
  assert.equal(await waitAtMost(Promise.resolve(7), 50), 7);
  assert.equal(await waitAtMost(new Promise(() => {}), 10), null);
});

test("a new plant record carries phone-made ids and the capture time", () => {
  const before = new Date().toISOString();
  const r = newPlantRecord(capture);
  const after = new Date().toISOString();
  assert.match(r.id, UUID);
  assert.match(r.specimen_id, UUID);
  assert.notEqual(r.id, r.specimen_id);
  assert.equal(r.user_id, ME);
  assert.equal(r.kind, "new_plant");
  assert.equal(r.step, "specimen");
  assert.equal(r.state, "pending");
  assert.equal(r.specimen_ref, null);
  assert.equal(r.base_version, null);
  assert.deepEqual(r.specimen, { proposed_species_name: "Nepenthes rajah", lat: 4.1, lng: 113.7, gps_accuracy_m: 6 });
  assert.ok(r.observation.observed_at >= before && r.observation.observed_at <= after);
  assert.equal(r.observation.height_cm, 12.5);
  assert.equal(r.observation.notes, null);
  assert.equal(r.observation.morphology, "pitchers");
});

test("a revisit of a plant made on this phone has no specimen id and points at its record", () => {
  const plant = newPlantRecord(capture);
  const r = revisitRecord({ userId: ME, qr_id: plant.qr_id, specimen_id: null, specimen_ref: plant.id, height_cm: "", morphology: "flowering" });
  assert.equal(r.kind, "revisit");
  assert.equal(r.step, "observation");
  assert.equal(r.specimen_id, null);
  assert.equal(r.specimen_ref, plant.id);
  assert.equal(r.specimen, null);
  assert.equal(r.observation.height_cm, null);
  assert.match(r.id, UUID);

  const server = revisitRecord({ userId: ME, qr_id: "NIAH-0007", specimen_id: "spec-7", specimen_ref: null });
  assert.equal(server.specimen_id, "spec-7");
  assert.equal(server.specimen_ref, null);
});

test("outbox photos keep the camera's id and only the fields the outbox stores", () => {
  const rows = outboxPhotos([...camera, { url: "file://b.jpg", base64: "RUZHSA==" }]);
  assert.equal(rows[0].id, "ph-1");
  assert.match(rows[1].id, UUID);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["base64", "caption", "id", "name", "position", "traits", "type"]);
  assert.equal(rows[1].position, 1);
  assert.equal(rows[1].type, "image/jpeg");
});

// Project rule: a plant with no GPS fix is saved with no location, never with a
// made-up position. A revisit used to fall back to the plant's stored location,
// which is the reduced one for an endangered plant.
test("a revisit with no GPS fix saves no location", () => {
  assert.deepEqual(revisitLocation({ lat: null, lng: null, acc: null }, { hasFix: false }), { lat: null, lng: null, gps_accuracy_m: null });
  // A fix, or a spot set by hand (which has no accuracy): all three come from it.
  assert.deepEqual(revisitLocation({ lat: 4.1, lng: 113.8, acc: 6 }, { hasFix: true }), { lat: 4.1, lng: 113.8, gps_accuracy_m: 6 });
  assert.deepEqual(revisitLocation({ lat: 4.1, lng: 113.8, acc: null }, { hasFix: true }), { lat: 4.1, lng: 113.8, gps_accuracy_m: null });
});

// The design keeps unsent records only in the encrypted file, never in plain
// files. expo-image-picker leaves a plain JPEG of every photo in the app's
// cache; once the record is saved on the phone (or sent) those are deleted.
test("after a save only the camera's own cache files are deleted, never a gallery original", () => {
  const cache = "file:///data/user/0/com.example.app/cache/";
  const photos = [
    { id: "p1", url: `${cache}ImagePicker/a.jpg`, base64: "AAAA" },
    { id: "p2", url: "content://media/external/images/media/12", base64: "BBBB" }, // a gallery original
    { id: "p3", url: `${cache}ImagePicker/a.jpg` }, // the same file twice
    { id: "p4", url: `${cache}../files/daun_drafts_secure.db` }, // never outside the cache
    { id: "p5" },
  ];
  assert.deepEqual(cameraCacheFiles(photos, cache), [`${cache}ImagePicker/a.jpg`]);
  assert.deepEqual(cameraCacheFiles(photos, cache.slice(0, -1)), [`${cache}ImagePicker/a.jpg`], "with or without the last slash");
  assert.deepEqual(cameraCacheFiles(photos, null), []);
});

test("the saved screen's thumbnail comes from the photo's bytes, so it shows after the file is deleted", () => {
  assert.equal(photoPreview({ base64: "AAAA", type: "image/png", url: "file:///x.png" }), "data:image/png;base64,AAAA");
  assert.equal(photoPreview({ base64: "AAAA" }), "data:image/jpeg;base64,AAAA");
  assert.equal(photoPreview({ url: "file:///x.jpg" }), "file:///x.jpg");
  assert.equal(photoPreview(undefined), null);
});

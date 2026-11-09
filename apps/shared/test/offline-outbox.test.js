// apps/shared/test/offline-outbox.test.js
// The outbox interface (CTIP-44). The same tests run against the in-memory outbox
// and the SQLite outbox, so the two cannot drift apart. The SQLite one runs on
// Node's built-in SQLite through a thin adapter that looks like expo-sqlite.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../offline/schema.js";
import { createMemoryOutbox } from "../offline/memoryOutbox.js";
import { createSqliteOutbox } from "../../mobile/offline/outboxStore.js";

// The parts of expo-sqlite's sync API that outboxStore.js uses.
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

const makers = {
  memory: () => createMemoryOutbox(),
  sqlite: () => {
    const db = expoLikeDb();
    migrate(db);
    return createSqliteOutbox(async () => db);
  },
};

function record(id, overrides = {}) {
  return {
    id,
    user_id: "user-1",
    kind: "new_plant",
    qr_id: "QR-" + id,
    specimen_id: null,
    specimen_ref: null,
    specimen: { proposed_species_name: "Nepenthes rajah", lat: 6.08, lng: 116.56, gps_accuracy_m: 8 },
    observation: {
      observed_at: "2026-11-07T08:00:00Z",
      height_cm: 12,
      morphology: "pitchers",
      notes: "",
      lat: 6.08,
      lng: 116.56,
      gps_accuracy_m: 8,
    },
    base_version: null,
    state: "pending",
    step: "specimen",
    attempts: 0,
    error: null,
    server: null,
    created_at: "2026-11-07T08:00:00.000Z",
    updated_at: "2026-11-07T08:00:00.000Z",
    ...overrides,
  };
}

function photo(id, position, overrides = {}) {
  return {
    id,
    position,
    base64: "AAAA" + id,
    name: id + ".jpg",
    type: "image/jpeg",
    caption: "",
    traits: ["leaf"],
    ...overrides,
  };
}

for (const [name, make] of Object.entries(makers)) {
  test(`${name} outbox: add then list returns only that user's records, oldest first`, async () => {
    const outbox = make();
    await outbox.add(record("b", { created_at: "2026-11-07T09:00:00.000Z" }), []);
    await outbox.add(record("a", { created_at: "2026-11-07T08:00:00.000Z" }), []);
    await outbox.add(record("c", { user_id: "user-2" }), []);
    await outbox.add(record("d", { created_at: "2026-11-07T10:00:00.000Z" }), []);

    assert.deepEqual((await outbox.list("user-1")).map((r) => r.id), ["a", "b", "d"]);
    assert.deepEqual((await outbox.list("user-2")).map((r) => r.id), ["c"]);
    assert.deepEqual(await outbox.list("nobody"), []);
  });

  test(`${name} outbox: get returns the record, or null`, async () => {
    const outbox = make();
    await outbox.add(record("a"), []);
    assert.deepEqual(await outbox.get("a"), record("a"));
    assert.equal(await outbox.get("missing"), null);
  });

  test(`${name} outbox: photos come back by position`, async () => {
    const outbox = make();
    await outbox.add(record("a"), [photo("p2", 1), photo("p1", 0), photo("p3", 2)]);
    await outbox.add(record("b"), [photo("q1", 0)]);

    const photos = await outbox.photos("a");
    assert.deepEqual(photos.map((p) => p.id), ["p1", "p2", "p3"]);
    assert.deepEqual(photos[0], {
      id: "p1",
      record_id: "a",
      position: 0,
      base64: "AAAAp1",
      name: "p1.jpg",
      type: "image/jpeg",
      caption: "",
      traits: ["leaf"],
      uploaded: 0,
    });
  });

  test(`${name} outbox: update merges shallowly and sets updated_at`, async () => {
    const outbox = make();
    await outbox.add(record("a"), []);

    await outbox.update("a", { state: "failed", attempts: 2, error: { code: "X", message: "m", action: null } });
    const after = await outbox.get("a");

    assert.equal(after.state, "failed");
    assert.equal(after.attempts, 2);
    assert.equal(after.error.code, "X");
    assert.equal(after.qr_id, "QR-a"); // untouched fields stay
    assert.notEqual(after.updated_at, "2026-11-07T08:00:00.000Z");

    // Shallow: a nested object is replaced, not merged.
    await outbox.update("a", { observation: { notes: "only this" } });
    assert.deepEqual((await outbox.get("a")).observation, { notes: "only this" });

    // The state column follows, so counts see it.
    assert.deepEqual(await outbox.count("user-1"), { pending: 0, failed: 1, conflict: 0 });

    assert.equal(await outbox.update("missing", { state: "failed" }), null);
  });

  test(`${name} outbox: markPhotoUploaded drops the photo bytes`, async () => {
    const outbox = make();
    await outbox.add(record("a"), [photo("p1", 0), photo("p2", 1)]);

    await outbox.markPhotoUploaded("p1");

    const [p1, p2] = await outbox.photos("a");
    assert.equal(p1.uploaded, 1);
    assert.equal("base64" in p1, false);
    assert.equal(p1.name, "p1.jpg"); // the rest of the metadata stays
    assert.equal(p2.uploaded, 0);
    assert.equal(p2.base64, "AAAAp2");
  });

  test(`${name} outbox: firstPhoto answers the lowest-position photo or null`, async () => {
    const outbox = make();
    // Saved out of order: position decides, not the order they were added.
    await outbox.add(record("a"), [photo("p2", 2), photo("p0", 0), photo("p1", 1)]);
    await outbox.add(record("b"), []);

    const first = await outbox.firstPhoto("a");
    assert.equal(first.id, "p0");
    assert.equal(first.record_id, "a");
    assert.equal(first.position, 0);
    assert.equal(first.base64, "AAAAp0");
    assert.equal(first.type, "image/jpeg");
    assert.equal(await outbox.firstPhoto("b"), null, "a record with no photos");
    assert.equal(await outbox.firstPhoto("missing"), null);

    await outbox.removePhoto("p0");
    assert.equal((await outbox.firstPhoto("a")).id, "p1");
  });

  test(`${name} outbox: remove deletes the record and its photos`, async () => {
    const outbox = make();
    await outbox.add(record("a"), [photo("p1", 0)]);
    await outbox.add(record("b"), [photo("q1", 0)]);

    await outbox.remove("a");

    assert.equal(await outbox.get("a"), null);
    assert.deepEqual(await outbox.photos("a"), []);
    assert.deepEqual((await outbox.list("user-1")).map((r) => r.id), ["b"]);
    assert.equal((await outbox.photos("b")).length, 1);
  });

  test(`${name} outbox: removePhoto deletes one photo and keeps the others`, async () => {
    const outbox = make();
    await outbox.add(record("a"), [photo("p1", 0), photo("p2", 1), photo("p3", 2)]);
    await outbox.add(record("b"), [photo("q1", 0)]);

    await outbox.removePhoto("p2");
    await outbox.removePhoto("missing"); // nothing to do, no error

    assert.deepEqual((await outbox.photos("a")).map((p) => p.id), ["p1", "p3"]);
    assert.equal((await outbox.photos("b")).length, 1);
    assert.equal((await outbox.get("a")).qr_id, "QR-a"); // the record itself stays
  });

  test(`${name} outbox: resetInterrupted turns sending into pending`, async () => {
    const outbox = make();
    await outbox.add(record("a", { state: "sending" }), []);
    await outbox.add(record("b", { state: "failed" }), []);
    await outbox.add(record("c", { state: "conflict" }), []);

    await outbox.resetInterrupted();

    assert.equal((await outbox.get("a")).state, "pending");
    assert.equal((await outbox.get("b")).state, "failed");
    assert.equal((await outbox.get("c")).state, "conflict");
  });

  test(`${name} outbox: count gives pending, failed and conflict for one user`, async () => {
    const outbox = make();
    await outbox.add(record("a"), []);
    await outbox.add(record("b", { state: "sending" }), []); // still waiting to go
    await outbox.add(record("c", { state: "failed" }), []);
    await outbox.add(record("d", { state: "conflict" }), []);
    await outbox.add(record("e", { user_id: "user-2" }), []);

    assert.deepEqual(await outbox.count("user-1"), { pending: 2, failed: 1, conflict: 1 });
    assert.deepEqual(await outbox.count("user-2"), { pending: 1, failed: 0, conflict: 0 });
    assert.deepEqual(await outbox.count("nobody"), { pending: 0, failed: 0, conflict: 0 });
  });

  test(`${name} outbox: add is all or nothing`, async () => {
    const outbox = make();
    await outbox.add(record("a"), [photo("p1", 0)]);

    // The second photo repeats an id, so the whole add fails and leaves nothing.
    await assert.rejects(outbox.add(record("b"), [photo("q1", 0), photo("q1", 1)]));
    assert.equal(await outbox.get("b"), null);
    assert.deepEqual(await outbox.photos("b"), []);

    // Re-adding an existing record id fails and does not touch the original.
    await assert.rejects(outbox.add(record("a", { qr_id: "other" }), [photo("p9", 0)]));
    assert.equal((await outbox.get("a")).qr_id, "QR-a");
    assert.deepEqual((await outbox.photos("a")).map((p) => p.id), ["p1"]);
  });
}

test("memory outbox: results are copies, so callers cannot change stored state", async () => {
  const outbox = createMemoryOutbox();
  const input = record("a");
  const inputPhotos = [photo("p1", 0)];
  await outbox.add(input, inputPhotos);

  input.observation.notes = "changed after add";
  inputPhotos[0].base64 = "changed after add";
  const got = await outbox.get("a");
  got.observation.notes = "changed after get";
  (await outbox.list("user-1"))[0].state = "failed";
  (await outbox.photos("a"))[0].base64 = "changed after photos";

  assert.equal((await outbox.get("a")).observation.notes, "");
  assert.equal((await outbox.get("a")).state, "pending");
  assert.equal((await outbox.photos("a"))[0].base64, "AAAAp1");
});

test("sqlite outbox: every method throws OUTBOX_UNAVAILABLE when there is no database", async () => {
  const outbox = createSqliteOutbox(async () => null);
  const calls = [
    () => outbox.add(record("a"), []),
    () => outbox.list("user-1"),
    () => outbox.get("a"),
    () => outbox.update("a", {}),
    () => outbox.photos("a"),
    () => outbox.firstPhoto("a"),
    () => outbox.markPhotoUploaded("p1"),
    () => outbox.remove("a"),
    () => outbox.removePhoto("p1"),
    () => outbox.resetInterrupted(),
    () => outbox.count("user-1"),
  ];
  for (const call of calls) {
    await assert.rejects(call(), (err) => err.code === "OUTBOX_UNAVAILABLE");
  }
});

test("sqlite outbox: stores the record JSON in data and the key fields as columns", async () => {
  const db = expoLikeDb();
  migrate(db);
  const outbox = createSqliteOutbox(async () => db);
  await outbox.add(record("a"), [photo("p1", 0)]);
  await outbox.update("a", { state: "failed" });

  const row = db.getFirstSync("SELECT * FROM outbox_records WHERE id = ?;", ["a"]);
  assert.equal(row.user_id, "user-1");
  assert.equal(row.state, "failed");
  assert.equal(row.created_at, "2026-11-07T08:00:00.000Z");
  assert.equal(JSON.parse(row.data).state, "failed");

  const p = db.getFirstSync("SELECT * FROM outbox_photos WHERE id = ?;", ["p1"]);
  assert.equal(p.record_id, "a");
  assert.equal(p.position, 0);
  assert.equal(p.uploaded, 0);
  assert.equal(JSON.parse(p.data).base64, "AAAAp1");
});

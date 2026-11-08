// apps/shared/test/offline-tags.test.js
// Scanning a tag without signal (CTIP-83): the phone answers from the workspace
// it last loaded, the tag list it saved (tag_cache), and its own unsent records.
import test from "node:test";
import assert from "node:assert/strict";
import {
  lookupTagOffline, tagCacheRows, cleanTagRow, outboxTagsFrom, revisitTarget,
  isReservedForOther, myKeptTags, reservedToCreate, nextReservedTag, RESERVED_LABEL, RESERVED_KEEP,
} from "../offline/tags.js";
import { createTopUp, shouldTopUp } from "../offline/reservedTopUp.js";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../offline/schema.js";
import { createReservedTags } from "../../mobile/offline/reservedTags.js";

const ME = "user-1";
// What the store holds before any workspace has loaded (staffStart in StoreProvider).
const emptyDb = { plants: [], tags: [], species: [], observations: [], reviews: [] };

const outboxPlant = {
  id: "rec-1",
  user_id: ME,
  kind: "new_plant",
  qr_id: "NIAH-0042",
  specimen_id: "spec-1",
  specimen_ref: null,
  specimen: { proposed_species_name: "Nepenthes rajah", lat: 4.1, lng: 113.7, gps_accuracy_m: 6 },
  observation: { observed_at: "2026-11-02T08:00:00.000Z" },
  state: "pending",
};

test("lookupTagOffline uses the cached tag list when the workspace is empty", () => {
  const cached = [
    { qr_id: "NIAH-0001", status: "unused", specimen_id: null, mine: false, name: null },
    { qr_id: "NIAH-0002", status: "assigned", specimen_id: "spec-9", mine: true, name: "Pitcher plant" },
    { qr_id: "NIAH-0003", status: "retired", specimen_id: null, mine: false, name: null },
  ];
  const opts = { cached, outboxTags: [], offline: true };

  const unused = lookupTagOffline(emptyDb, "NIAH-0001", opts);
  assert.equal(unused.kind, "unused");
  assert.equal(unused.id, "NIAH-0001");
  assert.equal(unused.tag.qr_id, "NIAH-0001");

  const used = lookupTagOffline(emptyDb, "niah-0002", opts);
  assert.equal(used.kind, "used");
  assert.equal(used.plant.id, "spec-9");
  assert.equal(used.plant.name, "Pitcher plant");
  assert.equal(used.plant.mine, true);

  assert.equal(lookupTagOffline(emptyDb, "NIAH-0003", opts).kind, "retired");
});

test("lookupTagOffline marks a tag used by a record on this phone as used", () => {
  // The workspace still says the tag is unused: the server has not got the record yet.
  const db = { ...emptyDb, tags: [{ qr_id: "NIAH-0042", status: "unused", batch_label: "A" }] };
  const r = lookupTagOffline(db, "NIAH-0042", { cached: [], outboxTags: outboxTagsFrom([outboxPlant]), offline: true });
  assert.equal(r.kind, "used");
  assert.equal(r.id, "NIAH-0042");
  assert.equal(r.plant.on_phone, true);
  assert.equal(r.plant.outbox_id, "rec-1");
  assert.equal(r.plant.name, "Nepenthes rajah (unconfirmed)");
});

test("lookupTagOffline answers unchecked for an unknown tag while offline", () => {
  const opts = { cached: [], outboxTags: [] };
  assert.equal(lookupTagOffline(emptyDb, "NIAH-0777", { ...opts, offline: true }).kind, "unchecked");
  // Online, the workspace is the full list, so a tag missing from it is unknown.
  assert.equal(lookupTagOffline(emptyDb, "NIAH-0777", { ...opts, offline: false }).kind, "unknown");
  // A code that is not a tag ID never starts a record, even offline.
  assert.equal(lookupTagOffline(emptyDb, "HELLO", { ...opts, offline: true }).kind, "unknown");
});

test("lookupTagOffline prefers the loaded workspace over the cached list", () => {
  const db = { ...emptyDb, tags: [{ qr_id: "NIAH-0005", status: "retired", batch_label: "A" }] };
  const cached = [{ qr_id: "NIAH-0005", status: "unused", specimen_id: null, mine: false, name: null }];
  assert.equal(lookupTagOffline(db, "NIAH-0005", { cached, outboxTags: [], offline: true }).kind, "retired");
});

test("tag cache rows hold no coordinates", () => {
  const db = {
    species: [{ id: "sp-1", common_name: "Rajah pitcher", scientific_name: "Nepenthes rajah" }],
    plants: [
      { id: "spec-1", qr_id: "NIAH-0010", species_id: "sp-1", registered_by: ME, lat: 4.1, lng: 113.7, gps_accuracy_m: 5 },
      { id: "spec-2", qr_id: "NIAH-0011", species_id: null, proposed_species: "Moss", registered_by: "user-2", lat: 4.2, lng: 113.8 },
    ],
    tags: [
      { qr_id: "NIAH-0010", status: "assigned" },
      { qr_id: "NIAH-0011", status: "assigned" },
      { qr_id: "NIAH-0012", status: "unused", batch_label: "B" },
    ],
  };
  const rows = tagCacheRows(db, ME);
  assert.deepEqual(rows, [
    { qr_id: "NIAH-0010", status: "assigned", specimen_id: "spec-1", mine: true, name: "Rajah pitcher" },
    { qr_id: "NIAH-0011", status: "assigned", specimen_id: "spec-2", mine: false, name: "Moss (unconfirmed)" },
    { qr_id: "NIAH-0012", status: "unused", specimen_id: null, mine: false, name: null },
  ]);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ["mine", "name", "qr_id", "specimen_id", "status"]);
  }
  // Whatever a caller hands in, only the five fields are kept.
  assert.deepEqual(cleanTagRow({ qr_id: "NIAH-1", status: "unused", lat: 1, lng: 2, specimen_id: null }), {
    qr_id: "NIAH-1", status: "unused", specimen_id: null, mine: false, name: null,
  });
});

test("a revisit of a plant made on this phone points at its outbox record", () => {
  const target = revisitTarget(emptyDb, "NIAH-0042", { cached: [], outboxItems: [outboxPlant] });
  assert.equal(target.specimen_id, null);
  assert.equal(target.specimen_ref, "rec-1");
  assert.equal(target.on_phone, true);
  assert.equal(target.lat, 4.1);

  const db = { ...emptyDb, plants: [{ id: "spec-7", qr_id: "NIAH-0007", proposed_species: "Fern", lat: 1, lng: 2, photos: [] }] };
  const server = revisitTarget(db, "NIAH-0007", { cached: [], outboxItems: [] });
  assert.equal(server.specimen_id, "spec-7");
  assert.equal(server.specimen_ref, null);

  const cachedOnly = revisitTarget(emptyDb, "NIAH-0002", {
    cached: [{ qr_id: "NIAH-0002", status: "assigned", specimen_id: "spec-9", mine: true, name: "Pitcher plant" }],
    outboxItems: [],
  });
  assert.equal(cachedOnly.specimen_id, "spec-9");
  assert.equal(revisitTarget(emptyDb, "NIAH-0999", { cached: [], outboxItems: [] }), null);
});

// Tags kept for offline use (CTIP-116).
const kept = (qr_id, created_by, extra = {}) => ({ qr_id, status: "unused", batch_label: RESERVED_LABEL, created_by, ...extra });

test("reservedToCreate tops up to 3, not counting tags used on this phone", () => {
  assert.equal(RESERVED_KEEP, 3);
  // One kept tag is still free, one is used by a record on this phone: 2 more.
  const tags = [kept("NIAH-0101", ME), kept("NIAH-0102", ME)];
  assert.equal(reservedToCreate(tags, ME, { usedOnPhone: ["NIAH-0102"] }), 2);
  // Three free kept tags: nothing to make.
  assert.equal(reservedToCreate([kept("NIAH-0101", ME), kept("NIAH-0102", ME), kept("NIAH-0103", ME)], ME), 0);
  // Another botanist's kept tags count for nothing.
  assert.equal(reservedToCreate([kept("NIAH-0101", "user-2"), kept("NIAH-0102", "user-2")], ME), 3);
  // Tags that are no longer unused, or not kept, do not count either.
  const others = [kept("NIAH-0101", ME, { status: "assigned" }), { qr_id: "NIAH-0102", status: "unused", batch_label: "B", created_by: ME }];
  assert.equal(reservedToCreate(others, ME), 3);
  assert.deepEqual(myKeptTags([...tags, ...others], ME), ["NIAH-0101", "NIAH-0102"]);
  assert.equal(reservedToCreate(tags, ME, { keep: 1 }), 0);
});

test("nextReservedTag skips tags used by a record on this phone", () => {
  assert.equal(nextReservedTag(["NIAH-0101", "NIAH-0102"], ["NIAH-0101"]), "NIAH-0102");
  assert.equal(nextReservedTag(["NIAH-0101", "NIAH-0102"], []), "NIAH-0101");
  assert.equal(nextReservedTag(["NIAH-0101"], ["niah-0101"]), null);
  assert.equal(nextReservedTag([], []), null);
});

test("isReservedForOther hides another botanist's reserved tags", () => {
  assert.equal(isReservedForOther(kept("NIAH-0101", ME), ME), false);
  assert.equal(isReservedForOther(kept("NIAH-0101", "user-2"), ME), true);
  // A printed batch tag is for everyone.
  assert.equal(isReservedForOther({ qr_id: "NIAH-0001", status: "unused", batch_label: "Batch 1", created_by: "user-2" }, ME), false);
});

test("tagCacheRows saves another botanist's kept tag as kept", () => {
  const db = {
    species: [],
    plants: [],
    tags: [kept("NIAH-0201", ME), kept("NIAH-0202", "user-2"), { qr_id: "NIAH-0203", status: "unused", batch_label: "Batch 1", created_by: "user-2" }],
  };
  const rows = tagCacheRows(db, ME);
  assert.deepEqual(rows.map((r) => [r.qr_id, r.status]), [["NIAH-0201", "unused"], ["NIAH-0202", "kept"], ["NIAH-0203", "unused"]]);
  // The kept row says only which tag it is and that it is kept: nothing about anyone's plant.
  assert.deepEqual(rows[1], { qr_id: "NIAH-0202", status: "kept", specimen_id: null, mine: false, name: null });
});

test("a cached kept tag scans as kept with no signal", () => {
  const cached = tagCacheRows({ species: [], plants: [], tags: [kept("NIAH-0202", "user-2")] }, ME);
  // A cold start without signal: nothing has loaded, only the saved list is there.
  assert.deepEqual(lookupTagOffline(emptyDb, "NIAH-0202", { cached, offline: true, meId: ME }), { kind: "kept", id: "NIAH-0202" });
});

test("two top-ups at once make one run", async () => {
  let runs = 0;
  let finish;
  const topUp = createTopUp(() => {
    runs += 1;
    return new Promise((resolve) => { finish = resolve; });
  });
  const a = topUp();
  const b = topUp();
  assert.equal(runs, 1);
  finish("done");
  assert.deepEqual(await Promise.all([a, b]), ["done", "done"]);
  // Once it has finished, the next call runs again.
  const c = topUp();
  assert.equal(runs, 2);
  finish("again");
  assert.equal(await c, "again");
});

test("a failed top-up lets the next one run", async () => {
  let runs = 0;
  const topUp = createTopUp(async () => {
    runs += 1;
    if (runs === 1) throw new Error("boom");
    return "ok";
  });
  await assert.rejects(topUp(), /boom/);
  assert.equal(await topUp(), "ok");
});

test("another botanist's kept tag is not offered as unused, online or offline", () => {
  const db = {
    ...emptyDb,
    tags: [
      { qr_id: "NIAH-0201", status: "unused", batch_label: "reserved", created_by: "other-id" },
      { qr_id: "NIAH-0202", status: "unused", batch_label: "reserved", created_by: "me-id" },
    ],
  };
  for (const offline of [false, true]) {
    assert.deepEqual(lookupTagOffline(db, "NIAH-0201", { meId: "me-id", offline }), { kind: "kept", id: "NIAH-0201" });
    // My own kept tag is still mine to use.
    assert.equal(lookupTagOffline(db, "NIAH-0202", { meId: "me-id", offline }).kind, "unused");
  }
});

// Kept tags are a fallback, on by default, and one switch per person (CTIP-116).
test("top-up never runs while keeping offline tags is off", () => {
  const ready = { keepOffline: true, role: "botanist", online: true, loaded: true };
  assert.equal(shouldTopUp(ready), true);
  assert.equal(shouldTopUp({ ...ready, keepOffline: false }), false);
  // The other conditions still apply with the switch on.
  assert.equal(shouldTopUp({ ...ready, role: "officer" }), false);
  assert.equal(shouldTopUp({ ...ready, online: false }), false);
  assert.equal(shouldTopUp({ ...ready, loaded: false }), false);
});

test("the keep-offline setting is on by default, kept per person, and a no-op with no database", async () => {
  const raw = new DatabaseSync(":memory:");
  const db = {
    execSync: (sql) => raw.exec(sql),
    runSync: (sql, params = []) => raw.prepare(sql).run(...params),
    getFirstSync: (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    getAllSync: (sql, params = []) => raw.prepare(sql).all(...params),
    withTransactionSync(task) { raw.exec("BEGIN;"); try { task(); raw.exec("COMMIT;"); } catch (e) { raw.exec("ROLLBACK;"); throw e; } },
  };
  migrate(db);
  const store = createReservedTags(async () => db);
  assert.equal(await store.getKeepOffline("a"), true); // no row: on
  await store.setKeepOffline("a", false);
  assert.equal(await store.getKeepOffline("a"), false);
  assert.equal(await store.getKeepOffline("b"), true); // another person is not affected
  await store.setKeepOffline("a", true);
  assert.equal(await store.getKeepOffline("a"), true);

  const none = createReservedTags(async () => null);
  assert.equal(await none.getKeepOffline("a"), true);
  await none.setKeepOffline("a", false); // nothing to save into, and no error
  assert.equal(await none.getKeepOffline("a"), true);
});

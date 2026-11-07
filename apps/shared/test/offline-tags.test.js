// apps/shared/test/offline-tags.test.js
// Scanning a tag without signal (CTIP-83): the phone answers from the workspace
// it last loaded, the tag list it saved (tag_cache), and its own unsent records.
import test from "node:test";
import assert from "node:assert/strict";
import { lookupTagOffline, tagCacheRows, cleanTagRow, outboxTagsFrom, revisitTarget } from "../offline/tags.js";

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

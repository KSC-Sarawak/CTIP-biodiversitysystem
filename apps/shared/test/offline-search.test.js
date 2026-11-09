// apps/shared/test/offline-search.test.js
// Finding a species by name without signal (CTIP-84): the phone searches the
// published species it saved, and answers in the same shape as GET /public/species.
import test from "node:test";
import assert from "node:assert/strict";
import { searchSpeciesOffline, shouldUseCache, cleanSpeciesRow, cacheIsFresh, CACHE_MAX_AGE_MS } from "../offline/offlineSearch.js";

const LIST = [
  { id: "3", scientific_name: "Rafflesia keithii", common_name: "Keith's rafflesia", family: "Rafflesiaceae", genus: "Rafflesia" },
  { id: "1", scientific_name: "Nepenthes rajah", common_name: "Giant pitcher plant", family: "Nepenthaceae", genus: "Nepenthes" },
  { id: "2", scientific_name: "Nepenthes villosa", common_name: null, family: "Nepenthaceae", genus: "Nepenthes" },
  { id: "4", scientific_name: "Dipterocarpus oblongifolius", common_name: "Chengal pasir", family: null, genus: null },
];
const ids = (r) => r.data.map((s) => s.id);

test("matches scientific name, common name, family and genus, ignoring case", () => {
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "RAJAH" })), ["1"]); // scientific name
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "pitcher" })), ["1"]); // common name
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "rafflesiac" })), ["3"]); // family
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "nep" })), ["1", "2"]); // genus and name, sorted
  // A species with no family, genus or common name still matches on what it has.
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "chengal" })), ["4"]);
});

test("results are sorted by scientific name", () => {
  // "ceae" matches three families; LIST holds Rafflesia first, but it must come last.
  const r = searchSpeciesOffline(LIST, { q: "ceae" });
  assert.deepEqual(r.data.map((s) => s.scientific_name), ["Nepenthes rajah", "Nepenthes villosa", "Rafflesia keithii"]);
});

test("family filter narrows the results", () => {
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "nep", family: "nepenthaceae" })), ["1", "2"]);
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "nep", family: "Rafflesiaceae" })), []);
  // A family alone is enough, and "all" means no filter (as for the API).
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { family: "Rafflesiaceae" })), ["3"]);
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "rajah", family: "all" })), ["1"]);
});

test("pages like the API and reports the total", () => {
  const many = Array.from({ length: 45 }, (_, i) => ({
    id: String(i), scientific_name: `Ficus ${String(i).padStart(2, "0")}`, common_name: null, family: "Moraceae", genus: "Ficus",
  }));
  const p1 = searchSpeciesOffline(many, { q: "ficus" });
  assert.equal(p1.data.length, 20);
  assert.deepEqual(p1.meta, { page: 1, limit: 20, total: 45 });
  const p3 = searchSpeciesOffline(many, { q: "ficus", page: 3 });
  assert.equal(p3.data.length, 5);
  assert.equal(p3.data[0].scientific_name, "Ficus 40");
  assert.deepEqual(p3.meta, { page: 3, limit: 20, total: 45 });
  const small = searchSpeciesOffline(many, { q: "ficus", limit: 10, page: 2 });
  assert.equal(small.data.length, 10);
  assert.equal(small.meta.limit, 10);
});

test("an empty term returns nothing", () => {
  for (const q of ["", "n", "  ", "%", undefined]) {
    const r = searchSpeciesOffline(LIST, { q });
    assert.deepEqual(r.data, []);
    assert.equal(r.meta.total, 0);
  }
  assert.deepEqual(searchSpeciesOffline(null, { q: "nep" }).data, []);
});

test("the term is cleaned like the online search", () => {
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "nep%en(thes)" })), ["1", "2"]);
  assert.deepEqual(ids(searchSpeciesOffline(LIST, { q: "keith's" })), ["3"]);
});

test("cleanSpeciesRow keeps only public fields and cuts the description to 200 characters", () => {
  const row = cleanSpeciesRow({
    id: "1", scientific_name: "Nepenthes rajah", common_name: "Giant pitcher plant", family: "Nepenthaceae", genus: "Nepenthes",
    description: "x".repeat(300), conservation_status: "endangered", primary_image_url: "https://img/1", is_published: true, internal_notes: "secret",
  });
  assert.equal(row.description.length, 200);
  assert.equal(row.conservation_status, "endangered");
  assert.equal("internal_notes" in row, false);
  assert.equal("is_published" in row, false);
  assert.equal("primary_image_url" in row, false);
  const bare = cleanSpeciesRow({ id: "2", scientific_name: "Ficus" });
  assert.equal(bare.common_name, null);
  assert.equal(bare.description, null);
});

test("cacheIsFresh is true for 24 hours after the last refresh", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  assert.equal(CACHE_MAX_AGE_MS, 24 * 60 * 60 * 1000);
  assert.equal(cacheIsFresh(new Date(now - 60 * 1000).toISOString(), now), true);
  assert.equal(cacheIsFresh(new Date(now - 25 * 3600 * 1000).toISOString(), now), false);
  assert.equal(cacheIsFresh(null, now), false);
  assert.equal(cacheIsFresh("not a date", now), false);
  // A clock set back must not freeze the cache for days.
  assert.equal(cacheIsFresh(new Date(now + 3600 * 1000).toISOString(), now), false);
});

test("shouldUseCache: page 1 may use the cache; later pages only when already offline", () => {
  assert.equal(shouldUseCache({ page: 1, offline: false }), true);
  assert.equal(shouldUseCache({ page: 1, offline: true }), true);
  assert.equal(shouldUseCache({ page: 2, offline: true }), true);
  // Signal lost while scrolling an online search: do not append a cached page.
  assert.equal(shouldUseCache({ page: 2, offline: false }), false);
  assert.equal(shouldUseCache({ page: 3 }), false);
});

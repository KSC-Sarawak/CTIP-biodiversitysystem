// apps/shared/test/species-ecology.test.js
// A species' habitat and ecology (CTIP-149): sent to the API like the other
// species text fields, and kept in the plant book.
import { test } from "node:test";
import assert from "node:assert/strict";
import { speciesBody } from "../api.js";
import { bookEntries } from "../selectors.js";

test("speciesBody sends ecology trimmed, and an empty one as null", () => {
  assert.equal(speciesBody({ scientific_name: "X", ecology: "  Peat swamp  " }).ecology, "Peat swamp");
  assert.equal(speciesBody({ scientific_name: "X", ecology: "   " }).ecology, null);
});

test("the plant book keeps a species' habitat and ecology", () => {
  const [e] = bookEntries([{ id: "1", scientific_name: "X", is_published: true, is_deleted: false, ecology: "Peat swamp" }]);
  assert.equal(e.ecology, "Peat swamp");
});

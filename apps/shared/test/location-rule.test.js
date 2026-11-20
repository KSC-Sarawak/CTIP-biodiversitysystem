// apps/shared/test/location-rule.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { BLANK_SPECIES, CONSERVATION, hideLocationRule, isThreatened, THREATENED } from "../data.js";
import { isExactProtected, tileServerZoom, TILE_LAYERS } from "../mapConfig.js";
import { generateMapHtml } from "../mapHtml.js";
import { plantView, shownCoords } from "../selectors.js";

test("isThreatened normalizes status and matches case-insensitively", () => {
  assert.equal(isThreatened("endangered"), true);
  assert.equal(isThreatened("Endangered"), true);
  assert.equal(isThreatened("  ENDANGERED  "), true);
  // RBAC D11: critically endangered is no longer a status (it became endangered).
  assert.equal(isThreatened("critically endangered"), false);

  assert.equal(isThreatened("vulnerable"), false);
  assert.equal(isThreatened("Vulnerable"), false);
  assert.equal(isThreatened("least concern"), false);
  assert.equal(isThreatened("Least Concern"), false);
  assert.equal(isThreatened("near threatened"), false);
  assert.equal(isThreatened(""), false);
  assert.equal(isThreatened(null), false);
  assert.equal(isThreatened(undefined), false);
});

test("endangered species have exact coordinates locked to hidden", () => {
  for (const status of ["endangered", "Endangered", " ENDANGERED "]) {
    const rule = hideLocationRule(status, false, false);
    assert.equal(rule.locked, true);
    assert.equal(rule.on, true);
    assert.match(rule.hint, /Always on for endangered species/);
  }
});

test("vulnerable and other statuses are shown until an officer or admin hides the plant (RBAC D11)", () => {
  for (const status of ["vulnerable", "Vulnerable", "near threatened", "least concern"]) {
    assert.equal(hideLocationRule(status, false).on, false, status);
    assert.equal(hideLocationRule(status, false).locked, false, status);
    assert.doesNotMatch(hideLocationRule(status, false).hint, /On by default/);
    // the flag, or ticking it on this screen, hides it
    assert.equal(hideLocationRule(status, true).on, true, status);
    assert.equal(hideLocationRule(status, false, true).on, true, status);
  }
});

test("only the four agreed statuses, and a new species has none picked (RBAC D11)", () => {
  assert.deepEqual(CONSERVATION, ["least concern", "near threatened", "vulnerable", "endangered"]);
  assert.equal(BLANK_SPECIES.conservation_status, "");
});

test("plantView and shownCoords protect endangered species from public visitors while staff see exact spots", () => {
  const db = {
    species: [
      { id: "s1", scientific_name: "Nepenthes rajah", common_name: "Rajah Pitcher", conservation_status: "Endangered", is_published: true },
      { id: "s2", scientific_name: "Hevea brasiliensis", common_name: "Rubber Tree", conservation_status: "Least Concern", is_published: true },
    ],
    plants: [
      { id: "p1", species_id: "s1", qr_id: "TAG-001", lat: 3.8, lng: 113.7, is_deleted: false },
      { id: "p2", species_id: "s2", qr_id: "TAG-002", lat: 3.8, lng: 113.7, is_deleted: false },
    ],
    observations: [
      { id: "o1", specimen_id: "p1", status: "approved", observed_at: "2026-01-01" },
      { id: "o2", specimen_id: "p2", status: "approved", observed_at: "2026-01-01" },
    ],
    profiles: [],
  };

  const v1 = plantView(db, db.plants[0]);
  assert.equal(v1.endangered, true);
  assert.equal(shownCoords(v1, "visitor"), null);
  assert.deepEqual(shownCoords(v1, "botanist"), { lat: 3.8, lng: 113.7 });
  assert.deepEqual(shownCoords(v1, "officer"), { lat: 3.8, lng: 113.7 });

  const v2 = plantView(db, db.plants[1]);
  assert.equal(v2.endangered, false);
  assert.deepEqual(shownCoords(v2, "visitor"), { lat: 3.8, lng: 113.7 });
});

test("other species are the officer's choice and start from what is saved", () => {
  assert.equal(hideLocationRule("least concern", false).on, false);
  assert.equal(hideLocationRule("least concern", true).on, true);
  assert.equal(hideLocationRule("least concern", false, true).on, true);
  assert.equal(hideLocationRule(undefined, false).locked, false);
});

test("every wording says that details and photos stay visible", () => {
  for (const status of ["endangered", "vulnerable", "least concern"]) {
    assert.match(hideLocationRule(status).hint, /Plant details and photos stay visible/);
  }
});

test("only an exact protected spot limits the map tiles", () => {
  assert.equal(isExactProtected({ endangered: true }), true);
  assert.equal(isExactProtected({ endangered: true, location_reduced: true }), false, "the 1.1 km area reveals nothing new");
  assert.equal(isExactProtected({ endangered: false }), false);
  assert.equal(tileServerZoom(TILE_LAYERS.osm), 19);
  assert.equal(tileServerZoom(TILE_LAYERS.satellite), 18);
});

test("the mobile map page's script is valid JavaScript", () => {
  const html = generateMapHtml({ points: [{ id: "a", qr_id: "NIAH-0001", name: "x", lat: 3.8, lng: 113.7, protect: true }] });
  const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Function(script));
});

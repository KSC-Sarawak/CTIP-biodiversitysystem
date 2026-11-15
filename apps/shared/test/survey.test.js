// apps/shared/test/survey.test.js
// Quick survey mode (CTIP-147): record a whole plot with kept tags, carrying
// over only what is the same for every plant.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SURVEY_TAG_DEFAULT, SURVEY_TAG_MAX, checkSurveyStart, carryOver, keepTarget, extraKeptTags, sessionSummary,
  surveyIdFor, keptTagRefusal,
} from "../offline/survey.js";
import { RESERVED_KEEP } from "../offline/tags.js";

test("survey defaults: 10 tags, at most 20", () => {
  assert.equal(SURVEY_TAG_DEFAULT, 10);
  assert.equal(SURVEY_TAG_MAX, 20);
});

test("carryOver never carries photos, GPS, height, morphology or notes", () => {
  const last = {
    survey_id: "s1", proposed_species: "Nepenthes rajah", photos: [{ uri: "x" }], lat: 3.8, lng: 113.7,
    gps_accuracy_m: 5, height_cm: 40, morphology: "pitchers", notes: "by the stream",
  };
  assert.deepEqual(carryOver(last, { sameSpecies: false }), { survey_id: "s1" });
  assert.deepEqual(carryOver(last, { sameSpecies: true }), { survey_id: "s1", proposed_species: "Nepenthes rajah" });
  assert.deepEqual(carryOver({ survey_id: "s1", proposed_species: "  " }, { sameSpecies: true }), { survey_id: "s1" });
});

test("checkSurveyStart refuses an empty name, 0 tags and 21 tags", () => {
  assert.deepEqual(checkSurveyStart({ name: "Plot 4", tagTarget: 10 }), { ok: true });
  assert.equal(checkSurveyStart({ name: "   ", tagTarget: 10 }).ok, false);
  assert.equal(checkSurveyStart({ name: "x".repeat(61), tagTarget: 10 }).ok, false);
  assert.equal(checkSurveyStart({ name: "Plot 4", tagTarget: 0 }).ok, false);
  assert.equal(checkSurveyStart({ name: "Plot 4", tagTarget: 21 }).ok, false);
  assert.equal(checkSurveyStart({ name: "Plot 4", tagTarget: 2.5 }).ok, false);
  assert.match(checkSurveyStart({ name: "Plot 4", tagTarget: 21 }).message, /20/);
});

test("keepTarget is 3 with no survey and the target during one", () => {
  assert.equal(keepTarget(null), RESERVED_KEEP);
  assert.equal(keepTarget({ tag_target: 10 }), 10);
  assert.equal(keepTarget({ tag_target: 2 }), RESERVED_KEEP);
});

test("extraKeptTags keeps the first 3 free tags and never returns one a record holds", () => {
  const kept = ["T-1", "T-2", "T-3", "T-4", "T-5", "T-6"];
  assert.deepEqual(extraKeptTags(kept, []), ["T-4", "T-5", "T-6"]);
  assert.deepEqual(extraKeptTags(kept, ["T-1", "T-5"]), ["T-6"]);
  assert.deepEqual(extraKeptTags(["T-1", "T-2"], []), []);
  assert.deepEqual(extraKeptTags(kept, [], 5), ["T-6"]);
});

test("sessionSummary counts recorded, on the phone, sent and tags left", () => {
  const timings = [{ survey_id: "s1" }, { survey_id: "s1" }, { survey_id: "s1" }, { survey_id: "other" }, { survey_id: null }];
  const outboxItems = [{ survey_id: "s1" }, { survey_id: "other" }];
  assert.deepEqual(
    sessionSummary({ sessionId: "s1", timings, outboxItems, keptIds: ["T-1", "T-2", "T-3", "T-4"], usedOnPhone: ["T-1"] }),
    { recorded: 3, onPhone: 1, sent: 2, tagsLeft: 3 },
  );
});

test("a plant recorded while a survey is open belongs to it, even from a scanned printed tag (review fix)", () => {
  assert.equal(surveyIdFor({ survey: "s1" }, { id: "s1" }), "s1");
  assert.equal(surveyIdFor({}, { id: "s1" }), "s1"); // came through Scan, no survey in the route
  assert.equal(surveyIdFor({ qr: "NIAH-0009" }, null), null);
  assert.equal(surveyIdFor(undefined, undefined), null);
});

test("a refused top-up is told to the botanist when it matters, and stays quiet otherwise (review fix)", () => {
  const tooMany = { ok: false, status: 403, code: "TOO_MANY_KEPT_TAGS", message: "Release some kept tags first." };
  assert.equal(keptTagRefusal(tooMany, 3), "Release some kept tags first.");
  assert.equal(keptTagRefusal(tooMany, 10), "Release some kept tags first.");
  const serverError = { ok: false, status: 500, code: "INTERNAL", message: "Something went wrong" };
  assert.match(keptTagRefusal(serverError, 10), /Something went wrong/);
  assert.equal(keptTagRefusal(serverError, 3), null); // the everyday top-up stays quiet, as before
  assert.equal(keptTagRefusal({ ok: false, offline: true, message: "Cannot reach the API server" }, 10), null);
});

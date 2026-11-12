// apps/shared/test/status-and-photos.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { statusKey, withStatusKey, isThreatened } from "../data.js";
import { speciesCatalogue, shownCoords } from "../selectors.js";
import { sniffFileKind, photoFileProblem } from "../utils.js";
import { seed } from "../data.js";
import { outboxStatus } from "../offline/syncEngine.js";
import { STATUS_TEXT, STATUS_TONE } from "../tokens.js";

// 1. "Endangered" with a capital E must count as endangered everywhere.

test("statusKey and withStatusKey put a status in one form", () => {
  assert.equal(statusKey("  Endangered "), "endangered");
  assert.equal(statusKey(null), null);
  assert.deepEqual(withStatusKey({ id: 1, conservation_status: "Critically Endangered" }), { id: 1, conservation_status: "critically endangered" });
  assert.deepEqual(withStatusKey({ id: 2 }), { id: 2 });
});

test("the catalogue (and the dashboard count) sees a capitalised Endangered species", () => {
  const db = { ...seed, plants: [], species: [
    { id: "a", scientific_name: "A", conservation_status: "Endangered" },
    { id: "b", scientific_name: "B", conservation_status: "CRITICALLY ENDANGERED" },
    { id: "c", scientific_name: "C", conservation_status: "Least Concern" },
  ] };
  const view = Object.fromEntries(speciesCatalogue(db, "officer").map((s) => [s.id, s.endangered]));
  assert.deepEqual(view, { a: true, b: true, c: false });
});

test("visitors get no map pin for an endangered plant, even with the API's reduced point", () => {
  const point = { lat: 3.815, lng: 113.775, endangered: isThreatened("Endangered") };
  assert.equal(shownCoords(point, "visitor"), null);
  assert.deepEqual(shownCoords(point, "officer"), { lat: 3.815, lng: 113.775 });
});

// 2. A video renamed to .jpg is not a picture.

const bytes = (...b) => new Uint8Array(b);
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

test("sniffFileKind reads what a file really is", () => {
  assert.equal(sniffFileKind(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffFileKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(sniffFileKind(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"))), "image/webp");
  assert.equal(sniffFileKind(bytes(0, 0, 0, 0x18, ...ascii("ftypmp42"))), "video");
  assert.equal(sniffFileKind(bytes(0, 0, 0, 0x18, ...ascii("ftypheic"))), "image/heic");
  assert.equal(sniffFileKind(bytes(0x1a, 0x45, 0xdf, 0xa3)), "video");
  assert.equal(sniffFileKind(bytes(...ascii("%PDF-1.7"))), null);
});

test("a video renamed to .jpg is refused with the reason; a real JPG passes", async () => {
  const video = new File([bytes(0, 0, 0, 0x18, ...ascii("ftypisom"), 0, 0, 0, 0)], "clip.jpg", { type: "image/jpeg" });
  assert.match(await photoFileProblem(video), /clip\.jpg is a video, not a picture/);
  const pdf = new File([bytes(...ascii("%PDF-1.7 rest"))], "scan.jpg", { type: "image/jpeg" });
  assert.match(await photoFileProblem(pdf), /scan\.jpg is not a picture, whatever its name says/);
  const jpg = new File([bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)], "leaf.jpg", { type: "image/jpeg" });
  assert.equal(await photoFileProblem(jpg), null);
});

// 3. A record saved on the phone shows its outbox state in the words the app
//    already uses (docs/architecture/offline-sync.md, section 6).

test("outboxStatus maps every outbox state to a status with STATUS_TEXT wording", () => {
  const expected = {
    pending: ["queued", "Waiting to sync", "neutral"],
    sending: ["sending", "Sending", "info"],
    failed: ["sync_failed", "Couldn't send", "warning"],
    conflict: ["sync_conflict", "Changed on another device", "warning"],
  };
  for (const [state, [status, text, tone]] of Object.entries(expected)) {
    assert.equal(outboxStatus({ state }), status, state);
    assert.equal(STATUS_TEXT[status], text, status);
    assert.equal(STATUS_TONE[status], tone, status);
  }
  // A row from an older build without a state is still waiting.
  assert.equal(outboxStatus({}), "queued");
});

// apps/shared/offline/syncStatus.js
// What the botanist sees about records saved on this phone, and when the app
// tries to send them again (CTIP-68). Design: docs/architecture/offline-sync.md,
// sections 6 and 11. The words here are the design's, so change them there first.
//
// Pure functions only: the phone's hooks and screens call these, and they run
// under plain Node in the tests. No React Native imports.
import { STATUS_TEXT } from "../tokens.js";
import { plantView } from "../selectors.js";
import { outboxStatus, actionFor } from "./syncEngine.js";
import { LIMITS, HEIGHT_PROBLEM, heightOk, cleanHeight, cleanText } from "./records.js";

/* ---------- when to try again ---------- */

// While records wait, the app tries again after 30 s, 1 min, 2 min, then every 5 min.
const BACKOFF_MS = [30000, 60000, 120000];
const BACKOFF_STEADY_MS = 300000;

/** How long to wait before try number `attempt` (0 = the first try after a reset). */
export function backoffDelay(attempt) {
  return BACKOFF_MS[attempt] ?? BACKOFF_STEADY_MS;
}

/**
 * Does this SyncSummary reset the backoff? Only a run that got through and sent
 * at least one record. A run that "got through" but sent nothing (say one record
 * keeps getting a server error) must not bring the next try back to 30 s, or
 * that record would be retried every 30 s for ever.
 */
export function isProgress(summary) {
  return Boolean(summary) && !summary.stoppedBy && summary.sent > 0;
}

/* ---------- counting ---------- */

const isWaiting = (r) => r?.state === "pending" || r?.state === "sending" || !r?.state;
const isUnsent = (r) => r?.state === "failed" || r?.state === "conflict";

/** Records still to be sent by a run (pending or being sent now). */
export const waitingCount = (outboxItems = []) => outboxItems.filter(isWaiting).length;

/** Records a run will not send until the botanist acts (failed or conflict): the tab badge. */
export const unsentCount = (outboxItems = []) => outboxItems.filter(isUnsent).length;

/* ---------- one record, listed once ---------- */

const norm = (id) => String(id || "").trim().toUpperCase();

/**
 * A record still in the outbox can already exist on the server: the sync
 * engine creates the observation as `queued` (and a new plant's specimen)
 * before its photos and submit. My records lists the outbox copy under
 * "On this phone", so the server's copies are hidden until the record leaves
 * the outbox:
 *   observations  with the record's id (the phone made it, the server keeps it)
 *   plants        a new plant's specimen, which would look "unfinished" (no visit yet)
 *   drafts        a crash-safe draft left on the record's tag
 */
export function withoutOutboxTwins({ observations = [], plants = [], drafts = [] }, outboxItems = []) {
  const recordIds = new Set(outboxItems.map((r) => r.id));
  const newPlants = outboxItems.filter((r) => r.kind === "new_plant");
  const specimenIds = new Set(newPlants.map((r) => r.specimen_id).filter(Boolean));
  const tags = new Set(newPlants.map((r) => norm(r.qr_id)).filter(Boolean));
  return {
    observations: observations.filter((o) => !recordIds.has(o.id)),
    plants: plants.filter((p) => !specimenIds.has(p.id)),
    drafts: drafts.filter((d) => !tags.has(norm(d.qr_id))),
  };
}

const unconfirmed = (proposed) => `${proposed || "Unnamed plant"} (unconfirmed)`;

// The plant's name: from the record itself (a new plant), from the plant's own
// record on this phone, from the loaded workspace, or from the saved tag list.
function nameFor(record, { db, outboxItems, cached }) {
  if (record.kind === "new_plant") return unconfirmed(record.specimen?.proposed_species_name);
  if (record.specimen_ref) {
    const plant = outboxItems.find((r) => r.id === record.specimen_ref);
    if (plant) return unconfirmed(plant.specimen?.proposed_species_name);
  }
  const loaded = (db?.plants || []).find((p) => p.id === record.specimen_id);
  if (loaded && db) return plantView(db, loaded).name;
  const row = cached.find((r) => norm(r.qr_id) === norm(record.qr_id));
  return row?.name || "Recorded plant";
}

/** One row of "On this phone": { id, name, qr_id, status, revisit, observed_at, label }. */
export function outboxRowView(record, { db = null, outboxItems = [], cached = [] } = {}) {
  const name = nameFor(record, { db, outboxItems, cached });
  const status = outboxStatus(record);
  const qr = record.qr_id ? norm(record.qr_id) : null;
  return {
    id: record.id,
    name,
    qr_id: qr,
    status,
    revisit: record.kind === "revisit",
    observed_at: record.observation?.observed_at ?? record.created_at ?? null,
    label: [name, qr ? `tag ${qr}` : null, STATUS_TEXT[status]].filter(Boolean).join(", "),
  };
}

/* ---------- the sync bar and its toasts ---------- */

/** "{n} waiting to sync · Last sent {time}", or "Sending…" while a run is going. */
export function syncBarText({ outboxItems = [], running = false, lastSyncedAt = null }, formatTime) {
  if (running) return "Sending…";
  const text = `${waitingCount(outboxItems)} waiting to sync`;
  return lastSyncedAt ? `${text} · Last sent ${formatTime(lastSyncedAt)}` : text;
}

// UI B, at the top of My records and Add plant while the store says the API
// can't be reached (apiStatus === 'offline'), never from one failed send.
export const OFFLINE_NOTICE = "You're offline. New records are saved on this phone.";

export const STILL_OFFLINE = "Still offline. They'll send when you're back online.";

const records = (n) => (n === 1 ? "1 record" : `${n} records`);

/**
 * The toast after "Sync now". `offline` is the store's own reading
 * (apiStatus === 'offline'). A run stopped with stoppedBy 'offline' can also
 * be a timeout or a 429 from a working server, so only the store's reading
 * may say "offline"; the summary alone never does.
 */
export function syncToast(summary, { offline = false } = {}) {
  if (offline && (!summary || summary.stoppedBy === "offline")) return STILL_OFFLINE;
  if (!summary) return null;
  if (summary.stoppedBy === "signed_out") return "Sign in again to send them.";
  if (summary.stoppedBy === "offline") return "Couldn't reach the server. They'll send later.";
  if (summary.sent > 0) return `${records(summary.sent)} sent for review`;
  const stuck = (summary.failed || 0) + (summary.conflicts || 0);
  if (stuck > 0) return `${records(stuck)} couldn't be sent. Open ${stuck === 1 ? "it" : "them"} to see why.`;
  if (summary.pending > 0) return "Not everything could be sent yet. It will try again soon.";
  return null;
}

/* ---------- a record that could not be sent ---------- */

/**
 * The warning on a failed record (UI D): { action, body, button, photoId? },
 * or null when the record has not failed. `photos` are the record's outbox
 * photos in order, to say which one ("Photo 2") cannot be sent.
 */
export function failureNotice(record, photos = []) {
  if (record?.state !== "failed") return null;
  const error = record.error || {};
  if (error.action === "pick_tag") {
    return {
      action: "pick_tag",
      body: `Tag ${record.qr_id} is already on another plant. Choose another tag for this record.`,
      button: "Choose another tag",
    };
  }
  if (error.action === "wait_review") {
    return {
      action: "wait_review",
      body: "This plant has a record waiting for an officer. It will be sent once they decide.",
      button: null, // it goes back to pending on every manual sync (resetsOnManualSync)
    };
  }
  if (error.action === "remove_photo") {
    const index = photos.findIndex((p) => p.id === error.photo_id);
    if (index >= 0) {
      return {
        action: "remove_photo",
        body: `Photo ${index + 1} can't be sent: it is too large, or not a JPEG, PNG or WebP. Remove it to send the rest.`,
        button: "Remove photo",
        photoId: error.photo_id,
      };
    }
    // The photo is gone already, so there is nothing to remove: just send again.
  }
  // The API refused the content. A record refused before this action existed
  // was saved with "retry", so its code decides too.
  if (error.action === "fix_record" || actionFor(error.code) === "fix_record") {
    const message = String(error.message || "").trim();
    const reason = message ? `: ${/[.!?]$/.test(message) ? message : `${message}.`}` : ".";
    return {
      action: "fix_record",
      body: `The server can't accept this record as it is${reason} Change the details below and send it again.`,
      button: "Save and send", // under the "Fix this record" form (PhoneRecords.js)
    };
  }
  return { action: "retry", body: error.message || "This record couldn't be sent.", button: "Try again" };
}

/**
 * The changes "Save and send" makes to a record the API refused for its
 * content (fix_record). `form` holds the botanist's text: height_cm,
 * morphology, notes and, for a new plant, proposed_species_name. Anything else
 * in `form` is ignored, so the record keeps every id, its tag, its time and
 * its place. An edit changes only the fields it already holds: it sends just
 * those. Answers { ok: true, changes } (for outbox.update) or { ok: false, message }
 * when a field breaks the same limits as the capture form.
 */
export function fixRecordChanges(record, form = {}) {
  const has = (field) => form[field] !== undefined;
  if (has("height_cm") && !heightOk(form.height_cm)) return { ok: false, message: HEIGHT_PROBLEM };
  for (const [field, label] of [["morphology", "Appearance"], ["notes", "Field notes"]]) {
    if (has(field) && String(form[field] ?? "").trim().length > LIMITS.text) {
      return { ok: false, message: `${label} can be at most ${LIMITS.text} characters.` };
    }
  }
  if (has("proposed_species_name") && String(form.proposed_species_name ?? "").trim().length > LIMITS.speciesName) {
    return { ok: false, message: `The species name can be at most ${LIMITS.speciesName} characters.` };
  }

  const isEdit = record.kind === "edit";
  const cleaners = { height_cm: cleanHeight, morphology: cleanText, notes: cleanText };
  const observation = { ...(record.observation || {}) };
  for (const [field, clean] of Object.entries(cleaners)) {
    if (!has(field) || (isEdit && !(field in observation))) continue;
    observation[field] = clean(form[field]);
  }
  const changes = { observation, state: "pending", error: null, attempts: 0 };
  if (record.kind === "new_plant" && has("proposed_species_name")) {
    changes.specimen = { ...(record.specimen || {}), proposed_species_name: cleanText(form.proposed_species_name) };
  }
  return { ok: true, changes };
}

/**
 * The changes "Choose another tag" makes to a record. The record keeps every id
 * it has (its observation, plant and photos): only the tag changes, and it is
 * sent again. It goes back to the specimen step only if the plant was never
 * made on the server (an older row may lack `step`).
 */
export function tagChangeFor(record, qrId) {
  const neverMade = record.kind === "new_plant" && (record.step ?? "specimen") === "specimen";
  return { qr_id: norm(qrId), state: "pending", error: null, attempts: 0, step: neverMade ? "specimen" : record.step };
}

/**
 * The outbox ids "Delete from this phone" removes for record `id`: the record,
 * and any revisit that waits for it (a revisit of a plant saved only on this
 * phone). Without the plant such a revisit could never be sent, and it would
 * wait in the outbox for ever.
 */
export function recordsToDelete(id, outboxItems = []) {
  return [id, ...outboxItems.filter((r) => r.specimen_ref === id && r.id !== id).map((r) => r.id)];
}

/** A record waiting for an officer's decision is tried again on every manual sync. */
export function resetsOnManualSync(record) {
  return record?.state === "failed" && record.error?.action === "wait_review";
}

/* ---------- two devices edited one record (CTIP-67) ---------- */

const CONFLICT_FIELDS = [
  { field: "height_cm", label: "Height", show: (v) => (v == null || v === "" ? "-" : `${v} cm`) },
  { field: "morphology", label: "Appearance", show: (v) => v || "-" },
  { field: "notes", label: "Notes", show: (v) => v || "-" },
];

// "" and null both mean "empty", so they never count as a difference.
const sameValue = (a, b) => (a ?? "") === (b ?? "");

/**
 * The table in the conflict view (UI E): [{ field, label, mine, theirs }] for the
 * fields where this phone's edit and the server's copy differ, in the order
 * Height, Appearance, Notes. Only fields the phone changed can differ: an edit
 * record holds just those. `mine` and `theirs` are the words to show.
 */
export function conflictRows(record) {
  const mine = record?.observation || {};
  const theirs = record?.server;
  if (!theirs) return [];
  return CONFLICT_FIELDS
    .filter(({ field }) => field in mine && !sameValue(mine[field], theirs[field]))
    .map(({ field, label, show }) => ({ field, label, mine: show(mine[field]), theirs: show(theirs[field]) }));
}

/** The sign-out alert's title (UI G). */
export const unsentTitle = (n) => `${records(n)} not sent yet`;

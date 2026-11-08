// apps/shared/offline/records.js
// Builds the outbox records the phone saves at capture time (CTIP-83). The record
// shape is documented in docs/architecture/offline-sync.md and memoryOutbox.js.
//
// Two rules matter here, because a field record cannot be made again:
//   - Every id (plant, observation, photo) is made on the phone, once, here. The
//     API answers a repeated id with the row it already holds, so a resend after
//     a lost answer never stores a second copy. The server never picks an id.
//   - observed_at is stamped now, at capture, and stored in the record. The
//     sync engine sends it as it is, so a record synced on Wednesday still says
//     it was made on Monday.
//
// No React Native imports: this runs under plain Node in the tests.
import { uid, nowIso } from "../utils.js";

// The form gives text; the API wants a number or null.
export function cleanHeight(height_cm) {
  if (height_cm === "" || height_cm == null) return null;
  const n = Number(height_cm);
  return Number.isNaN(n) ? null : n;
}

const cleanText = (value) => (typeof value === "string" ? value.trim() : value) || null;

// The observation part of a record, in the fields POST /sync accepts.
function observationOf({ height_cm, morphology, notes, lat, lng, gps_accuracy_m }, observedAt) {
  return {
    observed_at: observedAt,
    height_cm: cleanHeight(height_cm),
    morphology: cleanText(morphology),
    notes: cleanText(notes),
    lat: lat ?? null,
    lng: lng ?? null,
    gps_accuracy_m: gps_accuracy_m || null,
  };
}

// Fields every new record starts with.
function base({ userId, qr_id, kind, step, specimen_id, specimen_ref, specimen, observation, at }) {
  return {
    id: uid(), // the observation's id on the server too
    user_id: userId,
    kind,
    qr_id,
    specimen_id,
    specimen_ref,
    specimen,
    observation,
    base_version: null, // a create, never an edit
    state: "pending",
    step,
    attempts: 0,
    error: null,
    server: null,
    created_at: at,
    updated_at: at,
  };
}

/** A new plant on a tag: register the plant, then its first observation. */
export function newPlantRecord({ userId, qr_id, proposed_species, ...fields }) {
  const at = nowIso();
  return base({
    userId,
    qr_id,
    kind: "new_plant",
    step: "specimen",
    specimen_id: uid(), // the plant's id, made here so a resend cannot add a second plant
    specimen_ref: null,
    specimen: {
      proposed_species_name: cleanText(proposed_species),
      lat: fields.lat ?? null,
      lng: fields.lng ?? null,
      gps_accuracy_m: fields.gps_accuracy_m || null,
    },
    observation: observationOf(fields, at),
    at,
  });
}

/**
 * A revisit. Of a plant the server holds: `specimen_id` is its id. Of a plant
 * that so far exists only in this phone's outbox: `specimen_id` is null and
 * `specimen_ref` is that plant's outbox record id; the sync engine fills in the
 * plant's server id once the plant is registered.
 */
export function revisitRecord({ userId, qr_id, specimen_id = null, specimen_ref = null, ...fields }) {
  const at = nowIso();
  return base({
    userId,
    qr_id: qr_id ?? null,
    kind: "revisit",
    step: "observation",
    specimen_id: specimen_ref ? null : specimen_id,
    specimen_ref,
    specimen: null,
    observation: observationOf(fields, at),
    at,
  });
}

/**
 * What the edit form opened on: the record's values and version at that moment,
 * frozen. The screen keeps polling and `o` moves on when another device edits
 * the record, but the form's untouched fields still hold the old values. Those
 * values are compared with this snapshot (editRecord), and its version is the
 * one sent (PATCH `version` or outbox `base_version`). Comparing with the live
 * record instead would send an old value back as if the botanist had changed it,
 * and silently overwrite the other device's edit.
 */
export function editSnapshot(obs) {
  const { id, specimen_id, version, height_cm = null, morphology = null, notes = null } = obs;
  return Object.freeze({ id, specimen_id, version, height_cm, morphology, notes });
}

/**
 * An edit of an observation the server already holds as a draft or queued
 * record (CTIP-67). Its id is the observation's id. `base_version` is the
 * version the phone last saw: the server refuses the edit if it moved on, and
 * the botanist then chooses (conflicts.js). Only the fields that really changed
 * are kept, because the server answers a conflict only for what we try to change.
 * `qr_id` is optional and only for showing the tag in the list.
 */
export function editRecord({ userId, obs, changes, qr_id = null }) {
  const at = nowIso();
  const cleaners = { height_cm: cleanHeight, morphology: cleanText, notes: cleanText };
  const observation = {};
  for (const [field, clean] of Object.entries(cleaners)) {
    if (!(field in changes)) continue;
    // Both sides go through the same cleaning, so "" and null count as the same.
    const value = clean(changes[field]);
    if (value !== clean(obs[field])) observation[field] = value;
  }
  return {
    ...base({ userId, qr_id, kind: "edit", step: "observation", specimen_id: obs.specimen_id, specimen_ref: null, specimen: null, observation, at }),
    id: obs.id,
    base_version: obs.version,
  };
}

/**
 * Photos as the outbox stores them. A photo keeps the id the camera screen gave
 * it (so a draft restored and saved again keeps the same ids); one without an
 * id gets one now. Only the bytes and the botanist's notes are kept, not the
 * file link, which points at the camera's temporary cache.
 */
export function outboxPhotos(photos = []) {
  return photos.map((p, i) => ({
    id: p.id || uid(),
    position: i,
    base64: p.base64,
    name: p.name || `photo_${i + 1}.jpg`,
    type: p.type || "image/jpeg",
    caption: p.caption || "",
    traits: p.traits || [],
  }));
}

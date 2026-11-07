// apps/shared/test/helpers/fakeServer.js
// A pretend Daun Sense API for the sync engine's tests. It keeps its rows in
// memory and answers in apiFetch's shape ({ ok, status, code, message, data,
// offline }), copying the rules of the real handlers that matter for syncing:
//   - POST /specimens and POST /observations/:id/photos answer a repeated id
//     with the row already stored (services/api/src/field.js);
//   - POST /sync creates items as "queued", answers a resend "created" again,
//     and checks an edit's base_version (services/api/src/sync.js);
//   - POST /observations/:id/submit turns draft/queued into synced, and answers
//     WRONG_STATUS for anything else.
//
// dropNext(n) makes the next n calls fail as if the phone lost its connection.
// With { afterStore: true } the server does the work first and only the answer
// is lost: the case that would make a duplicate if the engine were careless.
//
// Extra knobs on `state` for tests: `signedOut` (every call answers 401) and
// `calls` (every call made, with a copy of its arguments).
import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SPECIMEN_FIELDS = ["id", "qr_id", "proposed_species_name", "lat", "lng", "gps_accuracy_m"];
const SYNC_ITEM_FIELDS = [
  "id", "specimen_id", "base_version", "observed_at", "height_cm", "morphology", "notes",
  "lat", "lng", "gps_accuracy_m", "device_id",
];
const EDIT_FIELDS = ["height_cm", "morphology", "notes", "lat", "lng", "gps_accuracy_m"];
const EDITABLE = ["draft", "queued"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const JSON_LIMIT = 100 * 1024; // express.json()'s default

const copy = (value) => (value === undefined ? undefined : structuredClone(value));
const ok = (status, data) => ({ ok: true, status, data: copy(data) });
const fail = (status, code, message) => ({ ok: false, status, code, message });
const offline = () => ({ ok: false, offline: true, status: 0, code: "NETWORK_ERROR", message: "Network request failed" });
const unknownKeys = (body, allowed) => Object.keys(body ?? {}).filter((k) => !allowed.includes(k));
const byteLength = (text) => new TextEncoder().encode(text).length;

export function createFakeServer({ userId = "user-1", tags = null, maxPhotoBytes = 10 * 1024 * 1024 } = {}) {
  const state = { specimens: [], observations: [], photos: [], comments: [], calls: [], signedOut: false, userId };
  const drops = []; // one entry per call still to drop: { afterStore }
  const now = () => new Date().toISOString();
  const findObs = (id) => state.observations.find((o) => o.id === id && !o.is_deleted);

  function createSpecimen(body) {
    if (unknownKeys(body, SPECIMEN_FIELDS).length || !body?.qr_id) {
      return fail(422, "VALIDATION_ERROR", "Bad specimen body");
    }
    if (body.id !== undefined && !UUID.test(body.id)) return fail(422, "VALIDATION_ERROR", "id must be a UUID");
    const existing = body.id && state.specimens.find((s) => s.id === body.id);
    if (existing) return ok(200, existing);
    if (state.specimens.some((s) => s.qr_id === body.qr_id)) {
      return fail(409, "TAG_IN_USE", `Tag ${body.qr_id} is already on another plant. Pick or scan an unused tag.`);
    }
    if (tags && !tags.includes(body.qr_id)) {
      return fail(422, "TAG_NOT_FOUND", `Tag ${body.qr_id} is not in the tag list. Ask an officer to create it.`);
    }
    const row = {
      id: body.id ?? randomUUID(), qr_id: body.qr_id, species_id: null,
      proposed_species_name: body.proposed_species_name ?? null, registered_by: userId,
      lat: body.lat ?? null, lng: body.lng ?? null, gps_accuracy_m: body.gps_accuracy_m ?? null,
      is_deleted: false, created_at: now(),
    };
    state.specimens.push(row);
    return ok(201, row);
  }

  // One /sync item, as syncItem() in sync.js answers it.
  function syncItem(item, deviceId) {
    const failed = (code, message) => ({ id: typeof item?.id === "string" ? item.id : undefined, result: "error", error: { code, message } });
    if (!item || typeof item !== "object") return failed("VALIDATION_ERROR", "item: must be an object");
    if (unknownKeys(item, SYNC_ITEM_FIELDS).length) return failed("VALIDATION_ERROR", `Unrecognized keys: ${unknownKeys(item, SYNC_ITEM_FIELDS)}`);
    if (!UUID.test(item.id ?? "")) return failed("VALIDATION_ERROR", "id: must be a UUID");
    if (!UUID.test(item.specimen_id ?? "")) return failed("VALIDATION_ERROR", "specimen_id: must be a UUID");
    if (!(item.base_version === null || (Number.isInteger(item.base_version) && item.base_version >= 1))) {
      return failed("VALIDATION_ERROR", "base_version: must be null or a whole number");
    }
    if (item.observed_at !== undefined && !ISO_WITH_OFFSET.test(item.observed_at)) {
      return failed("VALIDATION_ERROR", "observed_at: must be an ISO date-time");
    }
    if (item.base_version !== null && !EDIT_FIELDS.some((f) => item[f] !== undefined)) {
      return failed("VALIDATION_ERROR", "An edit must include at least one field to change");
    }

    if (item.base_version === null) {
      const waiting = state.observations.some((o) => o.specimen_id === item.specimen_id && o.status === "synced" && !o.is_deleted && o.id !== item.id);
      if (waiting) return failed("REVIEW_IN_PROGRESS", "This plant has a record waiting for an officer. You can add to it once a decision is returned.");
      const existing = state.observations.find((o) => o.id === item.id);
      if (existing) {
        if (existing.recorded_by === userId && !existing.is_deleted) return { id: item.id, result: "created", server_version: existing.version };
        return failed("ID_TAKEN", "That id belongs to another record. Make a new id.");
      }
      if (!state.specimens.some((s) => s.id === item.specimen_id)) return failed("VALIDATION_ERROR", "That plant does not exist");
      const { base_version: _ignored, ...fields } = item;
      state.observations.push({
        ...fields,
        device_id: fields.device_id ?? deviceId,
        status: "queued",
        observed_at: fields.observed_at ?? now(),
        recorded_by: userId,
        version: 1,
        last_synced_at: null,
        is_deleted: false,
      });
      return { id: item.id, result: "created", server_version: 1 };
    }

    // An edit: only while it is still the caller's unsent record at base_version.
    const row = findObs(item.id);
    if (!row || row.recorded_by !== userId) return failed("NOT_FOUND", "Observation not found");
    const changes = Object.fromEntries(EDIT_FIELDS.filter((f) => item[f] !== undefined).map((f) => [f, item[f]]));
    if (EDITABLE.includes(row.status) && row.version === item.base_version) {
      Object.assign(row, changes, { version: item.base_version + 1 });
      return { id: item.id, result: "updated", server_version: row.version };
    }
    if (!EDITABLE.includes(row.status)) {
      return {
        id: item.id, result: "conflict", server_version: row.version,
        error: { code: "WRONG_STATUS", message: "This record was already sent for review, so it cannot be changed." },
      };
    }
    if (Object.entries(changes).every(([f, v]) => row[f] === v)) return { id: item.id, result: "updated", server_version: row.version };
    return { id: item.id, result: "conflict", server_version: row.version };
  }

  function sync(body) {
    if (byteLength(JSON.stringify(body)) > JSON_LIMIT) return fail(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    const items = body?.observations;
    if (unknownKeys(body, ["device_id", "observations"]).length || typeof body?.device_id !== "string"
      || !body.device_id.trim() || body.device_id.length > 100
      || !Array.isArray(items) || items.length < 1 || items.length > 20) {
      return fail(422, "VALIDATION_ERROR", "Send device_id and 1 to 20 observations");
    }
    return ok(200, { results: items.map((item) => syncItem(item, body.device_id)) });
  }

  // `photo` is the outbox photo, as uploadObservationPhotoApi takes it.
  function uploadPhoto(observationId, photo) {
    // uploadObservationPhotoApi answers this itself, before any network call.
    if (!photo?.base64) return { ok: false, code: "UNREADABLE_PHOTO", message: "This photo could not be read. Remove it and add it again." };
    if (Math.floor((photo.base64.length * 3) / 4) > maxPhotoBytes) return fail(413, "FILE_TOO_LARGE", "Photos can be at most 10 MB");
    if (!PHOTO_TYPES.includes(photo.type ?? "image/jpeg")) {
      return fail(415, "UNSUPPORTED_FILE_TYPE", "Photos must be JPEG, PNG or WebP.");
    }
    if (photo.id !== undefined && !UUID.test(photo.id)) return fail(422, "VALIDATION_ERROR", "id must be a UUID");
    if (!findObs(observationId)) return fail(404, "NOT_FOUND", "Observation not found");
    const existing = photo.id && state.photos.find((p) => p.id === photo.id);
    if (existing) return ok(200, existing);
    const row = {
      id: photo.id ?? randomUUID(), observation_id: observationId, content_type: photo.type ?? "image/jpeg",
      caption: photo.caption?.trim() || null, traits: photo.traits ?? [], upload_status: "uploaded", created_at: now(),
    };
    state.photos.push(row);
    return ok(201, row);
  }

  function submit(observationId) {
    const obs = findObs(observationId);
    if (!obs) return fail(404, "NOT_FOUND", "Observation not found");
    if (obs.status === "draft" || obs.status === "queued") obs.status = "synced";
    else if (obs.status === "returned") Object.assign(obs, { status: "synced", version: obs.version + 1 });
    else return fail(409, "WRONG_STATUS", "This record is not a draft or waiting for your changes. Refresh to see its status.");
    obs.last_synced_at = now();
    return ok(200, obs);
  }

  function getObservation(id) {
    const obs = findObs(id);
    return obs ? ok(200, obs) : fail(404, "NOT_FOUND", "Observation not found");
  }

  function addComment(observationId, body) {
    if (!findObs(observationId)) return fail(404, "NOT_FOUND", "Observation not found");
    const row = { id: randomUUID(), observation_id: observationId, author_id: userId, body, created_at: now() };
    state.comments.push(row);
    return ok(201, row);
  }

  // Each endpoint waits a tick, like a real network call, so two runs started
  // together really do overlap.
  function endpoint(name, handler) {
    return async (...args) => {
      state.calls.push({ name, args: copy(args) });
      await new Promise((resolve) => setImmediate(resolve));
      const drop = drops.shift();
      if (drop && !drop.afterStore) return offline();
      if (state.signedOut) return fail(401, "UNAUTHORIZED", "Sign in again");
      const res = handler(...copy(args));
      return drop ? offline() : res;
    };
  }

  const api = {
    createSpecimen: endpoint("createSpecimen", createSpecimen),
    sync: endpoint("sync", sync),
    uploadPhoto: endpoint("uploadPhoto", uploadPhoto),
    submit: endpoint("submit", submit),
    getObservation: endpoint("getObservation", getObservation),
    addComment: endpoint("addComment", addComment),
  };

  return {
    api,
    state,
    dropNext(n = 1, { afterStore = false } = {}) {
      for (let i = 0; i < n; i += 1) drops.push({ afterStore });
    },
  };
}

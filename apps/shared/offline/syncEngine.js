// apps/shared/offline/syncEngine.js
// Sends the phone's outbox to the API (CTIP-16), resuming photo uploads where
// they stopped (CTIP-66). Design: docs/architecture/offline-sync.md, sections 3-5.
//
// Field records cannot be made again, so the rules are:
//   - Every call is safe to repeat. The phone made every id (plant, observation,
//     photo), and the API answers a repeated id with the row it already holds.
//     So when an answer is lost, sending the step again stores nothing twice.
//   - After every confirmed call we write the result (ids, `step`) back to the
//     outbox at once, so a killed app or a lost connection resumes from there.
//   - A record leaves the outbox only once the API has confirmed its submit.
//
// Each record moves through these steps (record.step):
//   specimen     POST /specimens            new plants only
//   observation  POST /sync                 several records per request
//   photos       POST /observations/:id/photos, one photo at a time
//   submit       POST /observations/:id/submit (edits stop after photos)
//
// No React Native imports: this runs under plain Node in the tests.

const MAX_ITEMS = 20; // POST /sync takes at most 20 observations
const MAX_CHARS = 80000; // well under express.json()'s 100 kB limit

// The fields POST /specimens and POST /sync accept from a record. The API
// refuses unknown fields, so we pick these instead of sending everything.
const SPECIMEN_FIELDS = ["proposed_species_name", "lat", "lng", "gps_accuracy_m"];
const OBSERVATION_FIELDS = ["observed_at", "height_cm", "morphology", "notes", "lat", "lng", "gps_accuracy_m"];

const PICK_TAG = ["TAG_IN_USE", "TAG_NOT_FOUND", "TAG_RESERVED", "TAG_RETIRED"];
const PHOTO_CODES = ["FILE_TOO_LARGE", "UNSUPPORTED_FILE_TYPE", "UNREADABLE_PHOTO"];
// Officers only decide records that were sent for review, so a server copy in
// one of these states proves our submit landed.
const SUBMITTED = ["synced", "returned", "approved", "rejected"];

/**
 * What a failed call means for the record:
 *   'retry'      no connection, timeout, 5xx or 429: keep it pending, try later
 *   'signed_out' 401: stop, keep every record pending until the person signs in
 *   'fail'       anything else: the API refused this record; move on to the next
 * Only some retries stop the whole run: see stopsRun.
 */
export function classify(res) {
  // apiFetch marks a failed connection or timeout with offline: true (status 0).
  if (res.offline) return "retry";
  if (res.status === 401) return "signed_out";
  if (res.status >= 500 || res.status === 429) return "retry";
  return "fail";
}

// No connection or a timeout affects every record, and 429 asks us to slow
// down, so the run stops. A 5xx may belong to this one record (say a database
// rule it breaks), so we keep that record for later and move on: one record
// must never block every younger one.
const stopsRun = (res) => Boolean(res.offline) || res.status === 429;

/** The fix the app offers for a failed record (docs/architecture/offline-sync.md §5). */
export function actionFor(code, status) {
  if (PICK_TAG.includes(code)) return "pick_tag";
  if (code === "REVIEW_IN_PROGRESS") return "wait_review";
  if (PHOTO_CODES.includes(code)) return "remove_photo";
  // PAYLOAD_TOO_LARGE is a JSON body over the limit, not a photo.
  if ((status === 413 || status === 415) && code !== "PAYLOAD_TOO_LARGE") return "remove_photo";
  return "retry";
}

// The size of `text` in UTF-8 bytes. A character outside ASCII takes 2 to 4
// bytes, and the API's limit is in bytes, so we count bytes, not characters.
function utf8Length(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4; // a surrogate pair is one 4-byte character
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Split items into batches of at most maxItems whose JSON stays under maxChars
 * (measured in UTF-8 bytes, which is never fewer than characters). Order is kept.
 * An item too big on its own still gets a batch of its own, so none is dropped.
 */
export function packBatches(items, { maxItems = MAX_ITEMS, maxChars = MAX_CHARS } = {}) {
  const batches = [];
  let batch = [];
  let size = 2; // the [ and ] of the array
  for (const item of items) {
    const itemSize = utf8Length(JSON.stringify(item)) + 1; // + the comma
    if (batch.length && (batch.length >= maxItems || size + itemSize >= maxChars)) {
      batches.push(batch);
      batch = [];
      size = 2;
    }
    batch.push(item);
    size += itemSize;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

const pick = (source, fields) =>
  Object.fromEntries(fields.filter((f) => source?.[f] !== undefined).map((f) => [f, source[f]]));

// Older rows might lack `step`; a new plant starts by registering the plant.
const stepOf = (record) => record.step ?? (record.kind === "new_plant" ? "specimen" : "observation");

/**
 * The promise's result, or null if it has not settled within `ms`. The promise
 * keeps running either way; this only stops waiting for it. A rejection inside
 * the wait is passed on.
 */
export function waitAtMost(promise, ms) {
  if (ms == null) return promise;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Save first, then send (CTIP-44, CTIP-83). Writes the record and its photos
 * to the outbox, and only then starts a sync and waits up to `waitMs` for it.
 *
 * Answers:
 *   { ok: false, code, message }  the outbox write failed: nothing was saved and
 *                                 no sync starts. The caller keeps the draft.
 *   { ok: true, queued, id, state, error }
 *                                 saved. `queued` is false only when the record
 *                                 already left the outbox (the API confirmed it).
 *
 * Never throws. A sync that throws or is slow leaves the record safely queued.
 */
export async function saveFirst({ outbox, record, photos = [], syncNow, waitMs = 8000 }) {
  try {
    await outbox.add(record, photos);
  } catch (err) {
    return {
      ok: false,
      code: err?.code || "OUTBOX_WRITE_FAILED",
      message: "This record could not be saved on this phone. Your draft is kept. Free up some space on the phone and try again.",
      error: err,
    };
  }

  try {
    await syncNow({ waitMs });
  } catch (err) {
    console.warn("saveFirst: sync after save failed:", err?.message || err);
  }

  // Still in the outbox means not sent yet (or refused, see state and error).
  let left = record;
  try {
    left = await outbox.get(record.id);
  } catch {
    // Could not read it back: it was saved, so say it is waiting.
  }
  return { ok: true, queued: Boolean(left), id: record.id, state: left?.state ?? null, error: left?.error ?? null };
}

/**
 * createSyncEngine({ outbox, api, deviceId, currentUserId }) → { run(userId) }
 * `api` holds createSpecimen(body), sync(body), uploadPhoto(observationId, photo),
 * submit(observationId), getObservation(id) and addComment(observationId, body),
 * each answering in apiFetch's shape { ok, status, code, message, data, offline }.
 * `currentUserId()` returns the signed-in user's id, or null.
 */
export function createSyncEngine({ outbox, api, deviceId, currentUserId }) {
  if (typeof currentUserId !== "function") throw new Error("createSyncEngine needs currentUserId()");
  let running = null; // { userId, promise } of the run going now (or queued next)
  let runUser = null; // whose records the current run sends

  // Every api call goes out with whatever token is current. If someone else has
  // signed in since the run began, the call would store this person's record
  // under the other person's name, for good. So check before each call, and
  // answer like a 401 instead: the run stops and the records stay pending.
  async function call(name, ...args) {
    if (currentUserId() !== runUser) {
      return { ok: false, status: 401, code: "USER_CHANGED", message: "Someone else is signed in now" };
    }
    return api[name](...args);
  }

  // Write changes to the record and carry on with the stored copy.
  const save = (record, changes) => outbox.update(record.id, changes);
  const markSending = (record) => (record.state === "sending" ? record : save(record, { state: "sending" }));

  // A failed call: put the record back (or mark it failed) and say whether the
  // run must stop. Returns null to go on, or the summary's stoppedBy value.
  async function setBack(record, res, extra = {}) {
    const kind = classify(res);
    if (kind === "signed_out") {
      await save(record, { state: "pending" }); // not the record's fault: no attempt
      return "signed_out";
    }
    const attempts = (record.attempts ?? 0) + 1;
    if (kind === "retry") {
      await save(record, { state: "pending", attempts });
      return stopsRun(res) ? "offline" : null;
    }
    const error = { code: res.code, message: res.message, action: actionFor(res.code, res.status), ...extra };
    await save(record, { state: "failed", attempts, error });
    return null;
  }

  // The plant id to send. A revisit of a plant made offline points at that
  // plant's outbox record (specimen_ref), and waits (null) until the plant is
  // registered. Once the plant has gone from the outbox, its server id was
  // already copied onto this record by pointRevisitsAt.
  async function specimenIdFor(record) {
    if (!record.specimen_ref) return record.specimen_id;
    const plant = await outbox.get(record.specimen_ref);
    if (!plant) return record.specimen_id;
    return stepOf(plant) === "specimen" ? null : plant.specimen_id;
  }

  // The API may keep the plant under another id than the phone's: copy the one
  // it holds onto every record of this person that points at the plant.
  async function pointRevisitsAt(plant) {
    for (const other of await outbox.list(plant.user_id)) {
      if (other.specimen_ref === plant.id) await outbox.update(other.id, { specimen_id: plant.specimen_id });
    }
  }

  // Step 1: register the plant.
  async function sendSpecimen(record) {
    const res = await call("createSpecimen", {
      id: record.specimen_id ?? undefined,
      qr_id: record.qr_id,
      ...pick(record.specimen, SPECIMEN_FIELDS),
    });
    if (!res.ok) return { stop: await setBack(record, res) };
    // Use the id the API answered with: from now on that is the plant's id.
    const saved = await save(record, { specimen_id: res.data?.id ?? record.specimen_id, step: "observation" });
    await pointRevisitsAt(saved);
    return { record: saved };
  }

  // Step 2: every record that is ready goes to POST /sync, in batches.
  async function sendObservations(records) {
    const items = records.map(({ record, specimenId }) => ({
      ...pick(record.observation, OBSERVATION_FIELDS), // observed_at is the capture time, never now
      id: record.id,
      specimen_id: specimenId,
      base_version: record.base_version ?? null,
    }));
    const byId = new Map(records.map(({ record }) => [record.id, record]));

    for (const batch of packBatches(items)) {
      const res = await call("sync", { device_id: deviceId, observations: batch });
      if (!res.ok) {
        let stop = null;
        for (const item of batch) stop = (await setBack(byId.get(item.id), res)) ?? stop;
        if (stop) return stop;
        continue;
      }
      // Write back every answer in the batch before stopping, so a confirmed
      // create is never sent as new again.
      let stop = null;
      for (const item of batch) {
        const record = byId.get(item.id);
        const answer = res.data?.results?.find((r) => r.id === item.id);
        if (answer?.result === "created" || answer?.result === "updated") {
          await save(record, { step: "photos" });
        } else if (answer?.result === "conflict") {
          stop = (await keepConflict(record, answer)) ?? stop;
        } else if (!answer || answer.error?.code === "DB_ERROR") {
          // No answer, or the database failed: treated like a 5xx (status 503
          // here), so this record stays pending and the others go on.
          stop = (await setBack(record, { ok: false, status: 503, code: "DB_ERROR", message: answer?.error?.message })) ?? stop;
        } else {
          await setBack(record, { ok: false, status: 422, code: answer.error?.code, message: answer.error?.message });
        }
      }
      if (stop) return stop;
    }
    return null;
  }

  // The server's copy moved on since the phone's edit. Nothing was changed on
  // the server; keep both copies and let the botanist choose (CTIP-67, Task 9).
  async function keepConflict(record, answer) {
    const res = await call("getObservation", record.id);
    if (!res.ok) return setBack(record, res);
    // WRONG_STATUS (already sent for review) comes with an error; a plain version
    // clash does not. Neither has an action: the botanist picks a copy instead.
    const error = answer.error ? { ...answer.error, action: null } : null;
    await save(record, { state: "conflict", server: res.data, error });
    return null;
  }

  // After a submit we could not confirm: has it landed? Answers { done: true },
  // { submit: true } (the server still holds it unsent), or { failed: res }
  // when the server copy could not be read.
  async function submitLanded(record) {
    const res = await call("getObservation", record.id);
    if (!res.ok) return { failed: res };
    if (SUBMITTED.includes(res.data?.status)) return { done: true };
    return { submit: true };
  }

  // Steps 3 and 4: the photos still missing, then the submit.
  async function finish(record) {
    if (stepOf(record) === "submit") {
      // A resume: an earlier run may have sent the submit and lost the answer.
      // Look first, because submitting again could undo an officer's decision
      // (a "returned" record would go back for review without its fixes).
      const seen = await submitLanded(record);
      if (seen.failed) return { stop: await setBack(record, seen.failed) };
      if (seen.done) return { done: true };
    }

    if (stepOf(record) === "photos") {
      for (const photo of await outbox.photos(record.id)) {
        if (photo.uploaded) continue; // already on the server: never sent again (CTIP-66)
        const res = await call("uploadPhoto", record.id, photo);
        if (!res.ok) return { stop: await setBack(record, res, { photo_id: photo.id }) };
        await outbox.markPhotoUploaded(photo.id);
      }
      // An edit changes a record the server already holds; it does not send it for review.
      if (record.kind === "edit") return { done: true };
      record = await save(record, { step: "submit" });
    }

    const res = await call("submit", record.id);
    if (res.ok) return { done: true };
    if (res.code === "WRONG_STATUS") {
      // The server holds it in a state that cannot be submitted: if that state
      // shows our submit landed, it is done.
      const seen = await submitLanded(record);
      if (seen.failed) return { stop: await setBack(record, seen.failed) };
      if (seen.done) return { done: true };
    }
    return { stop: await setBack(record, res) };
  }

  // The steps for one person's records. `progress.sent` counts finished records;
  // `touched` collects every record set to "sending". Returns the stoppedBy value.
  async function sendAll(userId, progress, touched) {
    const sending = async (record) => {
      touched.add(record.id);
      return markSending(record);
    };
    const current = async (id) => {
      const record = await outbox.get(id);
      return record && (record.state === "pending" || record.state === "sending") ? record : null;
    };

    // Failed and conflict records wait for the botanist; only pending ones go.
    const queue = (await outbox.list(userId)).filter((r) => r.state === "pending");
    const ids = queue.map((r) => r.id);

    // Step 1, oldest record first. Done before step 2, so a revisit queued
    // behind its plant can use the plant's id in the same run.
    for (const record of queue) {
      if (stepOf(record) !== "specimen") continue;
      const out = await sendSpecimen(await sending(record));
      if (out.stop) return out.stop;
    }

    // Step 2 for every record whose plant is registered, batched.
    const toSend = [];
    for (const id of ids) {
      const record = await current(id);
      if (!record || stepOf(record) !== "observation") continue;
      const specimenId = await specimenIdFor(record);
      if (!specimenId) continue; // its plant is not registered yet: it waits, pending
      toSend.push({ record: await sending(record), specimenId });
    }
    if (toSend.length) {
      const stop = await sendObservations(toSend);
      if (stop) return stop;
    }

    // Steps 3 and 4, one record at a time, oldest first.
    for (const id of ids) {
      const record = await current(id);
      if (!record || !["photos", "submit"].includes(stepOf(record))) continue;
      const out = await finish(await sending(record));
      if (out.stop) return out.stop;
      if (out.done) {
        await outbox.remove(id); // only now, after the API confirmed the last step
        progress.sent += 1;
      }
    }
    return null;
  }

  async function runOnce(userId) {
    runUser = userId; // call() checks every request against this
    // Anything left "sending" was cut off when the app was killed.
    await outbox.resetInterrupted();
    const progress = { sent: 0 };
    const touched = new Set();
    let stoppedBy;
    try {
      stoppedBy = await sendAll(userId, progress, touched);
    } finally {
      // A record this run left "sending" (the run stopped first) goes back to pending.
      for (const id of touched) {
        const record = await outbox.get(id);
        if (record?.state === "sending") await outbox.update(id, { state: "pending" });
      }
    }
    const counts = await outbox.count(userId);
    return { sent: progress.sent, pending: counts.pending, failed: counts.failed, conflicts: counts.conflict, stoppedBy };
  }

  return {
    // One run at a time. A second call for the same person while one is going
    // (or waiting to start) gets that same promise. A call for someone else
    // waits for it to end, then runs for them, so each caller gets their own summary.
    run(userId) {
      if (running?.userId === userId) return running.promise;
      const before = running ? running.promise.catch(() => {}) : Promise.resolve();
      const promise = before
        .then(() => runOnce(userId))
        .finally(() => {
          if (running?.promise === promise) running = null;
        });
      running = { userId, promise };
      return promise;
    },
  };
}

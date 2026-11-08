// apps/shared/offline/useOutboxSync.js
// The store's side of records saved on the phone (CTIP-16, CTIP-68): the one
// sync engine, the signed-in person's unsent records, the sync state the
// screens show, and what the botanist can do to a record that could not be sent.
// Moved out of StoreProvider.js, which had grown too long. Design:
// docs/architecture/offline-sync.md, sections 2, 6 and 11.
//
// Only the phone passes an outbox; on the web this hook does nothing (every
// answer is empty or null). When to sync is the phone's business
// (apps/mobile/offline/useSyncTriggers.js); this hook only says how.
//
// No JSX and no React Native imports: it is shared code.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpecimenApi,
  syncApi,
  uploadObservationPhotoApi,
  submitObservationApi,
  fetchObservationApi,
  addCommentApi,
} from "../api.js";
import { nowIso } from "../utils.js";
import { createSyncEngine, saveFirst, waitAtMost } from "./syncEngine.js";
import { outboxPhotos } from "./records.js";
import { recordsToDelete, resetsOnManualSync, tagChangeFor } from "./syncStatus.js";
import { resolveConflict as applyChoice } from "./conflicts.js";

// How long a save on the phone waits for its first send before it shows
// "Saved on this phone" (docs/architecture/offline-sync.md, section 2).
const SAVE_WAIT_MS = 8000;
const IDLE_SYNC = { running: false, lastSyncedAt: null, lastSummary: null };
// While a run is going, the list is read again at most this often, so the rows
// show "Sending" as the engine works through them.
const LIVE_REFRESH_MS = 400;

// The sync engine's view of the API (syncEngine.js). Every call goes through the
// store's callApi: a fresh token, and one retry when it had expired. `callRef`
// is a ref because the engine is made once and must always use the current callApi.
const engineApi = (callRef) => {
  const call = (fn, ...args) => callRef.current(fn, ...args);
  return {
    createSpecimen: (body) => call(createSpecimenApi, body),
    sync: (body) => call(syncApi, body),
    uploadPhoto: (observationId, photo) => call(uploadObservationPhotoApi, observationId, photo),
    submit: (observationId) => call(submitObservationApi, observationId, {}),
    getObservation: (id) => call(fetchObservationApi, id),
    addComment: (observationId, body) => call(addCommentApi, observationId, body),
  };
};

/**
 * useOutboxSync({ outbox, deviceId, userId, currentUserId, callApi, loadFromApi, notify })
 *   userId         the signed-in person (state), so their list loads when it changes
 *   currentUserId  () => whose records may be sent now, or null (see StoreProvider)
 * Answers { outboxItems, syncState, syncNow, saveOnPhone, recordPhotos,
 *           retryRecord, discardRecord, changeRecordTag, removeRecordPhoto,
 *           resolveConflict }.
 */
export function useOutboxSync({ outbox, deviceId, userId, currentUserId, callApi, loadFromApi, notify }) {
  const [outboxItems, setOutboxItems] = useState([]); // the signed-in person's unsent records
  const [syncState, setSyncState] = useState(IDLE_SYNC);
  const callApiRef = useRef(callApi);
  callApiRef.current = callApi;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const engineRef = useRef(null);
  const runsGoing = useRef(0);
  const liveTimer = useRef(null);

  // The signed-in person's unsent records, for My records and the scanner.
  const refreshOutbox = useCallback(async () => {
    if (!outbox) return;
    const id = userIdRef.current;
    try {
      const items = id ? await outbox.list(id) : [];
      if (userIdRef.current === id) setOutboxItems(items); // still the same person
    } catch (err) {
      console.warn("outbox.list:", err?.message || err);
    }
  }, [outbox]);

  // One engine for the provider's lifetime, so there is only ever one run at a
  // time. Its outbox reads the list again (a little later) after each change.
  if (outbox && !engineRef.current) {
    const liveOutbox = {
      ...outbox,
      update: async (...args) => {
        const saved = await outbox.update(...args);
        if (!liveTimer.current) {
          liveTimer.current = setTimeout(() => {
            liveTimer.current = null;
            refreshOutbox();
          }, LIVE_REFRESH_MS);
        }
        return saved;
      },
    };
    engineRef.current = createSyncEngine({ outbox: liveOutbox, api: engineApi(callApiRef), deviceId, currentUserId });
  }
  useEffect(() => () => clearTimeout(liveTimer.current), []);

  const finishRun = useCallback((summary) => {
    runsGoing.current -= 1;
    setSyncState((s) => ({
      running: runsGoing.current > 0,
      // "Last sent": the last time a run sent at least one record.
      lastSyncedAt: summary?.sent > 0 ? nowIso() : s.lastSyncedAt,
      lastSummary: summary ?? s.lastSummary,
    }));
    refreshOutbox();
    if (summary?.sent) loadFromApi(true); // show the records just sent as the server holds them
  }, [refreshOutbox, loadFromApi]);

  // A record waiting for an officer goes back to pending on every manual sync
  // (UI D, wait_review): the officer may have decided since.
  const retryWaitingForReview = useCallback(async (id) => {
    try {
      for (const record of await outbox.list(id)) {
        if (resetsOnManualSync(record)) await outbox.update(record.id, { state: "pending", error: null });
      }
    } catch (err) {
      console.warn("outbox: could not reset records waiting for review:", err?.message || err);
    }
  }, [outbox]);

  // Send this person's unsent records. Answers the SyncSummary, or null when
  // the run is still going after `waitMs` (it carries on), when there is
  // nothing to run (no outbox, nobody signed in), or when the run failed.
  // `manual`: the botanist asked ("Sync now", "Send now").
  // Never rejects: a failed run is logged and every record stays on the phone.
  const syncNow = useCallback(({ waitMs, manual = false } = {}) => {
    const engine = engineRef.current;
    const id = currentUserId();
    if (!engine || !id) return Promise.resolve(null);
    runsGoing.current += 1;
    setSyncState((s) => ({ ...s, running: true }));
    const run = (manual ? retryWaitingForReview(id) : Promise.resolve())
      .then(() => engine.run(id))
      .then(
        (summary) => {
          finishRun(summary);
          return summary;
        },
        (err) => {
          console.warn("sync run failed; the records stay on the phone:", err?.message || err);
          finishRun(null);
          return null;
        },
      );
    return waitAtMost(run, waitMs);
  }, [currentUserId, finishRun, retryWaitingForReview]);

  // A sync started by one of the actions below, after the change is saved. Its
  // answer does not matter here: the record's row shows how it went.
  const syncSoon = useCallback(() => {
    syncNow().catch((err) => console.warn("sync after a change failed:", err?.message || err));
  }, [syncNow]);

  // A new person (or nobody): their own records, and a fresh sync state.
  useEffect(() => {
    setSyncState(IDLE_SYNC);
    setOutboxItems([]);
    refreshOutbox();
  }, [userId, refreshOutbox]);

  // Save a record on the phone, then try to send it (saveFirst in syncEngine.js).
  // `photos` come from the camera screen and must carry their bytes (base64).
  const saveOnPhone = useCallback(async (record, photos, sentMessage) => {
    const unreadable = photos.findIndex((p) => !p.base64);
    if (unreadable >= 0) {
      return { ok: false, message: `Photo ${unreadable + 1} could not be read. Remove it and add it again.` };
    }
    const res = await saveFirst({ outbox, record, photos: outboxPhotos(photos), syncNow, waitMs: SAVE_WAIT_MS });
    if (!res.ok) {
      // OUTBOX_UNAVAILABLE: the caller sends it online instead (no SQLite on this device).
      if (res.code !== "OUTBOX_UNAVAILABLE") {
        console.warn("outbox.add failed:", res.error?.message || res.code);
        notify(res.message);
      }
      return res;
    }
    refreshOutbox();
    if (!res.queued) notify(sentMessage);
    else if (res.state === "failed" && res.error?.message) notify(`Saved on this phone, but not sent: ${res.error.message}`);
    return res;
  }, [outbox, syncNow, refreshOutbox, notify]);

  // A record's photos as the outbox keeps them (in order; a sent one has no bytes).
  const recordPhotos = useCallback(async (id) => {
    if (!outbox) return [];
    try {
      return await outbox.photos(id);
    } catch (err) {
      console.warn("outbox.photos:", err?.message || err);
      return [];
    }
  }, [outbox]);

  // Run a change to the outbox, then read the list again. Answers { ok, message? }.
  const change = useCallback(async (what, task) => {
    if (!outbox) return { ok: false, message: "There are no records on this phone." };
    try {
      const out = (await task()) || { ok: true };
      refreshOutbox();
      return out;
    } catch (err) {
      console.warn(`outbox: ${what} failed:`, err?.message || err);
      refreshOutbox();
      return { ok: false, message: "This record could not be changed on this phone. Try again." };
    }
  }, [outbox, refreshOutbox]);

  // "Try again" on a failed record: back to pending, then send.
  const retryRecord = useCallback((id) => change("retry", async () => {
    const saved = await outbox.update(id, { state: "pending", error: null });
    if (!saved) return { ok: false, message: "This record is no longer on this phone." };
    syncSoon();
    return { ok: true };
  }), [change, outbox, syncSoon]);

  // "Delete from this phone": the record, and any revisit that waits for it
  // (recordsToDelete). A run sending it at this moment skips it (syncEngine.js).
  const discardRecord = useCallback((id) => change("delete", async () => {
    const items = await outbox.list(userIdRef.current);
    for (const gone of recordsToDelete(id, items)) await outbox.remove(gone);
    notify("Deleted from this phone");
    return { ok: true };
  }), [change, outbox, notify]);

  // "Choose another tag" (pick_tag): the record keeps all its ids, takes the new
  // tag, and is sent again (tagChangeFor). Revisits waiting for this plant show
  // the new tag too.
  const changeRecordTag = useCallback((id, qrId) => change("change tag", async () => {
    const record = await outbox.get(id);
    if (!record) return { ok: false, message: "This record is no longer on this phone." };
    const changes = tagChangeFor(record, qrId);
    const items = await outbox.list(record.user_id);
    const taken = items.some((r) => r.id !== id && r.kind === "new_plant" && String(r.qr_id).toUpperCase() === changes.qr_id);
    if (taken) return { ok: false, message: `Tag ${changes.qr_id} is already on another record on this phone.` };
    await outbox.update(id, changes);
    for (const r of items) {
      if (r.specimen_ref === id) await outbox.update(r.id, { qr_id: changes.qr_id });
    }
    notify(`Tag changed to ${changes.qr_id}`);
    syncSoon();
    return { ok: true };
  }), [change, outbox, notify, syncSoon]);

  // "Remove photo" (remove_photo): drop the one photo that cannot be sent, then
  // send the rest.
  const removeRecordPhoto = useCallback((id, photoId) => change("remove photo", async () => {
    await outbox.removePhoto(photoId);
    const saved = await outbox.update(id, { state: "pending", error: null });
    if (!saved) return { ok: false, message: "This record is no longer on this phone." };
    syncSoon();
    return { ok: true };
  }), [change, outbox, syncSoon]);

  // Two devices edited this record: the botanist's choice (conflicts.js).
  // 'mine' sends the edit again, based on the server's version; the engine adds
  // the comment once the server accepts it. 'theirs' adds the comment and drops
  // the phone's copy, but only if the comment was saved. Answers { ok, message? }
  // and shows its own toast.
  const resolveConflict = useCallback((id, choice) => change("resolve conflict", async () => {
    const addComment = (observationId, body) => callApiRef.current(addCommentApi, observationId, body);
    const res = await applyChoice({ outbox, addComment, id, choice });
    if (!res.ok) {
      notify(choice === "theirs" ? `Couldn't keep the other version: ${res.message}` : res.message);
      return res;
    }
    if (choice === "mine") {
      notify("Kept this phone's version");
      syncSoon();
    } else {
      notify("Kept the other device's version");
      loadFromApi(true); // the server's copy and the new comment come back into My records
    }
    return res;
  }), [change, outbox, notify, syncSoon, loadFromApi]);

  return {
    outboxItems, syncState, syncNow, saveOnPhone, recordPhotos,
    retryRecord, discardRecord, changeRecordTag, removeRecordPhoto, resolveConflict,
  };
}

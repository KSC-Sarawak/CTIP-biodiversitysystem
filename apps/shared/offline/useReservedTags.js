// apps/shared/offline/useReservedTags.js
// The store's side of the tags kept on the phone (CTIP-116). While the botanist
// is online the phone keeps 3 tags made for them (batch_label "reserved"), so
// "Generate new QR tag" works with no signal. Design: docs/architecture/offline-sync.md, section 7.
//
// What this hook does:
//  - tops the botanist up to 3 free tags after each workspace load, and again
//    when a record on the phone takes one or the connection comes back;
//  - saves the free ones on the phone (reservedTags, apps/mobile/offline/reservedTags.js)
//    so they are there when the app is opened with no signal;
//  - hands one out (takeReservedTag) and gives one back (releaseTag).
//
// Only the phone passes `reservedTags`; on the web this hook does nothing (every
// answer is empty or null). Only botanists keep tags.
//
// No JSX and no React Native imports: it is shared code.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTagBatchApi, deleteTagApi } from "../api.js";
import { RESERVED_LABEL, myKeptTags, nextReservedTag, outboxTagsFrom, reservedToCreate } from "./tags.js";
import { createTopUp } from "./reservedTopUp.js";

/**
 * useReservedTags({ reservedTags, userId, role, db, outboxItems, callApi, apiStatus, notify, loadFromApi })
 * Answers { keptTags, topUpReservedTags, releaseTag, takeReservedTag }:
 *   keptTags           the tag IDs kept for this person that no record on the phone has taken
 *   topUpReservedTags  () => Promise, makes the missing tags (one run at a time; botanists, online)
 *   releaseTag         (qrId) => Promise<{ ok, message? }>, gives a kept tag back
 *   takeReservedTag    (except = []) => the first free tag, or null; `except` skips tags the
 *                      screen already shows (a tag only counts as taken once its record is saved)
 */
export function useReservedTags({ reservedTags, userId, role, db, outboxItems, callApi, apiStatus, notify, loadFromApi }) {
  const isBotanist = role === "botanist";
  const [saved, setSaved] = useState([]); // kept tag IDs, as the last load (or the phone) said
  const usedOnPhone = useMemo(() => outboxTagsFrom(outboxItems).map((t) => t.qr_id), [outboxItems]);

  // The workspace has loaded for this person once their own profile is in it.
  // Before that the store holds an empty tag list, which would look like "no kept tags".
  const loaded = !!userId && (db.profiles || []).some((p) => p.id === userId);

  // Always the newest values, for the top-up run (it may start inside an older render).
  const latest = useRef({});
  latest.current = { userId, isBotanist, loaded, db, usedOnPhone, apiStatus, callApi, loadFromApi };
  // Tags this phone has just made, until the store's tag list shows them. Without it a
  // second run started before the reload reaches the screen would make three more.
  const justMade = useRef(new Set());
  const savedJson = useRef(""); // what was last written to the phone, as JSON

  // The list saved on the phone, for a person who opens the app with no signal.
  useEffect(() => {
    setSaved([]);
    justMade.current = new Set();
    savedJson.current = "";
    if (!reservedTags || !userId) return undefined;
    let current = true;
    reservedTags.all(userId).then(
      (ids) => {
        if (current) setSaved((now) => (now.length ? now : ids));
      },
      (err) => console.warn("reservedTags.all:", err?.message || err),
    );
    return () => {
      current = false;
    };
  }, [reservedTags, userId]);

  // After each load: keep the store's list, and write the free tags to the phone.
  useEffect(() => {
    if (!reservedTags || !isBotanist || !loaded) return;
    const mine = myKeptTags(db.tags, userId);
    setSaved((now) => (now.join() === mine.join() ? now : mine));
    const free = mine.filter((id) => !usedOnPhone.includes(id));
    const json = JSON.stringify([userId, free]);
    if (json === savedJson.current) return;
    savedJson.current = json;
    reservedTags.save(userId, free).catch((err) => {
      savedJson.current = "";
      console.warn("reservedTags.save:", err?.message || err);
    });
  }, [reservedTags, isBotanist, loaded, db.tags, userId, usedOnPhone]);

  // Make the missing tags, one at a time, then reload so the store shows them.
  // A tag that cannot be made (no signal, a server error) stops the run quietly:
  // the next load, reconnect or taken tag tries again.
  const run = async () => {
    const now = latest.current;
    if (!reservedTags || !now.isBotanist || !now.loaded || now.apiStatus !== "connected") return { made: 0 };
    // Tags the list now shows no longer need remembering; the rest count as kept.
    const known = new Set((now.db.tags || []).map((t) => t.qr_id));
    for (const id of justMade.current) if (known.has(id)) justMade.current.delete(id);
    const tags = [
      ...(now.db.tags || []),
      ...[...justMade.current].map((qr_id) => ({ qr_id, status: "unused", batch_label: RESERVED_LABEL, created_by: now.userId })),
    ];
    const count = reservedToCreate(tags, now.userId, { usedOnPhone: now.usedOnPhone });
    let made = 0;
    for (let i = 0; i < count; i += 1) {
      const res = await now.callApi(createTagBatchApi, 1, RESERVED_LABEL);
      if (!res.ok) {
        console.warn("reserved tags: could not make one:", res.message || res.code);
        break;
      }
      for (const t of res.data || []) justMade.current.add(t.qr_id);
      made += 1;
    }
    if (made) await now.loadFromApi(true);
    return { made };
  };
  // One guard for the provider's lifetime, so two triggers at once make one run.
  const runRef = useRef(run);
  runRef.current = run;
  const topUpRef = useRef(null);
  if (!topUpRef.current) topUpRef.current = createTopUp(() => runRef.current());
  const topUpReservedTags = useCallback(() => topUpRef.current(), []);

  // After a load, when the connection comes back, or when a record on the phone takes a tag.
  useEffect(() => {
    if (!reservedTags || !isBotanist || !loaded || apiStatus !== "connected") return;
    topUpReservedTags().catch((err) => console.warn("reserved tags top-up failed:", err?.message || err));
  }, [reservedTags, isBotanist, loaded, apiStatus, db.tags, usedOnPhone, topUpReservedTags]);

  const keptTags = useMemo(() => (isBotanist ? saved.filter((id) => !usedOnPhone.includes(id)) : []), [isBotanist, saved, usedOnPhone]);

  const takeReservedTag = useCallback(
    (except = []) => nextReservedTag(keptTags, [...usedOnPhone, ...except]),
    [keptTags, usedOnPhone],
  );

  // Give a kept tag back. The API answers 403 for a tag that is not the person's own
  // and a reason for anything else; the message is shown as it comes.
  const releaseTag = useCallback(async (qrId) => {
    const res = await callApi(deleteTagApi, qrId);
    if (!res.ok) {
      notify(res.message);
      return { ok: false, message: res.message };
    }
    notify(`Tag ${qrId} released`);
    await loadFromApi(true);
    return { ok: true };
  }, [callApi, notify, loadFromApi]);

  return { keptTags, topUpReservedTags, releaseTag, takeReservedTag };
}

// apps/shared/offline/useReservedTags.js
// The store's side of the tags kept on the phone (CTIP-116). While the botanist
// is online and has "Keep tags for offline use" on (the default), the phone keeps
// 3 tags made for them (batch_label "reserved"), so "Generate new QR tag" works
// with no signal. They are a fallback: a botanist carries pre-printed tags and
// writes a kept ID on a spare tag only when they run out.
// Design: docs/architecture/offline-sync.md, section 7.
//
// What this hook does:
//  - tops the botanist up to 3 free tags after each workspace load, and again
//    when a record on the phone takes one or the connection comes back, but only
//    while the switch is on;
//  - remembers on the phone which kept tags this phone made (reservedTags,
//    apps/mobile/offline/reservedTags.js), so they are there when the app is opened
//    with no signal. Kept tags belong to the phone, not the account: two phones
//    signed in to one account never hand out the same ID;
//  - hands one out (takeReservedTag), and turns the switch on or off
//    (setKeepOffline; turning it off gives every kept tag back).
//
// Only the phone passes `reservedTags`; on the web this hook does nothing (every
// answer is empty or null). Only botanists keep tags.
//
// No JSX and no React Native imports: it is shared code.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTagBatchApi, deleteTagApi } from "../api.js";
import { RESERVED_LABEL, RESERVED_KEEP, nextReservedTag, outboxTagsFrom, reservedToCreate, keptTagsToRetain, tagsToRelease } from "./tags.js";
import { SURVEY_TAG_MAX, extraKeptTags, keptTagRefusal } from "./survey.js";
import { createTopUp, shouldTopUp } from "./reservedTopUp.js";

/**
 * useReservedTags({ reservedTags, userId, role, db, outboxItems, callApi, apiStatus, notify, loadFromApi, keepTarget })
 * `keepTarget` is how many free kept tags to hold: RESERVED_KEEP, or a survey's target while one is
 * active (CTIP-147, survey.js keepTarget). Extra free tags beyond it are given back once online.
 * Answers { keptTags, keepOffline, setKeepOffline, topUpReservedTags, takeReservedTag, releaseKept }:
 *   keptTags           the tag IDs kept for this person that no record on the phone has taken
 *                      (none while the switch is off)
 *   keepOffline        the "Keep tags for offline use" switch, saved on the phone per person; on by default
 *   setKeepOffline     (on) => Promise<{ ok, message? }>, botanists only, online only. Off gives every
 *                      kept tag back first, and stays on (with the API's message) if one cannot be
 *   topUpReservedTags  () => Promise, makes the missing tags (one run at a time; botanists, online, switch on)
 *   takeReservedTag    (except = []) => the first free tag, or null (always null while the switch is off);
 *                      `except` skips tags the screen already shows (a tag only counts as taken once its record is saved)
 *   releaseKept        (ids) => Promise<{ released, failed }>, gives these kept tags back (online)
 */
export function useReservedTags({ reservedTags, userId, role, db, outboxItems, callApi, apiStatus, notify, loadFromApi, keepTarget = RESERVED_KEEP }) {
  const isBotanist = role === "botanist";
  // The kept tag IDs this phone made for this person (reservedTags.all). Kept tags
  // belong to the phone, not the account, so two phones signed in to one account
  // never hand out the same ID (tags.js, reservedToCreate).
  const [saved, setSaved] = useState([]);
  // The switch. `null` until the phone has been read: nothing is made before that,
  // so a person who turned it off never gets tags made in the moment before it is read.
  const [keep, setKeep] = useState(null);
  const keepOffline = keep !== false;
  const usedOnPhone = useMemo(() => outboxTagsFrom(outboxItems).map((t) => t.qr_id), [outboxItems]);

  // The workspace has loaded for this person once their own profile is in it.
  // Before that the store holds an empty tag list, which would look like "no kept tags".
  const loaded = !!userId && (db.profiles || []).some((p) => p.id === userId);

  // Always the newest values, for the top-up run (it may start inside an older render).
  const latest = useRef({});
  latest.current = { userId, isBotanist, loaded, db, usedOnPhone, apiStatus, callApi, loadFromApi, keep, saved, keepTarget };
  // True while the switch is being changed, so a top-up does not make tags that are being released.
  const switching = useRef(false);
  // Tags this phone has just made, until the store's tag list shows them. Without it a
  // second run started before the reload reaches the screen would make three more.
  const justMade = useRef(new Set());
  const savedJson = useRef(""); // the list last kept on the phone after a load, as JSON

  // The list and the switch saved on the phone, for a person who opens the app with no signal.
  useEffect(() => {
    setSaved([]);
    setKeep(null);
    justMade.current = new Set();
    savedJson.current = "";
    if (!reservedTags || !userId) return undefined;
    let current = true;
    reservedTags.getKeepOffline(userId).then(
      (on) => {
        if (current) setKeep(on);
      },
      (err) => {
        console.warn("reservedTags.getKeepOffline:", err?.message || err);
        if (current) setKeep(true); // unreadable: the default
      },
    );
    reservedTags.all(userId).then(
      (ids) => {
        if (current) setSaved((now) => [...new Set([...now, ...ids])]);
      },
      (err) => console.warn("reservedTags.all:", err?.message || err),
    );
    return () => {
      current = false;
    };
  }, [reservedTags, userId]);

  // After each load: the phone keeps only its tags the server still holds free
  // (or that a record on the phone took); used and released ones are dropped.
  useEffect(() => {
    if (!reservedTags || !isBotanist || !loaded) return;
    const keepIds = keptTagsToRetain(db.tags, userId, { usedOnPhone, justMade: [...justMade.current] });
    const json = JSON.stringify([userId, keepIds]);
    if (json === savedJson.current) return;
    savedJson.current = json;
    reservedTags.retain(userId, keepIds)
      // A tag made while this ran is in justMade: write it back in case retain dropped it.
      .then(() => reservedTags.add(userId, [...justMade.current]))
      .then(() => reservedTags.all(userId))
      .then((ids) => {
        if (latest.current.userId === userId) setSaved(ids);
      })
      .catch((err) => {
        savedJson.current = "";
        console.warn("reservedTags.retain:", err?.message || err);
      });
  }, [reservedTags, isBotanist, loaded, db.tags, userId, usedOnPhone]);

  // Make the missing tags, one at a time, then reload so the store shows them.
  // A tag that cannot be made (no signal, a server error) stops the run quietly:
  // the next load, reconnect or taken tag tries again.
  const run = async () => {
    const now = latest.current;
    const ready = shouldTopUp({
      keepOffline: now.keep === true,
      role: now.isBotanist ? "botanist" : "",
      online: now.apiStatus === "connected",
      loaded: now.loaded && !switching.current,
    });
    if (!reservedTags || !ready) return { made: 0 };
    // Tags the list now shows no longer need remembering; the rest count as kept.
    const known = new Set((now.db.tags || []).map((t) => t.qr_id));
    for (const id of justMade.current) if (known.has(id)) justMade.current.delete(id);
    const tags = [
      ...(now.db.tags || []),
      ...[...justMade.current].map((qr_id) => ({ qr_id, status: "unused", batch_label: RESERVED_LABEL, created_by: now.userId })),
    ];
    // Only this phone's own kept tags count: another phone of the same account keeps its own.
    const madeHere = [...now.saved, ...justMade.current];
    const count = Math.min(SURVEY_TAG_MAX, reservedToCreate(tags, now.userId, { usedOnPhone: now.usedOnPhone, madeHere, keep: now.keepTarget }));
    let made = 0;
    // All the missing tags in one request (up to 20 for a survey, CTIP-147).
    if (count > 0) {
      const res = await now.callApi(createTagBatchApi, count, RESERVED_LABEL);
      if (!res.ok) {
        console.warn("reserved tags: could not make them:", res.message || res.code);
        const tell = keptTagRefusal(res, now.keepTarget);
        if (tell) notify?.(tell);
      } else {
        const ids = (res.data || []).map((t) => t.qr_id);
        for (const id of ids) justMade.current.add(id);
        try {
          await reservedTags.add(now.userId, ids);
        } catch (err) {
          console.warn("reservedTags.add:", err?.message || err);
        }
        if (latest.current.userId === now.userId) setSaved((list) => [...new Set([...list, ...ids])]);
        made = ids.length;
      }
    }
    // A survey has ended (the target fell back): give the extra free tags back.
    const free = tagsToRelease(tags, now.userId, { madeHere, usedOnPhone: now.usedOnPhone, justMade: [...justMade.current] });
    const extra = extraKeptTags(free, now.usedOnPhone, now.keepTarget);
    if (extra.length) await releaseRef.current(extra);
    else if (made) await now.loadFromApi(true);
    return { made };
  };
  // One guard for the provider's lifetime, so two triggers at once make one run.
  const runRef = useRef(run);
  runRef.current = run;
  const topUpRef = useRef(null);
  if (!topUpRef.current) topUpRef.current = createTopUp(() => runRef.current());
  const topUpReservedTags = useCallback(() => topUpRef.current(), []);

  // After a load, when the connection comes back, or when a record on the phone takes a tag.
  // Turning the switch on also lands here: `keep` changes and the run starts.
  useEffect(() => {
    if (!reservedTags) return;
    if (!shouldTopUp({ keepOffline: keep === true, role, online: apiStatus === "connected", loaded })) return;
    topUpReservedTags().catch((err) => console.warn("reserved tags top-up failed:", err?.message || err));
  }, [reservedTags, role, loaded, apiStatus, keep, db.tags, usedOnPhone, keepTarget, topUpReservedTags]);

  const keptTags = useMemo(
    () => (isBotanist && keepOffline ? saved.filter((id) => !usedOnPhone.includes(id)) : []),
    [isBotanist, keepOffline, saved, usedOnPhone],
  );

  const takeReservedTag = useCallback(
    (except = []) => (keepOffline ? nextReservedTag(keptTags, [...usedOnPhone, ...except]) : null),
    [keepOffline, keptTags, usedOnPhone],
  );

  // Turn the switch on or off. Off gives back every kept tag no record on the phone
  // has taken, one by one; only when all are released is the setting saved and the
  // phone's list cleared. If one fails the setting stays on, the list is reloaded
  // and the API's message is answered as it comes (until the migration that lets
  // botanists release their own tags is pushed, this reads "not found").
  const setKeepOffline = useCallback(async (on) => {
    const now = latest.current;
    if (!reservedTags || !now.isBotanist) return { ok: false, message: "Only botanists keep tags." };
    if (now.apiStatus !== "connected") return { ok: false, message: "Connect to the internet to change this." };
    if (switching.current) return { ok: false, message: "Please wait, this is still changing." };
    switching.current = true;
    try {
      if (on) {
        await reservedTags.setKeepOffline(now.userId, true);
        setKeep(true); // the effect above then makes the missing tags
        return { ok: true };
      }
      // This phone's free kept tags (and those it kept before kept tags were per
      // phone), never another phone's: tagsToRelease in tags.js.
      const free = tagsToRelease(now.db.tags, now.userId, {
        madeHere: await reservedTags.all(now.userId),
        legacy: await reservedTags.legacy(now.userId),
        usedOnPhone: now.usedOnPhone,
        justMade: [...justMade.current],
      });
      for (const id of free) {
        const res = await now.callApi(deleteTagApi, id);
        if (!res.ok) {
          // The screen shows the message; the list is reloaded so it shows what is left.
          setSaved(await reservedTags.all(now.userId));
          await now.loadFromApi(true);
          return { ok: false, message: res.message };
        }
        justMade.current.delete(id);
        await reservedTags.remove(now.userId, [id]);
      }
      await reservedTags.setKeepOffline(now.userId, false);
      savedJson.current = "";
      setSaved(await reservedTags.all(now.userId)); // only tags records on the phone took are left
      setKeep(false);
      notify("Offline tags turned off");
      await now.loadFromApi(true);
      return { ok: true };
    } catch (err) {
      console.warn("setKeepOffline:", err?.message || err);
      return { ok: false, message: "Could not change this. Try again." };
    } finally {
      switching.current = false;
    }
  }, [reservedTags, notify]);

  // Give kept tags back (a survey ended, CTIP-147). Stops at the first refusal and
  // reloads, so the list shows what is left; the next top-up tries again.
  const releaseKept = useCallback(async (ids = []) => {
    const now = latest.current;
    if (!reservedTags || !now.isBotanist || now.apiStatus !== "connected") return { released: 0, failed: ids.length };
    let released = 0;
    for (const id of ids) {
      const res = await now.callApi(deleteTagApi, id);
      if (!res.ok) {
        console.warn("reserved tags: could not release", id, res.message || res.code);
        break;
      }
      justMade.current.delete(id);
      try {
        await reservedTags.remove(now.userId, [id]);
      } catch (err) {
        console.warn("reservedTags.remove:", err?.message || err);
      }
      released += 1;
    }
    try {
      const ids2 = await reservedTags.all(now.userId);
      if (latest.current.userId === now.userId) setSaved(ids2);
    } catch (err) {
      console.warn("reservedTags.all:", err?.message || err);
    }
    await now.loadFromApi(true);
    return { released, failed: ids.length - released };
  }, [reservedTags]);
  const releaseRef = useRef(releaseKept);
  releaseRef.current = releaseKept;

  return { keptTags, keepOffline, setKeepOffline, topUpReservedTags, takeReservedTag, releaseKept };
}

// apps/shared/offline/tags.js
// What a scanned tag is when the phone may have no signal (CTIP-83).
// Three sources, in this order:
//   1. this phone's unsent records: a tag one of them uses is taken, even though
//      the server (and so the workspace) does not know it yet;
//   2. the workspace the store last loaded (lookupTag in selectors.js);
//   3. the tag list saved on the phone at the last workspace load (tag_cache),
//      for when the app was opened without signal and nothing has loaded.
// A tag none of them knows is "unchecked" while offline: the botanist may still
// start a record, and the API checks the tag when the record is sent (a clash
// then becomes a `pick_tag` failure the botanist can fix).
//
// tag_cache rows hold only { qr_id, status, specimen_id, mine, name }: never a
// location, because the phone may be lost and the cache is not needed for maps.
//
// No React Native imports: this runs under plain Node in the tests.
import { lookupTag, plantView } from "../selectors.js";

// Printed Daun Sense tags. Anything else is never offered as a new record.
const TAG_ID = /^NIAH-\d{4}$/;

const norm = (id) => String(id || "").trim().toUpperCase();
const unconfirmed = (proposed) => `${proposed || "Unnamed plant"} (unconfirmed)`;

/** Keep only the five fields a tag_cache row may hold. */
export function cleanTagRow(row) {
  return {
    qr_id: norm(row?.qr_id),
    status: row?.status || "unknown",
    specimen_id: row?.specimen_id || null,
    mine: Boolean(row?.mine),
    name: row?.name || null,
  };
}

/**
 * The rows to save in tag_cache after a workspace load. `db` holds the store's
 * shaped `tags`, `plants` and `species`; `userId` decides `mine`.
 */
export function tagCacheRows(db, userId) {
  const species = new Map((db.species || []).map((s) => [s.id, s]));
  const plants = new Map();
  for (const p of db.plants || []) {
    if (p?.qr_id && !p.is_deleted) plants.set(norm(p.qr_id), p);
  }
  const nameOf = (p) => {
    const sp = species.get(p.species_id);
    return sp && !sp.is_deleted ? sp.common_name || sp.scientific_name : unconfirmed(p.proposed_species);
  };
  const row = (qr_id, status, p) =>
    cleanTagRow({ qr_id, status, specimen_id: p?.id, mine: !!p && p.registered_by === userId, name: p ? nameOf(p) : null });

  const rows = [];
  const seen = new Set();
  for (const t of db.tags || []) {
    const id = norm(t.qr_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    rows.push(row(id, t.status, plants.get(id)));
  }
  // A plant whose tag is missing from the tag list is still on that tag.
  for (const [id, p] of plants) {
    if (!seen.has(id)) rows.push(row(id, "assigned", p));
  }
  return rows;
}

/** The tags this person's unsent new plants use: [{ qr_id, record_id, specimen_id, name }]. */
export function outboxTagsFrom(outboxItems = []) {
  return outboxItems
    .filter((r) => r?.kind === "new_plant" && r.qr_id)
    .map((r) => ({
      qr_id: norm(r.qr_id),
      record_id: r.id,
      specimen_id: r.specimen_id ?? null,
      name: r.specimen?.proposed_species_name || null,
    }));
}

/**
 * lookupTagOffline(db, id, { cached, outboxTags, offline })
 *   → { kind: 'unused'|'used'|'retired'|'unknown'|'unchecked', id, tag?, plant? }
 * Same answers as lookupTag, plus 'unchecked' (unknown while offline). A plant
 * that exists only on this phone comes back with `plant.on_phone: true` and
 * `plant.outbox_id`; one known only from the cache has no photos or status.
 */
export function lookupTagOffline(db, id, { cached = [], outboxTags = [], offline = false } = {}) {
  const cleanId = norm(id);
  if (!cleanId) return { kind: "unknown", id: cleanId };

  const mine = outboxTags.find((t) => norm(t.qr_id) === cleanId);
  if (mine) {
    return {
      kind: "used",
      id: cleanId,
      plant: {
        id: mine.specimen_id,
        qr_id: cleanId,
        name: unconfirmed(mine.name),
        scientific: "",
        photos: [],
        status: "queued", // "Waiting to sync"
        mine: true,
        on_phone: true,
        outbox_id: mine.record_id,
      },
    };
  }

  const live = lookupTag(db, cleanId);
  if (live.kind !== "unknown") return live;

  const row = cached.find((r) => norm(r.qr_id) === cleanId);
  if (row) {
    const tag = { qr_id: cleanId, status: row.status, batch_label: null };
    if (row.status === "unused") return { kind: "unused", id: cleanId, tag, cached: true };
    if (row.status === "retired") return { kind: "retired", id: cleanId, tag, cached: true };
    if (row.specimen_id) {
      const loaded = (db?.plants || []).find((p) => p.id === row.specimen_id);
      const plant = loaded
        ? plantView(db, loaded)
        : { id: row.specimen_id, qr_id: cleanId, name: row.name || "Recorded plant", scientific: "", photos: [], status: null, mine: row.mine };
      return { kind: "used", id: cleanId, plant, cached: true };
    }
    // Taken, but by a plant we cannot show (a deleted one): as lookupTag answers.
    return { kind: "unknown", id: cleanId };
  }

  if (offline && TAG_ID.test(cleanId)) return { kind: "unchecked", id: cleanId };
  return { kind: "unknown", id: cleanId };
}

/**
 * The plant a revisit of tag `qr` is for, or null:
 *   { specimen_id, specimen_ref, qr_id, name, lat, lng, on_phone, plant }
 * A plant only in this phone's outbox has specimen_id null and specimen_ref set
 * to its outbox record (see revisitRecord in records.js). `plant` is the
 * workspace's plant when it has one.
 */
export function revisitTarget(db, qr, { cached = [], outboxItems = [] } = {}) {
  const cleanId = norm(qr);
  if (!cleanId) return null;

  const onPhone = outboxItems.find((r) => r?.kind === "new_plant" && norm(r.qr_id) === cleanId);
  if (onPhone) {
    return {
      specimen_id: null,
      specimen_ref: onPhone.id,
      qr_id: cleanId,
      name: unconfirmed(onPhone.specimen?.proposed_species_name),
      lat: onPhone.specimen?.lat ?? null,
      lng: onPhone.specimen?.lng ?? null,
      on_phone: true,
      plant: null,
    };
  }

  const plant = (db?.plants || []).find((p) => p?.qr_id && norm(p.qr_id) === cleanId && !p.is_deleted);
  if (plant) {
    return {
      specimen_id: plant.id,
      specimen_ref: null,
      qr_id: cleanId,
      name: plantView(db, plant).name,
      lat: plant.lat ?? null,
      lng: plant.lng ?? null,
      on_phone: false,
      plant,
    };
  }

  const row = cached.find((r) => norm(r.qr_id) === cleanId && r.specimen_id);
  if (row) {
    return {
      specimen_id: row.specimen_id,
      specimen_ref: null,
      qr_id: cleanId,
      name: row.name || "Recorded plant",
      lat: null, // the cache keeps no locations
      lng: null,
      on_phone: false,
      plant: null,
    };
  }
  return null;
}

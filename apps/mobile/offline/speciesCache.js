// apps/mobile/offline/speciesCache.js
// The published species saved on the phone (CTIP-84), so a botanist with no signal
// can still find a species by name when recording a plant.
//
// Rows live in the encrypted SQLite file's species_cache table, with the time of
// the last refresh in meta (apps/shared/offline/schema.js, v3). Each row's
// thumbnail is a small file in the app's document directory:
// species-thumbs/{id}.jpg, and thumb_path points at it.
//
// This is public data (GET /public/species lists only published species, with no
// staff-only fields), so unlike unsent records it is not tied to a person.
// Losing it costs nothing: the next refresh fetches it again. So every failure
// here is quiet: SQLite missing means an empty cache, and a failed refresh keeps
// whatever was saved before. Nothing here ever throws to the botanist.
//
// What to call (Task 7's triggers):
//   speciesCache.refresh()               after the API first answers (App.js does this)
//   speciesCache.refresh({ force: true }) when the connection returns
//   await speciesCache.all()             { list, cachedAt } for searchSpeciesOffline
import { apiFetch } from '../../shared/api.js';
import { cleanSpeciesRow, cacheIsFresh } from '../../shared/offline/offlineSearch.js';
import { getLocalDb } from './localDb.js';

const THUMB_DIR = 'species-thumbs';
const CACHED_AT_KEY = 'species_cached_at';
const DOWNLOADS_AT_ONCE = 4; // enough to be quick, few enough not to starve a weak connection

// Species IDs are UUIDs; this keeps anything odd out of a file name.
const thumbName = (id) => `${String(id).replace(/[^A-Za-z0-9_-]/g, '')}.jpg`;

// expo-file-system is loaded when needed, like expo-sqlite in localDb.js, so a
// build or test run without it only loses thumbnails. Its main entry is the
// File / Directory / Paths API (the old documentDirectory API lives in /legacy).
async function loadFileSystem() {
  try {
    return await import('expo-file-system');
  } catch {
    return null;
  }
}

function thumbsDirectory(FS) {
  const dir = new FS.Directory(FS.Paths.document, THUMB_DIR);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

// Downloads one species' picture. Resolves to the saved file's uri, or null when
// it could not be saved: one missing or slow picture must not fail the refresh.
async function downloadThumb(FS, dir, species) {
  const url = species.primary_image_url;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const file = new FS.File(dir, thumbName(species.id));
  try {
    // idempotent: replace a picture that is already there instead of failing.
    const saved = await FS.File.downloadFileAsync(url, file, { idempotent: true });
    return saved.uri;
  } catch {
    // On Android a failed download can leave half a file behind.
    try { if (file.exists) file.delete(); } catch { /* nothing to clean up */ }
    return null;
  }
}

// Runs `task` over `items`, a few at a time.
async function inBatches(items, size, task) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(task));
  }
}

/**
 * Does a species' picture need downloading? Only when it is new, it changed
 * (another link), or the last download failed (no file). A forced refresh uses
 * the same rule: it is about the list being fresh, and a few hundred unchanged
 * pictures fetched again on every reconnect would waste the botanist's data.
 */
export function thumbNeedsDownload(old, thumbSrc) {
  return !(old?.thumb_path && old.thumb_src === thumbSrc);
}

export function createSpeciesCache(openDb = getLocalDb) {
  let running = null; // a refresh in progress; callers share it
  let runningForced = false; // whether that refresh skips the 24-hour check
  let forcedNext = null; // a forced refresh waiting for a normal one to finish
  let memo = null; // the list as last read, until the next refresh

  function readAll(db) {
    const rows = db.getAllSync('SELECT id, data, thumb_path FROM species_cache;');
    const list = rows.map((r) => ({ ...JSON.parse(r.data), id: r.id, thumb_path: r.thumb_path ?? null }));
    const saved = db.getFirstSync('SELECT value FROM meta WHERE key = ?;', [CACHED_AT_KEY]);
    return { list, cachedAt: saved?.value ?? null };
  }

  async function doRefresh({ force }) {
    const db = await openDb();
    if (!db) return { ok: false, reason: 'no_database' };

    const saved = db.getFirstSync('SELECT value FROM meta WHERE key = ?;', [CACHED_AT_KEY]);
    if (!force && cacheIsFresh(saved?.value)) return { ok: true, skipped: true };

    // Every published species in one call: GET /public/species pages only when asked to.
    const res = await apiFetch('/public/species', { token: null });
    if (!res.ok || !Array.isArray(res.data)) return { ok: false, reason: res.offline ? 'offline' : 'api_error' };
    const fresh = res.data.filter((s) => s?.id && s.scientific_name);

    // What is already saved, so a picture that has not changed is not downloaded again.
    const before = new Map(readAll(db).list.map((s) => [s.id, s]));
    const FS = await loadFileSystem();
    let dir = null;
    try { dir = FS ? thumbsDirectory(FS) : null; } catch { dir = null; }

    const rows = fresh.map((s) => {
      const old = before.get(s.id);
      return { species: s, data: { ...cleanSpeciesRow(s), thumb_src: s.primary_image_url || null }, thumb_path: old?.thumb_path ?? null, old };
    });
    if (dir) {
      const wanted = rows.filter((r) => {
        if (!r.species.primary_image_url) { r.thumb_path = null; return false; }
        return thumbNeedsDownload(r.old, r.data.thumb_src);
      });
      await inBatches(wanted, DOWNLOADS_AT_ONCE, async (r) => {
        // A failed download keeps the old picture if there was one, else none.
        r.thumb_path = (await downloadThumb(FS, dir, r.species)) ?? (r.old?.thumb_path || null);
      });
    }

    // Swap the list in one transaction, so a crash never leaves half of one.
    const cachedAt = new Date().toISOString();
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM species_cache;');
      for (const r of rows) {
        db.runSync('INSERT INTO species_cache (id, data, thumb_path) VALUES (?, ?, ?);', [
          r.species.id, JSON.stringify(r.data), r.thumb_path,
        ]);
      }
      db.runSync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [CACHED_AT_KEY, cachedAt]);
    });
    memo = null;

    // Delete the pictures of species that are gone (and any stray file).
    if (dir) {
      try {
        const keep = new Set(rows.filter((r) => r.thumb_path).map((r) => thumbName(r.species.id)));
        for (const entry of dir.list()) {
          if (entry instanceof FS.File && !keep.has(entry.name)) entry.delete();
        }
      } catch { /* a leftover picture is harmless; the next refresh tries again */ }
    }
    return { ok: true, count: rows.length };
  }

  // Fetch the species list and save it. Skipped when it ran less than 24 hours
  // ago, unless `force` is set. Never throws; resolves to { ok, skipped?, count?, reason? }.
  // Calls made while one is running share it, except a forced call while a
  // normal one runs: that one may skip itself (the list looked fresh), so the
  // forced refresh runs once it has finished instead of being dropped.
  function refresh({ force = false } = {}) {
    if (running) {
      if (!force || runningForced) return running;
      if (!forcedNext) {
        forcedNext = running.then(() => {
          forcedNext = null;
          return refresh({ force: true });
        });
      }
      return forcedNext;
    }
    runningForced = force;
    running = doRefresh({ force })
      .catch((err) => {
        console.warn('[SpeciesCache] refresh failed, keeping the old list:', err?.message || err);
        return { ok: false, reason: 'error' };
      })
      .finally(() => { running = null; });
    return running;
  }

  return {
    refresh,

    // The saved species ({ id, scientific_name, ..., thumb_path }) and when they
    // were saved (ISO text, or null when never). Empty when SQLite is not available.
    async all() {
      if (memo) return memo;
      try {
        const db = await openDb();
        if (!db) return { list: [], cachedAt: null };
        memo = readAll(db);
        return memo;
      } catch (err) {
        console.warn('[SpeciesCache] could not read the saved species:', err?.message || err);
        return { list: [], cachedAt: null };
      }
    },
  };
}

// One cache for the whole app.
export const speciesCache = createSpeciesCache();

// apps/mobile/draftStore.js
// Crash-safe local draft persistence for in-progress plant observations (CTIP-57).
// Uses expo-sqlite on native devices, with graceful fallback to AsyncStorage / memory.
// The SQLite file is encrypted with SQLCipher (CTIP-107); see offline/localDb.js.

import { getLocalDb } from './offline/localDb.js';

const memoryStore = new Map();

// The encrypted database itself (key, migrations, old-file move) is opened in
// offline/localDb.js, because the offline outbox uses the same file (CTIP-44).
// Drafts keep their own fallback below for when SQLite is not available.
const getDb = getLocalDb;

async function getAsyncStorage() {
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    return mod.default || mod;
  } catch {
    return null;
  }
}

const STORAGE_PREFIX = 'daun_draft_';

/**
 * Save an in-progress plant observation draft.
 * Holds taxonomy, morphology, height, notes, photos, GPS and QR tag ID.
 */
export async function saveDraft(qr_id, draft) {
  if (!qr_id) return false;
  const payload = {
    qr_id,
    user_id: draft.user_id || null, // who started it, so My Records shows people only their own drafts
    proposed_species: draft.proposed_species || draft.sp || '',
    morphology: draft.morphology || draft.looks || '',
    height_cm: draft.height_cm || draft.height || '',
    notes: draft.notes || '',
    photos: draft.photos || [],
    gps: draft.gps || null,
    updated_at: new Date().toISOString(),
  };
  const json = JSON.stringify(payload);

  try {
    const db = await getDb();
    if (db) {
      db.runSync(
        'INSERT OR REPLACE INTO drafts (qr_id, data, updated_at) VALUES (?, ?, ?);',
        [qr_id, json, payload.updated_at]
      );
      return true;
    }
  } catch (err) {
    console.warn('[DraftStore SQLite Error]', err?.message || err);
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.setItem === 'function') {
      await storage.setItem(`${STORAGE_PREFIX}${qr_id}`, json);
      return true;
    }
  } catch {
    // fallback to memory
  }

  memoryStore.set(qr_id, payload);
  return true;
}

/**
 * The draft `userId` started on a QR tag, or null. Drafts are kept per tag and
 * are cleared on sign-out, but not when a session ends some other way (it
 * expired, or the account was turned off), so on a shared phone the next person
 * to scan the tag must not get someone else's notes, photos and GPS, or send
 * them as their own. Drafts from before user_id was added have no owner and
 * still open.
 */
export async function getDraft(qr_id, userId) {
  const draft = await readDraft(qr_id);
  return draft && (!draft.user_id || draft.user_id === userId) ? draft : null;
}

async function readDraft(qr_id) {
  if (!qr_id) return null;

  try {
    const db = await getDb();
    if (db) {
      const row = db.getFirstSync('SELECT data FROM drafts WHERE qr_id = ?;', [qr_id]);
      if (row && row.data) {
        return JSON.parse(row.data);
      }
    }
  } catch (err) {
    console.warn('[DraftStore SQLite Read Error]', err?.message || err);
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.getItem === 'function') {
      const raw = await storage.getItem(`${STORAGE_PREFIX}${qr_id}`);
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // fallback to memory
  }

  return memoryStore.get(qr_id) || null;
}

/**
 * Delete a draft after successful submission or intentional discard.
 */
export async function clearDraft(qr_id) {
  if (!qr_id) return false;

  try {
    const db = await getDb();
    if (db) {
      db.runSync('DELETE FROM drafts WHERE qr_id = ?;', [qr_id]);
    }
  } catch (err) {
    console.warn('[DraftStore SQLite Delete Error]', err?.message || err);
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.removeItem === 'function') {
      await storage.removeItem(`${STORAGE_PREFIX}${qr_id}`);
    }
  } catch {
    // fallback
  }

  memoryStore.delete(qr_id);
  return true;
}

/**
 * List all saved drafts currently stored locally.
 */
export async function listDrafts() {
  try {
    const db = await getDb();
    if (db) {
      const rows = db.getAllSync('SELECT qr_id, data, updated_at FROM drafts ORDER BY updated_at DESC;');
      return (rows || []).map((r) => {
        try {
          return JSON.parse(r.data);
        } catch {
          return { qr_id: r.qr_id, updated_at: r.updated_at };
        }
      });
    }
  } catch {
    // fallback
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.getAllKeys === 'function') {
      const keys = await storage.getAllKeys();
      const draftKeys = keys.filter((k) => k.startsWith(STORAGE_PREFIX));
      const pairs = await storage.multiGet(draftKeys);
      return pairs
        .map(([, val]) => {
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    }
  } catch {
    // fallback
  }

  return Array.from(memoryStore.values());
}

/**
 * The drafts one user started on this device. Drafts are kept per tag, and a phone
 * can be shared, so My Records must not list (and let someone send) another
 * person's draft. Drafts saved before user_id was added have no owner and are
 * left out; they still open when their tag is scanned.
 */
export async function listDraftsFor(userId) {
  if (!userId) return [];
  return (await listDrafts()).filter((d) => d.user_id === userId);
}

/**
 * Clear all drafts from the encrypted SQLite database, AsyncStorage, and memory.
 * Invoked on sign-out so in-progress plant drafts do not remain on shared devices.
 */
export async function clearAllDrafts() {
  try {
    const db = await getDb();
    if (db) {
      db.runSync('DELETE FROM drafts;');
    }
  } catch (err) {
    console.warn('[DraftStore SQLite ClearAll Error]', err?.message || err);
  }

  try {
    const storage = await getAsyncStorage();
    if (storage && typeof storage.getAllKeys === 'function') {
      const keys = await storage.getAllKeys();
      const draftKeys = (keys || []).filter((k) => k.startsWith(STORAGE_PREFIX));
      if (draftKeys.length > 0 && typeof storage.multiRemove === 'function') {
        await storage.multiRemove(draftKeys);
      }
    }
  } catch {
    // fallback
  }

  memoryStore.clear();
  return true;
}

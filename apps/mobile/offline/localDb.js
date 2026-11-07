// apps/mobile/offline/localDb.js
// Opens the encrypted on-device database that holds drafts and the offline outbox.
// Moved out of draftStore.js (CTIP-44) so the outbox and the drafts share one file.
// The SQLite file is encrypted with SQLCipher (CTIP-107, docs/security/encryption.md
// "Mobile SQLite"): useSQLCipher is on in app.json, and the key is 32 random bytes
// made on the phone and kept in expo-secure-store, never in code.

import { migrate } from '../../shared/offline/schema.js';

const DB_NAME = 'daun_drafts_secure.db';
// Drafts saved before CTIP-107 live in this plain file; they are copied into the
// encrypted one on first open and the plain file is deleted.
const OLD_DB_NAME = 'daun_drafts.db';
const KEY_NAME = 'daun_drafts_db_key';

let dbPromise = null;

async function getDbKey() {
  const SecureStore = await import('expo-secure-store');
  let key = await SecureStore.getItemAsync(KEY_NAME);
  if (!key || !/^[0-9a-f]{64}$/.test(key)) {
    const { getRandomBytes } = await import('expo-crypto');
    key = Array.from(getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_NAME, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return key;
}

function moveOldDrafts(SQLite, db) {
  try {
    const old = SQLite.openDatabaseSync(OLD_DB_NAME);
    const hasTable = old.getFirstSync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drafts';"
    );
    const rows = hasTable ? old.getAllSync('SELECT qr_id, data, updated_at FROM drafts;') : [];
    old.closeSync();
    for (const r of rows) {
      db.runSync(
        'INSERT OR IGNORE INTO drafts (qr_id, data, updated_at) VALUES (?, ?, ?);',
        [r.qr_id, r.data, r.updated_at]
      );
    }
    SQLite.deleteDatabaseSync(OLD_DB_NAME);
  } catch {
    // No old file, or it could not be read: nothing to move.
  }
}

async function openDb() {
  try {
    const SQLite = await import('expo-sqlite');
    if (SQLite && typeof SQLite.openDatabaseSync === 'function') {
      const key = await getDbKey();
      const db = SQLite.openDatabaseSync(DB_NAME);
      // Raw 256-bit key (x'..'), so SQLCipher skips its slow password derivation.
      db.execSync(`PRAGMA key = "x'${key}'";`);
      // Create or upgrade the tables. This must come before moveOldDrafts, which
      // needs the drafts table. A database from before versioning has the drafts
      // table and user_version 0, and its drafts are kept.
      migrate(db);
      if (!db.getFirstSync('PRAGMA cipher_version;')) {
        // Expo Go has no SQLCipher, so the file there is not encrypted.
        console.warn('[LocalDb] SQLCipher is not active; the local database is not encrypted in this build');
      }
      moveOldDrafts(SQLite, db);
      return db;
    }
  } catch (err) {
    // Native SQLite not available in this environment (e.g. Node test runner, Web),
    // or the database could not be opened or migrated.
    console.warn('[LocalDb] could not open the local database:', err?.message || err);
  }
  return null;
}

/**
 * The encrypted local database, opened and migrated once and then reused.
 * Resolves to null if SQLite is not available; callers decide what to do then
 * (drafts fall back to AsyncStorage, the outbox refuses with OUTBOX_UNAVAILABLE).
 */
export function getLocalDb() {
  dbPromise ??= openDb();
  return dbPromise;
}

// apps/shared/offline/schema.js
// The versioned schema of the encrypted on-device database (CTIP-44).
// No React Native imports: migrate() only needs { execSync, getFirstSync }, so it
// runs under plain Node in the tests as well as on the phone.
//
// Rules for changing this file:
//  - Never edit a migration that has shipped. Add a new one with the next version.
//  - Each migration runs once, in order, and the version is stored in SQLite's
//    built-in `PRAGMA user_version` (0 on a database made before CTIP-44).

export const MIGRATIONS = [
  {
    // The drafts table as it was before versioning, so a phone that already has
    // drafts keeps them (CREATE TABLE IF NOT EXISTS leaves the old table alone).
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS drafts (
        qr_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    // The outbox: records waiting to be sent, and their photos. The full record is
    // JSON in `data`; id, user_id, state and created_at are also columns so we can
    // list, count and sort without parsing every row.
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS outbox_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS outbox_records_user_created ON outbox_records (user_id, created_at);
      CREATE TABLE IF NOT EXISTS outbox_photos (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        uploaded INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL
      );
    `,
  },
  {
    // Read-only copies of server data for use without signal.
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS species_cache (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        thumb_path TEXT
      );
      CREATE TABLE IF NOT EXISTS tag_cache (
        qr_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `,
  },
  {
    // The tags kept for each botanist, so "Generate new QR tag" works with no
    // signal (CTIP-116). No "used" column: the outbox already says which of them a
    // record on this phone has taken.
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS reserved_tags (
        qr_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL
      );
    `,
  },
  {
    // Kept tags belong to the phone that made them, not to the account, so two
    // phones signed in to one account never hand out the same tag ID. made_here
    // is 1 for a tag this phone made. Rows saved before this version held the
    // account's whole list (another phone may hold the same IDs), so they get 0:
    // never handed out, only released when "Keep tags for offline use" is turned off.
    version: 5,
    sql: `
      ALTER TABLE reserved_tags ADD COLUMN made_here INTEGER NOT NULL DEFAULT 0;
    `,
  },
];

/**
 * Bring the database up to the latest version. Returns the new version.
 * Each migration runs in its own transaction together with its version bump, so a
 * failure leaves the database exactly as it was before that migration and throws.
 */
export function migrate(db) {
  const row = db.getFirstSync('PRAGMA user_version;');
  let current = Number(row?.user_version ?? 0);

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    if (!Number.isInteger(migration.version)) {
      throw new Error('Migration version must be an integer');
    }
    db.execSync('BEGIN;');
    try {
      db.execSync(migration.sql);
      // PRAGMA cannot take bound parameters; the version is a checked integer.
      db.execSync(`PRAGMA user_version = ${migration.version};`);
      db.execSync('COMMIT;');
    } catch (err) {
      try {
        db.execSync('ROLLBACK;');
      } catch {
        // Already rolled back by SQLite; keep the original error.
      }
      throw err;
    }
    current = migration.version;
  }
  return current;
}

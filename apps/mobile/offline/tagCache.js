// apps/mobile/offline/tagCache.js
// The tag list the phone saved at the last workspace load (CTIP-83), in the
// encrypted SQLite file's tag_cache table (apps/shared/offline/schema.js, v3).
// Scan uses it when the app was opened without signal and nothing has loaded.
//
// Each row is { qr_id, status, specimen_id, mine, name } and nothing else: no
// coordinates (cleanTagRow enforces that). Rows belong to the person whose load
// they came from, so on a shared phone people only read their own.
//
// Unlike the outbox, losing this list costs nothing (the next load writes it
// again), so when SQLite is not available it saves nothing and reads empty.
import { cleanTagRow } from '../../shared/offline/tags.js';

export function createTagCache(getLocalDb) {
  return {
    // Replace this person's list with `rows`, in one transaction.
    async save(userId, rows = []) {
      if (!userId) return;
      const db = await getLocalDb();
      if (!db) return;
      db.withTransactionSync(() => {
        db.runSync('DELETE FROM tag_cache WHERE user_id = ?;', [userId]);
        for (const row of rows) {
          const clean = cleanTagRow(row);
          if (!clean.qr_id) continue;
          // qr_id is the table's key, so on a shared phone the last person whose
          // list held this tag owns its row. Their lists come from the same
          // server, so only `mine` and `name` can differ.
          db.runSync('INSERT OR REPLACE INTO tag_cache (qr_id, user_id, data) VALUES (?, ?, ?);', [
            clean.qr_id,
            userId,
            JSON.stringify(clean),
          ]);
        }
      });
    },

    async all(userId) {
      if (!userId) return [];
      const db = await getLocalDb();
      if (!db) return [];
      const rows = db.getAllSync('SELECT data FROM tag_cache WHERE user_id = ? ORDER BY qr_id ASC;', [userId]);
      return rows.map((r) => cleanTagRow(JSON.parse(r.data)));
    },
  };
}

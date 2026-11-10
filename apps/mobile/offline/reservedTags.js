// apps/mobile/offline/reservedTags.js
// The tags kept for offline use on this phone (CTIP-116), in the encrypted
// SQLite file's reserved_tags table (apps/shared/offline/schema.js, v4 and v5).
// They let "Generate new QR tag" work with no signal: the tags were made on the
// server ahead of time (useReservedTags.js), so using one needs no connection.
//
// Kept tags belong to the phone that made them, not to the account: a botanist
// signed in on two phones must never be offered the same kept ID on both, or one
// ID could be written on two spare tags. Rows are { qr_id, user_id, made_here }:
//   made_here 1  a tag this phone made; the only ones it hands out (all)
//   made_here 0  saved before kept tags were per phone, when the list was the
//                account's (legacy): never handed out, only released when the
//                switch is turned off
// Which of them a record on this phone has already taken comes from the outbox.
//
// Losing this list costs no record, so when SQLite is not available it saves
// nothing and reads empty.
//
// The "Keep tags for offline use" switch is saved per person in the meta table
// (key keep_offline_tags:<userId>, value "1" or "0"). No row means on. With no
// database it answers on and saves nothing.
const keepKey = (userId) => `keep_offline_tags:${userId}`;

export function createReservedTags(getLocalDb) {
  const norm = (id) => String(id || '').trim().toUpperCase();
  const ids = (rows) => rows.map((r) => r.qr_id);
  return {
    async getKeepOffline(userId) {
      if (!userId) return true;
      const db = await getLocalDb();
      if (!db) return true;
      const row = db.getFirstSync('SELECT value FROM meta WHERE key = ?;', [keepKey(userId)]);
      return row?.value !== '0';
    },

    async setKeepOffline(userId, on) {
      if (!userId) return;
      const db = await getLocalDb();
      if (!db) return;
      db.runSync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);', [keepKey(userId), on ? '1' : '0']);
    },

    // Tags this phone has just made for this person.
    async add(userId, qrIds = []) {
      if (!userId) return;
      const db = await getLocalDb();
      if (!db) return;
      db.withTransactionSync(() => {
        for (const id of qrIds.map(norm).filter(Boolean)) {
          db.runSync('INSERT OR REPLACE INTO reserved_tags (qr_id, user_id, made_here) VALUES (?, ?, 1);', [id, userId]);
        }
      });
    },

    // The tags this phone made for this person: the only ones it hands out.
    async all(userId) {
      if (!userId) return [];
      const db = await getLocalDb();
      if (!db) return [];
      return ids(db.getAllSync('SELECT qr_id FROM reserved_tags WHERE user_id = ? AND made_here = 1 ORDER BY qr_id ASC;', [userId]));
    },

    // Tags saved before kept tags were per phone.
    async legacy(userId) {
      if (!userId) return [];
      const db = await getLocalDb();
      if (!db) return [];
      return ids(db.getAllSync('SELECT qr_id FROM reserved_tags WHERE user_id = ? AND made_here = 0 ORDER BY qr_id ASC;', [userId]));
    },

    // Drop this person's rows that are not in `keepIds` (used, or released).
    async retain(userId, keepIds = []) {
      if (!userId) return;
      const db = await getLocalDb();
      if (!db) return;
      const keep = new Set(keepIds.map(norm));
      db.withTransactionSync(() => {
        for (const { qr_id } of db.getAllSync('SELECT qr_id FROM reserved_tags WHERE user_id = ?;', [userId])) {
          if (!keep.has(qr_id)) db.runSync('DELETE FROM reserved_tags WHERE qr_id = ? AND user_id = ?;', [qr_id, userId]);
        }
      });
    },

    // Tags given back to the server.
    async remove(userId, qrIds = []) {
      if (!userId) return;
      const db = await getLocalDb();
      if (!db) return;
      db.withTransactionSync(() => {
        for (const id of qrIds.map(norm).filter(Boolean)) {
          db.runSync('DELETE FROM reserved_tags WHERE qr_id = ? AND user_id = ?;', [id, userId]);
        }
      });
    },
  };
}

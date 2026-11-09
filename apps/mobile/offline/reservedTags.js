// apps/mobile/offline/reservedTags.js
// The tags kept for each botanist on this phone (CTIP-116), in the encrypted
// SQLite file's reserved_tags table (apps/shared/offline/schema.js, v4). They let
// "Generate new QR tag" work with no signal: the tags were made on the server
// ahead of time (useReservedTags.js), so using one needs no connection.
//
// Rows are { qr_id, user_id }: only the tag ID and whose it is. Which of them a
// record on this phone has already taken comes from the outbox, not from here.
//
// Like tag_cache, losing this list costs nothing but a top-up on the next
// connection, so when SQLite is not available it saves nothing and reads empty.
//
// The "Keep tags for offline use" switch is saved per person in the meta table
// (key keep_offline_tags:<userId>, value "1" or "0"). No row means on. With no
// database it answers on and saves nothing.
const keepKey = (userId) => `keep_offline_tags:${userId}`;

export function createReservedTags(getLocalDb) {
  const norm = (id) => String(id || '').trim().toUpperCase();
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

    // Replace this person's list with `qrIds`, in one transaction.
    async save(userId, qrIds = []) {
      if (!userId) return;
      const db = await getLocalDb();
      if (!db) return;
      db.withTransactionSync(() => {
        db.runSync('DELETE FROM reserved_tags WHERE user_id = ?;', [userId]);
        for (const id of qrIds.map(norm).filter(Boolean)) {
          // qr_id is the key, so on a shared phone the last person to save a tag owns it.
          db.runSync('INSERT OR REPLACE INTO reserved_tags (qr_id, user_id) VALUES (?, ?);', [id, userId]);
        }
      });
    },

    async all(userId) {
      if (!userId) return [];
      const db = await getLocalDb();
      if (!db) return [];
      const rows = db.getAllSync('SELECT qr_id FROM reserved_tags WHERE user_id = ? ORDER BY qr_id ASC;', [userId]);
      return rows.map((r) => r.qr_id);
    },
  };
}

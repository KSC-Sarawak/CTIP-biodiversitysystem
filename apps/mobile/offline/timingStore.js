// apps/mobile/offline/timingStore.js
// Time per record on this phone (CTIP-146), in the encrypted SQLite file's
// capture_timings table (apps/shared/offline/schema.js, v6). The rows feed the
// field evaluation (CTIP-148) through the CSV export on the Account page and are
// never sent to the API. Rows come from timingRow() in
// apps/shared/offline/captureTimings.js, which keeps out locations, tags,
// species and notes.
//
// A lost timing must never stop a plant being saved: with no database, or when a
// write fails, recordTiming logs and gives up, and the reads answer empty.
const COLUMNS = ['id', 'user_id', 'survey_id', 'started_at', 'saved_at', 'duration_ms', 'offline', 'photos', 'located'];

export function createTimingStore(getLocalDb) {
  return {
    async recordTiming(row) {
      if (!row?.id || !row.user_id) return;
      try {
        const db = await getLocalDb();
        if (!db) return;
        db.runSync(
          `INSERT OR REPLACE INTO capture_timings (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')});`,
          COLUMNS.map((c) => row[c] ?? null),
        );
      } catch (err) {
        console.warn('[timings] could not save a timing:', err?.message || err);
      }
    },

    async listTimings(userId) {
      if (!userId) return [];
      const db = await getLocalDb();
      if (!db) return [];
      return db.getAllSync(
        `SELECT ${COLUMNS.join(', ')} FROM capture_timings WHERE user_id = ? ORDER BY saved_at;`,
        [userId],
      );
    },

    async clearTimings(userId) {
      if (!userId) return 0;
      const db = await getLocalDb();
      if (!db) return 0;
      return db.runSync('DELETE FROM capture_timings WHERE user_id = ?;', [userId]).changes ?? 0;
    },
  };
}

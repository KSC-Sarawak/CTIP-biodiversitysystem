// apps/mobile/offline/surveyStore.js
// Quick survey mode (CTIP-147): the surveys a botanist started on this phone, in
// the encrypted SQLite file's survey_sessions table (apps/shared/offline/schema.js,
// v7). The active survey is the one with no ended_at; it survives the app being
// killed. Never sent to the API.
//
// With no database a survey cannot start (startSurvey answers null) and nothing
// is active.
import { uid } from '../../shared/utils.js';

const COLUMNS = 'id, user_id, name, tag_target, started_at, ended_at';

export function createSurveyStore(getLocalDb) {
  return {
    async startSurvey({ userId, name, tagTarget }) {
      if (!userId) return null;
      const db = await getLocalDb();
      if (!db) return null;
      const now = new Date().toISOString();
      const row = { id: uid(), user_id: userId, name: String(name).trim(), tag_target: tagTarget, started_at: now, ended_at: null };
      // One survey at a time: one still open is ended first.
      db.runSync('UPDATE survey_sessions SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL;', [now, userId]);
      db.runSync(
        'INSERT INTO survey_sessions (id, user_id, name, tag_target, started_at, ended_at) VALUES (?, ?, ?, ?, ?, NULL);',
        [row.id, row.user_id, row.name, row.tag_target, row.started_at],
      );
      return row;
    },

    async activeSurvey(userId) {
      if (!userId) return null;
      const db = await getLocalDb();
      if (!db) return null;
      return db.getFirstSync(
        `SELECT ${COLUMNS} FROM survey_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1;`,
        [userId],
      ) ?? null;
    },

    async endSurvey(id) {
      if (!id) return;
      const db = await getLocalDb();
      if (!db) return;
      db.runSync('UPDATE survey_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL;', [new Date().toISOString(), id]);
    },
  };
}

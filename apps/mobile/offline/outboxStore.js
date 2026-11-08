// apps/mobile/offline/outboxStore.js
// The outbox on the encrypted SQLite file (CTIP-44): records waiting to be sent, and
// their photos. Same interface and behaviour as apps/shared/offline/memoryOutbox.js.
//
// Unsent records must never be lost or leak, so there is no fallback here: if
// SQLite is not available, every method throws OUTBOX_UNAVAILABLE and the caller
// tells the botanist the record could not be saved.
//
// Each record is JSON in `data`. id, user_id, state and created_at are also columns,
// so the update methods rewrite those columns whenever they change `data`.

function unavailable() {
  const err = new Error('The offline store is not available on this device');
  err.code = 'OUTBOX_UNAVAILABLE';
  return err;
}

export function createSqliteOutbox(getLocalDb) {
  async function open() {
    const db = await getLocalDb();
    if (!db) throw unavailable();
    return db;
  }

  // Write a whole record back, keeping the columns in step with the JSON.
  function writeRecord(db, record) {
    db.runSync(
      'UPDATE outbox_records SET user_id = ?, state = ?, created_at = ?, data = ? WHERE id = ?;',
      [record.user_id, record.state, record.created_at, JSON.stringify(record), record.id]
    );
  }

  const readRecord = (db, id) => {
    const row = db.getFirstSync('SELECT data FROM outbox_records WHERE id = ?;', [id]);
    return row ? JSON.parse(row.data) : null;
  };

  return {
    // One transaction: the record and all its photos are saved, or none are.
    async add(record, photos = []) {
      if (!record?.id || !record?.user_id) throw new Error('An outbox record needs an id and a user_id');
      const db = await open();
      const created_at = record.created_at ?? new Date().toISOString();
      const stored = {
        ...record,
        state: record.state ?? 'pending',
        created_at,
        updated_at: record.updated_at ?? created_at,
      };
      db.withTransactionSync(() => {
        db.runSync(
          'INSERT INTO outbox_records (id, user_id, state, created_at, data) VALUES (?, ?, ?, ?, ?);',
          [stored.id, stored.user_id, stored.state, stored.created_at, JSON.stringify(stored)]
        );
        photos.forEach((p, i) => {
          if (!p?.id) throw new Error('An outbox photo needs an id');
          db.runSync(
            'INSERT INTO outbox_photos (id, record_id, position, uploaded, data) VALUES (?, ?, ?, 0, ?);',
            [
              p.id,
              stored.id,
              p.position ?? i,
              JSON.stringify({
                base64: p.base64,
                name: p.name ?? null,
                type: p.type ?? null,
                caption: p.caption ?? '',
                traits: p.traits ?? [],
              }),
            ]
          );
        });
      });
    },

    // rowid breaks ties between records saved with the same created_at.
    async list(userId) {
      const db = await open();
      const rows = db.getAllSync(
        'SELECT data FROM outbox_records WHERE user_id = ? ORDER BY created_at ASC, rowid ASC;',
        [userId]
      );
      return rows.map((r) => JSON.parse(r.data));
    },

    async get(id) {
      const db = await open();
      return readRecord(db, id);
    },

    // Shallow merge into the record. Returns the new record, or null if there is none.
    async update(id, changes) {
      const db = await open();
      const existing = readRecord(db, id);
      if (!existing) return null;
      const merged = { ...existing, ...changes, id, updated_at: new Date().toISOString() };
      writeRecord(db, merged);
      return merged;
    },

    async photos(recordId) {
      const db = await open();
      const rows = db.getAllSync(
        'SELECT id, record_id, position, uploaded, data FROM outbox_photos WHERE record_id = ? ORDER BY position ASC;',
        [recordId]
      );
      return rows.map((r) => ({
        id: r.id,
        record_id: r.record_id,
        position: r.position,
        uploaded: r.uploaded,
        ...JSON.parse(r.data),
      }));
    },

    // Only the first photo (lowest position), or null: for a list's thumbnail,
    // which must not read every full-size photo of every record (CTIP-68).
    async firstPhoto(recordId) {
      const db = await open();
      const row = db.getFirstSync(
        'SELECT id, record_id, position, uploaded, data FROM outbox_photos WHERE record_id = ? ORDER BY position ASC LIMIT 1;',
        [recordId]
      );
      return row
        ? { id: row.id, record_id: row.record_id, position: row.position, uploaded: row.uploaded, ...JSON.parse(row.data) }
        : null;
    },

    // Once a photo is on the server its bytes are dead weight, so drop them.
    async markPhotoUploaded(photoId) {
      const db = await open();
      db.withTransactionSync(() => {
        const row = db.getFirstSync('SELECT data FROM outbox_photos WHERE id = ?;', [photoId]);
        if (!row) return;
        const data = JSON.parse(row.data);
        delete data.base64;
        db.runSync('UPDATE outbox_photos SET uploaded = 1, data = ? WHERE id = ?;', [
          JSON.stringify(data),
          photoId,
        ]);
      });
    },

    // One photo the botanist removed from an unsent record (it could not be sent).
    async removePhoto(photoId) {
      const db = await open();
      db.runSync('DELETE FROM outbox_photos WHERE id = ?;', [photoId]);
    },

    async remove(id) {
      const db = await open();
      db.withTransactionSync(() => {
        db.runSync('DELETE FROM outbox_photos WHERE record_id = ?;', [id]);
        db.runSync('DELETE FROM outbox_records WHERE id = ?;', [id]);
      });
    },

    // After a crash or force-quit, anything still marked sending was cut off.
    async resetInterrupted() {
      const db = await open();
      db.withTransactionSync(() => {
        const rows = db.getAllSync("SELECT data FROM outbox_records WHERE state = 'sending';");
        for (const row of rows) {
          const record = JSON.parse(row.data);
          writeRecord(db, { ...record, state: 'pending', updated_at: new Date().toISOString() });
        }
      });
    },

    // A record being sent still counts as waiting, so it is part of `pending`.
    async count(userId) {
      const db = await open();
      const rows = db.getAllSync(
        'SELECT state, COUNT(*) AS n FROM outbox_records WHERE user_id = ? GROUP BY state;',
        [userId]
      );
      const counts = { pending: 0, failed: 0, conflict: 0 };
      for (const { state, n } of rows) {
        if (state === 'pending' || state === 'sending') counts.pending += n;
        else if (state === 'failed') counts.failed += n;
        else if (state === 'conflict') counts.conflict += n;
      }
      return counts;
    },
  };
}

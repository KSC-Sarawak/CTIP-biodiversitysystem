// apps/shared/offline/memoryOutbox.js
// An in-memory outbox with the same interface as the SQLite one in
// apps/mobile/offline/outboxStore.js (CTIP-44). It is for the sync engine's tests
// under plain Node. The app never uses it: unsent records must live in the
// encrypted SQLite file, never in memory (see docs/architecture/offline-sync.md).
//
// Keep the behaviour identical to outboxStore.js; offline-outbox.test.js runs the
// same tests against both.

// Round-trip through JSON, as SQLite does, so callers get copies they cannot use to
// change stored state (and fields set to undefined disappear the same way).
const copy = (value) => JSON.parse(JSON.stringify(value));

export function createMemoryOutbox() {
  // Insertion order matters: it breaks ties between records with equal created_at.
  const records = new Map(); // id -> record
  const photoRows = new Map(); // id -> { id, record_id, position, uploaded, data }

  const toPhoto = (row) => ({
    id: row.id,
    record_id: row.record_id,
    position: row.position,
    uploaded: row.uploaded,
    ...copy(row.data),
  });

  function waiting(userId) {
    return [...records.values()].filter((r) => r.user_id === userId);
  }

  return {
    async add(record, photos = []) {
      if (!record?.id || !record?.user_id) throw new Error('An outbox record needs an id and a user_id');
      if (records.has(record.id)) throw new Error(`Outbox record ${record.id} already exists`);

      // Check everything first, then write, so a bad photo leaves nothing behind.
      const now = new Date().toISOString();
      const created_at = record.created_at ?? now;
      const stored = copy({
        ...record,
        state: record.state ?? 'pending',
        created_at,
        updated_at: record.updated_at ?? created_at,
      });
      const rows = [];
      photos.forEach((p, i) => {
        if (!p?.id) throw new Error('An outbox photo needs an id');
        if (photoRows.has(p.id) || rows.some((r) => r.id === p.id)) {
          throw new Error(`Outbox photo ${p.id} already exists`);
        }
        rows.push({
          id: p.id,
          record_id: record.id,
          position: p.position ?? i,
          uploaded: 0,
          data: copy({
            base64: p.base64,
            name: p.name ?? null,
            type: p.type ?? null,
            caption: p.caption ?? '',
            traits: p.traits ?? [],
          }),
        });
      });

      records.set(stored.id, stored);
      for (const row of rows) photoRows.set(row.id, row);
    },

    async list(userId) {
      // Array.sort is stable, so equal created_at keeps insertion order.
      return waiting(userId)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
        .map(copy);
    },

    async get(id) {
      const record = records.get(id);
      return record ? copy(record) : null;
    },

    // Shallow merge into the record. Returns the new record, or null if there is none.
    async update(id, changes) {
      const existing = records.get(id);
      if (!existing) return null;
      const merged = copy({ ...existing, ...changes, id, updated_at: new Date().toISOString() });
      records.set(id, merged);
      return copy(merged);
    },

    async photos(recordId) {
      return [...photoRows.values()]
        .filter((row) => row.record_id === recordId)
        .sort((a, b) => a.position - b.position)
        .map(toPhoto);
    },

    // Once a photo is on the server its bytes are dead weight, so drop them.
    async markPhotoUploaded(photoId) {
      const row = photoRows.get(photoId);
      if (!row) return;
      row.uploaded = 1;
      delete row.data.base64;
    },

    async remove(id) {
      records.delete(id);
      for (const [photoId, row] of photoRows) {
        if (row.record_id === id) photoRows.delete(photoId);
      }
    },

    // After a crash or force-quit, anything still marked sending was cut off.
    async resetInterrupted() {
      for (const [id, record] of records) {
        if (record.state === 'sending') {
          records.set(id, { ...record, state: 'pending', updated_at: new Date().toISOString() });
        }
      }
    },

    // A record being sent still counts as waiting, so it is part of `pending`.
    async count(userId) {
      const counts = { pending: 0, failed: 0, conflict: 0 };
      for (const { state } of waiting(userId)) {
        if (state === 'pending' || state === 'sending') counts.pending += 1;
        else if (state === 'failed') counts.failed += 1;
        else if (state === 'conflict') counts.conflict += 1;
      }
      return counts;
    },
  };
}

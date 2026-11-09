import { z } from 'zod';
import { supabaseAs } from './supabase.js';
import { parseBody, UUID } from './validate.js';
import { findObservation } from './observationAccess.js';
import {
  ObservationCreate, EDITABLE, isDuplicate, reviewInProgress, REVIEW_IN_PROGRESS_MESSAGE,
} from './field.js';

// POST /sync (CTIP-16): the phone sends what it recorded offline, up to 20
// observations at a time. Design: docs/architecture/offline-sync.md.
//
// Two rules keep a resent batch safe:
//   - Every item carries the id the phone made, so a create that already
//     arrived is answered "created" again and stored once.
//   - An edit names the version the phone edited from (base_version). It only
//     changes the row while that is still the current version, so the phone
//     never overwrites an edit made elsewhere. Sending the same edit again
//     finds the fields already equal and answers "updated", not "conflict".
//
// Each item is answered on its own, in request order: a bad item gets an
// error entry and the others still save. The batch is small, so items are
// handled one at a time, which also keeps two items for one plant in order.

// What an edit may change. The plant, capture time and device stay as first sent.
const EDIT_FIELDS = ['height_cm', 'morphology', 'notes', 'lat', 'lng', 'gps_accuracy_m'];

// A sync item is a normal new observation, except: the phone cannot choose
// the status (items are always created as "queued", and the phone sends the
// record for review later with POST /observations/:id/submit), the id is
// required, and base_version says create (null) or edit (a version number).
const SyncItem = ObservationCreate
  .omit({ status: true })
  .extend({
    id: z.string().regex(UUID, 'must be a UUID'),
    base_version: z.number().int().min(1).nullable(),
  })
  .refine(
    (item) => item.base_version === null || EDIT_FIELDS.some((f) => item[f] !== undefined),
    'An edit must include at least one field to change',
  );

const SyncRequest = z.strictObject({
  device_id: z.string().trim().min(1).max(100),
  // Items are checked one by one below, so one bad item does not fail the batch.
  observations: z.array(z.unknown()).min(1).max(20),
});

const failed = (id, code, message) => ({ id, result: 'error', error: { code, message } });

async function createItem(db, user, item, deviceId) {
  const review = await reviewInProgress(db, user, item.specimen_id, item.id);
  if (review.error) return failed(item.id, 'DB_ERROR', review.error.message);
  if (review.blocked) return failed(item.id, 'REVIEW_IN_PROGRESS', REVIEW_IN_PROGRESS_MESSAGE);

  const { base_version, ...fields } = item;
  const { data, error } = await db
    .from('observations')
    .insert({
      ...fields,
      device_id: fields.device_id ?? deviceId,
      status: 'queued',
      // The phone's own capture time survives a late sync.
      observed_at: fields.observed_at ?? new Date().toISOString(),
      recorded_by: user.id,
      version: 1,
      last_synced_at: null,
    })
    .select('id, version')
    .single();
  if (!error) return { id: item.id, result: 'created', server_version: data.version };

  if (isDuplicate(error, 'observations_pkey')) {
    // Already stored: our own row means this is a resend. Anyone else's row (or
    // one we cannot see) means the id is not ours to use.
    const existing = await findObservation(db, { params: { id: item.id }, user });
    if (existing.error) return failed(item.id, 'DB_ERROR', existing.error.message);
    if (existing.data?.recorded_by === user.id) {
      return { id: item.id, result: 'created', server_version: existing.data.version };
    }
    return failed(item.id, 'ID_TAKEN', 'That id belongs to another record. Make a new id.');
  }
  if (error.code === '23503') return failed(item.id, 'VALIDATION_ERROR', 'That plant does not exist');
  if (error.code === '42501') return failed(item.id, 'FORBIDDEN', 'You cannot add an observation here');
  return failed(item.id, 'DB_ERROR', error.message);
}

async function editItem(db, user, item) {
  const changes = {};
  for (const f of EDIT_FIELDS) if (item[f] !== undefined) changes[f] = item[f];

  // Matches only the caller's own record, still unsent, still at the version
  // the phone edited from. Anything else changes nothing.
  const { data, error } = await db
    .from('observations')
    .update({ ...changes, version: item.base_version + 1 })
    .eq('id', item.id)
    .eq('recorded_by', user.id)
    .eq('is_deleted', false)
    .in('status', EDITABLE)
    .eq('version', item.base_version)
    .select('version')
    .maybeSingle();
  if (error) return failed(item.id, 'DB_ERROR', error.message);
  if (data) return { id: item.id, result: 'updated', server_version: data.version };

  // No row matched: find out why, so the phone can tell the botanist.
  const found = await findObservation(db, { params: { id: item.id }, user });
  if (found.error) return failed(item.id, 'DB_ERROR', found.error.message);
  const row = found.data;
  // Another user's record looks the same as a missing one.
  if (!row || row.recorded_by !== user.id) return failed(item.id, 'NOT_FOUND', 'Observation not found');
  if (!EDITABLE.includes(row.status)) {
    return {
      id: item.id, result: 'conflict', server_version: row.version,
      error: { code: 'WRONG_STATUS', message: 'This record was already sent for review, so it cannot be changed.' },
    };
  }
  // The same edit sent twice: the first one landed, the answer was lost.
  if (Object.entries(changes).every(([f, v]) => row[f] === v)) {
    return { id: item.id, result: 'updated', server_version: row.version };
  }
  return { id: item.id, result: 'conflict', server_version: row.version };
}

async function syncItem(db, user, raw, deviceId) {
  const parsed = SyncItem.safeParse(raw);
  if (!parsed.success) {
    const id = typeof raw?.id === 'string' ? raw.id : undefined;
    const why = parsed.error.issues.map((i) => `${i.path.join('.') || 'item'}: ${i.message}`).join('; ');
    return failed(id, 'VALIDATION_ERROR', why);
  }
  const item = parsed.data;
  return item.base_version === null ? createItem(db, user, item, deviceId) : editItem(db, user, item);
}

export const syncHandlers = {
  'post /sync': async (req, res) => {
    const body = parseBody(SyncRequest, req, res);
    if (!body) return;
    const db = supabaseAs(req.user);
    const results = [];
    for (const raw of body.observations) results.push(await syncItem(db, req.user, raw, body.device_id));
    res.json({ results });
  },
};

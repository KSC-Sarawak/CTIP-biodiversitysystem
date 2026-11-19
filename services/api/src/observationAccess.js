// Reading observations, shared by the field routes (field.js) and the review
// routes (observations.js), so the botanist guard lives in one place.

// The columns every observation answer carries.
export const OBS_COLUMNS = `id, specimen_id, recorded_by, observed_at, height_cm, morphology, notes, lat, lng,
  gps_accuracy_m, status, version, device_id, last_synced_at, created_at, updated_at`;

// Botanists see what they recorded, at every status, and every APPROVED
// observation, whoever recorded it (RBAC D16). RLS says the same; this is the
// API's own second guard. user.id comes from the verified token.
export const visibleTo = (query, user) =>
  (user.role === 'botanist' ? query.or(`recorded_by.eq.${user.id},status.eq.approved`) : query);

// Review decisions and comments stay between the botanist who recorded the
// observation and the staff (RBAC D16), even when the observation itself is
// shared because it is approved.
export const ownOrStaff = (obs, user) => user.role !== 'botanist' || obs.recorded_by === user.id;
export const PRIVATE_TALK_MESSAGE = 'Only the botanist who recorded this observation and the officers can see or add its reviews and comments.';

// The observation named in req.params.id, if this user may see it.
export const findObservation = (db, req) => visibleTo(
  db.from('observations').select(OBS_COLUMNS).eq('id', req.params.id).eq('is_deleted', false),
  req.user,
).maybeSingle();

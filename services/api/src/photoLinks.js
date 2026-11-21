// Photo rows keep a Storage path in s3_key ("{species_id}/{media_id}.jpg").
// Rows saved by older app builds may hold a full link there instead.

// Any link with a scheme (https:, data:, ...): not a file in our Storage.
export const isFullLink = (key) => /^[a-z]+:/i.test(key);

// A link the apps can open as it is.
export const isWebLink = (key) => /^https?:/i.test(key);

// The Storage path of a field photo. Older app builds saved a full link such as
// https://<project>.supabase.co/storage/v1/object/public/observation-photos/<path>.
// That bucket is private, so such a link never opens (tagged-plant photos showed
// as blank boxes): the API signs its path instead. null for any other link.
export function photoPath(key, bucket = 'observation-photos') {
  if (!key) return null;
  if (!isFullLink(key)) return key;
  const at = key.indexOf(`/storage/v1/object/`);
  if (at < 0) return null;
  const rest = key.slice(at + '/storage/v1/object/'.length).replace(/^(public|sign|authenticated)\//, '');
  if (!rest.startsWith(`${bucket}/`)) return null;
  const path = rest.slice(bucket.length + 1).split(/[?#]/)[0];
  try { return decodeURIComponent(path) || null; } catch { return null; }
}

// Public link for a species photo (species-media is a public bucket).
export const publicMediaUrl = (db, { s3_bucket, s3_key }) =>
  (isWebLink(s3_key) ? s3_key : db.storage.from(s3_bucket || 'species-media').getPublicUrl(s3_key).data.publicUrl);

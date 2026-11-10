// apps/mobile/offline/photoFiles.js
// Deletes the plain JPEGs expo-image-picker leaves in the app's cache folder,
// once a record's photos are safe: saved in the encrypted outbox, or sent.
// docs/architecture/offline-sync.md, section 2: unsent records live only in
// the encrypted SQLite file, never in plain files.
//
// Only files inside the cache folder are touched (cameraCacheFiles), never a
// gallery original. expo-file-system is loaded when needed, as in
// speciesCache.js. A file that cannot be deleted is left for the system to
// clear with the rest of the cache: this never fails a save.
import { cameraCacheFiles } from '../../shared/offline/records.js';

export async function deleteCameraFiles(photos = []) {
  let FS;
  try {
    FS = await import('expo-file-system');
  } catch {
    return;
  }
  let cacheUri;
  try {
    cacheUri = FS.Paths.cache.uri;
  } catch {
    return;
  }
  for (const uri of cameraCacheFiles(photos, cacheUri)) {
    try {
      const file = new FS.File(uri);
      if (file.exists) file.delete();
    } catch (err) {
      console.warn('[PhotoFiles] could not delete a camera file:', err?.message || err);
    }
  }
}

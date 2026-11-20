import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { photoPath } from '../src/photoLinks.js';
import { withSignedUrls } from '../src/field.js';
import { supabaseAnon } from '../src/supabase.js';

// Tagged-plant photos showed as blank boxes (web and mobile). The
// observation-photos bucket is private, so:
//   * visitors were sent /object/public/ links, which never open;
//   * staff were sent the full /object/public/ link that older app builds
//     saved in s3_key, as it was.
// Both now get signed links. A plant whose location is hidden keeps its photos.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const OLD_LINK = 'https://cgtvoirktzqjqaosslfh.supabase.co/storage/v1/object/public/observation-photos/o2/p2.jpg';
const SPECIES = '11111111-1111-4111-8111-111111111111';
let signCalls;
let publicPhotos;

beforeEach((t) => {
  signCalls = [];
  publicPhotos = [
    { id: 'p1', observation_id: 'o1', s3_key: 'o1/p1.jpg', s3_bucket: 'observation-photos', created_at: '2026-11-01' },
    { id: 'p2', observation_id: 'o2', s3_key: OLD_LINK, s3_bucket: 'observation-photos', created_at: '2026-11-01' },
  ];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/storage/v1/object/sign/observation-photos') {
      const { paths } = JSON.parse(init.body);
      signCalls.push({ paths, auth: new Headers(init.headers).get('Authorization') });
      return ok(paths.map((path) => ({ path, signedURL: `/object/sign/observation-photos/${path}?token=t`, error: null })));
    }
    if (url.pathname.endsWith('/rpc/public_observation_photos')) return ok(publicPhotos);
    if (url.pathname.endsWith('/rpc/public_plants')) {
      return ok([{ id: 's1', qr_id: 'NIAH-0001', species_id: SPECIES, lat: 3.8, lng: 113.7, endangered_override: true, is_deleted: false, observation_id: 'o1' }]);
    }
    if (url.pathname.endsWith('/species')) return ok([{ id: SPECIES, conservation_status: 'endangered', is_published: true }]);
    return ok([]);
  });
});

test('photoPath: a Storage path stays; an old full link to the photo bucket gives its path', () => {
  assert.equal(photoPath('o1/p1.jpg'), 'o1/p1.jpg');
  assert.equal(photoPath(OLD_LINK), 'o2/p2.jpg');
  assert.equal(photoPath('https://x.supabase.co/storage/v1/object/sign/observation-photos/o3/p%203.jpg?token=abc'), 'o3/p 3.jpg');
  assert.equal(photoPath('https://example.com/photo.jpg'), null, 'another site is not our file');
  assert.equal(photoPath('https://x.supabase.co/storage/v1/object/public/species-media/s/m.jpg'), null);
  assert.equal(photoPath(null), null);
});

test('staff: an old full link is signed by its path instead of sent as it is', async () => {
  const rows = await withSignedUrls(supabaseAnon(), [{ id: 'p2', s3_key: OLD_LINK }, { id: 'p3', s3_key: 'https://example.com/a.jpg' }]);
  assert.deepEqual(signCalls[0].paths, ['o2/p2.jpg']);
  assert.match(rows[0].url, /\/storage\/v1\/object\/sign\/observation-photos\/o2\/p2\.jpg\?token=t$/);
  assert.equal(rows[1].url, 'https://example.com/a.jpg', 'a link to another site is kept');
});

test('visitors get signed photo links, also for a plant whose location is hidden', async () => {
  const app = createApp({ verify: async () => { throw new Error('no token needed'); } });
  const res = await request(app).get('/v1/public/workspace');
  assert.equal(res.status, 200);
  assert.deepEqual(signCalls[0].paths, ['o1/p1.jpg', 'o2/p2.jpg']);
  assert.equal(signCalls[0].auth, 'Bearer sb_publishable_test', 'signed as the visitor, so the storage policy decides');
  const urls = res.body.observation_photos.map((p) => p.url);
  for (const u of urls) {
    assert.match(u, /\/object\/sign\/observation-photos\//);
    assert.doesNotMatch(u, /\/object\/public\//);
  }
  assert.equal(res.body.specimens[0].lat, null, 'the location stays hidden');
});

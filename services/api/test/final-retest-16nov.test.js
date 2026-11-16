import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { sendPushToUsers } from '../src/pushNotifications.js';

// Security re-test 16 Nov 2026: profile photo must be a small picture, never a
// link; other people's push tokens are read only with the server's secret key.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const id = crypto.randomUUID();
const verify = async () => ({ sub: id, user_role: 'botanist', email: 'b@gmail.com', aal: 'aal2' });
const app = createApp({ verify });

test('PATCH /me refuses an avatar that is a link, not a picture', async () => {
  for (const avatar_url of ['https://evil.example/track.png', 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    const res = await request(app).patch('/v1/me').set('Authorization', 'Bearer b').send({ avatar_url });
    assert.equal(res.status, 422, avatar_url);
  }
});

test('PATCH /me refuses an avatar picture over 90 KB', async () => {
  const res = await request(app).patch('/v1/me').set('Authorization', 'Bearer b')
    .send({ avatar_url: `data:image/jpeg;base64,${'A'.repeat(95_000)}` });
  assert.equal(res.status, 422);
});

test('push tokens are never read with the caller\'s own token', async () => {
  const saved = process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response('[]', { status: 200 }); };
  try {
    await sendPushToUsers({ db: { rpc: () => { throw new Error('caller client used'); } }, userIds: [id], title: 't' });
  } finally {
    globalThis.fetch = realFetch;
    if (saved) process.env.SUPABASE_SECRET_KEY = saved;
  }
  assert.equal(calls.length, 0);
});

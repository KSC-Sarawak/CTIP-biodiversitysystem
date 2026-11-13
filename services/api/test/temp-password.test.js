import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MFA_ROLES } from '../src/mfa.js';

// F-16: a person whose admin typed their temporary password can do nothing but
// finish signing in and choose their own. A fake Supabase Auth answers the
// password change, so these run without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const id = crypto.randomUUID();
const people = {
  'temp-aal2': { sub: id, user_role: 'botanist', aal: 'aal2', email: 'temp@example.com', user_metadata: { must_change_password: true } },
  'temp-aal1': { sub: id, user_role: 'botanist', aal: 'aal1', email: 'temp@example.com', user_metadata: { must_change_password: true } },
  'done-aal2': { sub: id, user_role: 'botanist', aal: 'aal2', email: 'temp@example.com', user_metadata: { must_change_password: false } },
};
const verify = async (token) => {
  if (!people[token]) throw new Error('bad token');
  return people[token];
};
const handlers = { 'get /me': (req, res) => res.json({ id: req.user.id }) };
const app = createApp({ verify, handlers, mfaRoles: MFA_ROLES });
const appReal = createApp({ verify, mfaRoles: MFA_ROLES });
const as = (token) => ({ Authorization: `Bearer ${token}` });

let puts;
beforeEach((t) => {
  puts = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user' && init.method === 'PUT') {
      puts.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  });
});

test('F-16: with the temporary password, every other route answers 403 PASSWORD_CHANGE_REQUIRED', async () => {
  const res = await request(app).get('/v1/me').set(as('temp-aal2'));
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('F-16: the 6-digit step still comes first (MFA_REQUIRED), and its routes are not blocked', async () => {
  const res = await request(app).get('/v1/me').set(as('temp-aal1'));
  assert.equal(res.body.code, 'MFA_REQUIRED');
  const verifyStep = await request(appReal).post('/v1/auth/mfa/verify').set(as('temp-aal1')).send({ code: '12' });
  assert.notEqual(verifyStep.body.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('F-16: POST /me/password works and lifts the flag; after that the routes open', async () => {
  const res = await request(appReal).post('/v1/me/password').set(as('temp-aal2')).send({ new_password: 'my-own-pass1' });
  assert.equal(res.status, 204);
  assert.deepEqual(puts[0], { password: 'my-own-pass1', data: { must_change_password: false } });
  const after = await request(app).get('/v1/me').set(as('done-aal2'));
  assert.equal(after.status, 200);
});

test('F-16: a normal password change does not touch the account details', async () => {
  const res = await request(appReal).post('/v1/me/password').set(as('done-aal2')).send({ new_password: 'my-own-pass2' });
  assert.equal(res.status, 204);
  assert.deepEqual(puts[0], { password: 'my-own-pass2' });
});

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetAttemptLimits, ATTEMPT_LIMIT } from '../src/session.js';

// Sign-in, refresh and passwords through the API (CTIP-114). A fake Supabase
// Auth answers the calls the API makes, so these run without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const officerId = crypto.randomUUID();
const verify = async (token) => ({ sub: officerId, user_role: 'officer', email: 'officer@example.com', token });
const app = createApp({ verify });

let calls; // what the API sent to Supabase Auth
let password; // the officer's current password
let profile; // the officer's own profile row, or undefined: the read fails

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const session = (n) => ({
  access_token: `access-${n}`, refresh_token: `refresh-${n}`, token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: officerId, email: 'officer@example.com' },
});
let issued = 0;

async function fakeAuth(input, init = {}) {
  const url = new URL(input);
  const body = init.body ? JSON.parse(init.body) : {};
  const auth = new Headers(init.headers).get('Authorization');
  calls.push({ method: init.method ?? 'GET', path: url.pathname + url.search, body, auth });
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    if (body.email === 'officer@example.com' && body.password === password) return json(200, session(++issued));
    return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    if (body.refresh_token === 'refresh-ok') return json(200, session(++issued));
    return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
  }
  if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
  if (url.pathname === '/rest/v1/profiles') {
    if (!profile) return json(404, { message: 'no fake profile' });
    const one = /vnd\.pgrst\.object/.test(new Headers(init.headers).get('Accept') ?? '');
    return json(200, one ? profile : [profile]);
  }
  if (url.pathname === '/auth/v1/recover') return json(200, {});
  if (url.pathname === '/auth/v1/user' && init.method === 'PUT') {
    if (body.password === 'weakweak') return json(422, { code: 422, error_code: 'weak_password', msg: 'Password is too weak' });
    password = body.password;
    return json(200, { id: officerId });
  }
  return json(404, { msg: `no fake for ${url.pathname}` });
}

beforeEach((t) => {
  calls = [];
  password = 'old-password';
  profile = undefined;
  resetAttemptLimits();
  t.mock.method(globalThis, 'fetch', fakeAuth);
});

test('sign-in returns the session the app stores', async () => {
  const res = await request(app).post('/v1/auth/sign-in').send({ email: 'Officer@Example.com ', password: 'old-password' });
  assert.equal(res.status, 200);
  assert.match(res.body.access_token, /^access-/);
  assert.match(res.body.refresh_token, /^refresh-/);
  assert.equal(typeof res.body.expires_at, 'number');
  assert.deepEqual(res.body.user, { id: officerId, email: 'officer@example.com' });
  assert.equal(calls[0].body.email, 'officer@example.com', 'email is trimmed and lower-cased');
});

test('wrong password: 401 INVALID_CREDENTIALS; a bad body: 422', async () => {
  const wrong = await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'nope' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.code, 'INVALID_CREDENTIALS');
  const bad = await request(app).post('/v1/auth/sign-in').send({ email: 'not-an-email', password: 'x' });
  assert.equal(bad.status, 422);
});

// The API's own sign-in limit was removed on 8 Nov 2026 (team decision), so
// repeated tries all reach Supabase. Supabase may still refuse with its own limit.
test(`sign-in has no API limit: more than ${ATTEMPT_LIMIT} tries all reach Supabase`, async () => {
  for (let i = 0; i <= ATTEMPT_LIMIT; i++) {
    assert.equal((await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'nope' })).status, 401);
  }
  assert.equal(calls.filter((c) => c.path.startsWith('/auth/v1/token')).length, ATTEMPT_LIMIT + 1);
});

test('a disabled account: sign-in says so, gives no session and ends the one Supabase made', async () => {
  profile = { is_active: false, deleted_at: null };
  const res = await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'old-password' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'ACCOUNT_DISABLED');
  assert.match(res.body.message, /disabled/);
  assert.equal(res.body.access_token, undefined);
  assert.ok(calls.some((c) => c.path.startsWith('/auth/v1/logout')), 'the new session is ended');
});

test('a deleted account is told it was deleted; an active one signs in as usual', async () => {
  profile = { is_active: false, deleted_at: '2026-11-01T00:00:00Z' };
  const gone = await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'old-password' });
  assert.equal(gone.status, 403);
  assert.match(gone.body.message, /deleted/);
  profile = { is_active: true, deleted_at: null };
  assert.equal((await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'old-password' })).status, 200);
});

test('a wrong password for a disabled account still only says wrong email or password', async () => {
  profile = { is_active: false, deleted_at: null };
  const res = await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'nope' });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'INVALID_CREDENTIALS');
});

// A token that already carries a role (the hook did not leave it out) must not skip the check.
test('a disabled account is refused even when its new token carries a user_role', async (t) => {
  const jwt = `h.${Buffer.from(JSON.stringify({ user_role: 'officer' })).toString('base64url')}.s`;
  const real = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/token') return json(200, { ...session(++issued), access_token: jwt });
    return real(input, init);
  });
  profile = { is_active: false, deleted_at: null };
  for (const [path, body] of [['/v1/auth/sign-in', { email: 'officer@example.com', password: 'old-password' }], ['/v1/auth/refresh', { refresh_token: 'refresh-ok' }]]) {
    const res = await request(app).post(path).send(body);
    assert.equal(res.status, 403, path);
    assert.equal(res.body.code, 'ACCOUNT_DISABLED', path);
    assert.equal(res.body.access_token, undefined, path);
  }
});

test('refresh for an account disabled since sign-in: 403 ACCOUNT_DISABLED', async () => {
  profile = { is_active: false, deleted_at: null };
  const res = await request(app).post('/v1/auth/refresh').send({ refresh_token: 'refresh-ok' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'ACCOUNT_DISABLED');
});

test('refresh swaps a refresh token for a new session; an unknown one ends it', async () => {
  const ok = await request(app).post('/v1/auth/refresh').send({ refresh_token: 'refresh-ok' });
  assert.equal(ok.status, 200);
  assert.match(ok.body.access_token, /^access-/);
  const ended = await request(app).post('/v1/auth/refresh').send({ refresh_token: 'stolen' });
  assert.equal(ended.status, 401);
  assert.equal(ended.body.code, 'SESSION_ENDED');
});

test('sign-out ends that session in Supabase, and works without a token too', async () => {
  const res = await request(app).post('/v1/auth/sign-out').set('Authorization', 'Bearer access-9');
  assert.equal(res.status, 204);
  assert.deepEqual(calls.map((c) => [c.path, c.auth]), [
    ['/rest/v1/rpc/log_auth_event', 'Bearer access-9'], // VA-71 audit log, as that person
    ['/auth/v1/logout?scope=local', 'Bearer access-9'],
  ]);
  assert.deepEqual(calls[0].body, { p_event: 'SIGN_OUT', p_email: '' });
  calls = [];
  assert.equal((await request(app).post('/v1/auth/sign-out')).status, 204);
  assert.equal(calls.length, 0);
});

test('password reset: 202 for any address, so it never reveals who has an account', async () => {
  const res = await request(app).post('/v1/auth/password-reset').send({ email: 'nobody@example.com' });
  assert.equal(res.status, 202);
  assert.equal(calls[0].path.startsWith('/auth/v1/recover'), true);
});

test('change password: needs a token; a wrong current password changes nothing', async () => {
  assert.equal((await request(app).post('/v1/me/password').send({ new_password: 'new-password' })).status, 401);
  const wrong = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1')
    .send({ current_password: 'guess', new_password: 'new-password' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.code, 'WRONG_PASSWORD');
  assert.equal(password, 'old-password');
  assert.equal(calls.some((c) => c.path === '/auth/v1/user'), false);
});

test('change password with the right current one: 204, set as the signed-in user, check session closed', async () => {
  const res = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1')
    .send({ current_password: 'old-password', new_password: 'new-password' });
  assert.equal(res.status, 204);
  assert.equal(password, 'new-password');
  const put = calls.find((c) => c.path === '/auth/v1/user');
  assert.equal(put.auth, 'Bearer access-1', "changed with the caller's own token");
  assert.equal(calls.some((c) => c.path.startsWith('/auth/v1/logout')), true, 'the session opened to check the password is closed');
});

test('after a reset link (no current password) the new one is set; a weak one is refused', async () => {
  const ok = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1').send({ new_password: 'new-password' });
  assert.equal(ok.status, 204);
  const weak = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1').send({ new_password: 'weakweak' });
  assert.equal(weak.status, 422);
  assert.equal(weak.body.code, 'WEAK_PASSWORD');
  const short = await request(app).post('/v1/me/password').set('Authorization', 'Bearer access-1').send({ new_password: 'short' });
  assert.equal(short.status, 422);
});

// VA-71: sign-ins go into the audit log, with the email only.
const logged = () => calls.filter((c) => c.path === '/rest/v1/rpc/log_auth_event');

test('audit log: a right password logs SIGN_IN as that person, a wrong one SIGN_IN_FAILED, never the password', async () => {
  await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'nope' });
  await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'old-password' });
  const rows = logged();
  assert.deepEqual(rows.map((c) => c.body.p_event), ['SIGN_IN_FAILED', 'SIGN_IN']);
  assert.equal(rows[0].body.p_email, 'officer@example.com');
  assert.match(rows[1].auth, /^Bearer access-/, 'SIGN_IN is sent with the new token, so the database knows who');
  assert.doesNotMatch(JSON.stringify(rows), /nope|old-password/, 'no password in the log');
});

test('audit log: if it cannot be written, signing in still works', async () => {
  // The fake answers 404 for the log call unless told otherwise, like a missing migration.
  const res = await request(app).post('/v1/auth/sign-in').send({ email: 'officer@example.com', password: 'old-password' });
  assert.equal(res.status, 200);
  assert.equal(logged().length, 1);
});

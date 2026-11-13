import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MFA_ROLES, fromEmailLink, EMAIL_LINK_MAX_AGE_S } from '../src/mfa.js';
import { resetAttemptLimits } from '../src/session.js';
import { resetEmailLimit } from '../src/emailLimit.js';

// Lost phone, reset through email (lecturer, 13 Nov 2026). A fake Supabase
// Auth answers the calls the API makes, so these run without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';

const id = crypto.randomUUID();
const now = () => Math.floor(Date.now() / 1000);
const people = {
  password: { sub: id, email: 'officer@example.com', user_role: 'officer', aal: 'aal1', amr: [{ method: 'password', timestamp: now() }] },
  link: { sub: id, email: 'officer@example.com', user_role: 'officer', aal: 'aal1', amr: [{ method: 'otp', timestamp: now() }] },
  oldlink: { sub: id, email: 'officer@example.com', user_role: 'officer', aal: 'aal1', amr: [{ method: 'otp', timestamp: now() - EMAIL_LINK_MAX_AGE_S - 60 }] },
  resetlink: { sub: id, email: 'officer@example.com', user_role: 'officer', aal: 'aal1', amr: [{ method: 'recovery', timestamp: now() }] },
};
const verify = async (token) => {
  if (!people[token]) throw new Error('bad token');
  return people[token];
};
const app = createApp({ verify, mfaRoles: MFA_ROLES });

let calls;
let factors;
let otpError;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = init.method ?? 'GET';
  const body = init.body ? JSON.parse(init.body) : {};
  calls.push({ method, path: url.pathname, body, search: url.search });
  const p = url.pathname.replace('/auth/v1', '');
  if (p === '/user' && method === 'GET') return json(200, { id, factors });
  if (p === '/otp') return otpError ? json(429, otpError) : json(200, {});
  if (p === `/admin/users/${id}/factors` && method === 'GET') return json(200, factors);
  const del = new RegExp(`^/admin/users/${id}/factors/([^/]+)$`).exec(p);
  if (del && method === 'DELETE') {
    factors = factors.filter((f) => f.id !== del[1]);
    return json(200, { id: del[1] });
  }
  return json(404, {});
};

beforeEach(() => {
  calls = [];
  factors = [{ id: crypto.randomUUID(), factor_type: 'totp', status: 'verified' }];
  otpError = null;
  resetAttemptLimits();
  resetEmailLimit();
});

test('recovery: emails a sign-in link to the account\'s own address, with no new account', async () => {
  const res = await request(app).post('/v1/auth/mfa/recovery').set('Authorization', 'Bearer password').send({ email: 'someone-else@example.com' });
  assert.equal(res.status, 202);
  const otp = calls.find((c) => c.path === '/auth/v1/otp');
  assert.equal(otp.body.email, 'officer@example.com');
  assert.equal(otp.body.create_user, false);
});

test('recovery: needs the password first (no token, no email)', async () => {
  const res = await request(app).post('/v1/auth/mfa/recovery');
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('recovery: nothing to reset when no app is set up', async () => {
  factors = [];
  const res = await request(app).post('/v1/auth/mfa/recovery').set('Authorization', 'Bearer password');
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'MFA_NOT_SET_UP');
  assert.ok(!calls.some((c) => c.path === '/auth/v1/otp'));
});

test('recovery: at most 3 emails in 15 minutes', async () => {
  for (let i = 0; i < 3; i++) {
    assert.equal((await request(app).post('/v1/auth/mfa/recovery').set('Authorization', 'Bearer password')).status, 202);
  }
  const res = await request(app).post('/v1/auth/mfa/recovery').set('Authorization', 'Bearer password');
  assert.equal(res.status, 429);
});

test('recovery: Supabase email limit is passed on', async () => {
  otpError = { error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' };
  const res = await request(app).post('/v1/auth/mfa/recovery').set('Authorization', 'Bearer password');
  assert.equal(res.status, 429);
  assert.equal(res.body.code, 'EMAIL_RATE_LIMIT');
});

test('reset: the email-link session removes the old app', async () => {
  const res = await request(app).post('/v1/auth/mfa/reset').set('Authorization', 'Bearer link');
  assert.equal(res.status, 204);
  assert.equal(factors.length, 0);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path.startsWith(`/auth/v1/admin/users/${id}/factors/`)));
});

test('reset: refused with a password-only session (a stolen password is not enough)', async () => {
  const res = await request(app).post('/v1/auth/mfa/reset').set('Authorization', 'Bearer password');
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'EMAIL_LINK_REQUIRED');
  assert.equal(factors.length, 1);
});

test('reset: refused with an email link older than 15 minutes, or a password-reset link', async () => {
  for (const token of ['oldlink', 'resetlink']) {
    const res = await request(app).post('/v1/auth/mfa/reset').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 403, token);
  }
  assert.equal(factors.length, 1);
});

test('the email-link session still cannot use the rest of the API', async () => {
  const res = await request(app).get('/v1/me').set('Authorization', 'Bearer link');
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'MFA_REQUIRED');
});

test('fromEmailLink accepts otp and magiclink only, within 15 minutes', () => {
  const t = Date.now();
  assert.equal(fromEmailLink([{ method: 'magiclink', timestamp: t / 1000 }], t), true);
  assert.equal(fromEmailLink([{ method: 'otp', timestamp: t / 1000 - 60 }], t), true);
  assert.equal(fromEmailLink([{ method: 'password', timestamp: t / 1000 }], t), false);
  assert.equal(fromEmailLink(undefined, t), false);
});

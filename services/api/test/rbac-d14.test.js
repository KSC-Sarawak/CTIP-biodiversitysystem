import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetEmailLimit } from '../src/emailLimit.js';

// RBAC D14: an admin corrects an email, and it changes only after the link
// sent to the new address is clicked. Admins no longer change names.
// A fake Supabase (Auth + the tables used) answers, so no internet is needed.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_only';

const ids = { admin: crypto.randomUUID(), officer: crypto.randomUUID(), botanist: crypto.randomUUID() };
const verify = async (who) => {
  if (!ids[who]) throw new Error('bad token');
  return { sub: ids[who], user_role: who, aal: 'aal2' };
};
const app = createApp({ verify });
const as = (who) => ({ Authorization: `Bearer ${who}` });

let authUsers; // id -> { id, email, user_metadata }
let profiles;
let requests;
let calls;
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function rest(table, url, method, body, single) {
  const rows = { profiles, email_change_requests: requests }[table];
  const filters = [...url.searchParams].filter(([k]) => !['select', 'limit', 'order'].includes(k));
  const match = (r) => filters.every(([k, v]) => {
    if (v === 'is.null') return r[k] == null;
    return `${r[k]}` === v.replace(/^eq\./, '');
  });
  if (method === 'GET') {
    const hit = rows.filter(match);
    return json(200, single ? hit[0] ?? null : hit);
  }
  if (method === 'POST') {
    const row = { id: crypto.randomUUID(), done_at: null, placeholder_id: null, ...body };
    rows.push(row);
    return json(201, single ? row : [row]);
  }
  if (method === 'PATCH') {
    const hit = rows.filter(match);
    for (const r of hit) Object.assign(r, body);
    return json(200, hit);
  }
  if (method === 'DELETE') {
    const keep = rows.filter((r) => !match(r));
    rows.length = 0;
    rows.push(...keep);
    return json(204);
  }
  return json(405, {});
}

beforeEach((t) => {
  resetEmailLimit?.();
  calls = [];
  authUsers = new Map(Object.entries({
    [ids.botanist]: { id: ids.botanist, email: 'old@example.com', user_metadata: {} },
  }));
  profiles = [
    { id: ids.admin, email: 'admin@example.com', role: 'admin', deleted_at: null },
    { id: ids.botanist, email: 'old@example.com', role: 'botanist', deleted_at: null, full_name: 'Bo Tanist' },
  ];
  requests = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : {};
    const auth = new Headers(init.headers).get('Authorization');
    calls.push({ method, path: url.pathname, body, auth });
    if (url.pathname === '/auth/v1/invite') {
      if ([...authUsers.values()].some((u) => u.email === body.email)) return json(422, { code: 'email_exists', msg: 'A user with this email address has already been registered' });
      const user = { id: crypto.randomUUID(), email: body.email, user_metadata: body.data };
      authUsers.set(user.id, user);
      profiles.push({ id: user.id, email: body.email, role: null }); // the sign-up trigger
      return json(200, user);
    }
    if (url.pathname === '/auth/v1/user' && method === 'GET') {
      const token = auth?.replace('Bearer ', '');
      const user = authUsers.get(token?.replace('link-for-', ''));
      return user ? json(200, user) : json(401, { msg: 'invalid JWT' });
    }
    const admin = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
    if (admin && method === 'DELETE') {
      authUsers.delete(admin[1]);
      return json(200, {});
    }
    if (admin && method === 'PUT') {
      const user = authUsers.get(admin[1]);
      if ([...authUsers.values()].some((u) => u.email === body.email && u.id !== admin[1])) return json(422, { msg: 'email exists' });
      Object.assign(user, { email: body.email });
      return json(200, user);
    }
    const table = url.pathname.replace('/rest/v1/', '');
    const single = /vnd\.pgrst\.object/.test(new Headers(init.headers).get('Accept') ?? '');
    return rest(table, url, method, body, single);
  });
});

const correct = (email, who = 'admin', id = ids.botanist) =>
  request(app).post(`/v1/profiles/${id}/email`).set(as(who)).set('Origin', 'http://localhost:5173').send({ email });
const placeholderOf = (email) => [...authUsers.values()].find((u) => u.email === email && u.user_metadata?.email_change_request);
const confirm = (token) => request(app).post('/v1/auth/email-change/confirm').send({ access_token: token });

test('admin corrects an email: 202, an invitation goes to the new address, nothing changes yet', async () => {
  const res = await correct('New@Example.com');
  assert.equal(res.status, 202);
  assert.equal(res.body.pending_email, 'new@example.com');
  const invite = calls.find((c) => c.path === '/auth/v1/invite');
  assert.equal(invite.body.email, 'new@example.com');
  assert.equal(invite.auth, 'Bearer sb_secret_test_only');
  assert.equal(authUsers.get(ids.botanist).email, 'old@example.com', 'the real sign-in email waits for the link');
  assert.equal(profiles.find((p) => p.id === ids.botanist).email, 'old@example.com');
  const placeholder = placeholderOf('new@example.com');
  assert.ok(placeholder);
  assert.ok(!profiles.some((p) => p.id === placeholder.id), 'the placeholder never shows on the Users page');
  assert.equal(requests[0].placeholder_id, placeholder.id);
});

test('clicking the link moves the address onto the real account and its profile', async () => {
  await correct('new@example.com');
  const placeholder = placeholderOf('new@example.com');
  const res = await confirm(`link-for-${placeholder.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.email, 'new@example.com');
  assert.equal(authUsers.get(ids.botanist).email, 'new@example.com');
  assert.equal(profiles.find((p) => p.id === ids.botanist).email, 'new@example.com');
  assert.ok(!authUsers.has(placeholder.id), 'placeholder removed');
  assert.ok(requests[0].done_at);
  // The same link again does nothing.
  assert.equal((await confirm(`link-for-${placeholder.id}`)).status, 410);
});

test('an expired request or an unknown token changes nothing', async () => {
  await correct('new@example.com');
  const placeholder = placeholderOf('new@example.com');
  requests[0].expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await confirm(`link-for-${placeholder.id}`)).status, 410);
  assert.equal(authUsers.get(ids.botanist).email, 'old@example.com');
  assert.equal((await confirm('link-for-nobody-xxxxxxxxxxxxxxxx')).status, 410);
  // A normal staff token (no request in it) is refused too.
  authUsers.set(ids.officer, { id: ids.officer, email: 'o@example.com', user_metadata: {} });
  assert.equal((await confirm(`link-for-${ids.officer}`)).status, 410);
});

test('a second correction replaces the first; its old link stops working', async () => {
  await correct('first@example.com');
  const first = placeholderOf('first@example.com');
  await correct('second@example.com');
  assert.ok(!authUsers.has(first.id));
  assert.equal(requests.length, 1);
  assert.equal((await confirm(`link-for-${first.id}`)).status, 410);
});

test('refused: not an admin, same email, taken email, bad email, unknown user', async () => {
  assert.equal((await correct('new@example.com', 'officer')).status, 403);
  assert.equal((await correct('new@example.com', 'botanist')).status, 403);
  assert.equal((await correct('old@example.com')).status, 422);
  assert.equal((await correct('admin@example.com')).status, 409);
  assert.equal((await correct('not-an-email')).status, 422);
  assert.equal((await correct('new@example.com', 'admin', crypto.randomUUID())).status, 404);
  assert.equal(calls.filter((c) => c.path === '/auth/v1/invite').length, 0);
});

test('an admin can no longer change another person\'s name (PATCH /profiles/:id)', async () => {
  const res = await request(app).patch(`/v1/profiles/${ids.botanist}`).set(as('admin')).send({ full_name: 'Someone Else' });
  assert.equal(res.status, 422);
  assert.equal(profiles.find((p) => p.id === ids.botanist).full_name, 'Bo Tanist');
});

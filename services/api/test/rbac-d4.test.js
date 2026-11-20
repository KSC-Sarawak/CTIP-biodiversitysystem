import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { routes } from '../src/permissions.js';

// RBAC D4 (RBAC.md, 19 Nov 2026): only officers delete and restore tagged
// plants. It is a soft delete: the row stays (is_deleted), its tag stays taken
// and a restore brings it back as it was. A fake Supabase answers, so no
// internet is needed. The database side is guard_specimen_update()
// (migration 20261120070000).
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const ids = { admin: crypto.randomUUID(), officer: crypto.randomUUID(), botanist: crypto.randomUUID() };
const verify = async (who) => {
  if (!ids[who]) throw new Error('bad token');
  return { sub: ids[who], user_role: who, aal: 'aal2' };
};
const app = createApp({ verify });
const as = (who) => ({ Authorization: `Bearer ${who}` });
const rolesOf = (method, path) => routes.find(([m, p]) => m === method && p === path)?.[2];

let profiles;
let specimens;
let patches;
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach((t) => {
  patches = [];
  profiles = Object.entries(ids).map(([role, id]) => ({ id, role, is_active: true, deleted_at: null }));
  specimens = [
    { id: crypto.randomUUID(), qr_id: 'NIAH-0001', species_id: null, registered_by: ids.botanist, is_deleted: false },
    { id: crypto.randomUUID(), qr_id: 'NIAH-0002', species_id: null, registered_by: ids.botanist, is_deleted: true },
  ];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method ?? 'GET';
    const table = url.pathname.replace('/rest/v1/', '');
    const rows = { profiles, specimens }[table] ?? [];
    const single = /vnd\.pgrst\.object/.test(new Headers(init.headers).get('Accept') ?? '');
    const filters = [...url.searchParams].filter(([k]) => !['select', 'limit', 'order'].includes(k));
    const match = (r) => filters.every(([k, v]) => `${r[k]}` === v.replace(/^eq\./, ''));
    const hit = rows.filter(match);
    if (method === 'PATCH') {
      const body = JSON.parse(init.body);
      patches.push({ table, body });
      for (const r of hit) Object.assign(r, body);
    }
    if (single) return hit.length ? json(200, hit[0]) : json(406, { code: 'PGRST116', message: 'no rows' });
    return json(200, hit);
  });
});

const del = (id, who = 'officer') => request(app).delete(`/v1/specimens/${id}`).set(as(who));
const restore = (id, who = 'officer') => request(app).post(`/v1/specimens/${id}/restore`).set(as(who));

test('D4: only officers may call delete and restore', () => {
  assert.deepEqual(rolesOf('delete', '/specimens/:id'), ['officer']);
  assert.deepEqual(rolesOf('post', '/specimens/:id/restore'), ['officer']);
});

test('an officer deletes a plant: 204, only is_deleted changes', async () => {
  const [live] = specimens;
  const res = await del(live.id);
  assert.equal(res.status, 204);
  assert.equal(live.is_deleted, true);
  assert.deepEqual(patches, [{ table: 'specimens', body: { is_deleted: true } }]);
  assert.equal(live.qr_id, 'NIAH-0001', 'the tag stays on the plant, so it stays taken');
});

test('an officer restores a deleted plant: 200 with the plant', async () => {
  const gone = specimens[1];
  const res = await restore(gone.id);
  assert.equal(res.status, 200);
  assert.equal(res.body.qr_id, 'NIAH-0002');
  assert.equal(gone.is_deleted, false);
});

test('deleting twice, restoring a live plant or an unknown id gives 404', async () => {
  assert.equal((await del(specimens[1].id)).status, 404);
  assert.equal((await restore(specimens[0].id)).status, 404);
  assert.equal((await del(crypto.randomUUID())).status, 404);
  assert.equal((await del('not-a-uuid')).status, 404);
});

test('botanists and admins get 403 and nothing changes', async () => {
  for (const who of ['botanist', 'admin']) {
    assert.equal((await del(specimens[0].id, who)).status, 403, who);
    assert.equal((await restore(specimens[1].id, who)).status, 403, who);
  }
  assert.equal(patches.length, 0);
  assert.equal(specimens[0].is_deleted, false);
  assert.equal(specimens[1].is_deleted, true);
});

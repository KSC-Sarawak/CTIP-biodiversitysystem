import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// POST /v1/specimens/:id/publish: an officer or admin takes a published plant
// off public view with a reason, or puts it back. A fake Supabase plays
// public.set_plant_published() (same checks and error codes as migration
// 20261118120000), so the tests run without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const users = { botanist: crypto.randomUUID(), officer: crypto.randomUUID(), admin: crypto.randomUUID() };
const roleOf = { botanist: 'botanist', officer: 'officer', admin: 'admin' };
const verify = async (who) => ({ sub: users[who], user_role: roleOf[who] });
const app = createApp({ verify });
const as = (who) => ({ Authorization: `Bearer ${who}` });

let plants, rpcCalls;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setPlantPublished({ p_specimen_id, p_published, p_reason }, caller) {
  if (!['officer', 'admin'].includes(caller.role)) return json(403, { code: '42501', message: 'Only officers and admins can unpublish or publish a plant' });
  if (!p_published && !p_reason?.trim()) return json(400, { code: 'CTRQ0', message: 'A reason is required to unpublish a plant' });
  const p = plants.find((x) => x.id === p_specimen_id && !x.is_deleted);
  if (!p) return json(400, { code: 'CTNF0', message: 'Plant not found' });
  if (p.is_withdrawn === !p_published) return json(400, { code: 'CTST0', message: `Plant is already ${p_published ? 'published' : 'unpublished'}` });
  Object.assign(p, {
    is_withdrawn: !p_published,
    withdrawn_reason: p_published ? null : p_reason.trim(),
    withdrawn_by: p_published ? null : caller.id,
    withdrawn_at: p_published ? null : new Date().toISOString(),
  });
  return json(200, p);
}

beforeEach((t) => {
  plants = [{ id: crypto.randomUUID(), qr_id: 'KSC-0001', registered_by: users.botanist, is_deleted: false,
    is_withdrawn: false, withdrawn_reason: null, withdrawn_by: null, withdrawn_at: null }];
  rpcCalls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input);
    const bearer = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '');
    if (url.pathname === '/rest/v1/rpc/set_plant_published') {
      const args = JSON.parse(init.body);
      rpcCalls.push(args);
      return setPlantPublished(args, { id: users[bearer], role: roleOf[bearer] });
    }
    return json(200, []); // the visit lookup for the push
  });
});

const publish = (who, id, body) => request(app).post(`/v1/specimens/${id}/publish`).set(as(who)).send(body);

test('officer unpublishes a plant with a reason: who, why and when are saved', async () => {
  const res = await publish('officer', plants[0].id, { is_published: false, reason: '  Wrong species on the tag ' });
  assert.equal(res.status, 200);
  assert.equal(res.body.is_withdrawn, true);
  assert.equal(res.body.withdrawn_reason, 'Wrong species on the tag');
  assert.equal(res.body.withdrawn_by, users.officer);
  assert.ok(res.body.withdrawn_at);
  assert.deepEqual(rpcCalls[0], { p_specimen_id: plants[0].id, p_published: false, p_reason: 'Wrong species on the tag' });
});

test('admin can publish it again, which clears the reason', async () => {
  await publish('officer', plants[0].id, { is_published: false, reason: 'Check the photos' });
  const res = await publish('admin', plants[0].id, { is_published: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.is_withdrawn, false);
  assert.equal(res.body.withdrawn_reason, null);
});

test('unpublishing needs a reason, checked before the database', async () => {
  for (const body of [{ is_published: false }, { is_published: false, reason: '   ' }]) {
    const res = await publish('officer', plants[0].id, body);
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  }
  assert.equal(rpcCalls.length, 0);
});

test('a botanist cannot unpublish a plant, even their own', async () => {
  const res = await publish('botanist', plants[0].id, { is_published: false, reason: 'mine' });
  assert.equal(res.status, 403);
  assert.equal(plants[0].is_withdrawn, false);
  assert.equal(rpcCalls.length, 0);
});

test('doing it twice answers WRONG_STATUS', async () => {
  await publish('officer', plants[0].id, { is_published: false, reason: 'one' });
  const twice = await publish('admin', plants[0].id, { is_published: false, reason: 'two' });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.code, 'WRONG_STATUS');
  assert.equal(plants[0].withdrawn_reason, 'one');
});

test('unknown plant is 404; unknown fields are refused', async () => {
  assert.equal((await publish('officer', crypto.randomUUID(), { is_published: true })).status, 404);
  assert.equal((await publish('officer', 'not-a-uuid', { is_published: true })).status, 404);
  const extra = await publish('officer', plants[0].id, { is_published: false, reason: 'x', withdrawn_by: users.botanist });
  assert.equal(extra.status, 422);
});

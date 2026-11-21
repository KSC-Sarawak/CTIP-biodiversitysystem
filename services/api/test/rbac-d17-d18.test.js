import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { routes } from '../src/permissions.js';

// RBAC D17 and D18 (RBAC.md, 21 Nov 2026).
// D17: only officers unpublish a tagged plant (reason required) or publish it
//      again, and publishing again waits until no review is open.
// D18: while a plant is unpublished, an officer can send its approved
//      observation back to the botanist (a 'return' review).
// A fake Supabase plays public.set_plant_published() and
// public.review_observation() with the same checks and error codes as
// migration 20261121120000, so the tests run without the internet.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const users = { botanist: crypto.randomUUID(), officer: crypto.randomUUID(), admin: crypto.randomUUID() };
const verify = async (who) => {
  if (!users[who]) throw new Error('bad token');
  return { sub: users[who], user_role: who, aal: 'aal2' };
};
const app = createApp({ verify });
const as = (who) => ({ Authorization: `Bearer ${who}` });
const rolesOf = (method, path) => routes.find(([m, p]) => m === method && p === path)?.[2];

let plant, observations, rpcCalls;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const dbError = (code, message) => json(400, { code, message });

function setPlantPublished({ p_specimen_id, p_published, p_reason }, role, uid) {
  if (role !== 'officer') return dbError('42501', 'Only officers can unpublish or publish a plant');
  if (!p_published && !p_reason?.trim()) return dbError('CTRQ0', 'A reason is required to unpublish a plant');
  if (p_specimen_id !== plant.id || plant.is_deleted) return dbError('CTNF0', 'Plant not found');
  if (plant.is_withdrawn === !p_published) return dbError('CTST0', `Plant is already ${p_published ? 'published' : 'unpublished'}`);
  if (p_published) {
    if (observations.some((o) => ['synced', 'returned'].includes(o.status))) {
      return dbError('CTST1', 'An observation of this plant is still in review or with the botanist. Finish the review before publishing.');
    }
    if (!observations.some((o) => o.status === 'approved')) return dbError('CTST2', 'This plant has no approved observation to publish.');
  }
  Object.assign(plant, {
    is_withdrawn: !p_published,
    withdrawn_reason: p_published ? null : p_reason.trim(),
    withdrawn_by: p_published ? null : uid,
    withdrawn_at: p_published ? null : new Date().toISOString(),
  });
  return json(200, plant);
}

function reviewObservation({ p_obs_id, p_version, p_decision, p_comment }, role, uid) {
  if (role !== 'officer') return dbError('42501', 'Only officers can review observations');
  if (p_decision !== 'approve' && !p_comment?.trim()) return dbError('CTRQ0', 'A reason is required');
  const o = observations.find((x) => x.id === p_obs_id);
  if (!o) return dbError('CTNF0', 'Observation not found');
  const sendBack = o.status === 'approved' && p_decision === 'return' && plant.is_withdrawn;
  if (o.status !== 'synced' && !sendBack) return dbError('CTST0', `Observation is ${o.status}, not waiting for review`);
  if (o.version !== p_version) return dbError('CTVR0', 'Observation changed');
  o.status = { approve: 'approved', return: 'returned', reject: 'rejected' }[p_decision];
  return json(200, { id: crypto.randomUUID(), observation_id: o.id, reviewer_id: uid, decision: p_decision, comment: p_comment });
}

beforeEach((t) => {
  plant = { id: crypto.randomUUID(), qr_id: 'NIAH-0031', registered_by: users.botanist, is_deleted: false,
    is_withdrawn: false, withdrawn_reason: null, withdrawn_by: null, withdrawn_at: null };
  observations = [{ id: crypto.randomUUID(), specimen_id: plant.id, recorded_by: users.botanist, status: 'approved', version: 1 }];
  rpcCalls = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const who = new Headers(init.headers).get('Authorization')?.replace('Bearer ', '');
    const uid = users[who];
    if (url.pathname === '/rest/v1/rpc/set_plant_published') {
      const args = JSON.parse(init.body);
      rpcCalls.push(args);
      return setPlantPublished(args, who, uid);
    }
    if (url.pathname === '/rest/v1/rpc/review_observation') return reviewObservation(JSON.parse(init.body), who, uid);
    return json(200, url.pathname.endsWith('/observations') ? observations : []);
  });
});

const publish = (who, body, id = plant.id) => request(app).post(`/v1/specimens/${id}/publish`).set(as(who)).send(body);
const review = (who, obs, decision, comment) =>
  request(app).post(`/v1/observations/${obs.id}/reviews`).set(as(who))
    .send({ decision, observation_version: obs.version, ...(comment ? { comment } : {}) });

test('D17: only officers may unpublish or publish a tagged plant', () => {
  assert.deepEqual(rolesOf('post', '/specimens/:id/publish'), ['officer']);
});

test('D17: an officer unpublishes with a reason; who, why and when are saved', async () => {
  const res = await publish('officer', { is_published: false, reason: '  Wrong species on the tag ' });
  assert.equal(res.status, 200);
  assert.equal(res.body.is_withdrawn, true);
  assert.equal(res.body.withdrawn_reason, 'Wrong species on the tag');
  assert.equal(res.body.withdrawn_by, users.officer);
  assert.deepEqual(rpcCalls[0], { p_specimen_id: plant.id, p_published: false, p_reason: 'Wrong species on the tag' });
});

test('D17: botanists and admins get 403, before the database is asked', async () => {
  for (const who of ['botanist', 'admin']) {
    const res = await publish(who, { is_published: false, reason: 'no' });
    assert.equal(res.status, 403, who);
  }
  assert.equal(rpcCalls.length, 0);
  assert.equal(plant.is_withdrawn, false);
});

test('D17: unpublishing needs a reason; unknown fields are refused', async () => {
  for (const body of [{ is_published: false }, { is_published: false, reason: '   ' }, { is_published: false, reason: 'x', withdrawn_by: users.botanist }]) {
    const res = await publish('officer', body);
    assert.equal(res.status, 422);
  }
  assert.equal(rpcCalls.length, 0);
});

test('D17: doing it twice is WRONG_STATUS; unknown plant is 404', async () => {
  await publish('officer', { is_published: false, reason: 'one' });
  const twice = await publish('officer', { is_published: false, reason: 'two' });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.code, 'WRONG_STATUS');
  assert.equal(plant.withdrawn_reason, 'one');
  assert.equal((await publish('officer', { is_published: true }, crypto.randomUUID())).status, 404);
  assert.equal((await publish('officer', { is_published: true }, 'not-a-uuid')).status, 404);
});

test('D18: a published plant\'s approved observation cannot be sent back', async () => {
  const res = await review('officer', observations[0], 'return', 'Check the leaves');
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'WRONG_STATUS');
  assert.equal(observations[0].status, 'approved');
});

test('D18: full cycle — unpublish, send back, resend, approve, then publish again by hand', async () => {
  const [obs] = observations;
  assert.equal((await publish('officer', { is_published: false, reason: 'Wrong species' })).status, 200);

  // Sent back: the approved observation becomes returned.
  const back = await review('officer', obs, 'return', 'Please retake the leaf photo');
  assert.equal(back.status, 201);
  assert.equal(obs.status, 'returned');

  // With the botanist: publishing again is refused.
  let again = await publish('officer', { is_published: true });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'REVIEW_IN_PROGRESS');

  // The botanist resends (synced): still refused until it is decided.
  obs.status = 'synced';
  obs.version = 2;
  again = await publish('officer', { is_published: true });
  assert.equal(again.body.code, 'REVIEW_IN_PROGRESS');

  // Approving does not publish the plant by itself.
  assert.equal((await review('officer', obs, 'approve')).status, 201);
  assert.equal(obs.status, 'approved');
  assert.equal(plant.is_withdrawn, true);

  // The officer publishes again on purpose.
  again = await publish('officer', { is_published: true });
  assert.equal(again.status, 200);
  assert.equal(plant.is_withdrawn, false);
  assert.equal(plant.withdrawn_reason, null);
});

test('D18: sending back needs a reason, and only officers can do it', async () => {
  await publish('officer', { is_published: false, reason: 'Wrong species' });
  assert.equal((await review('officer', observations[0], 'return')).status, 422);
  assert.equal((await review('admin', observations[0], 'return', 'x')).status, 403);
  assert.equal((await review('botanist', observations[0], 'return', 'x')).status, 403);
  assert.equal(observations[0].status, 'approved');
});

test('D17: a plant with nothing approved cannot be published again', async () => {
  await publish('officer', { is_published: false, reason: 'Wrong species' });
  observations[0].status = 'rejected';
  const res = await publish('officer', { is_published: true });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'NOTHING_APPROVED');
});

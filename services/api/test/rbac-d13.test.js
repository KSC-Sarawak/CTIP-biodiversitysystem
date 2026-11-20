import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { routes } from '../src/permissions.js';

// RBAC D13 (RBAC.md, 19 Nov 2026): only officers move a tagged plant to a new
// QR tag, and only after the old tag is marked retired or damaged. A fake
// Supabase answers, so no internet is needed. The database side is
// guard_specimen_update() (migration 20261120080000) and the tag trigger.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const ids = { admin: crypto.randomUUID(), officer: crypto.randomUUID(), botanist: crypto.randomUUID() };
const verify = async (who) => {
  if (!ids[who]) throw new Error('bad token');
  return { sub: ids[who], user_role: who, aal: 'aal2' };
};
const app = createApp({ verify });
const as = (who) => ({ Authorization: `Bearer ${who}` });
const PLANT = crypto.randomUUID();

let profiles;
let specimens;
let tags;
let writes;
const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// What the database does on a tag change: the guard and the tag trigger.
function moveTag(plant, qrId) {
  const old = tags.find((t) => t.qr_id === plant.qr_id);
  if (!['retired', 'damaged'].includes(old?.status)) return json(400, { code: 'CTTG2', message: 'Mark the old tag first' });
  const tag = tags.find((t) => t.qr_id === qrId);
  if (!tag) return json(409, { code: '23503', message: 'foreign key' });
  if (['retired', 'damaged'].includes(tag.status)) return json(400, { code: 'CTTG0', message: 'retired' });
  if (specimens.some((s) => s.qr_id === qrId)) return json(409, { code: '23505', message: 'duplicate key' });
  plant.qr_id = qrId;
  tag.status = 'assigned';
  return null;
}

beforeEach((t) => {
  writes = [];
  profiles = Object.entries(ids).map(([role, id]) => ({ id, role, is_active: true, deleted_at: null }));
  specimens = [
    { id: PLANT, qr_id: 'NIAH-0001', registered_by: ids.botanist, is_deleted: false },
    { id: crypto.randomUUID(), qr_id: 'NIAH-0002', registered_by: ids.botanist, is_deleted: false },
  ];
  tags = [
    { qr_id: 'NIAH-0001', status: 'assigned' },
    { qr_id: 'NIAH-0002', status: 'assigned' },
    { qr_id: 'NIAH-0003', status: 'unassigned' },
    { qr_id: 'NIAH-0004', status: 'retired' },
  ];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = init.method ?? 'GET';
    const table = url.pathname.replace('/rest/v1/', '');
    const rows = { profiles, specimens, qr_tags: tags }[table] ?? [];
    const single = /vnd\.pgrst\.object/.test(new Headers(init.headers).get('Accept') ?? '');
    const filters = [...url.searchParams].filter(([k]) => !['select', 'limit', 'order'].includes(k));
    const hit = rows.filter((r) => filters.every(([k, v]) => `${r[k]}` === v.replace(/^eq\./, '')));
    if (method === 'PATCH') {
      const body = JSON.parse(init.body);
      writes.push({ table, body });
      if (table === 'specimens' && body.qr_id) {
        const refused = moveTag(hit[0], body.qr_id);
        if (refused) return refused;
      } else for (const r of hit) Object.assign(r, body);
    }
    if (single) return hit.length ? json(200, hit[0]) : json(406, { code: 'PGRST116', message: 'no rows' });
    return json(200, hit);
  });
});

const retag = (body, who = 'officer', id = PLANT) => request(app).post(`/v1/specimens/${id}/retag`).set(as(who)).send(body);

test('D13: only officers may re-tag', () => {
  assert.deepEqual(routes.find(([m, p]) => m === 'post' && p === '/specimens/:id/retag')?.[2], ['officer']);
});

test('an officer re-tags: the old tag is marked first, then the plant moves', async () => {
  const res = await retag({ qr_id: 'niah-0003', old_tag: 'damaged' });
  assert.equal(res.status, 200);
  assert.equal(res.body.qr_id, 'NIAH-0003');
  assert.deepEqual(writes, [
    { table: 'qr_tags', body: { status: 'damaged' } },
    { table: 'specimens', body: { qr_id: 'NIAH-0003' } },
  ]);
  assert.equal(tags.find((t) => t.qr_id === 'NIAH-0001').status, 'damaged');
  assert.equal(specimens[0].id, PLANT, 'the same plant, only the tag changed');
});

test('the old tag must be marked retired or damaged, nothing else', async () => {
  const res = await retag({ qr_id: 'NIAH-0003', old_tag: 'unassigned' });
  assert.equal(res.status, 422);
  assert.equal((await retag({ qr_id: 'NIAH-0003' })).status, 422);
  assert.equal(writes.length, 0);
});

test('a taken, retired or unknown new tag, or the same tag, is refused', async () => {
  const taken = await retag({ qr_id: 'NIAH-0002', old_tag: 'retired' });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.code, 'TAG_IN_USE');
  const retired = await retag({ qr_id: 'NIAH-0004', old_tag: 'retired' });
  assert.equal(retired.body.code, 'TAG_RETIRED');
  const unknown = await retag({ qr_id: 'NIAH-9999', old_tag: 'retired' });
  assert.equal(unknown.status, 422);
  assert.equal(unknown.body.code, 'TAG_NOT_FOUND');
  const same = await retag({ qr_id: 'NIAH-0001', old_tag: 'retired' });
  assert.equal(same.body.code, 'SAME_TAG');
  assert.equal(specimens[0].qr_id, 'NIAH-0001');
});

test('botanists and admins get 403; an unknown plant 404', async () => {
  for (const who of ['botanist', 'admin']) assert.equal((await retag({ qr_id: 'NIAH-0003', old_tag: 'retired' }, who)).status, 403, who);
  assert.equal(writes.length, 0);
  assert.equal((await retag({ qr_id: 'NIAH-0003', old_tag: 'retired' }, 'officer', crypto.randomUUID())).status, 404);
});

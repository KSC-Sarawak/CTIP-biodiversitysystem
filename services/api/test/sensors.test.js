import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// POST /telemetry and POST /sensor-nodes/:id/images: the IoT gateway's routes.
// A fake Supabase records what the API writes, and which key it used.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.SENSOR_KEY = 'right-sensor-key';

const app = createApp({ verify: async () => { throw new Error('no person tokens here'); } });
const KEY = { 'X-Sensor-Key': 'right-sensor-key' };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

let db; let stored; let keysUsed;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function fakeSupabase(input, init = {}) {
  const url = new URL(input);
  const method = init.method ?? 'GET';
  keysUsed.add(new Headers(init.headers).get('apikey'));
  if (url.pathname.startsWith('/storage/v1/object/sensor-images/') && method === 'POST') {
    stored.push(decodeURIComponent(url.pathname.replace('/storage/v1/object/sensor-images/', '')));
    return json(200, { Key: 'x' });
  }
  if (url.pathname === '/storage/v1/object/sensor-images' && method === 'DELETE') return json(200, []);
  const table = url.pathname.replace('/rest/v1/', '');
  const id = url.searchParams.get('id')?.replace('eq.', '');
  if (method === 'POST') {
    const list = [].concat(JSON.parse(init.body));
    const rows = list.map((r) => ({ id: crypto.randomUUID(), alert_id: null, created_at: new Date().toISOString(), ...r }));
    db[table].push(...rows);
    return json(201, new Headers(init.headers).get('Accept') === 'application/vnd.pgrst.object+json' ? rows[0] : rows);
  }
  if (method === 'PATCH') {
    db[table].filter((r) => r.id === id).forEach((r) => Object.assign(r, JSON.parse(init.body)));
    return json(200, []);
  }
  const rows = db[table].filter((r) => !id || r.id === id);
  return json(200, rows); // maybeSingle: supabase-js picks the first or null
}

const node = crypto.randomUUID();
beforeEach((t) => {
  db = { sensor_nodes: [{ id: node, status: 'active', last_seen: null }], telemetry: [], sensor_images: [] };
  stored = []; keysUsed = new Set();
  t.mock.method(globalThis, 'fetch', fakeSupabase);
});

const ts = '2026-11-01T08:00:00Z';

test('telemetry: a right key stores the readings (202) with the secret key and updates last_seen', async () => {
  const res = await request(app).post('/v1/telemetry').set(KEY)
    .send({ node_id: node, readings: [{ ts, temperature: 28.5, humidity: 80, soil_moisture: 40, distance_cm: 12, motion_detected: false }] });
  assert.equal(res.status, 202);
  assert.equal(db.telemetry.length, 1);
  assert.equal(db.telemetry[0].node_id, node);
  assert.equal(db.sensor_nodes[0].last_seen, new Date(ts).toISOString());
  assert.deepEqual([...keysUsed], ['sb_secret_test']);
});

test('telemetry: no key or a wrong key is 401 and nothing is stored', async () => {
  const body = { node_id: node, readings: [{ ts }] };
  assert.equal((await request(app).post('/v1/telemetry').send(body)).status, 401);
  assert.equal((await request(app).post('/v1/telemetry').set('X-Sensor-Key', 'guess').send(body)).status, 401);
  assert.equal(db.telemetry.length, 0);
});

test('telemetry: a bad reading is 422, an unknown or retired node 404', async () => {
  const send = (body) => request(app).post('/v1/telemetry').set(KEY).send(body);
  assert.equal((await send({ node_id: node, readings: [] })).status, 422);
  assert.equal((await send({ node_id: node, readings: [{ temperature: 30 }] })).status, 422); // no ts
  assert.equal((await send({ node_id: node, readings: [{ ts, humidity: 150 }] })).status, 422);
  assert.equal((await send({ node_id: node, readings: [{ ts, is_admin: true }] })).status, 422); // unknown field
  assert.equal((await send({ node_id: 'not-a-uuid', readings: [{ ts }] })).status, 422);
  assert.equal((await send({ node_id: crypto.randomUUID(), readings: [{ ts }] })).status, 404);
  db.sensor_nodes[0].status = 'retired';
  assert.equal((await send({ node_id: node, readings: [{ ts }] })).status, 404);
  assert.equal(db.telemetry.length, 0);
});

test('image: a JPEG with the right key is stored (201) under <node_id>/<id>.jpg', async () => {
  const res = await request(app).post(`/v1/sensor-nodes/${node}/images`).set(KEY)
    .set('Content-Type', 'image/jpeg').set('X-Captured-At', ts).send(JPEG);
  assert.equal(res.status, 201);
  assert.equal(res.body.node_id, node);
  assert.equal(res.body.s3_key, `${node}/${res.body.id}.jpg`);
  assert.equal(res.body.size_bytes, JPEG.length);
  assert.equal(res.body.captured_at, ts);
  assert.deepEqual(stored, [res.body.s3_key]);
});

test('image: no key 401, not a JPEG 415, too big 413, unknown node 404', async () => {
  const up = (id = node) => request(app).post(`/v1/sensor-nodes/${id}/images`);
  assert.equal((await up().set('Content-Type', 'image/jpeg').send(JPEG)).status, 401);
  assert.equal((await up().set(KEY).set('Content-Type', 'image/jpeg').send(Buffer.from('<?php echo 1; ?>'))).status, 415);
  assert.equal((await up().set(KEY).set('Content-Type', 'image/png').send(JPEG)).status, 415);
  const big = Buffer.concat([JPEG, Buffer.alloc(2097152)]);
  assert.equal((await up().set(KEY).set('Content-Type', 'image/jpeg').send(big)).status, 413);
  assert.equal((await up(crypto.randomUUID()).set(KEY).set('Content-Type', 'image/jpeg').send(JPEG)).status, 404);
  assert.equal((await up().set(KEY).set('Content-Type', 'image/jpeg').query({ captured_at: 'yesterday' }).send(JPEG)).status, 422);
  assert.deepEqual(stored, []);
});

test('sensor routes are off (503) when the server has no SENSOR_KEY', async () => {
  const saved = process.env.SENSOR_KEY;
  delete process.env.SENSOR_KEY;
  try {
    assert.equal((await request(app).post('/v1/telemetry').set(KEY).send({ node_id: node, readings: [{ ts }] })).status, 503);
  } finally { process.env.SENSOR_KEY = saved; }
});

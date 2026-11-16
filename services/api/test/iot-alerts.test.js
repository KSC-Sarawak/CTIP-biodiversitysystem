import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { checkSilentNodesSoon, pushAlerts, resetSilentClock, silentMinutes, SILENT_CHECK_EVERY_MS } from '../src/alertWatch.js';
import { supabaseService } from '../src/supabase.js';

// Automated IoT alerts (CTIP-76, CTIP-77): the database raises the alerts and
// writes the in-app notifications (following the routing); the API pushes the
// same words to phones and runs the silent check. A fake Supabase and a fake
// Expo record what the API asks for and sends.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
process.env.SENSOR_KEY = 'right-sensor-key';

const app = createApp({ verify: async () => { throw new Error('no person tokens here'); } });
const KEY = { 'X-Sensor-Key': 'right-sensor-key' };
const node = crypto.randomUUID();
const officer = crypto.randomUUID();
const admin = crypto.randomUUID();

let db; let pushed; let rpcCalls; let silentAnswer;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function matches(url) {
  const filters = [...url.searchParams].filter(([k]) => !['select', 'order', 'limit'].includes(k));
  return (row) => filters.every(([k, v]) => {
    const [op, ...rest] = v.split('.');
    const want = rest.join('.');
    if (op === 'eq') return `${row[k]}` === want;
    if (op === 'gte') return `${row[k]}` >= want;
    if (op === 'in') return want.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/"/g, '')).includes(`${row[k]}`);
    return true;
  });
}

async function fake(input, init = {}) {
  const url = new URL(input);
  const method = init.method ?? 'GET';
  if (url.host === 'exp.host') {
    pushed.push(...JSON.parse(init.body));
    return json(200, { data: [] });
  }
  const table = url.pathname.replace('/rest/v1/', '');
  if (table === 'rpc/raise_silent_node_alerts') {
    rpcCalls.push(JSON.parse(init.body));
    return json(200, silentAnswer);
  }
  if (method === 'POST') {
    const rows = [].concat(JSON.parse(init.body)).map((r) => ({ id: crypto.randomUUID(), ...r }));
    db[table].push(...rows);
    // What the database triggers do with a reading outside the stable range.
    if (table === 'telemetry' && rows.some((r) => r.soil_moisture < 20)) raiseAlert('Soil moisture too low', 'Node 1a2b: Soil Moisture 12 · Stable Range 20.0 to 80.0 %');
    return json(201, rows);
  }
  if (method === 'PATCH') return json(200, []);
  return json(200, db[table].filter(matches(url)));
}

// An alert and the in-app notifications the database trigger would write:
// the routing sent it to the officer only.
function raiseAlert(type, body) {
  const id = crypto.randomUUID();
  db.alerts.push({ id, node_id: node, type, created_at: new Date().toISOString() });
  db.notifications.push({ user_id: officer, type: 'alert_created', related_table: 'alerts', related_id: id, title: `New alert: ${type}`, body });
  return id;
}

beforeEach((t) => {
  db = {
    sensor_nodes: [{ id: node, status: 'active', last_seen: null }],
    telemetry: [], alerts: [], notifications: [],
    user_push_tokens: [
      { user_id: officer, token: 'ExponentPushToken[officer-phone]' },
      { user_id: admin, token: 'ExponentPushToken[admin-phone]' },
      { user_id: officer, token: 'not-a-push-token' },
    ],
  };
  pushed = []; rpcCalls = []; silentAnswer = [];
  resetSilentClock();
  t.mock.method(globalThis, 'fetch', fake);
});

test('a reading outside the stable range: the officer told in the app gets the same words as a push', async () => {
  const res = await request(app).post('/v1/telemetry').set(KEY)
    .send({ node_id: node, readings: [{ ts: new Date().toISOString(), soil_moisture: 12, lat: 3.812345, lng: 113.781234 }] });
  assert.equal(res.status, 202);
  assert.equal(pushed.length, 1); // the officer's phone only: routing, and only real Expo tokens
  const [msg] = pushed;
  assert.equal(msg.to, 'ExponentPushToken[officer-phone]');
  assert.equal(msg.title, 'New alert: Soil moisture too low');
  assert.equal(msg.channelId, 'alerts');
  assert.deepEqual(msg.data, { type: 'alert', alertId: db.alerts[0].id });
  assert.ok(!JSON.stringify(msg).includes('3.81') && !JSON.stringify(msg).includes('113.78'), 'no coordinate in a push');
});

test('readings that raise nothing send no push', async () => {
  const res = await request(app).post('/v1/telemetry').set(KEY)
    .send({ node_id: node, readings: [{ ts: new Date().toISOString(), soil_moisture: 50 }] });
  assert.equal(res.status, 202);
  assert.deepEqual(pushed, []);
});

test('telemetry also runs the silent check, at most once a minute', async () => {
  const send = () => request(app).post('/v1/telemetry').set(KEY).send({ node_id: node, readings: [{ ts: new Date().toISOString() }] });
  await send();
  await send();
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(rpcCalls[0], { p_minutes: 15 });
});

test('silent check: new "Node silent" alerts are pushed; a failing check never throws', async () => {
  const id = raiseAlert('Node silent', 'Node 1a2b: Silent For 40 min');
  silentAnswer = [{ alert_id: id, node_id: node }];
  const db1 = supabaseService();
  const now = Date.now();
  assert.deepEqual(await checkSilentNodesSoon({ db: db1, now }), [id]);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].body, 'Node 1a2b: Silent For 40 min');
  assert.deepEqual(await checkSilentNodesSoon({ db: db1, now: now + 1000 }), []); // within the minute
  assert.equal(rpcCalls.length, 1);

  const broken = { rpc: async () => { throw new Error('down'); } };
  assert.deepEqual(await checkSilentNodesSoon({ db: broken, now: now + SILENT_CHECK_EVERY_MS }), []);
});

test('pushAlerts: nothing to send for no alerts or no client', async () => {
  assert.equal(await pushAlerts(supabaseService(), []), 0);
  assert.equal(await pushAlerts(null, ['x']), 0);
  assert.deepEqual(pushed, []);
});

test('NODE_SILENT_MINUTES: 1 to 1440, else 15', () => {
  assert.equal(silentMinutes({}), 15);
  assert.equal(silentMinutes({ NODE_SILENT_MINUTES: '30' }), 30);
  assert.equal(silentMinutes({ NODE_SILENT_MINUTES: '0' }), 15);
  assert.equal(silentMinutes({ NODE_SILENT_MINUTES: '2000' }), 15);
  assert.equal(silentMinutes({ NODE_SILENT_MINUTES: 'soon' }), 15);
});

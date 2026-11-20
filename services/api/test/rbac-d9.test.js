import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { protectSpecimen } from '../src/distribution.js';

// RBAC D9: visitors do not see a location-protected plant on the map at all.
// The visitor workspace (GET /public/workspace) must send such a plant with no
// coordinates, even if the database function public_plants() sent some.
// A fake Supabase answers the species table and the two public functions.
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const COMMON = '11111111-1111-4111-8111-111111111111';
const RAJAH = '22222222-2222-4222-8222-222222222222';
const EXACT = { lat: 3.81234, lng: 113.78123, gps_accuracy_m: 4 };

const species = [
  { id: COMMON, scientific_name: 'Shorea macrophylla', conservation_status: 'least concern', is_published: true },
  { id: RAJAH, scientific_name: 'Nepenthes rajah', conservation_status: 'Endangered', is_published: true },
];
const row = (id, qr_id, species_id, fields = {}) => ({
  id, qr_id, species_id, ...EXACT, endangered_override: false, is_deleted: false,
  observation_id: crypto.randomUUID(), height_cm: '120', morphology: null, observed_at: '2026-11-01T00:00:00Z', ...fields,
});
// What public_plants() returns. It "forgot" to remove the protected spots, so
// this checks the API on its own.
let publicPlants;

beforeEach((t) => {
  publicPlants = [
    row('aaaaaaaa-0000-4000-8000-000000000001', 'NIAH-0001', COMMON),
    row('aaaaaaaa-0000-4000-8000-000000000002', 'NIAH-0002', RAJAH),
    row('aaaaaaaa-0000-4000-8000-000000000003', 'NIAH-0003', COMMON, { endangered_override: true }),
  ];
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    let body = [];
    if (url.pathname.endsWith('/rpc/public_plants')) body = publicPlants;
    else if (url.pathname.endsWith('/species')) body = species;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
});

const app = createApp({ verify: async () => { throw new Error('no token needed'); } });
const byTag = async () => {
  const res = await request(app).get('/v1/public/workspace');
  assert.equal(res.status, 200);
  return Object.fromEntries(res.body.specimens.map((s) => [s.qr_id, s]));
};

test('visitor workspace: an ordinary plant keeps its exact location', async () => {
  const p = (await byTag())['NIAH-0001'];
  assert.equal(p.lat, EXACT.lat);
  assert.equal(p.lng, EXACT.lng);
  assert.equal(p.location_reduced, false);
});

test('visitor workspace: an endangered plant has no coordinates, not a rough area', async () => {
  const p = (await byTag())['NIAH-0002'];
  assert.deepEqual([p.lat, p.lng, p.gps_accuracy_m, p.location_reduced], [null, null, null, true]);
});

test('visitor workspace: a hidden plant (hide-location flag) has no coordinates', async () => {
  const p = (await byTag())['NIAH-0003'];
  assert.deepEqual([p.lat, p.lng, p.location_reduced], [null, null, true]);
});

test('protectSpecimen: no role means no coordinates for a protected plant', () => {
  const plant = { id: 'x', species_id: RAJAH, ...EXACT, endangered_override: false };
  const shown = protectSpecimen(plant, { role: null, userId: null, status: 'endangered' });
  assert.deepEqual([shown.lat, shown.lng, shown.location_reduced], [null, null, true]);
  // A species the visitor cannot see is treated as protected (fails closed).
  const unknown = protectSpecimen(plant, { role: null, userId: null, status: undefined });
  assert.deepEqual([unknown.lat, unknown.lng], [null, null]);
});

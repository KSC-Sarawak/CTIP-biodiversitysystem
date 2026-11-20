// RBAC D2, D5 and D6 (RBAC.md, 19 Nov 2026): admins run the system and only
// view data. Review, species changes, reports and printing or retiring tags
// are for officers. Admins keep read access to species (D6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routes } from '../src/permissions.js';

const rolesOf = (method, path) => routes.find(([m, p]) => m === method && p === path)?.[2];

const OFFICER_ONLY = [
  ['post', '/observations/:id/reviews'],
  ['post', '/species'], ['patch', '/species/:id'], ['delete', '/species/:id'],
  ['post', '/species/:id/publish'], ['post', '/species/:id/restore'],
  ['post', '/species/:id/media'], ['patch', '/species/:id/media/:mediaId'], ['delete', '/species/:id/media/:mediaId'],
  ['get', '/reports/observations'], ['get', '/reports/species'],
  ['post', '/qr-tags/:qrId/retire'],
];

test('D2: data work is officer only', () => {
  for (const [m, p] of OFFICER_ONLY) assert.deepEqual(rolesOf(m, p), ['officer'], `${m} ${p}`);
});

test('D5: tags are made by botanists and officers, never admins', () => {
  for (const [m, p] of [['post', '/qr-tags/batch'], ['delete', '/qr-tags/:qrId']]) {
    assert.deepEqual(rolesOf(m, p), ['botanist', 'officer'], `${m} ${p}`);
  }
});

test('D6: admins can still read species', () => {
  for (const p of ['/species', '/species/:id', '/species/:id/media']) assert.ok(rolesOf('get', p).includes('admin'), p);
});

test('D15: officers and admins can call the plant update (admins only for the hide flag)', () => {
  assert.ok(rolesOf('patch', '/specimens/:id').includes('admin'));
});

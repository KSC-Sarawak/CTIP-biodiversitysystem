// RBAC D1 (RBAC.md, 19 Nov 2026): only botanists register tagged
// plants, create observations and add observation photos. Officers and admins
// get 403 from the API (the database refuses them too, migration
// 20261119120000_rbac_d1_botanist_only_create.sql).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routes } from '../src/permissions.js';

const CREATE_ROUTES = [
  ['post', '/specimens'],
  ['post', '/observations'],
  ['post', '/observations/:id/photos'],
  ['post', '/observations/:id/photos/:photoId/confirm'],
  ['post', '/sync'],
];

test('D1: creating plants, observations and photos is for botanists only', () => {
  for (const [method, path] of CREATE_ROUTES) {
    const row = routes.find(([m, p]) => m === method && p === path);
    assert.ok(row, `${method} ${path} is listed`);
    assert.deepEqual(row[2], ['botanist'], `${method} ${path} allows botanists only`);
  }
});

test('D1: reviewing stays with officers and admins (D2 narrows it later)', () => {
  const row = routes.find(([m, p]) => m === 'post' && p === '/observations/:id/reviews');
  assert.ok(!row[2].includes('botanist'));
});

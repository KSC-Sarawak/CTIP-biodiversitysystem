// apps/mobile/tests/survey-route.test.mjs
// Quick survey mode (CTIP-147) is a botanist tool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_NAMES, canAccess } from '../navigation/routeMeta.js';

test('only botanists can open the survey screen', () => {
  assert.ok(ROUTE_NAMES.includes('survey'));
  assert.equal(canAccess('botanist', 'survey'), true);
  for (const role of ['officer', 'admin', 'visitor']) assert.equal(canAccess(role, 'survey'), false);
});

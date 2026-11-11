// apps/mobile/tests/tabs.test.mjs
// The bottom bar (navigation/tabs.js): the number on a tab's badge, and the
// words on the raised centre button for each role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeText, getRoleTabs } from '../navigation/tabs.js';

test('badge text is capped at 99+', () => {
  assert.equal(badgeText(0), '');
  assert.equal(badgeText(7), '7');
  assert.equal(badgeText(99), '99');
  assert.equal(badgeText(100), '99+');
});

test('only botanists see "Add plant"; officers and admins cannot add plants', () => {
  const main = (role) => getRoleTabs(role).find((t) => t.main).label;
  assert.equal(main('botanist'), 'Add plant');
  assert.equal(main('officer'), 'Scan');
  assert.equal(main('admin'), 'Scan');
  assert.equal(main('visitor'), 'Scan');
});

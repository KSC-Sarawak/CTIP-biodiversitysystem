// apps/mobile/tests/navigation-stack.test.mjs
// The screen stack behind the navigator (navigation/stack.js): what a push, a
// replace, a back and a reset do, and which screens stay mounted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entry, resetTo, push, replaceTop, pop, mountedEntries, KEEP_MOUNTED } from '../navigation/stack.js';

test('every entry gets its own key', () => {
  assert.notEqual(entry('home').key, entry('home').key);
});

test('push adds on top and keeps earlier entries (same objects)', () => {
  const a = resetTo('records');
  const b = push(a, 'record', { id: 'o1' });
  assert.equal(b.length, 2);
  assert.equal(b[0], a[0]);
  assert.deepEqual(b[1].params, { id: 'o1' });
});

test('replaceTop keeps the key for the same screen, changes it for another', () => {
  const a = resetTo('plants');
  const same = replaceTop(a, 'plants', { view: 'tagged' });
  assert.equal(same[0].key, a[0].key);
  assert.deepEqual(same[0].params, { view: 'tagged' });
  assert.notEqual(replaceTop(a, 'tag', { qr: 'NIAH-0001' })[0].key, a[0].key);
});

test('pop removes the top, never the last entry', () => {
  const one = resetTo('home');
  assert.equal(pop(one), one);
  assert.equal(pop(push(one, 'about')).length, 1);
});

test('resetTo drops everything (sign-out, role change, tab switch)', () => {
  const deep = push(push(resetTo('review'), 'reviewItem'), 'tag');
  const fresh = resetTo('home');
  assert.equal(fresh.length, 1);
  assert.ok(!deep.some((e) => e.key === fresh[0].key));
});

test('only the newest KEEP_MOUNTED entries stay mounted', () => {
  let s = resetTo('home');
  for (let i = 0; i < 8; i += 1) s = push(s, 'species', { id: i });
  const kept = mountedEntries(s);
  assert.equal(KEEP_MOUNTED, 5);
  assert.equal(kept.length, 5);
  assert.equal(kept[4], s[s.length - 1]);
  assert.equal(mountedEntries(resetTo('home')).length, 1);
});

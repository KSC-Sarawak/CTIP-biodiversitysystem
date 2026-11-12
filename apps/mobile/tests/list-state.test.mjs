// apps/mobile/tests/list-state.test.mjs
// What a list with no rows shows (components/listState.js): still loading, no
// connection, or really empty. An empty list must never claim "nothing yet"
// before the API has answered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyKind } from '../components/listState.js';

test('a list with rows never shows an empty state', () => {
  for (const s of ['checking', 'connected', 'offline']) assert.equal(emptyKind(3, s), 'none');
});

test('no rows while the API has not answered yet is loading, not empty', () => {
  assert.equal(emptyKind(0, 'checking'), 'loading');
});

test('no rows with no connection says so', () => {
  assert.equal(emptyKind(0, 'offline'), 'offline');
});

test('no rows once connected is really empty', () => {
  assert.equal(emptyKind(0, 'connected'), 'empty');
});

test('a search or filter with no match is "no match", whatever the connection', () => {
  for (const s of ['checking', 'connected', 'offline']) assert.equal(emptyKind(0, s, true), 'empty');
});

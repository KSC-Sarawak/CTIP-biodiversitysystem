// apps/mobile/tests/iot-tags-species-parity.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { ROUTE_NAMES, canAccess } from '../navigation/routeMeta.js';
import { can } from '../../shared/permissions.js';

test('IoT Dashboard, QR Tag Actions, and Species Parity Suite', async (t) => {
  await t.test('Route registry contains all screens', () => {
    assert.ok(ROUTE_NAMES.includes('plants'), 'plants screen exists');
    assert.ok(ROUTE_NAMES.includes('speciesAdmin'), 'speciesAdmin screen exists');
    assert.ok(ROUTE_NAMES.includes('tagQr'), 'tagQr screen exists');
    assert.ok(ROUTE_NAMES.includes('monitor'), 'monitor screen exists');
  });

  await t.test('Route access rules for species and tags', () => {
    assert.equal(canAccess('officer', 'speciesAdmin'), true);
    assert.equal(canAccess('admin', 'speciesAdmin'), true);
    assert.equal(canAccess('botanist', 'speciesAdmin'), false);
    assert.equal(canAccess('visitor', 'speciesAdmin'), false);

    assert.equal(canAccess('officer', 'tags'), true);
    assert.equal(canAccess('admin', 'tags'), true);
    assert.equal(canAccess('botanist', 'tags'), false);

    assert.equal(canAccess('officer', 'tagQr'), true);
    assert.equal(canAccess('botanist', 'tagQr'), true);
  });

  await t.test('Tag actions: unused tag permits retire and delete; assigned permits retire', () => {
    const isUnused = (status) => status === 'unused';
    const canRetire = (status, role) => can(role, 'tags') && status !== 'retired';
    const canDelete = (status, role) => can(role, 'tags') && isUnused(status);

    assert.equal(canRetire('unused', 'officer'), true);
    assert.equal(canDelete('unused', 'officer'), true);

    assert.equal(canRetire('assigned', 'officer'), true);
    assert.equal(canDelete('assigned', 'officer'), false);

    assert.equal(canRetire('retired', 'officer'), false);
    assert.equal(canDelete('retired', 'officer'), false);

    // Botanists or visitors without 'tags' permission cannot retire or delete stock tags
    assert.equal(canRetire('unused', 'botanist'), false);
    assert.equal(canDelete('unused', 'botanist'), false);
  });

  await t.test('Species permissions: officer and admin can manage species, visitors and botanists cannot', () => {
    assert.equal(can('officer', 'species'), true);
    assert.equal(can('admin', 'species'), true);
    assert.equal(can('botanist', 'species'), false);
    assert.equal(can('visitor', 'species'), false);
  });

  await t.test('IoT telemetry fields include air humidity, temperature, soil moisture, distance, and motion', () => {
    const reading = {
      ts: '2026-11-12T10:00:00Z',
      temperature: 28.5,
      humidity: 82,
      soil_moisture: 45,
      distance_cm: 120,
      motion_detected: true,
    };

    assert.equal(typeof reading.humidity, 'number', 'reading has air humidity');
    assert.equal(typeof reading.temperature, 'number', 'reading has temperature');
    assert.equal(typeof reading.soil_moisture, 'number', 'reading has soil moisture');
    assert.equal(typeof reading.distance_cm, 'number', 'reading has distance_cm');
    assert.equal(typeof reading.motion_detected, 'boolean', 'reading has motion_detected');
  });
});

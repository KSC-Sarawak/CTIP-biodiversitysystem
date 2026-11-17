import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// F-12: the API must not say which server software it runs.
test('responses have no X-Powered-By header', async () => {
  const app = createApp({ verify: async () => ({}), handlers: {} });
  const res = await request(app).get('/v1/public/species');
  assert.equal(res.headers['x-powered-by'], undefined);
});
// VA-10 (ZAP, 16 Nov): nosniff and Cross-Origin-Resource-Policy on every answer,
// including errors and routes that do not exist.
test('responses say nosniff and same-origin resource policy', async () => {
  const app = createApp({ verify: async () => ({}), handlers: {} });
  for (const path of ['/v1/public/species', '/v1/health', '/v1/no-such-route']) {
    const res = await request(app).get(path);
    assert.equal(res.headers['x-content-type-options'], 'nosniff', path);
    assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin', path);
  }
});

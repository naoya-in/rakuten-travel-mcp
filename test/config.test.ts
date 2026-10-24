import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config.js';

test('config accepts minimal environment and documented defaults', () => {
  assert.deepEqual(readConfig({ RAKUTEN_APPLICATION_ID: ' app ', RAKUTEN_ACCESS_KEY: ' key ' }), {
    applicationId: 'app', accessKey: 'key', affiliateId: undefined, referer: undefined, timeoutMs: 15000, minIntervalMs: 1000,
  });
});

test('config validates credentials, URL and timer values without echoing secrets', () => {
  assert.throws(() => readConfig({}), /RAKUTEN_APPLICATION_ID/);
  assert.throws(() => readConfig({ RAKUTEN_APPLICATION_ID: 'app' }), /RAKUTEN_ACCESS_KEY/);
  const base = { RAKUTEN_APPLICATION_ID: 'app', RAKUTEN_ACCESS_KEY: 'key' };
  assert.throws(() => readConfig({ ...base, RAKUTEN_REFERER: 'file:///tmp/key' }), /HTTP or HTTPS/);
  assert.throws(() => readConfig({ ...base, RAKUTEN_TIMEOUT_MS: '0' }), /RAKUTEN_TIMEOUT_MS/);
  assert.throws(() => readConfig({ ...base, RAKUTEN_MIN_INTERVAL_MS: '-1' }), /RAKUTEN_MIN_INTERVAL_MS/);
  assert.equal(readConfig({ ...base, RAKUTEN_MIN_INTERVAL_MS: '0' }).minIntervalMs, 0);
});

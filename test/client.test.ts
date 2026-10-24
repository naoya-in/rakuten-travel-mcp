import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RakutenClient, RakutenError } from '../src/client.js';
import { getApi } from '../src/catalog.js';
import type { Config } from '../src/config.js';

export const config: Config = { applicationId: 'test-app', accessKey: 'test-secret', affiliateId: 'test-affiliate', timeoutMs: 1000, minIntervalMs: 0 };

test('serializes every supplied parameter, encodes plus sorting, uses header auth and preserves all response fields', async () => {
  const body = { pagingInfo: { pageCount: 5 }, hotels: [{ customFutureField: { preserved: true } }] };
  const client = new RakutenClient({ ...config, referer: 'https://example.com/' }, async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, 'https://openapi.rakuten.co.jp');
    assert.equal(parsed.pathname, '/engine/api/Travel/VacantHotelSearch/20170426');
    assert.equal(parsed.searchParams.get('sort'), '+roomCharge');
    assert.equal(parsed.searchParams.get('hotelNo'), '123,456');
    assert.equal(parsed.searchParams.get('squeezeCondition'), 'breakfast,kinen');
    assert.equal(parsed.searchParams.get('infantWithoutMBNum'), '0');
    assert.equal(parsed.searchParams.get('affiliateId'), 'override');
    assert.equal(parsed.searchParams.get('accessKey'), null);
    assert.equal(parsed.searchParams.get('format'), 'json');
    assert.equal(parsed.searchParams.get('datumType'), '1');
    assert.equal(parsed.searchParams.get('formatVersion'), '2');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('accessKey'), 'test-secret');
    assert.equal(headers.get('referer'), 'https://example.com/');
    assert.equal(headers.get('origin'), 'https://example.com');
    return Response.json(body);
  });
  assert.deepEqual(await client.request(getApi('search_vacant_hotels'), { hotelNo: [123, 456],
    sort: '+roomCharge', squeezeCondition: ['breakfast', 'kinen'], infantWithoutMBNum: 0, affiliateId: 'override' }), body);
});

test('rejects invalid input before making a request', async () => {
  let calls = 0;
  const client = new RakutenClient(config, async () => { calls++; return Response.json({}); });
  await assert.rejects(client.request(getApi('search_hotels'), { hotelNo: 123, page: 101 }));
  assert.equal(calls, 0);
});

test('structured API and gateway errors are actionable and redact echoed credentials', async () => {
  for (const status of [400, 404, 429, 500, 503]) {
    const client = new RakutenClient(config, async () => Response.json({ error: 'wrong_parameter', error_description: 'test-secret test-app test-affiliate' },
      { status, headers: { 'retry-after': '3' } }));
    await assert.rejects(client.request(getApi('get_hotel_chains'), {}), (error: unknown) => {
      assert(error instanceof RakutenError);
      assert.equal(error.status, status);
      assert.equal(error.retryAfter, '3');
      assert.equal(error.message, '[REDACTED] [REDACTED] [REDACTED]');
      return true;
    });
  }
  const gateway = new RakutenClient(config, async () => Response.json({ errors: { errorCode: 403, errorMessage: 'REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING' } }, { status: 403 }));
  await assert.rejects(gateway.request(getApi('get_hotel_chains'), {}), (error: unknown) => {
    assert(error instanceof RakutenError);
    assert.equal(error.code, 'REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING');
    assert.match(error.message, /RAKUTEN_REFERER/);
    return true;
  });
});

test('HTML and malformed JSON produce useful errors without forwarding response contents', async () => {
  const client = new RakutenClient(config, async () => new Response('<html>test-secret</html>', { status: 429, headers: { 'retry-after': '30' } }));
  await assert.rejects(client.request(getApi('get_hotel_chains'), {}), (error: unknown) => {
    assert(error instanceof RakutenError);
    assert.equal(error.code, 'invalid_response');
    assert.equal(error.retryAfter, '30');
    assert(!error.message.includes('test-secret'));
    return true;
  });
});

test('timeout and caller cancellation are distinct, and failures do not poison the queue', async () => {
  const abortingFetch: typeof fetch = async (_url, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });
  const timed = new RakutenClient({ ...config, timeoutMs: 10 }, abortingFetch);
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(timed.request(getApi('get_hotel_chains'), {}), (error: unknown) => error instanceof RakutenError && error.code === 'timeout');
    const controller = new AbortController(); controller.abort();
    const client = new RakutenClient(config, async () => Response.json({ hotelChains: [] }));
    await assert.rejects(client.request(getApi('get_hotel_chains'), {}, controller.signal), (error: unknown) => error instanceof RakutenError && error.code === 'cancelled');
    assert.deepEqual(await client.request(getApi('get_hotel_chains'), {}), { hotelChains: [] });
  } finally { clearTimeout(keepAlive); }
});

test('concurrent calls are serialized and honor request spacing', async () => {
  const starts: number[] = [];
  const client = new RakutenClient({ ...config, minIntervalMs: 30 }, async () => { starts.push(Date.now()); return Response.json({}); });
  await Promise.all([1, 2, 3].map(() => client.request(getApi('get_hotel_chains'), {})));
  assert.equal(starts.length, 3);
  assert(starts[1]! - starts[0]! >= 25);
  assert(starts[2]! - starts[1]! >= 25);
});

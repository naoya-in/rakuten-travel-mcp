import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { RakutenClient, isObject } from '../src/client.js';
import { apiDefinitions } from '../src/catalog.js';

const config = { applicationId: 'test-app', accessKey: 'test-secret', timeoutMs: 1000, minIntervalMs: 0 };
const area = { areaClasses: { largeClasses: [{ largeClassCode: 'japan', largeClassName: '日本', middleClasses: [
  { middleClassCode: 'tokyo', middleClassName: '東京都', smallClasses: [{ smallClassCode: 'tokyo', smallClassName: '東京２３区', detailClasses: [
    { detailClassCode: 'A', detailClassName: '東京駅・銀座' }, { detailClassCode: 'B', detailClassName: '新宿・中野' },
  ] }] },
] }] } };

test('MCP initializes, advertises schemas, executes every API and reads reference resources', async () => {
  const calls: URL[] = [];
  const server = createServer(new RakutenClient(config, async url => {
    const parsed = new URL(String(url)); calls.push(parsed);
    return Response.json(parsed.pathname.includes('GetAreaClass') ? area
      : { pagingInfo: { page: Number(parsed.searchParams.get('page') ?? '1'), pageCount: 3 }, hotels: [{ untouched: { nested: 'field' } }] });
  }));
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 8);
    assert(tools.every(tool => tool.annotations?.readOnlyHint));
    assert.deepEqual(tools.find(tool => tool.name === 'search_hotels_by_keyword')?.inputSchema.required, ['keyword']);
    for (const api of apiDefinitions) {
      const args = ['search_hotels', 'search_vacant_hotels', 'get_hotel_details'].includes(api.name) ? { hotelNo: 123 }
        : api.name === 'search_hotels_by_keyword' ? { keyword: '京都' } : {};
      const output = await client.callTool({ name: api.name, arguments: args });
      assert(!output.isError, api.name);
      assert(output.structuredContent);
      const text = (output.content as { type: string; text?: string }[]).find(item => item.type === 'text')?.text;
      assert.deepEqual(JSON.parse(text!), output.structuredContent);
    }
    assert.equal(calls.length, 7);
    for (const api of apiDefinitions) assert(calls.some(url => url.pathname.endsWith(`/${api.api}/${api.version}`)));
    const nextPage = await client.callTool({ name: 'search_hotels', arguments: { hotelNo: 123, page: 2, hits: 1 } });
    assert(isObject(nextPage.structuredContent));
    assert.equal((nextPage.structuredContent.pagingInfo as { page: number }).page, 2);
    const found = await client.callTool({ name: 'find_area_codes', arguments: { query: '東京', limit: 1 } });
    assert.deepEqual(found.structuredContent, { total: 2, offset: 0, limit: 1, areas: [{ largeClassCode: 'japan', largeClassName: '日本',
      middleClassCode: 'tokyo', middleClassName: '東京都', smallClassCode: 'tokyo', smallClassName: '東京２３区',
      detailClassCode: 'A', detailClassName: '東京駅・銀座', leaf: true }], nextOffset: 1 });
    const second = await client.callTool({ name: 'find_area_codes', arguments: { query: '東京', limit: 1, offset: 1 } });
    assert(isObject(second.structuredContent));
    assert.equal(second.structuredContent.nextOffset, null);
    const empty = await client.callTool({ name: 'find_area_codes', arguments: { query: 'no-such-place' } });
    assert(isObject(empty.structuredContent));
    assert.equal(empty.structuredContent.total, 0);
    const { resources } = await client.listResources();
    assert.equal(resources.length, 2);
    for (const resource of resources) {
      const output = await client.readResource({ uri: resource.uri });
      assert(output.contents.length);
      assert(output.contents[0] && 'text' in output.contents[0]);
      const text = output.contents[0].text;
      assert(!text.includes('test-secret'));
      if (resource.uri.endsWith('/apis')) assert.equal(JSON.parse(text).apis.length, 7);
    }
    const invalid = await client.callTool({ name: 'search_vacant_hotels', arguments: { hotelNo: 123, checkinDate: '2026-11-01' } });
    assert.equal(invalid.isError, true);
    assert.equal(calls.length, 11, 'invalid dates must not cause an upstream request');
  } finally { await client.close(); await server.close(); }
});

test('upstream failures are MCP tool errors and the server remains usable', async () => {
  let count = 0;
  const server = createServer(new RakutenClient(config, async () => ++count === 1
    ? Response.json({ error: 'too_many_requests', error_description: 'retry later test-secret' }, { status: 429, headers: { 'retry-after': '60' } })
    : Response.json({ hotelChains: [] })));
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  try {
    const failure = await client.callTool({ name: 'get_hotel_chains', arguments: {} });
    assert.equal(failure.isError, true);
    assert.deepEqual(failure.structuredContent, { error: 'too_many_requests', message: 'retry later [REDACTED]', status: 429, retryAfter: '60' });
    const success = await client.callTool({ name: 'get_hotel_chains', arguments: {} });
    assert(!success.isError);
  } finally { await client.close(); await server.close(); }
});

test('stdio works from an unrelated working directory without stdout noise', async () => {
  const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
  const tsx = import.meta.resolve('tsx');
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', tsx, entry], cwd: tmpdir(),
    env: { RAKUTEN_APPLICATION_ID: 'test-app', RAKUTEN_ACCESS_KEY: 'test-secret' }, stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 8);
    assert.equal((await client.listResources()).resources.length, 2);
    assert.equal(stderr, '');
  } finally { await client.close(); }
});

test('MCP env settings configure API authentication and do not inherit the project .env', async () => {
  const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
  for (const affiliate of [true, false]) {
    const preload = `globalThis.fetch = async (url, init) => {
      const query = new URL(url).searchParams;
      const headers = new Headers(init.headers);
      return Response.json({
        applicationIdMatches: query.get('applicationId') === 'configured-app',
        accessKeyMatches: headers.get('accessKey') === 'configured-secret',
        affiliateMatches: query.get('affiliateId') === ${affiliate ? "'configured-affiliate'" : 'null'},
        refererMatches: headers.get('referer') === 'https://registered.example/path',
        originMatches: headers.get('origin') === 'https://registered.example'
      });
    };`;
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--import', import.meta.resolve('tsx'), '--import', `data:text/javascript,${encodeURIComponent(preload)}`, entry],
      cwd: tmpdir(), env: {
        RAKUTEN_APPLICATION_ID: 'configured-app', RAKUTEN_ACCESS_KEY: 'configured-secret',
        RAKUTEN_REFERER: 'https://registered.example/path',
        ...(affiliate ? { RAKUTEN_AFFILIATE_ID: 'configured-affiliate' } : {}),
      }, stderr: 'pipe' });
    const client = new Client({ name: 'env-settings-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const response = await client.callTool({ name: 'get_hotel_chains', arguments: {} });
      assert(!response.isError);
      assert.deepEqual(response.structuredContent, {
        applicationIdMatches: true, accessKeyMatches: true, affiliateMatches: true, refererMatches: true, originMatches: true,
      });
    } finally { await client.close(); }
  }
});

test('stdio EOF closes the server and cancels active and queued requests', async () => {
  const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
  const preload = `globalThis.fetch = async (_url, init) => { process.stderr.write('fetch-started\\n'); return new Promise((resolve, reject) => { const timer = setTimeout(() => resolve(Response.json({})), 10000); init.signal.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal.reason); }, {once:true}); }); };`;
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), '--import', `data:text/javascript,${encodeURIComponent(preload)}`, entry], {
    cwd: tmpdir(), env: { RAKUTEN_APPLICATION_ID: 'test-app', RAKUTEN_ACCESS_KEY: 'test-secret', RAKUTEN_MIN_INTERVAL_MS: '1000' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exit = once(child, 'exit');
  let started = 0;
  const fetched = new Promise<void>(resolve => child.stderr.on('data', chunk => {
    started += (chunk.toString().match(/fetch-started/g) ?? []).length;
    if (started) resolve();
  }));
  const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
  try {
    const firstResponse = once(child.stdout, 'data');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'eof-test', version: '1' } } }) + '\n');
    await firstResponse;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    for (const id of [2, 3]) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'get_hotel_chains', arguments: {} } }) + '\n');
    await fetched;
    child.stdin.end();
    const [code, signal] = await exit;
    assert.equal(signal, null, 'must exit on EOF, without the timeout killing the process');
    assert.equal(code, 0);
    assert.equal(started, 1, 'the queued request must not start after EOF');
  } finally { clearTimeout(timeout); child.kill(); }
});

test('MCP cancellation reaches the active upstream request', async () => {
  let aborted = false;
  let notifyStarted: () => void = () => {};
  const started = new Promise<void>(resolve => { notifyStarted = resolve; });
  const server = createServer(new RakutenClient(config, async (_url, init) => {
    notifyStarted();
    return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => {
      aborted = true; reject(init.signal?.reason);
    }, { once: true }));
  }));
  const client = new Client({ name: 'cancel-test', version: '1.0.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct);
  try {
    const controller = new AbortController();
    const request = client.callTool({ name: 'get_hotel_chains', arguments: {} }, undefined, { signal: controller.signal });
    await started;
    controller.abort();
    await assert.rejects(request);
    await new Promise(resolve => setImmediate(resolve));
    assert(aborted);
  } finally { await client.close(); await server.close(); }
});

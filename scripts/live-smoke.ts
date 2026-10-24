import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { isObject } from '../src/client.js';

const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const environment = Object.fromEntries(Object.entries(process.env)
  .filter((entry): entry is [string, string] => entry[0].startsWith('RAKUTEN_') && entry[1] !== undefined));
const transport = new StdioClientTransport({ command: process.execPath, args: [entry],
  env: { ...environment, RAKUTEN_MIN_INTERVAL_MS: '2000' }, stderr: 'pipe' });
const client = new Client({ name: 'rakuten-travel-live-check', version: '1.0.0' });
const report: object[] = [];
const call = async (name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({ name, arguments: args });
  const data = result.structuredContent;
  report.push({ tool: name, status: result.isError ? 'ERROR' : 'PASS',
    ...(result.isError ? { error: data } : { keys: isObject(data) ? Object.keys(data) : [] }) });
  if (result.isError) throw new Error(`${name} failed; see report.`);
  return data;
};
const findHotelNo = (value: unknown): number | undefined => {
  if (Array.isArray(value)) return value.map(findHotelNo).find(v => v !== undefined);
  if (!isObject(value)) return undefined;
  if (typeof value.hotelNo === 'number') return value.hotelNo;
  return Object.values(value).map(findHotelNo).find(v => v !== undefined);
};
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 8);
  report.push({ check: 'stdio initialize/listTools', status: 'PASS', tools: tools.length });
  const resources = await client.listResources();
  for (const resource of resources.resources) await client.readResource({ uri: resource.uri });
  report.push({ check: 'resources/list and read', status: 'PASS', count: resources.resources.length });
  await call('get_hotel_chains', {});
  await call('get_area_class', {});
  const lookup = await call('find_area_codes', { query: '新宿', limit: 2 });
  assert(isObject(lookup) && Array.isArray(lookup.areas) && lookup.areas.length > 0, 'Area lookup returned no Shinjuku paths');
  const keyword = await call('search_hotels_by_keyword', { keyword: '東京', hits: 1 });
  const nearby = await call('search_hotels', { latitude: 35.6812, longitude: 139.7671, hits: 1 });
  const hotelNo = findHotelNo(nearby) ?? findHotelNo(keyword);
  assert(hotelNo, 'Hotel search returned no hotelNo');
  await call('get_hotel_details', { hotelNo, responseType: 'large' });
  await call('get_hotel_rankings', { genre: ['all', 'onsen', 'premium'] });
  const start = new Date(Date.now() + 9 * 60 * 60 * 1000); start.setUTCDate(start.getUTCDate() + 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1);
  await call('search_vacant_hotels', { latitude: 35.6812, longitude: 139.7671, searchRadius: 3,
    checkinDate: start.toISOString().slice(0, 10), checkoutDate: end.toISOString().slice(0, 10), adultNum: 2, hits: 1, searchPattern: 1 });
} catch (error) {
  process.exitCode = 1;
  report.push({ check: 'live smoke', status: 'FAILED', message: error instanceof Error ? error.message : 'Unknown error' });
} finally {
  await client.close();
  console.log(JSON.stringify(report, null, 2));
}

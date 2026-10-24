import assert from 'node:assert/strict';
import { apiDefinitions } from '../src/catalog.js';

const handledElsewhere = new Set(['applicationId', 'accessKey', 'format', 'callback']);
const clean = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
for (const api of apiDefinitions) {
  const response = await fetch(api.documentation);
  assert(response.ok, `Cannot read ${api.documentation}: ${response.status}`);
  const html = await response.text();
  const table = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].find(match => match[0].includes('formatVersion'))?.[0];
  assert(table, `No input parameter table: ${api.api}`);
  const parameters = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map(row => [...row[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => clean(cell[1]!)))
    .filter(cells => /^\d+$/.test(cells[0] ?? '') && /^[a-zA-Z]+$/.test(cells[2] ?? ''))
    .map(cells => cells[2]!);
  assert(parameters.length >= 7, `Input table parser found too few parameters for ${api.api}`);
  const expected = parameters.filter(key => !handledElsewhere.has(key)).sort();
  assert.deepEqual(Object.keys(api.schema.shape).sort(), expected, `${api.api}: parameter coverage differs from official input table`);
  assert(html.includes(`/Travel/${api.api}/${api.version}`), `${api.api}: version differs from documentation`);
  console.log(`${api.api}/${api.version}: ${expected.length} exposed parameters, official input-table parity PASS`);
}

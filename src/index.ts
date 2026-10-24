#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnvironment, readConfig } from './config.js';
import { RakutenClient } from './client.js';
import { createServer } from './server.js';

try {
  const { values } = parseArgs({ options: { 'env-file': { type: 'string' }, help: { type: 'boolean' }, version: { type: 'boolean' } } });
  if (values.help) {
    console.log('rakuten-travel-mcp [--env-file /absolute/path/to/.env]\n\nRuns a stdio MCP server. Set RAKUTEN_APPLICATION_ID, RAKUTEN_ACCESS_KEY,\nRAKUTEN_AFFILIATE_ID (optional), and RAKUTEN_REFERER in the MCP server env settings.\nNo .env file is loaded automatically. --env-file or RAKUTEN_ENV_FILE opts in;\nexisting environment values take precedence over the selected file.');
  } else if (values.version) {
    console.log('0.1.0');
  } else {
    loadEnvironment(values['env-file']);
    const server = createServer(new RakutenClient(readConfig()));
    await server.connect(new StdioServerTransport());
    const close = async () => { await server.close(); process.exit(0); };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    process.stdin.once('end', close);
  }
} catch {
  console.error('rakuten-travel-mcp: Startup failed. Check Node.js >=22, CLI arguments, MCP env settings (RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY), and any explicitly selected --env-file path.');
  process.exitCode = 1;
}

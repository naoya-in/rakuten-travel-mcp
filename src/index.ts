#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnvironment, readConfig } from './config.js';
import { RakutenClient } from './client.js';
import { createServer } from './server.js';

try {
  const { values } = parseArgs({ options: { 'env-file': { type: 'string' }, help: { type: 'boolean' }, version: { type: 'boolean' } } });
  if (values.help) {
    console.log('rakuten-travel-mcp [--env-file /absolute/path/to/.env]\n\nRuns a stdio MCP server. Requires RAKUTEN_APPLICATION_ID and RAKUTEN_ACCESS_KEY.\nEnvironment values take precedence over the .env file next to the project.');
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
  console.error('rakuten-travel-mcp: Startup failed. Check Node.js >=22, CLI arguments, the .env path, and required RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY settings.');
  process.exitCode = 1;
}

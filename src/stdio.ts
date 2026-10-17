#!/usr/bin/env node
// Local use over stdio (Claude Desktop, Cursor, Grok Bot local tools, etc.). Free: no billing.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

const server = createServer();
await server.connect(new StdioServerTransport());
const stop = async () => { await server.close().catch(() => {}); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

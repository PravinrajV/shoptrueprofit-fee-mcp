// Static MCP server card (SEP-1649), served at /.well-known/mcp/server-card.json. Directories such as Smithery read it
// when they cannot scan a server behind auth. Built from a live tools/list over an in-memory transport, so it always
// matches the real schemas exactly.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, INSTRUCTIONS } from './server';
import { SERVER_NAME, SERVER_VERSION, SITE } from './meta';

let cached: Promise<Record<string, unknown>> | undefined;

export function serverCard(): Promise<Record<string, unknown>> {
  cached ??= (async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createServer(); const client = new Client({ name: 'server-card', version: SERVER_VERSION });
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      const { tools } = await client.listTools();
      return {
        serverInfo: { name: SERVER_NAME, title: 'ShopTrueProfit Fee & Profit', version: SERVER_VERSION, websiteUrl: SITE },
        instructions: INSTRUCTIONS,
        transport: { type: 'streamable-http', endpoint: '/mcp' },
        tools, resources: [], prompts: [],
      };
    } finally { await client.close(); await server.close(); }
  })().catch(e => { cached = undefined; throw e; });
  return cached;
}

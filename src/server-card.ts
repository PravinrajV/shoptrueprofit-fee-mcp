// Static MCP server card (SEP-1649), served at /.well-known/mcp/server-card.json. Directories such as Smithery read it
// when they cannot scan a server behind auth. Built from a live tools/list over an in-memory transport, so it always
// matches the real schemas exactly.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, instructions, serverInfo } from './server';
import { SERVER_VERSION, distribution, type Distribution } from './meta';

const cache = new Map<Distribution, Promise<Record<string, unknown>>>();

export function serverCard(): Promise<Record<string, unknown>> {
  const mode = distribution(); let card = cache.get(mode);
  if (!card) cache.set(mode, card = (async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createServer(); const client = new Client({ name: 'server-card', version: SERVER_VERSION });
    await Promise.all([server.connect(a), client.connect(b)]);
    try {
      const { tools } = await client.listTools();
      return {
        serverInfo: (({ name, title, version, ...rest }) => ({ name, title, version, ...rest }))(serverInfo()),
        instructions: instructions(),
        transport: { type: 'streamable-http', endpoint: '/mcp' },
        tools, resources: [], prompts: [],
      };
    } finally { await client.close(); await server.close(); }
  })().catch(e => { cache.delete(mode); throw e; }));
  return card;
}

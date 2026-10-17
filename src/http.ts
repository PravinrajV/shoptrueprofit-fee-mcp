// Streamable HTTP transport (stateless JSON-RPC over POST /mcp). Used by the Apify Standby server and for self-hosting:
//   PORT=3000 node dist/http.js
import express, { type Request, type Response } from 'express';
import type { Server } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server';
import { freeBiller, type Biller } from './billing';
import { SERVER_NAME, SERVER_VERSION, SITE } from './meta';
import { TOOLS } from './tools';
import { serverCard } from './server-card';

export interface HttpOptions { biller?: Biller; log?: (msg: string, data?: Record<string, unknown>) => void }

export function createHttpApp({ biller = freeBiller, log = () => {} }: HttpOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use((req, res, next) => { // CORS for browser-based MCP clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });

  app.get('/', (req: Request, res: Response) => {
    if (req.headers['x-apify-container-server-readiness-probe']) { res.type('text').send('ok\n'); return; }
    res.json({ name: SERVER_NAME, version: SERVER_VERSION, mcp_endpoint: '/mcp', transport: 'streamable-http', tools: TOOLS.map(t => t.name), website: SITE });
  });
  app.get('/health', (_req, res) => { res.json({ ok: true, version: SERVER_VERSION }); });
  app.get('/.well-known/mcp/server-card.json', async (_req, res) => {
    try { res.set('Cache-Control', 'public, max-age=3600').json(await serverCard()); }
    catch (e) { log('server card failed', { error: e instanceof Error ? e.message : String(e) }); res.status(500).json({ error: 'server card unavailable' }); }
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    const server = createServer(biller);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log('MCP request failed', { error: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  });
  const notAllowed = (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. This server is stateless: send JSON-RPC requests with POST /mcp.' }, id: null });
  };
  app.get('/mcp', notAllowed); app.delete('/mcp', notAllowed);
  // Malformed JSON bodies: answer with a JSON-RPC parse error instead of an HTML page.
  app.use((err: Error & { type?: string; status?: number }, _req: Request, res: Response, _next: express.NextFunction) => {
    const parse = err.type === 'entity.parse.failed', big = err.type === 'entity.too.large';
    res.status(big ? 413 : parse ? 400 : 500).json({ jsonrpc: '2.0', error: { code: parse ? -32700 : -32600, message: big ? 'Request body too large (max 64 KB).' : parse ? 'Parse error: body is not valid JSON.' : 'Bad request.' }, id: null });
  });
  return app;
}

export function listen(app: ReturnType<typeof createHttpApp>, port: number, host = '0.0.0.0'): Promise<Server> {
  return new Promise((resolve, reject) => { const s = app.listen(port, host, (err?: Error) => (err ? reject(err) : resolve(s))); s.on('error', reject); });
}

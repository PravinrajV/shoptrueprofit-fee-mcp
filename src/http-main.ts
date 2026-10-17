// Self-hosted streamable HTTP server (free, no billing):  PORT=3000 HOST=127.0.0.1 node dist/http.js
import { createHttpApp, listen } from './http';
import { SERVER_NAME, SERVER_VERSION } from './meta';

const port = Number(process.env.PORT ?? 3000); const host = process.env.HOST ?? '127.0.0.1';
const s = await listen(createHttpApp({ log: (m, d) => console.error(m, d ?? '') }), port, host);
const addr = s.address(); const actual = typeof addr === 'object' && addr ? addr.port : port;
console.error(`${SERVER_NAME} ${SERVER_VERSION} listening on http://${host}:${actual}/mcp`);
const stop = () => s.close(() => process.exit(0)); process.on('SIGINT', stop); process.on('SIGTERM', stop);

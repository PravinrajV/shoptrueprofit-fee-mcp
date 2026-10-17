// Runs the BUILT Apify entry point (dist/main.js) with the real Apify SDK in local pay-per-event test mode
// (ACTOR_TEST_PAY_PER_EVENT + ACTOR_USE_CHARGING_LOG_DATASET), in both Standby (MCP over HTTP) and standard (batch) modes,
// and checks the SDK's charging log: exactly one `fee-calculation` event per successful calculation.
import { describe, it, expect, beforeAll } from 'vitest';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ROOT = resolve(__dirname, '..');
const readDataset = (dir: string, name: string) => existsSync(join(dir, 'datasets', name))
  ? readdirSync(join(dir, 'datasets', name)).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(dir, 'datasets', name, f), 'utf8'))) : [];
const freePort = () => new Promise<number>(res => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => res(p)); }); });
const env = (dir: string, extra: Record<string, string> = {}) => ({ ...process.env, CRAWLEE_STORAGE_DIR: dir, ACTOR_TEST_PAY_PER_EVENT: 'true', ACTOR_USE_CHARGING_LOG_DATASET: 'true', APIFY_LOG_LEVEL: 'WARNING', ...extra });

beforeAll(() => { if (!existsSync(resolve(ROOT, 'dist/main.js'))) execFileSync('node', ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' }); });

describe('Apify Actor (local, real SDK)', () => {
  it('Standby mode: MCP over HTTP at /mcp, readiness probe, one charge per calculation', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stp-standby-')); const port = await freePort();
    const proc = spawn(process.execPath, [resolve(ROOT, 'dist/main.js')], { cwd: dir, env: env(dir, { APIFY_META_ORIGIN: 'STANDBY', ACTOR_WEB_SERVER_PORT: String(port) }), stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; proc.stdout!.on('data', d => { log += d; }); proc.stderr!.on('data', d => { log += d; });
    try {
      const base = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 100; i++) { try { if ((await fetch(base, { headers: { 'x-apify-container-server-readiness-probe': '1' } })).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
      expect(await (await fetch(base, { headers: { 'x-apify-container-server-readiness-probe': '1' } })).text()).toBe('ok\n');
      const c = new Client({ name: 'apify-standby-test', version: '1.0.0' });
      await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
      expect((await c.listTools()).tools).toHaveLength(13);
      const a: any = await c.callTool({ name: 'etsy_profit', arguments: { price: 25, shipping_charged: 5, item_cost: 8, shipping_label_cost: 4 } });
      expect(a.structuredContent.profit.profit).toBe(14.7);
      await c.callTool({ name: 'list_amazon_categories', arguments: {} });
      await c.callTool({ name: 'ebay_fees', arguments: { price: 0 } });
      const b: any = await c.callTool({ name: 'amazon_fees', arguments: { price: 24.99, category: 'home-kitchen', fulfillment: 'fba', length_in: 10, width_in: 6, height_in: 3, weight_lb: 1.2, ship_date: '2026-10-16' } });
      expect(b.structuredContent.fees.total).toBe(9.93);
      await c.close();
      const charges = readDataset(dir, 'charging_log');
      expect(charges.map((x: any) => [x.eventName, x.chargedCount])).toEqual([['fee-calculation', 1], ['fee-calculation', 1]]);
    } finally { proc.kill('SIGTERM'); await new Promise(r => proc.once('exit', r)); }
    expect(log).not.toMatch(/Error|exception/i);
  });

  it('Standard run (batch): dataset items + one charge per successful calculation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stp-batch-')); mkdirSync(join(dir, 'key_value_stores', 'default'), { recursive: true });
    writeFileSync(join(dir, 'key_value_stores', 'default', 'INPUT.json'), JSON.stringify({ calls: [
      { tool: 'compare_marketplaces', arguments: { price: 30, shipping_charged: 5, item_cost: 8, amazon: { category: 'toys', fulfillment: 'fbm' } } },
      { tool: 'list_etsy_regions' }, { tool: 'etsy_fees', arguments: { price: 25, region: 'xx' } }, { tool: 'ebay_target_price', arguments: { item_cost: 8, target_margin_pct: 30 } } ] }));
    execFileSync(process.execPath, [resolve(ROOT, 'dist/main.js')], { cwd: dir, env: env(dir), stdio: 'pipe', timeout: 60000 });
    const items = readDataset(dir, 'default');
    expect(items.map((x: any) => [x.tool, x.ok])).toEqual([['compare_marketplaces', true], ['list_etsy_regions', true], ['etsy_fees', false], ['ebay_target_price', true]]);
    expect(items[2].error).toMatch(/region must be one of/);
    expect(readDataset(dir, 'charging_log').map((x: any) => x.eventName)).toEqual(['fee-calculation', 'fee-calculation']);
  });

  it('Standby without pay-per-event pricing (free / pay-per-usage): results are served, nothing is charged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stp-free-')); const port = await freePort();
    const proc = spawn(process.execPath, [resolve(ROOT, 'dist/main.js')], { cwd: dir, env: { ...process.env, CRAWLEE_STORAGE_DIR: dir, APIFY_LOG_LEVEL: 'ERROR', APIFY_META_ORIGIN: 'STANDBY', ACTOR_WEB_SERVER_PORT: String(port) }, stdio: 'ignore' });
    try {
      const base = `http://127.0.0.1:${port}`;
      for (let i = 0; i < 100; i++) { try { if ((await fetch(base, { headers: { 'x-apify-container-server-readiness-probe': '1' } })).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
      const c = new Client({ name: 'apify-free-test', version: '1.0.0' });
      await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
      const r: any = await c.callTool({ name: 'ebay_fees', arguments: { price: 25, shipping_charged: 5 } });
      expect(r.isError).toBeFalsy(); expect(r.structuredContent.fees.total).toBe(4.48);
      await c.close();
      expect(readDataset(dir, 'charging_log')).toEqual([]);
    } finally { proc.kill('SIGTERM'); await new Promise(r => proc.once('exit', r)); }
  });

  it('Standard run with no input fails with a helpful status message', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stp-empty-'));
    let out = ''; try { execFileSync(process.execPath, [resolve(ROOT, 'dist/main.js')], { cwd: dir, env: env(dir, { APIFY_LOG_LEVEL: 'INFO' }), stdio: 'pipe', timeout: 60000 }); } catch (e: any) { out = String(e.stdout) + String(e.stderr); expect(e.status).toBe(1); }
    expect(out).toMatch(/Input is empty/);
  });
});

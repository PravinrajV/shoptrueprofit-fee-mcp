// MCP protocol tests against the BUILT server (dist/): stdio and streamable HTTP. Lists tools and calls every one.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpApp, listen } from '../src/http';
import { recordingBiller, apifyBiller, CHARGE_EVENT } from '../src/billing';
import { TOOLS } from '../src/tools';

const ROOT = resolve(__dirname, '..');
const fba = { price: 24.99, category: 'home-kitchen', fulfillment: 'fba', length_in: 10, width_in: 6, height_in: 3, weight_lb: 1.2, ship_date: '2026-10-16' };
export const SAMPLE: Record<string, Record<string, unknown>> = {
  etsy_fees: { price: 25, shipping_charged: 5 }, ebay_fees: { price: 25, shipping_charged: 5 }, amazon_fees: fba,
  etsy_profit: { price: 25, shipping_charged: 5, item_cost: 8, shipping_label_cost: 4 }, ebay_profit: { price: 25, shipping_charged: 5, item_cost: 8, shipping_label_cost: 4 },
  amazon_profit: { ...fba, item_cost: 6, inbound_cost: 0.5 },
  etsy_target_price: { shipping_charged: 5, item_cost: 8, shipping_label_cost: 4, target_margin_pct: 30 }, ebay_target_price: { shipping_charged: 5, item_cost: 8, shipping_label_cost: 4, target_margin_pct: 30 },
  amazon_target_price: { category: 'home-kitchen', fulfillment: 'fba', length_in: 10, width_in: 6, height_in: 3, weight_lb: 1.2, ship_date: '2026-10-16', item_cost: 6, inbound_cost: 0.5, target_margin_pct: 30 },
  compare_marketplaces: { price: 25, shipping_charged: 5, item_cost: 8, shipping_label_cost: 4, target_margin_pct: 30, amazon: { category: 'home-kitchen', fulfillment: 'fbm' } },
  list_ebay_categories: {}, list_amazon_categories: {}, list_etsy_regions: {},
};
const EXPECT_SUMMARY: Record<string, RegExp> = {
  etsy_fees: /\$3\.30/, ebay_fees: /\$4\.48/, amazon_fees: /\$9\.93/, etsy_profit: /\$14\.70/, ebay_profit: /\$13\.52/, amazon_profit: /\$8\.56/,
  etsy_target_price: /list at \$/, ebay_target_price: /\$16\.99/, amazon_target_price: /break-even \$14\.92/, compare_marketplaces: /pays the most|Tie/,
};

async function exercise(c: Client) {
  const { tools } = await c.listTools();
  expect(tools.map(t => t.name).sort()).toEqual(TOOLS.map(t => t.name).sort());
  for (const t of tools) {
    expect(t.inputSchema.type).toBe('object'); expect((t.inputSchema as any).additionalProperties).toBe(false); expect(t.outputSchema?.type).toBe('object');
    expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    const r: any = await c.callTool({ name: t.name, arguments: SAMPLE[t.name] });
    expect(r.isError, `${t.name}: ${r.content?.[0]?.text}`).toBeFalsy();
    expect(r.structuredContent.tool).toBe(t.name);
    expect(JSON.parse(r.content[0].text)).toEqual(r.structuredContent); // text mirror of the structured result
    if (EXPECT_SUMMARY[t.name]) expect(r.structuredContent.summary).toMatch(EXPECT_SUMMARY[t.name]);
  }
  const bad: any = await c.callTool({ name: 'ebay_fees', arguments: { price: -1, promoted_listings_pct: 1 } });
  expect(bad.isError).toBe(true); expect(bad.content[0].text).toMatch(/price must be greater than 0[\s\S]*between 2 and 100/);
  const unknown: any = await c.callTool({ name: 'etsy_fees', arguments: { price: 25, colour: 'red' } });
  expect(unknown.isError).toBe(true); expect(unknown.content[0].text).toMatch(/Unknown argument\(s\): colour/);
  await expect(c.callTool({ name: 'nope', arguments: {} }).then((x: any) => { if (x.isError) throw new Error(x.content[0].text); })).rejects.toThrow(/nope/);
  return tools.length;
}

beforeAll(() => { if (!existsSync(resolve(ROOT, 'dist/stdio.js')) || process.env.STP_REBUILD !== '0') execFileSync('node', ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' }); });

describe('stdio transport (node dist/stdio.js)', () => {
  it('initialize, list 13 tools, call every tool, reject bad input', async () => {
    const c = new Client({ name: 'stdio-test', version: '1.0.0' });
    await c.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(ROOT, 'dist/stdio.js')], stderr: 'pipe' }));
    expect(c.getServerVersion()).toMatchObject({ name: 'shoptrueprofit-fee-mcp' }); expect(c.getInstructions()).toMatch(/compare_marketplaces/);
    expect(await exercise(c)).toBe(13);
    await c.close();
  });
});

describe('streamable HTTP transport (node dist/http.js)', () => {
  let proc: ChildProcess; let url: string;
  beforeAll(async () => {
    proc = spawn(process.execPath, [resolve(ROOT, 'dist/http.js')], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'ignore', 'pipe'] });
    url = await new Promise<string>((res, rej) => {
      let buf = ''; const t = setTimeout(() => rej(new Error(`server did not start: ${buf}`)), 15000);
      proc.stderr!.on('data', d => { buf += d; const m = buf.match(/listening on (http:\/\/\S+\/mcp)/); if (m) { clearTimeout(t); res(m[1]); } });
    });
  });
  afterAll(() => { proc?.kill('SIGTERM'); });
  it('initialize, list 13 tools, call every tool, reject bad input', async () => {
    const c = new Client({ name: 'http-test', version: '1.0.0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(url)));
    expect(await exercise(c)).toBe(13);
    await c.close();
  });
  it('readiness probe, info, health, 405 on GET /mcp, JSON-RPC parse error on bad JSON', async () => {
    const root = url.replace(/\/mcp$/, '');
    expect(await (await fetch(root, { headers: { 'x-apify-container-server-readiness-probe': '1' } })).text()).toBe('ok\n');
    expect(await (await fetch(root)).json()).toMatchObject({ mcp_endpoint: '/mcp', transport: 'streamable-http' });
    expect(await (await fetch(`${root}/health`)).json()).toMatchObject({ ok: true });
    const card = await fetch(`${root}/.well-known/mcp/server-card.json`); expect(card.status).toBe(200);
    const cj = (await card.json()) as any;
    expect(cj.serverInfo.name).toBe('shoptrueprofit-fee-mcp');
    expect(cj.tools.map((t: any) => t.name)).toEqual(TOOLS.map(t => t.name));
    expect(cj.tools.every((t: any) => t.inputSchema?.type === 'object' && t.outputSchema?.type === 'object')).toBe(true);
    const g = await fetch(url); expect(g.status).toBe(405);
    const p = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{not json' });
    expect(p.status).toBe(400); expect(((await p.json()) as any).error.code).toBe(-32700);
    const big = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(70_000) }) }); expect(big.status).toBe(413);
  });
});

describe('pay-per-event billing over HTTP (in-process)', () => {
  async function withServer(biller: any, fn: (c: Client) => Promise<void>) {
    const s = await listen(createHttpApp({ biller }), 0, '127.0.0.1');
    const c = new Client({ name: 'billing-test', version: '1.0.0' });
    try { await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(s.address() as AddressInfo).port}/mcp`))); await fn(c); }
    finally { await c.close().catch(() => {}); await new Promise(r => s.close(r)); }
  }
  it('exactly one charge per successful calculation; none for list tools, validation errors or unknown tools', async () => {
    const b = recordingBiller();
    await withServer(b, async c => {
      for (const t of TOOLS) await c.callTool({ name: t.name, arguments: SAMPLE[t.name] });
      await c.callTool({ name: 'etsy_fees', arguments: { price: 0 } });
      await c.callTool({ name: 'amazon_fees', arguments: { price: 10, category: 'toys', fulfillment: 'fba' } });
      await c.callTool({ name: 'nope', arguments: {} }).catch(() => {});
    });
    expect(b.calls).toEqual(TOOLS.filter(t => t.charged).map(t => t.name)); expect(b.calls).toHaveLength(10);
  });
  it('Apify biller charges the "fee-calculation" event and withholds the result when the spending limit is reached', async () => {
    const charges: string[] = []; let budget = 2;
    const fakeActor = { charge: async ({ eventName }: { eventName: string }) => { charges.push(eventName); const n = budget > 0 ? 1 : 0; budget--; return { chargedCount: n, eventChargeLimitReached: budget <= 0 }; } };
    await withServer(apifyBiller(fakeActor), async c => {
      expect((await c.callTool({ name: 'etsy_fees', arguments: { price: 10 } }) as any).isError).toBeFalsy();
      expect((await c.callTool({ name: 'list_etsy_regions', arguments: {} }) as any).isError).toBeFalsy();
      expect((await c.callTool({ name: 'ebay_fees', arguments: { price: 10 } }) as any).isError).toBeFalsy();
      const over: any = await c.callTool({ name: 'ebay_fees', arguments: { price: 10 } });
      expect(over.isError).toBe(true); expect(over.content[0].text).toMatch(/spending limit/); expect(over.structuredContent).toBeUndefined();
    });
    expect(charges).toEqual([CHARGE_EVENT, CHARGE_EVENT, CHARGE_EVENT]);
  });
  it('Apify biller serves without charging when the Actor is not on pay-per-event pricing', async () => {
    let called = 0;
    await withServer(apifyBiller({ charge: async () => { called++; return { chargedCount: 0, eventChargeLimitReached: false }; } }, () => {}, () => false), async c => {
      const r: any = await c.callTool({ name: 'etsy_fees', arguments: { price: 10 } }); expect(r.isError).toBeFalsy();
    });
    expect(called).toBe(0);
  });
  it('Apify biller fails closed if charging throws', async () => {
    await withServer(apifyBiller({ charge: async () => { throw new Error('network'); } }), async c => {
      const r: any = await c.callTool({ name: 'etsy_fees', arguments: { price: 10 } }); expect(r.isError).toBe(true); expect(r.content[0].text).toMatch(/not charged or returned/);
    });
  });
});

// Distribution modes. Default (GitHub, npm, MCPB, MCP registry, self-hosted) links results to the free calculators.
// Apify (STP_DISTRIBUTION=apify, set in the Actor's Dockerfile) must contain no off-platform links or promotion
// anywhere a Store user can see it (Apify Store Publishing Terms 2.2.4.2), with every number identical.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, INSTRUCTIONS } from '../src/server';
import { serverCard } from '../src/server-card';
import { createHttpApp, listen } from '../src/http';
import { runBatch } from '../src/batch';
import { TOOLS, COMMON } from '../src/tools';
import { distribution, FEE_TABLES, SITE } from '../src/meta';

const ROOT = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8');
/** Anything that links to or promotes something outside the Apify platform. */
const OFF_PLATFORM = /shoptrueprofit\.com|utm_|calculator_url|github\.com|free calculators?|profit dashboard|websiteUrl|npmjs|npx /i;

const fba = { price: 24.99, category: 'home-kitchen', fulfillment: 'fba', length_in: 10, width_in: 6, height_in: 3, weight_lb: 1.2, ship_date: '2026-10-16' };
const SAMPLE: Record<string, Record<string, unknown>> = {
  etsy_fees: { price: 25, shipping_charged: 5, region: 'ca-dom' }, ebay_fees: { price: 25, shipping_charged: 5 }, amazon_fees: fba,
  etsy_profit: { price: 25, shipping_charged: 5, item_cost: 8, shipping_label_cost: 4 }, ebay_profit: { price: 25, shipping_charged: 5, item_cost: 8, shipping_label_cost: 4 },
  amazon_profit: { ...fba, item_cost: 6, inbound_cost: 0.5 },
  etsy_target_price: { shipping_charged: 5, item_cost: 8, shipping_label_cost: 4, target_margin_pct: 30 }, ebay_target_price: { shipping_charged: 5, item_cost: 8, shipping_label_cost: 4, target_margin_pct: 30 },
  amazon_target_price: { ...(({ price, ...x }) => x)(fba), item_cost: 6, inbound_cost: 0.5, target_margin_pct: 30 },
  compare_marketplaces: { price: 25, shipping_charged: 5, item_cost: 8, shipping_label_cost: 4, target_margin_pct: 30, amazon: { ...(({ price, ...x }) => x)(fba) } },
  list_ebay_categories: {}, list_amazon_categories: {}, list_etsy_regions: {},
};

/** Everything a client can see from one server: info, instructions, tools/list, every tool result, card, HTTP root, batch items. */
async function surface() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createServer(); const c = new Client({ name: 'dist-test', version: '1.0.0' });
  await Promise.all([server.connect(a), c.connect(b)]);
  const { tools } = await c.listTools();
  const calls: Record<string, any> = {};
  for (const t of TOOLS) {
    const r: any = await c.callTool({ name: t.name, arguments: SAMPLE[t.name] });
    expect(r.isError, `${t.name}: ${r.content?.[0]?.text}`).toBeFalsy();
    calls[t.name] = r;
  }
  const info = c.getServerVersion(); const instructions = c.getInstructions();
  await c.close(); await server.close();
  const http = await listen(createHttpApp({ log: () => {} }), 0, '127.0.0.1');
  const root: any = await (await fetch(`http://127.0.0.1:${(http.address() as AddressInfo).port}/`)).json();
  http.close();
  const items: any[] = [];
  await runBatch({ pushData: async (i: object) => { items.push(i); return { chargedCount: 1 }; } }, { calls: TOOLS.map(t => ({ tool: t.name, arguments: SAMPLE[t.name] })) });
  return { info, instructions, tools, calls, card: await serverCard(), root, batch: items };
}

/** A result with the default-only provenance removed, for comparing the two modes number for number. */
function neutral(r: any): any {
  const strip = (v: any): any => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'calculator_url' && k !== 'documentation').map(([k, x]) => [k, strip(x)])) : v;
  return JSON.parse(JSON.stringify(strip(r)).replace(/exactly as (on shoptrueprofit\.com|in the ShopTrueProfit fee engine)/g, 'exactly as ENGINE'));
}

describe('distribution switch', () => {
  it('STP_DISTRIBUTION wins; otherwise the Apify platform selects apify', () => {
    expect(distribution({})).toBe('default');
    expect(distribution({ STP_DISTRIBUTION: 'apify' })).toBe('apify');
    expect(distribution({ STP_DISTRIBUTION: ' APIFY ' })).toBe('apify');
    expect(distribution({ STP_DISTRIBUTION: 'default', APIFY_IS_AT_HOME: '1' })).toBe('default');
    expect(distribution({ APIFY_IS_AT_HOME: '1' })).toBe('apify');
    expect(distribution({ APIFY_IS_AT_HOME: '0' })).toBe('default');
  });
});

describe('both modes', () => {
  const saved = { d: process.env.STP_DISTRIBUTION, h: process.env.APIFY_IS_AT_HOME };
  let def: Awaited<ReturnType<typeof surface>>; let apify: Awaited<ReturnType<typeof surface>>;
  beforeAll(async () => {
    delete process.env.STP_DISTRIBUTION; delete process.env.APIFY_IS_AT_HOME;
    def = await surface();
    process.env.STP_DISTRIBUTION = 'apify';
    apify = await surface();
  });
  afterAll(() => {
    for (const [k, v] of [['STP_DISTRIBUTION', saved.d], ['APIFY_IS_AT_HOME', saved.h]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  it('default mode keeps the calculator links, website and wording', () => {
    expect(def.info).toMatchObject({ name: 'shoptrueprofit-fee-mcp', websiteUrl: SITE });
    expect(def.instructions).toBe(INSTRUCTIONS);
    expect((def.card as any).serverInfo.websiteUrl).toBe(SITE);
    expect(def.root.website).toBe(SITE);
    for (const t of def.tools) expect(t.description).toBe(TOOLS.find(x => x.name === t.name)!.description);
    for (const t of def.tools.filter(t => TOOLS.find(x => x.name === t.name)!.charged)) expect(t.description).toContain(COMMON);
    for (const t of def.tools) expect((t.outputSchema as any).required).toContain('calculator_url');
    expect(def.calls.ebay_fees.structuredContent.calculator_url).toBe('https://shoptrueprofit.com/ebay-fee-calculator?utm_source=mcp&utm_medium=tool&utm_campaign=stp-fee-mcp');
    expect(Object.keys(def.calls.compare_marketplaces.structuredContent.calculator_url)).toEqual(['etsy', 'ebay', 'amazon']);
    expect(def.calls.amazon_fees.structuredContent.fee_table).toEqual(FEE_TABLES.amazon);
    expect(def.calls.etsy_fees.structuredContent.assumptions.join(' ')).toContain('exactly as on shoptrueprofit.com');
    for (const i of def.batch) expect(i.result.calculator_url).toBeTruthy();
  });

  it('apify mode has no off-platform link or promotion anywhere a user can see it', () => {
    for (const [part, value] of Object.entries(apify)) {
      const text = JSON.stringify(value);
      expect(text.match(OFF_PLATFORM)?.[0], `apify ${part}`).toBeUndefined();
    }
    expect(apify.info).toEqual({ name: 'shoptrueprofit-fee-mcp', title: 'ShopTrueProfit Fee & Profit', version: def.info!.version });
    for (const r of Object.values(apify.calls)) {
      expect(r.structuredContent).not.toHaveProperty('calculator_url');
      expect(JSON.parse(r.content[0].text)).toEqual(r.structuredContent);
      const fts = [r.structuredContent.fee_table].flat();
      for (const f of fts) expect(f.documentation).toMatch(/^https:\/\/(www\.etsy\.com|www\.ebay\.com|sellercentral\.amazon\.com)\//);
    }
    for (const t of apify.tools) { expect((t.outputSchema as any).required ?? []).not.toContain('calculator_url'); expect((t.outputSchema as any).additionalProperties).toEqual({}); }
    expect(apify.instructions).toMatch(/ShopTrueProfit fee engine/);
  });

  it('apify mode returns exactly the same numbers as the default mode', () => {
    for (const t of TOOLS) expect(neutral(apify.calls[t.name].structuredContent), t.name).toEqual(neutral(def.calls[t.name].structuredContent));
    expect(apify.batch.map(i => neutral(i.result))).toEqual(def.batch.map(i => neutral(i.result)));
    expect(apify.tools.map(t => [t.name, t.inputSchema])).toEqual(def.tools.map(t => [t.name, t.inputSchema]));
  });
});

describe('Apify Store packaging', () => {
  it('the Actor uses an Apify-only README with no off-platform links or pitch', () => {
    const a = JSON.parse(read('.actor/actor.json'));
    expect(a.readme).toBe('./README.md');
    const md = read('.actor/README.md');
    expect(md.match(OFF_PLATFORM)?.[0]).toBeUndefined();
    expect(md).not.toMatch(/mailto:|git clone|npm (install|run)|\]\((?!https:\/\/(docs\.apify\.com|www\.ebay\.com|www\.etsy\.com|sellercentral\.amazon\.com))/);
    for (const t of TOOLS) expect(md).toContain(`\`${t.name}\``);
  });
  it('actor.json has no off-platform link or promotion', () => {
    expect(read('.actor/actor.json').match(OFF_PLATFORM)?.[0]).toBeUndefined();
    for (const f of ['input_schema.json', 'dataset_schema.json', 'output_schema.json']) expect(read(`.actor/${f}`).match(OFF_PLATFORM)?.[0], f).toBeUndefined();
  });
  it('the Actor image runs in apify mode', () => {
    const stages = read('Dockerfile').split(/^FROM /m);
    expect(stages[stages.length - 1]).toMatch(/^ENV STP_DISTRIBUTION=apify$/m);
  });
  it('the GitHub/npm README is unchanged in substance (still links the calculators)', () => {
    expect(read('README.md')).toContain('https://shoptrueprofit.com');
  });
});

// Input validation: every bad input is rejected with a message that names the field. Nothing is silently clamped.
import { describe, it, expect } from 'vitest';
import * as z from 'zod';
import { err, ok } from './helpers';
import { TOOLS } from '../src/tools';
import { calcOutput, listOutput } from '../src/server';

const fba = { price: 24.99, category: 'home-kitchen', fulfillment: 'fba', length_in: 10, width_in: 6, height_in: 3, weight_lb: 1.2, ship_date: '2026-10-16' };
const amzFbm = { price: 20, category: 'home-kitchen', fulfillment: 'fbm' };

describe('rejects bad input with a clear, field-specific message', () => {
  const cases: [string, unknown, RegExp][] = [
    ['etsy_fees', {}, /price/],
    ['etsy_fees', { price: 0 }, /price must be greater than 0/],
    ['etsy_fees', { price: -5 }, /price must be greater than 0/],
    ['etsy_fees', { price: '25' }, /price must be a number/],
    ['etsy_fees', { price: 24.999 }, /at most 2 decimal places/],
    ['etsy_fees', { price: 2_000_000 }, /at most 1,000,000/],
    ['etsy_fees', { price: 25, quantity: 1.5 }, /whole number/],
    ['etsy_fees', { price: 25, quantity: 0 }, /at least 1/],
    ['etsy_fees', { price: 25, offsite_ads_pct: 10 }, /0, 12 or 15/],
    ['etsy_fees', { price: 25, offsite_ads_pct: 0.15 }, /0, 12 or 15/],
    ['etsy_fees', { price: 25, region: 'mars' }, /region must be one of: us, ca-dom/],
    ['etsy_fees', { price: 25, sales_tax_pct: 60 }, /at most 50/],
    ['etsy_fees', { price: 25, sales_tax_pct: -1 }, /cannot be negative/],
    ['etsy_fees', { price: 25, discount: 30 }, /discount \(30\) cannot be more than price x quantity \(25\)/],
    ['etsy_fees', { price: 25, shiping: 5 }, /Unknown argument\(s\): shiping\. Allowed arguments: price, quantity/],
    ['etsy_profit', { price: 25, item_cost: -1 }, /item_cost cannot be negative/],
    ['etsy_target_price', { item_cost: 5 }, /target_margin_pct/],
    ['etsy_target_price', { item_cost: 5, target_margin_pct: 95 }, /at most 90/],
    ['etsy_target_price', { price: 10, item_cost: 5, target_margin_pct: 30 }, /Unknown argument\(s\): price/],
    ['ebay_fees', { price: 25, category: 'cars' }, /category must be one of: most, media/],
    ['ebay_fees', { price: 25, promoted_listings_pct: 1 }, /0 \(no ads\) or between 2 and 100/],
    ['ebay_fees', { price: 25, promoted_listings_pct: 101 }, /at most 100/],
    ['ebay_fees', { price: 25, seller_performance: 'great' }, /seller_performance must be one of: none, below/],
    ['ebay_fees', { price: 25, international: 'yes' }, /international must be true or false/],
    ['amazon_fees', { price: 20, fulfillment: 'fbm' }, /category must be one of/],
    ['amazon_fees', { price: 20, category: 'home-kitchen' }, /fulfillment must be one of: fba, fbm/],
    ['amazon_fees', { price: 20, category: 'home-kitchen', fulfillment: 'fba' }, /length_in is required when fulfillment is "fba"/],
    ['amazon_fees', { ...fba, weight_lb: undefined }, /weight_lb is required/],
    ['amazon_fees', { ...fba, height_in: 0 }, /height_in must be greater than 0/],
    ['amazon_fees', { ...fba, shipping_charged: 5 }, /shipping_charged must be 0 for FBA/],
    ['amazon_profit', { ...fba, shipping_label_cost: 3 }, /shipping_label_cost is for FBM only/],
    ['amazon_profit', { ...amzFbm, inbound_cost: 1 }, /inbound_cost is for FBA only/],
    ['amazon_fees', { ...fba, ship_date: '2026-02-30' }, /real calendar date/],
    ['amazon_fees', { ...fba, ship_date: '10/16/2026' }, /YYYY-MM-DD/],
    ['amazon_fees', { ...fba, ship_date: '2031-01-01' }, /between 2025-01-01 and 2030-12-31/],
    ['amazon_fees', { ...fba, storage_months: 121 }, /at most 120/],
    ['amazon_fees', { ...fba, weight_lb: 20000 }, /at most 10000 pounds/],
    ['amazon_fees', { ...fba, product_type: 'fragile' }, /standard, apparel, dangerous/],
    ['amazon_fees', { ...amzFbm, selling_plan: 'free' }, /pro, individual/],
    ['amazon_fees', { ...amzFbm, units_per_month: 2.5 }, /whole number/],
    ['compare_marketplaces', { price: 20 }, /amazon/],
    ['compare_marketplaces', { price: 20, amazon: { category: 'toys', fulfillment: 'fba' } }, /length_in is required.*at amazon\.length_in/],
    ['compare_marketplaces', { price: 20, amazon: { category: 'toys', fulfillment: 'fbm', price: 3 } }, /Unknown argument\(s\): price/],
    ['compare_marketplaces', { price: 20, ebay: { promoted_listings_pct: 1 }, amazon: { category: 'toys', fulfillment: 'fbm' } }, /between 2 and 100/],
    ['list_ebay_categories', { anything: 1 }, /Unknown argument\(s\): anything/],
    ['no_such_tool', {}, /Unknown tool "no_such_tool"/],
  ];
  for (const [tool, args, re] of cases) it(`${tool} ${JSON.stringify(args)}`, () => { expect(err(tool, args)).toMatch(re); });
  it('NaN / Infinity are rejected (they cannot arrive via JSON, but direct callers are guarded too)', () => {
    expect(err('etsy_fees', { price: Number.NaN })).toMatch(/price/); expect(err('ebay_fees', { price: Number.POSITIVE_INFINITY })).toMatch(/price/);
  });
});

describe('accepts valid edge values exactly (no clamping)', () => {
  it('boundaries pass through unchanged', () => {
    expect(ok('etsy_fees', { price: 0.01 }).inputs.price).toBe(0.01);
    expect(ok('etsy_fees', { price: 25, discount: 25 }).revenue.seller_revenue).toBe(0);
    expect(ok('ebay_fees', { price: 25, promoted_listings_pct: 2 }).inputs.promoted_listings_pct).toBe(2);
    expect(ok('ebay_fees', { price: 25, promoted_listings_pct: 100, sales_tax_pct: 50 }).inputs.sales_tax_pct).toBe(50);
    expect(ok('amazon_fees', { ...fba, storage_months: 120, ship_date: '2030-12-31' }).inputs.storage_months).toBe(120);
    expect(ok('etsy_target_price', { target_margin_pct: 90 }).pricing.target_margin_pct).toBe(90);
  });
  it('defaults are explicit in the echoed inputs and assumptions', () => {
    const r = ok('etsy_fees', { price: 25 });
    expect(r.inputs).toMatchObject({ quantity: 1, shipping_charged: 0, offsite_ads_pct: 0, region: 'us', sales_tax_pct: 0, currency: 'USD' });
    const a = ok('amazon_fees', { ...fba, ship_date: undefined });
    expect(a.inputs.ship_date).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(a.assumptions.join(' ')).toMatch(/today in US Eastern time/);
    expect(ok('amazon_fees', amzFbm).assumptions.join(' ')).toMatch(/subscription is NOT included/);
  });
});

describe('advertised JSON Schemas are tight', () => {
  for (const t of TOOLS) it(`${t.name}: object, additionalProperties false, every property described`, () => {
    const js: any = z.toJSONSchema(t.input, { io: 'input' });
    expect(js.type).toBe('object'); expect(js.additionalProperties).toBe(false);
    for (const [k, p] of Object.entries<any>(js.properties ?? {})) expect(p.description, `${t.name}.${k}`).toMatch(/\w{3,}/);
    expect(t.description.length).toBeGreaterThan(t.charged ? 200 : 80);
  });
  it('required fields are exactly the ones without defaults', () => {
    const req = (n: string) => (z.toJSONSchema(TOOLS.find(t => t.name === n)!.input, { io: 'input' }) as any).required ?? [];
    expect(req('etsy_fees')).toEqual(['price']); expect(req('ebay_fees')).toEqual(['price']); expect(req('amazon_fees').sort()).toEqual(['category', 'fulfillment', 'price']);
    expect(req('etsy_target_price')).toEqual(['target_margin_pct']); expect(req('compare_marketplaces').sort()).toEqual(['amazon', 'price']);
    expect(req('list_amazon_categories')).toEqual([]);
  });
  it('enums are advertised so agents can pick valid ids without a lookup', () => {
    const js: any = z.toJSONSchema(TOOLS.find(t => t.name === 'amazon_fees')!.input, { io: 'input' });
    expect(js.properties.category.enum).toContain('home-kitchen'); expect(js.properties.fulfillment.enum).toEqual(['fba', 'fbm']);
    expect(js.properties.price.multipleOf).toBe(0.01);
  });
  it('every tool result satisfies its output schema', () => {
    const samples: Record<string, unknown> = {
      etsy_fees: { price: 25 }, ebay_fees: { price: 25 }, amazon_fees: fba, etsy_profit: { price: 25, item_cost: 8 }, ebay_profit: { price: 25, item_cost: 8 },
      amazon_profit: { ...fba, item_cost: 6 }, etsy_target_price: { item_cost: 8, target_margin_pct: 30 }, ebay_target_price: { item_cost: 8, target_margin_pct: 30 },
      amazon_target_price: { ...(({ price, ...x }) => x)(fba), item_cost: 6, target_margin_pct: 30 }, compare_marketplaces: { price: 25, amazon: { category: 'toys', fulfillment: 'fbm' }, target_margin_pct: 20 },
      list_ebay_categories: {}, list_amazon_categories: {}, list_etsy_regions: {},
    };
    for (const t of TOOLS) { const r = ok(t.name, samples[t.name]); const s = (t.charged ? calcOutput : listOutput).safeParse(r); expect(s.success, `${t.name}: ${s.error?.message}`).toBe(true); }
  });
});

describe('every result carries provenance', () => {
  it('fee table version + date, sources, calculator link, assumptions, disclaimer', () => {
    for (const [tool, args, page] of [['etsy_fees', { price: 25 }, 'etsy-fee-calculator'], ['ebay_profit', { price: 25 }, 'ebay-fee-calculator'], ['amazon_fees', fba, 'amazon-fba-fee-calculator']] as const) {
      const r = ok(tool, args);
      expect(r.fee_table.id).toMatch(/^(etsy|ebay-us|amazon-us)-2026-10-1[36]$/); expect(r.fee_table.verified_on).toMatch(/^2026-10-1[36]$/); expect(r.fee_table.engine_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.sources.length).toBeGreaterThan(1); for (const s of r.sources) expect(s.url).toMatch(/^https:\/\/(www\.etsy\.com|help\.etsy\.com|www\.ebay\.com|sellercentral\.amazon\.com|sell\.amazon\.com)\//);
      expect(r.calculator_url).toBe(`https://shoptrueprofit.com/${page}?utm_source=mcp&utm_medium=tool&utm_campaign=stp-fee-mcp`);
      expect(r.assumptions.length).toBeGreaterThan(2); expect(r.disclaimer).toMatch(/Not affiliated/); expect(r.summary).toMatch(/\$/);
      expect(r.fees.lines.reduce((s: number, l: any) => s + l.amount, 0)).toBeCloseTo(r.fees.total, 1);
    }
  });
});

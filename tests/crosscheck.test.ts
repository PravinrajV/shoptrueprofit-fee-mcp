// Cross-checks every number this server returns against the LIVE APP's own functions (imported straight from
// etsy-profit-dashboard/src, not from our vendored copy) and against the app's hand-verified test fixtures.
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_SRC, HAS_APP, ok, rng, cents, pick, line } from './helpers';
import SOURCE from '../src/engine/SOURCE.json';
import { EBAY_CATEGORY_IDS, AMAZON_CATEGORY_IDS, ETSY_REGION_IDS, EBAY_PERFORMANCE_IDS } from '../src/schemas';

const app = HAS_APP ? {
  etsy: await import(/* @vite-ignore */ resolve(APP_SRC, 'feecalc.ts')),
  ebay: await import(/* @vite-ignore */ resolve(APP_SRC, 'marketplaces/ebay.ts')),
  amazon: await import(/* @vite-ignore */ resolve(APP_SRC, 'marketplaces/amazon.ts')),
} : null;
const d = describe.skipIf(!HAS_APP);
let compared = 0; // number of tool results compared field-by-field against the app

// ---- independent mapping from tool arguments to the app's calculator inputs (mirrors the calculator pages: % / 100)
const etsyIn = (a: any) => ({ price: a.price ?? 0, qty: a.quantity ?? 1, shipping: a.shipping_charged ?? 0, giftWrap: a.gift_wrap ?? 0, discount: a.discount ?? 0,
  cost: a.item_cost ?? 0, label: (a.shipping_label_cost ?? 0) + (a.ad_spend ?? 0), offsite: ({ 0: 0, 12: 0.12, 15: 0.15 } as any)[a.offsite_ads_pct ?? 0], region: a.region ?? 'us', taxRate: (a.sales_tax_pct ?? 0) / 100 });
const ebayIn = (a: any) => ({ price: a.price ?? 0, qty: a.quantity ?? 1, shipping: a.shipping_charged ?? 0, taxRate: (a.sales_tax_pct ?? 0) / 100, category: a.category ?? 'most',
  adRate: (a.promoted_listings_pct ?? 0) / 100, international: a.international ?? false, performance: a.seller_performance ?? 'none', insertion: a.insertion_fee ?? false,
  cost: a.item_cost ?? 0, label: (a.shipping_label_cost ?? 0) + (a.ad_spend ?? 0) });
const amzIn = (a: any) => ({ price: a.price ?? 0, shipping: a.fulfillment === 'fba' ? 0 : a.shipping_charged ?? 0, giftWrap: a.gift_wrap ?? 0, category: a.category, fulfillment: a.fulfillment,
  plan: a.selling_plan ?? 'pro', unitsPerMonth: a.units_per_month ?? 0, type: a.product_type ?? 'standard', length: a.length_in ?? 0, width: a.width_in ?? 0, height: a.height_in ?? 0,
  weight: a.weight_lb ?? 0, date: a.ship_date, storageMonths: a.storage_months ?? 1, cost: (a.item_cost ?? 0) + (a.ad_spend ?? 0), inbound: a.inbound_cost ?? 0, label: a.shipping_label_cost ?? 0 });

function checkEtsy(a: any) {
  const e = app!.etsy.calc(etsyIn(a)); const f = ok('etsy_fees', strip(a, ['item_cost', 'shipping_label_cost', 'ad_spend'])); const p = ok('etsy_profit', a);
  for (const r of [f, p]) {
    expect([line(r, 'listing'), line(r, 'transaction'), line(r, 'processing'), line(r, 'offsite_ads')]).toEqual([e.listing, e.transaction, e.processing, e.offsite]);
    expect(r.fees.total).toBe(e.fees); expect(r.revenue.seller_revenue).toBe(e.gross); expect(r.revenue.sales_tax_collected_by_marketplace).toBe(e.tax); expect(r.currency).toBe(e.region.cur);
  }
  expect(p.profit).toEqual({ profit: e.profit, margin_pct: Math.round(e.margin * 10000) / 100, margin_ratio: e.margin, profit_per_unit: e.perUnit, break_even_price: e.breakEven });
  expect(p.costs.total).toBe(e.costs);
  compared += 2; return e;
}
function checkEbay(a: any) {
  const e = app!.ebay.calcEbay(ebayIn(a)); const f = ok('ebay_fees', strip(a, ['item_cost', 'shipping_label_cost', 'ad_spend'])); const p = ok('ebay_profit', a);
  for (const r of [f, p]) {
    expect(['final_value_fee', 'per_order_fee', 'promoted_listings', 'international', 'performance', 'insertion'].map(c => line(r, c))).toEqual([e.fvf, e.orderFee, e.ad, e.intl, e.performance, e.insertion]);
    expect(r.fees.total).toBe(e.fees); expect(r.revenue.seller_revenue).toBe(e.gross); expect(r.details.sale_total_incl_tax).toBe(e.saleTotal);
  }
  expect(p.profit).toEqual({ profit: e.profit, margin_pct: Math.round(e.margin * 10000) / 100, margin_ratio: e.margin, profit_per_unit: e.perUnit, break_even_price: e.breakEven });
  expect(p.costs.total).toBe(e.costs);
  compared += 2; return e;
}
function checkAmazon(a: any) {
  const e = app!.amazon.calcAmazon(amzIn(a), a.ship_date); const f = ok('amazon_fees', strip(a, ['item_cost', 'inbound_cost', 'shipping_label_cost', 'ad_spend'])); const p = ok('amazon_profit', a);
  for (const r of [f, p]) {
    expect(['referral', 'closing', 'per_item', 'subscription', 'fba_fulfillment', 'fuel_surcharge', 'storage'].map(c => line(r, c))).toEqual([e.referral, e.closing, e.perItem, e.plan, e.fba, e.surcharge, e.storage]);
    expect(r.fees.total).toBe(e.fees); expect(r.revenue.seller_revenue).toBe(e.gross); expect(r.details.season).toBe(e.season);
    expect(r.details.size_tier?.id ?? null).toBe(e.tier?.tier ?? null);
  }
  expect(p.warnings.slice(0, e.warnings.length)).toEqual(e.warnings);
  expect(p.profit).toEqual({ profit: e.profit, margin_pct: Math.round(e.margin * 10000) / 100, margin_ratio: e.margin, profit_per_unit: e.profit, break_even_price: e.breakEven });
  expect(p.costs.total).toBe(e.costs);
  compared += 2; return e;
}
function checkTarget(m: 'etsy' | 'ebay' | 'amazon', a: any, tm: number) {
  const { price: _p, ...rest } = a; const t = ok(`${m}_target_price`, { ...rest, target_margin_pct: tm });
  const solve = m === 'etsy' ? (x: number) => app!.etsy.priceForMargin(etsyIn(a), x) : m === 'ebay' ? (x: number) => app!.ebay.ebayPriceForMargin(ebayIn(a), x) : (x: number) => app!.amazon.amazonPriceForMargin(amzIn(a), x, a.ship_date);
  expect(t.pricing.break_even_price).toBe(solve(0)); expect(t.pricing.target_price).toBe(solve(tm / 100)); expect(t.pricing.reachable).toBe(solve(tm / 100) !== null);
  if (t.pricing.target_price !== null) {
    const at = m === 'etsy' ? app!.etsy.calc({ ...etsyIn(a), price: t.pricing.target_price }) : m === 'ebay' ? app!.ebay.calcEbay({ ...ebayIn(a), price: t.pricing.target_price }) : app!.amazon.calcAmazon({ ...amzIn(a), price: t.pricing.target_price }, a.ship_date);
    expect(t.pricing.at_target_price).toEqual({ revenue: at.gross, fees: at.fees, costs: at.costs, profit: at.profit, margin_pct: Math.round(at.margin * 10000) / 100 });
    expect(at.margin).toBeGreaterThanOrEqual(tm / 100 - 1e-9);
  }
  compared++; return t;
}
const strip = (a: any, keys: string[]) => Object.fromEntries(Object.entries(a).filter(([k]) => !keys.includes(k)));

d('engine is a byte-identical copy of the app', () => {
  it('SHA-256 of every vendored file matches the app source', () => {
    for (const [f, h] of Object.entries(SOURCE.files)) {
      expect(createHash('sha256').update(readFileSync(resolve(APP_SRC, f))).digest('hex'), `app src/${f}`).toBe(h);
      expect(createHash('sha256').update(readFileSync(resolve(__dirname, '../src/engine', f))).digest('hex'), `vendored ${f}`).toBe(h);
    }
  });
});

d('app fixtures (hand-verified numbers from etsy-profit-dashboard/tests)', () => {
  // Etsy: tests/feecalc.test.ts
  it('Etsy $25 + $5 shipping, $8 cost, $4 label → fees 3.30, profit 14.70', () => {
    const e = checkEtsy({ price: 25, shipping_charged: 5, item_cost: 8, shipping_label_cost: 4 });
    expect(e).toMatchObject({ gross: 30, listing: 0.2, transaction: 1.95, processing: 1.15, fees: 3.3, costs: 12, profit: 14.7 });
  });
  it('Etsy Offsite Ads 15% + 8% tax → processing 1.22, offsite 4.50, fees 7.87', () => {
    const r = ok('etsy_fees', { price: 25, shipping_charged: 5, offsite_ads_pct: 15, sales_tax_pct: 8 });
    expect([r.revenue.sales_tax_collected_by_marketplace, line(r, 'processing'), line(r, 'offsite_ads'), r.fees.total]).toEqual([2.4, 1.22, 4.5, 7.87]); checkEtsy({ price: 25, shipping_charged: 5, offsite_ads_pct: 15, sales_tax_pct: 8 });
  });
  it('Etsy qty 2, $4 discount, gift wrap → gross 45, fees 4.93', () => {
    checkEtsy({ price: 20, quantity: 2, discount: 4, shipping_charged: 6, gift_wrap: 3 });
    const r = ok('etsy_fees', { price: 20, quantity: 2, discount: 4, shipping_charged: 6, gift_wrap: 3 }); expect([r.revenue.seller_revenue, line(r, 'listing'), line(r, 'transaction'), line(r, 'processing'), r.fees.total]).toEqual([45, 0.4, 2.93, 1.6, 4.93]);
  });
  it('Etsy Offsite Ads cap: $1,000 at 12% → 100; $800 → 96', () => {
    expect(line(ok('etsy_fees', { price: 1000, offsite_ads_pct: 12 }), 'offsite_ads')).toBe(100); expect(line(ok('etsy_fees', { price: 800, offsite_ads_pct: 12 }), 'offsite_ads')).toBe(96);
    checkEtsy({ price: 1000, offsite_ads_pct: 12 }); checkEtsy({ price: 800, offsite_ads_pct: 12 });
  });
  it('Etsy UK region 4% + £0.20 → processing 2.20 GBP', () => { const r = ok('etsy_fees', { price: 50, region: 'uk' }); expect(line(r, 'processing')).toBe(2.2); expect(r.currency).toBe('GBP'); checkEtsy({ price: 50, region: 'uk' }); });
  it('Etsy break-even 11.50 with 15% Offsite Ads; 30% target price', () => {
    const t = checkTarget('etsy', { shipping_charged: 5, item_cost: 8, shipping_label_cost: 4, offsite_ads_pct: 15 }, 30); expect(t.pricing.break_even_price).toBe(11.5);
    expect(t.pricing.at_target_price.margin_pct).toBeGreaterThanOrEqual(30); expect(t.pricing.at_target_price.margin_pct).toBeLessThan(30.1);
  });
  it('Etsy break-even across the ads cap; 95%-style impossible margin is unreachable at 90 with high fees', () => {
    const t = checkTarget('etsy', { item_cost: 900, offsite_ads_pct: 15 }, 0); expect(t.pricing.reachable).toBe(true);
    const u = checkTarget('etsy', { item_cost: 5, offsite_ads_pct: 15 }, 90); expect(u.pricing.reachable).toBe(false); expect(u.pricing.max_reachable_margin_pct).toBeLessThan(90);
  });
  // eBay: tests/ebay.test.ts
  it('eBay $25 + $5, $8 cost, $4 label → fvf 4.08, fees 4.48, profit 13.52', () => {
    expect(checkEbay({ price: 25, shipping_charged: 5, item_cost: 8, shipping_label_cost: 4 })).toMatchObject({ fvf: 4.08, orderFee: 0.4, fees: 4.48, profit: 13.52 });
  });
  it('eBay official example: $400 + 6% tax + insertion → fees 58.41, profit 341.59', () => {
    expect(checkEbay({ price: 400, sales_tax_pct: 6, insertion_fee: true })).toMatchObject({ saleTotal: 424, fvf: 57.66, fees: 58.41, profit: 341.59 });
  });
  it('eBay official example: $9,500 trading card + 6% tax → FVF + order fee 1,054.55', () => {
    const r = ok('ebay_fees', { price: 9500, sales_tax_pct: 6, category: 'cards', insertion_fee: true });
    expect(line(r, 'final_value_fee') + line(r, 'per_order_fee')).toBeCloseTo(1054.55, 2); checkEbay({ price: 9500, sales_tax_pct: 6, category: 'cards', insertion_fee: true });
  });
  it('eBay per-order fee $0.30 at a $10.00 total, $0.40 above (tax counts)', () => {
    expect(checkEbay({ price: 8, shipping_charged: 2 })).toMatchObject({ orderFee: 0.3, fvf: 1.36, fees: 1.66 });
    expect(checkEbay({ price: 8.01, shipping_charged: 2 }).orderFee).toBe(0.4); expect(checkEbay({ price: 9.5, sales_tax_pct: 8 }).orderFee).toBe(0.4);
  });
  it('eBay tax in fee base, not in gross; Promoted + international', () => {
    expect(checkEbay({ price: 25, shipping_charged: 5, sales_tax_pct: 8 })).toMatchObject({ gross: 30, saleTotal: 32.4, fvf: 4.41, fees: 4.81, profit: 25.19 });
    expect(checkEbay({ price: 35, shipping_charged: 5, promoted_listings_pct: 5, international: true })).toMatchObject({ fvf: 5.44, ad: 2, intl: 0.66, fees: 8.5 });
  });
  it('eBay performance surcharges 6% / 7% / 5%', () => {
    expect(checkEbay({ price: 30, seller_performance: 'below' }).performance).toBe(1.8); expect(checkEbay({ price: 30, seller_performance: 'below4' }).performance).toBe(2.1);
    expect(checkEbay({ price: 30, seller_performance: 'inad' }).performance).toBe(1.5);
  });
  it('eBay tiered categories (watches, jewelry, bullion, handbags, most, media, guitars, heavy)', () => {
    const cases: [any, number][] = [[{ price: 2000, category: 'watches' }, 215], [{ price: 9000, category: 'watches' }, 617.5], [{ price: 5000, category: 'jewelry' }, 750], [{ price: 5000.01, category: 'jewelry' }, 450],
      [{ price: 8000, category: 'bullion' }, 560], [{ price: 2500, category: 'handbags' }, 225], [{ price: 10000 }, 1078.75], [{ price: 20, category: 'media' }, 3.06], [{ price: 1000, category: 'guitars' }, 67], [{ price: 20000, category: 'heavy' }, 475]];
    for (const [a, fvf] of cases) expect(checkEbay(a).fvf, JSON.stringify(a)).toBe(fvf);
  });
  it('eBay athletic shoes: 8% and no per-order fee from $150', () => {
    expect(checkEbay({ price: 150, category: 'sneakers' })).toMatchObject({ fvf: 12, orderFee: 0, fees: 12 }); expect(checkEbay({ price: 149.99, category: 'sneakers' })).toMatchObject({ fvf: 20.4, orderFee: 0.4 });
  });
  it('eBay tiers per item, per-order fee once (2 watches at $1,000)', () => { expect(checkEbay({ price: 1000, quantity: 2, category: 'watches' })).toMatchObject({ fvf: 300, orderFee: 0.4, perUnit: 849.8 }); });
  it('eBay break-even 9.36, 30% target 16.99; $10 step (8.45 / 10.13); jewelry band switch', () => {
    const t = checkTarget('ebay', { shipping_charged: 5, item_cost: 8, shipping_label_cost: 4 }, 30); expect([t.pricing.break_even_price, t.pricing.target_price]).toEqual([9.36, 16.99]);
    expect(checkTarget('ebay', { item_cost: 7 }, 0).pricing.break_even_price).toBe(8.45); expect(checkTarget('ebay', { item_cost: 8.35 }, 0).pricing.break_even_price).toBe(10.13);
    expect(checkTarget('ebay', { item_cost: 4500, category: 'jewelry' }, 0).pricing.break_even_price).toBe(5000.01);
  });
  // Amazon: tests/amazon.test.ts
  const base = { price: 24.99, category: 'home-kitchen', fulfillment: 'fba', length_in: 10, width_in: 6, height_in: 3, weight_lb: 1.2, ship_date: '2026-10-16', item_cost: 6, inbound_cost: 0.5 };
  it('Amazon FBA default page example: fees 9.93, profit 8.56, break-even 14.92 (peak)', () => {
    expect(checkAmazon(base)).toMatchObject({ referral: 3.75, fba: 5.73, surcharge: 0.2, storage: 0.25, fees: 9.93, profit: 8.56, breakEven: 14.92, season: 'peak' });
  });
  it('Amazon non-peak before/after the Apr 17 surcharge', () => {
    expect(checkAmazon({ ...base, ship_date: '2026-03-01' })).toMatchObject({ fba: 5.42, surcharge: 0, storage: 0.08, season: 'nonpeak' }); expect(checkAmazon({ ...base, ship_date: '2026-07-01' }).surcharge).toBe(0.19);
  });
  it('Amazon FBM Individual plan: referral 3.75 + 0.99, profit 10.26', () => {
    expect(checkAmazon({ price: 20, shipping_charged: 5, fulfillment: 'fbm', selling_plan: 'individual', category: 'home-kitchen', item_cost: 6, shipping_label_cost: 4, ship_date: '2026-10-16' }))
      .toMatchObject({ gross: 25, referral: 3.75, perItem: 0.99, fees: 4.74, costs: 10, profit: 10.26 });
  });
  it('Amazon media closing fee + Pro plan allocation → fees 3.70', () => {
    expect(checkAmazon({ price: 10, category: 'media', fulfillment: 'fbm', units_per_month: 100, ship_date: '2026-10-16' })).toMatchObject({ referral: 1.5, closing: 1.8, plan: 0.4, fees: 3.7 });
  });
  it('Amazon break-even across the $10 band (9.15 / 11.46) and clothing bands (14.22)', () => {
    const sm = { category: 'home-kitchen', fulfillment: 'fba', length_in: 8, width_in: 5, height_in: 0.5, weight_lb: 0.25, ship_date: '2026-10-16', storage_months: 0, item_cost: 5 };
    expect(checkTarget('amazon', sm, 0).pricing.break_even_price).toBe(9.15); expect(checkTarget('amazon', { ...sm, item_cost: 6 }, 0).pricing.break_even_price).toBe(11.46);
    expect(checkTarget('amazon', { category: 'clothing', fulfillment: 'fbm', item_cost: 13.5, ship_date: '2026-10-16' }, 0).pricing.break_even_price).toBe(14.22);
  });
  it('Amazon official FBA examples (iron, baby cot, monitor, TV) via amazon_fees', () => {
    const ex: [any, number, number][] = [[{ length_in: 12.6, width_in: 6.6, height_in: 5.5, weight_lb: 3.35, price: 20 }, 7.13, 7.67], [{ length_in: 24, width_in: 7.5, height_in: 6, weight_lb: 7.9, price: 60 }, 10.21, 11.25],
      [{ length_in: 54, width_in: 35, height_in: 3.5, weight_lb: 41, price: 30 }, 44.19, 46.92], [{ length_in: 65, width_in: 20, height_in: 7, weight_lb: 62, price: 300 }, 48.57, 51.38]];
    for (const [a, nonpeak, peak] of ex) {
      expect(line(ok('amazon_fees', { ...a, category: 'home-kitchen', fulfillment: 'fba', ship_date: '2026-03-01' }), 'fba_fulfillment')).toBe(nonpeak);
      expect(line(ok('amazon_fees', { ...a, category: 'home-kitchen', fulfillment: 'fba', ship_date: '2026-11-01' }), 'fba_fulfillment')).toBe(peak);
      checkAmazon({ ...a, category: 'home-kitchen', fulfillment: 'fba', ship_date: '2026-03-01' }); checkAmazon({ ...a, category: 'home-kitchen', fulfillment: 'fba', ship_date: '2026-11-01' });
    }
  });
  it('Amazon warnings pass through (after Jan 14, 2027; Overmax)', () => {
    expect(ok('amazon_fees', { ...strip(base, ['item_cost', 'inbound_cost']), ship_date: '2027-02-01' }).warnings[0]).toMatch(/after Jan 14, 2027/);
    expect(ok('amazon_fees', { ...strip(base, ['item_cost', 'inbound_cost']), length_in: 100, weight_lb: 50 }).warnings.join(' ')).toMatch(/Overmax/);
    checkAmazon({ ...base, ship_date: '2027-02-01' }); checkAmazon({ ...base, length_in: 100, weight_lb: 50 });
  });
  it('Amazon 90% margin is unreachable', () => { expect(checkTarget('amazon', base, 90).pricing.reachable).toBe(false); });
});

d('generated cases: tool output === app output, field by field', () => {
  const r = rng(20261017); const N = 150;
  it(`Etsy: ${N} random orders x (fees, profit, target price)`, () => {
    for (let k = 0; k < N; k++) {
      const price = Math.max(0.01, cents(r, pick(r, [5, 40, 300, 2000]))); const quantity = 1 + Math.floor(r() * 5);
      const a: any = { price, quantity, shipping_charged: cents(r, 15), gift_wrap: r() < 0.2 ? cents(r, 8) : 0, discount: r() < 0.3 ? cents(r, price * quantity) : 0,
        offsite_ads_pct: pick(r, [0, 0, 12, 15]), region: pick(r, ETSY_REGION_IDS), sales_tax_pct: r() < 0.5 ? Math.round(r() * 1200) / 100 : 0,
        item_cost: cents(r, price * 0.8), shipping_label_cost: cents(r, 12), ad_spend: r() < 0.3 ? cents(r, 5) : 0 };
      checkEtsy(a); checkTarget('etsy', a, pick(r, [0, 10, 25, 40, 60, 85]));
    }
  });
  it(`eBay: ${N} random orders x (fees, profit, target price)`, () => {
    for (let k = 0; k < N; k++) {
      const price = Math.max(0.01, cents(r, pick(r, [12, 60, 400, 6000, 20000])));
      const a: any = { price, quantity: r() < 0.8 ? 1 : 2 + Math.floor(r() * 4), shipping_charged: cents(r, 20), sales_tax_pct: r() < 0.5 ? Math.round(r() * 1000) / 100 : 0,
        category: pick(r, EBAY_CATEGORY_IDS), promoted_listings_pct: r() < 0.4 ? 2 + Math.round(r() * 1800) / 100 : 0, international: r() < 0.2, seller_performance: pick(r, EBAY_PERFORMANCE_IDS),
        insertion_fee: r() < 0.2, item_cost: cents(r, price * 0.7), shipping_label_cost: cents(r, 15), ad_spend: r() < 0.2 ? cents(r, 5) : 0 };
      checkEbay(a); checkTarget('ebay', a, pick(r, [0, 15, 30, 50, 75]));
    }
  });
  it(`Amazon: ${N} random units (FBA + FBM, all categories, all seasons) x (fees, profit, target price)`, () => {
    const dates = ['2025-06-01', '2026-01-20', '2026-04-16', '2026-04-17', '2026-09-30', '2026-10-14', '2026-10-15', '2026-12-31', '2027-01-14', '2027-01-15', '2028-05-05'];
    for (let k = 0; k < N; k++) {
      const fba = r() < 0.65; const price = Math.max(0.01, cents(r, pick(r, [9.99, 25, 60, 400, 2500])));
      const a: any = { price, category: pick(r, AMAZON_CATEGORY_IDS), fulfillment: fba ? 'fba' : 'fbm', selling_plan: r() < 0.8 ? 'pro' : 'individual',
        units_per_month: r() < 0.5 ? Math.floor(r() * 500) : 0, product_type: pick(r, ['standard', 'standard', 'apparel', 'dangerous']), ship_date: pick(r, dates),
        gift_wrap: r() < 0.1 ? cents(r, 5) : 0, item_cost: cents(r, price * 0.6), ad_spend: r() < 0.3 ? cents(r, 4) : 0 };
      if (fba) Object.assign(a, { length_in: Math.round((0.5 + r() * pick(r, [12, 20, 50, 110])) * 10) / 10, width_in: Math.round((0.2 + r() * pick(r, [8, 15, 35])) * 10) / 10,
        height_in: Math.round((0.1 + r() * pick(r, [0.7, 6, 25])) * 100) / 100, weight_lb: Math.round((0.05 + r() * pick(r, [0.9, 4, 30, 180])) * 100) / 100,
        storage_months: pick(r, [0, 1, 1, 2.5, 6]), inbound_cost: cents(r, 3) });
      else Object.assign(a, { shipping_charged: cents(r, 12), shipping_label_cost: cents(r, 10) });
      checkAmazon(a); checkTarget('amazon', a, pick(r, [0, 10, 20, 35, 60]));
    }
  });
  it('compare_marketplaces equals the three per-marketplace profit tools (and the app)', () => {
    for (let k = 0; k < 40; k++) {
      const fba = r() < 0.5; const price = Math.max(1, cents(r, 120));
      const a: any = { price, shipping_charged: cents(r, 10), sales_tax_pct: Math.round(r() * 900) / 100, item_cost: cents(r, price * 0.5), shipping_label_cost: cents(r, 8), ad_spend: cents(r, 3), target_margin_pct: 25,
        etsy: { offsite_ads_pct: pick(r, [0, 12, 15]) }, ebay: { category: pick(r, EBAY_CATEGORY_IDS), promoted_listings_pct: pick(r, [0, 2, 5.5, 12]), seller_performance: 'none' },
        amazon: { category: pick(r, AMAZON_CATEGORY_IDS), fulfillment: fba ? 'fba' : 'fbm', ship_date: '2026-11-02', ...(fba ? { length_in: 9, width_in: 6, height_in: 2, weight_lb: 0.8, inbound_cost: 0.4 } : {}) } };
      const c = ok('compare_marketplaces', a);
      const ep = { price, shipping_charged: a.shipping_charged, sales_tax_pct: a.sales_tax_pct, item_cost: a.item_cost, shipping_label_cost: a.shipping_label_cost, ad_spend: a.ad_spend };
      const e = checkEtsy({ ...ep, offsite_ads_pct: a.etsy.offsite_ads_pct });
      const b = checkEbay({ ...ep, ...a.ebay });
      const am = checkAmazon({ ...a.amazon, price, item_cost: a.item_cost, ad_spend: a.ad_spend, ...(fba ? {} : { shipping_charged: a.shipping_charged, shipping_label_cost: a.shipping_label_cost }) });
      const by = Object.fromEntries(c.comparison.ranking.map((x: any) => [x.marketplace, x]));
      expect([by.etsy.profit, by.ebay.profit, by.amazon.profit]).toEqual([e.profit, b.profit, am.profit]);
      expect([by.etsy.fees, by.ebay.fees, by.amazon.fees]).toEqual([e.fees, b.fees, am.fees]);
      expect([by.etsy.break_even_price, by.ebay.break_even_price, by.amazon.break_even_price]).toEqual([e.breakEven, b.breakEven, am.breakEven]);
      expect(c.comparison.ranking.map((x: any) => x.profit)).toEqual([...c.comparison.ranking.map((x: any) => x.profit)].sort((p: number, q: number) => q - p));
      expect(by.etsy.target_price).toBe(app!.etsy.priceForMargin(etsyIn({ ...ep, offsite_ads_pct: a.etsy.offsite_ads_pct }), 0.25));
      compared++;
    }
  });
  it('compared at least 30 cases (actually hundreds)', () => { expect(compared).toBeGreaterThanOrEqual(30); console.log(`cross-checked ${compared} tool results against the app`); });
});

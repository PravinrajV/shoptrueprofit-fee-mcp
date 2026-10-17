// Input schemas (zod v4). These are the ONLY gate in front of the fee engine: the engine itself silently clamps junk
// (negative -> 0, unknown category -> default), so every rule here rejects instead, with a message an agent can act on.
import * as z from 'zod';
import { REGIONS } from './engine/feecalc';
import { EBAY_CATEGORIES, EBAY_PERFORMANCE, EBAY_AD_MIN, EBAY_AD_MAX } from './engine/marketplaces/ebay';
import { AMZ_CATEGORIES } from './engine/marketplaces/amazon';

export const MAX_MONEY = 1_000_000;
export const MAX_QTY = 10_000;

const ids = <T extends { id: string }>(a: T[]) => a.map(x => x.id) as [string, ...string[]];
export const ETSY_REGION_IDS = ids(REGIONS);
export const EBAY_CATEGORY_IDS = ids(EBAY_CATEGORIES);
export const EBAY_PERFORMANCE_IDS = ids(EBAY_PERFORMANCE);
export const AMAZON_CATEGORY_IDS = ids(AMZ_CATEGORIES);

const enumOf = (field: string, values: [string, ...string[]], hint: string) =>
  z.enum(values, { error: iss => `${field} must be one of: ${values.join(', ')}${hint ? ` (${hint})` : ''}. Got ${JSON.stringify(iss.input)}.` });

/** Money amount in whole cents, 0..1,000,000 (or > 0 when `positive`). */
function money(field: string, description: string, positive = false) {
  let s = z.number({ error: iss => `${field} must be a number (got ${iss.input === undefined ? 'nothing' : typeof iss.input}).` });
  s = positive ? s.gt(0, { error: `${field} must be greater than 0.` }) : s.min(0, { error: `${field} cannot be negative.` });
  return s.max(MAX_MONEY, { error: `${field} must be at most ${MAX_MONEY.toLocaleString('en-US')}.` })
    .multipleOf(0.01, { error: `${field} must be in whole cents (at most 2 decimal places), e.g. 24.99.` })
    .describe(description);
}
function pct(field: string, description: string, max: number) {
  return z.number({ error: `${field} must be a number of percent, e.g. 8.25 for 8.25%.` })
    .min(0, { error: `${field} cannot be negative.` })
    .max(max, { error: `${field} must be at most ${max} (it is a percent: 8.25 means 8.25%).` })
    .multipleOf(0.0001, { error: `${field} allows at most 4 decimal places.` })
    .describe(description);
}
/** Strict object: unknown argument names are rejected (a typo like "categry" must not be silently ignored). */
function strict<T extends z.ZodRawShape>(shape: T) {
  const allowed = Object.keys(shape).join(', ');
  return z.strictObject(shape, { error: iss => iss.code === 'unrecognized_keys' ? `Unknown argument(s): ${iss.keys.join(', ')}. Allowed arguments: ${allowed || '(none)'}.` : undefined });
}
const qty = () => z.number({ error: 'quantity must be a whole number.' }).int({ error: 'quantity must be a whole number (no decimals).' })
  .min(1, { error: 'quantity must be at least 1.' }).max(MAX_QTY, { error: `quantity must be at most ${MAX_QTY}.` });
const targetMargin = () => z.number({ error: 'target_margin_pct must be a number of percent, e.g. 30 for 30%.' })
  .min(0, { error: 'target_margin_pct cannot be negative (use 0 for break-even).' }).max(90, { error: 'target_margin_pct must be at most 90 (percent of revenue).' })
  .multipleOf(0.01, { error: 'target_margin_pct allows at most 2 decimal places.' })
  .describe('Desired profit as a percent of seller revenue (0 = break-even, 30 = 30% margin). 0 to 90.');
const dim = (field: string, unit: string, max: number) => z.number({ error: `${field} must be a number in ${unit}.` })
  .gt(0, { error: `${field} must be greater than 0 ${unit}.` }).max(max, { error: `${field} must be at most ${max} ${unit}.` });

// ------------------------------------------------------------------ Etsy
const etsySale = {
  price: money('price', 'Item price per unit, before any discount, in the shop\'s region currency (USD for "us").', true),
  quantity: qty().default(1).describe('Units in the order (same item). Default 1.'),
  shipping_charged: money('shipping_charged', 'Shipping the buyer pays for the whole order. Default 0.').default(0),
  gift_wrap: money('gift_wrap', 'Gift wrap charge paid by the buyer. Default 0.').default(0),
  discount: money('discount', 'Total discount on the order (coupon or sale), in currency, not percent. Default 0.').default(0),
  offsite_ads_pct: z.union([z.literal(0), z.literal(12), z.literal(15)], { error: 'offsite_ads_pct must be 0, 12 or 15.' }).default(0)
    .describe('Etsy Offsite Ads fee if this order came from an Offsite Ad: 15 (shops under $10k/yr sales), 12 (over $10k/yr), or 0 (not an Offsite Ads sale). Default 0. Capped at 100 per order.'),
  region: enumOf('region', ETSY_REGION_IDS, 'seller\'s Etsy Payments region; call list_etsy_regions').default('us')
    .describe('Seller\'s Etsy Payments region, which sets the payment processing rate and currency. Default "us". See list_etsy_regions.'),
  sales_tax_pct: pct('sales_tax_pct', 'Sales tax / VAT rate the buyer pays on items + shipping (Etsy collects it; it is not seller income, but payment processing is charged on it). Default 0.', 50).default(0),
};
const etsyCosts = {
  item_cost: money('item_cost', 'Your cost per unit (materials, product, packaging per item). Default 0.').default(0),
  shipping_label_cost: money('shipping_label_cost', 'What you pay for the shipping label and packaging for the whole order. Default 0.').default(0),
  ad_spend: money('ad_spend', 'Ad spend you attribute to this order (e.g. Etsy Ads cost-per-click budget per sale). Not an Etsy fee; counted as a cost. Default 0.').default(0),
};
const discountCheck = (v: { price: number; quantity: number; discount: number }, ctx: z.RefinementCtx) => {
  if (v.discount > v.price * v.quantity + 1e-9) ctx.addIssue({ code: 'custom', path: ['discount'], message: `discount (${v.discount}) cannot be more than price x quantity (${+(v.price * v.quantity).toFixed(2)}).` });
};
export const etsyFeesInput = strict(etsySale).superRefine(discountCheck);
export const etsyProfitInput = strict({ ...etsySale, ...etsyCosts }).superRefine(discountCheck);
const { price: _p1, ...etsyNoPrice } = etsySale;
export const etsyTargetInput = strict({ ...etsyNoPrice, ...etsyCosts, target_margin_pct: targetMargin() });

// ------------------------------------------------------------------ eBay
const promoted = () => z.number({ error: 'promoted_listings_pct must be a number of percent.' })
  .min(0, { error: 'promoted_listings_pct cannot be negative.' }).max(EBAY_AD_MAX * 100, { error: 'promoted_listings_pct must be at most 100.' })
  .multipleOf(0.0001, { error: 'promoted_listings_pct allows at most 4 decimal places.' })
  .refine(v => v === 0 || v >= EBAY_AD_MIN * 100, { error: `promoted_listings_pct must be 0 (no ads) or between ${EBAY_AD_MIN * 100} and 100: eBay's General (cost-per-sale) ad rate cannot be below 2%.` })
  .default(0).describe('eBay Promoted Listings General (cost-per-sale) ad rate in percent, charged on the total sale amount incl. shipping and tax. 0 (not promoted, or no sale via ad) or 2 to 100. Default 0.');
const ebaySale = {
  price: money('price', 'Item price per unit in USD.', true),
  quantity: qty().default(1).describe('Units in the order (same item). Fee tiers apply per item; the per-order fee once. Default 1.'),
  shipping_charged: money('shipping_charged', 'Shipping and handling the buyer pays for the whole order, USD. Default 0.').default(0),
  sales_tax_pct: pct('sales_tax_pct', 'Buyer\'s sales tax rate in percent. eBay charges its final value fee on the total INCLUDING tax, but the tax is not seller income. Default 0.', 50).default(0),
  category: enumOf('category', EBAY_CATEGORY_IDS, 'call list_ebay_categories').default('most')
    .describe('eBay final value fee category id. Default "most" (Most categories, 13.6%). See list_ebay_categories.'),
  promoted_listings_pct: promoted(),
  international: z.boolean({ error: 'international must be true or false.' }).default(false)
    .describe('true if the buyer is outside the US and the item is NOT shipped with eBay International Shipping (adds the 1.65% international fee). Default false.'),
  seller_performance: enumOf('seller_performance', EBAY_PERFORMANCE_IDS, '').default('none')
    .describe('Seller performance surcharge: none (Above Standard / Top Rated), below (+6%), below4 (+7%, 4+ months), inad (+5%, very high "not as described"), inad4 (+6%). Default none.'),
  insertion_fee: z.boolean({ error: 'insertion_fee must be true or false.' }).default(false)
    .describe('true if this listing used up your 250 free monthly listings and paid the $0.35 insertion fee. Default false.'),
};
const ebayCosts = {
  item_cost: money('item_cost', 'Your cost per unit, USD. Default 0.').default(0),
  shipping_label_cost: money('shipping_label_cost', 'What you pay for the shipping label and packaging for the whole order, USD. Default 0.').default(0),
  ad_spend: money('ad_spend', 'Other ad spend you attribute to this order, USD (e.g. Promoted Listings Priority cost-per-click). Counted as a cost. Default 0.').default(0),
};
export const ebayFeesInput = strict(ebaySale);
export const ebayProfitInput = strict({ ...ebaySale, ...ebayCosts });
const { price: _p2, ...ebayNoPrice } = ebaySale;
export const ebayTargetInput = strict({ ...ebayNoPrice, ...ebayCosts, target_margin_pct: targetMargin() });

// ------------------------------------------------------------------ Amazon
const DATE_MIN = '2025-01-01', DATE_MAX = '2030-12-31';
export const isCalendarDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const shipDate = () => z.string({ error: 'ship_date must be a date string YYYY-MM-DD.' })
  .refine(isCalendarDate, { error: 'ship_date must be a real calendar date in YYYY-MM-DD format, e.g. 2026-11-20.' })
  .refine(s => s >= DATE_MIN && s <= DATE_MAX, { error: `ship_date must be between ${DATE_MIN} and ${DATE_MAX}.` });
const amazonSale = {
  price: money('price', 'Item price per unit in USD (what the buyer pays for the item, excluding tax).', true),
  category: enumOf('category', AMAZON_CATEGORY_IDS, 'referral fee category; call list_amazon_categories')
    .describe('Amazon referral fee category id (required). See list_amazon_categories.'),
  fulfillment: enumOf('fulfillment', ['fba', 'fbm'], 'fba = Fulfilled by Amazon, fbm = you ship it')
    .describe('"fba" (Fulfilled by Amazon: FBA fulfillment + storage fees, needs package dimensions and weight) or "fbm" (merchant fulfilled: you ship; referral applies to item + shipping).'),
  shipping_charged: money('shipping_charged', 'FBM only: shipping the buyer pays, USD. Must be 0 or omitted for FBA (Amazon sets FBA shipping). Default 0.').default(0),
  gift_wrap: money('gift_wrap', 'Gift wrap charge paid by the buyer, USD. Default 0.').default(0),
  selling_plan: enumOf('selling_plan', ['pro', 'individual'], '').default('pro')
    .describe('"pro" (Professional, $39.99/month) or "individual" ($0.99 per unit sold). Default "pro".'),
  units_per_month: z.number({ error: 'units_per_month must be a whole number.' }).int({ error: 'units_per_month must be a whole number.' })
    .min(0, { error: 'units_per_month cannot be negative.' }).max(10_000_000, { error: 'units_per_month must be at most 10,000,000.' }).default(0)
    .describe('Professional plan only: units you sell per month, to spread the $39.99 subscription per unit. 0 = do not include the subscription. Default 0.'),
  product_type: enumOf('product_type', ['standard', 'apparel', 'dangerous'], 'dangerous = hazmat / dangerous goods').default('standard')
    .describe('FBA fee card: "standard", "apparel", or "dangerous" (hazmat). Default "standard".'),
  length_in: dim('length_in', 'inches', 1200).optional().describe('FBA (required): packaged length in inches. Sides may be given in any order.'),
  width_in: dim('width_in', 'inches', 1200).optional().describe('FBA (required): packaged width in inches.'),
  height_in: dim('height_in', 'inches', 1200).optional().describe('FBA (required): packaged height in inches.'),
  weight_lb: dim('weight_lb', 'pounds', 10000).optional().describe('FBA (required): packaged unit weight in pounds (16 oz = 1 lb).'),
  ship_date: shipDate().optional()
    .describe('Date the unit ships (YYYY-MM-DD). Sets peak (Oct 15 - Jan 14) vs non-peak FBA rates, the fuel surcharge (from 2026-04-17) and storage season. Default: today in US Eastern time.'),
  storage_months: z.number({ error: 'storage_months must be a number.' }).min(0, { error: 'storage_months cannot be negative.' })
    .max(120, { error: 'storage_months must be at most 120.' }).multipleOf(0.01, { error: 'storage_months allows at most 2 decimal places.' }).default(1)
    .describe('FBA: months the unit sits in Amazon storage before it sells (monthly storage fee x months, at the ship-date month\'s rate). Default 1.'),
};
const amazonCosts = {
  item_cost: money('item_cost', 'Your cost per unit (product + packaging), USD. Default 0.').default(0),
  inbound_cost: money('inbound_cost', 'FBA only: your cost per unit to ship inventory into Amazon warehouses, USD. Default 0.').default(0),
  shipping_label_cost: money('shipping_label_cost', 'FBM only: what you pay per unit for the shipping label, USD. Default 0.').default(0),
  ad_spend: money('ad_spend', 'Ad spend you attribute to this unit (e.g. Sponsored Products cost per sale), USD. Counted as a cost. Default 0.').default(0),
};
type AmzShape = { fulfillment: string; shipping_charged: number; length_in?: number; width_in?: number; height_in?: number; weight_lb?: number; inbound_cost?: number; shipping_label_cost?: number };
export const amazonCheck = (v: AmzShape, ctx: z.RefinementCtx, at: (string | number)[] = []) => {
  if (v.fulfillment === 'fba') {
    for (const k of ['length_in', 'width_in', 'height_in', 'weight_lb'] as const)
      if (v[k] === undefined) ctx.addIssue({ code: 'custom', path: [...at, k], message: `${k} is required when fulfillment is "fba" (FBA fees depend on package size and weight).` });
    if (v.shipping_charged > 0) ctx.addIssue({ code: 'custom', path: [...at, 'shipping_charged'], message: 'shipping_charged must be 0 for FBA: Amazon sets FBA shipping. Use fulfillment "fbm" if you charge shipping.' });
    if ((v.shipping_label_cost ?? 0) > 0) ctx.addIssue({ code: 'custom', path: [...at, 'shipping_label_cost'], message: 'shipping_label_cost is for FBM only; FBA shipping is covered by the FBA fulfillment fee. Use inbound_cost for your cost to send stock to Amazon.' });
  } else if ((v.inbound_cost ?? 0) > 0) ctx.addIssue({ code: 'custom', path: [...at, 'inbound_cost'], message: 'inbound_cost is for FBA only (shipping stock into Amazon). For FBM use shipping_label_cost.' });
};
export const amazonFeesInput = strict(amazonSale).superRefine((v, c) => amazonCheck(v, c));
export const amazonProfitInput = strict({ ...amazonSale, ...amazonCosts }).superRefine((v, c) => amazonCheck(v, c));
const { price: _p3, ...amazonNoPrice } = amazonSale;
export const amazonTargetInput = strict({ ...amazonNoPrice, ...amazonCosts, target_margin_pct: targetMargin() }).superRefine((v, c) => amazonCheck(v, c));

// ------------------------------------------------------------------ Compare
const { price: _a, shipping_charged: _b, gift_wrap: _c, ...amazonCompare } = amazonSale;
export const compareInput = strict({
  price: money('price', 'Item price per unit in USD, used on all three marketplaces.', true),
  shipping_charged: money('shipping_charged', 'Shipping the buyer pays, USD. Applied on Etsy, eBay and Amazon FBM; not on Amazon FBA (Amazon sets FBA shipping). Default 0.').default(0),
  sales_tax_pct: pct('sales_tax_pct', 'Buyer\'s sales tax rate in percent (affects Etsy processing and eBay final value fee bases; Amazon referral excludes tax). Default 0.', 50).default(0),
  item_cost: money('item_cost', 'Your cost per unit, USD. Default 0.').default(0),
  shipping_label_cost: money('shipping_label_cost', 'Your label + packaging cost per order, USD. Applied on Etsy, eBay and Amazon FBM (FBA covers shipping). Default 0.').default(0),
  ad_spend: money('ad_spend', 'Ad spend you attribute to one sale, USD, applied equally on each marketplace. Default 0.').default(0),
  target_margin_pct: targetMargin().optional(),
  etsy: strict({ offsite_ads_pct: etsySale.offsite_ads_pct }).default({ offsite_ads_pct: 0 })
    .describe('Etsy options. The comparison uses the US region (USD) and quantity 1.'),
  ebay: strict({ category: ebaySale.category, promoted_listings_pct: promoted(), seller_performance: ebaySale.seller_performance })
    .default({ category: 'most', promoted_listings_pct: 0, seller_performance: 'none' }).describe('eBay options. Quantity 1, domestic buyer.'),
  amazon: strict({ ...amazonCompare, inbound_cost: amazonCosts.inbound_cost })
    .describe('Amazon options (required): category and fulfillment, plus package dimensions and weight for FBA.'),
}).superRefine((v, c) => amazonCheck({ ...v.amazon, shipping_charged: 0, shipping_label_cost: 0 }, c, ['amazon']));

export const emptyInput = strict({});

export type EtsyFeesIn = z.output<typeof etsyFeesInput>; export type EtsyProfitIn = z.output<typeof etsyProfitInput>; export type EtsyTargetIn = z.output<typeof etsyTargetInput>;
export type EbayFeesIn = z.output<typeof ebayFeesInput>; export type EbayProfitIn = z.output<typeof ebayProfitInput>; export type EbayTargetIn = z.output<typeof ebayTargetInput>;
export type AmazonFeesIn = z.output<typeof amazonFeesInput>; export type AmazonProfitIn = z.output<typeof amazonProfitInput>; export type AmazonTargetIn = z.output<typeof amazonTargetInput>;
export type CompareIn = z.output<typeof compareInput>;

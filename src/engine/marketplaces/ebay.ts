// eBay.com (US) fee & profit calculator. Pure functions.
import { minPrice } from './solve';
// Rates verified Oct 16, 2026 against eBay's official help pages (see docs/fees-sources.md):
//  - Selling fees            https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822
//  - Store selling fees      https://www.ebay.com/help/selling/fees-credits-invoices/store-selling-fees?id=4809
//  - General (Promoted Listings) campaign strategy https://www.ebay.com/help/selling/ebay-advertising/promoted-listings/general-campaign-strategy?id=4164
// These are the rates for sellers WITHOUT a Store subscription (also identical for Starter Store).
// Basic/Premium/Anchor/Enterprise Store subscribers pay different (mostly lower) rates and are not modelled here.

/** A final value fee rule. `marginal`: each rate applies to the portion of the per-item sale amount inside its band.
 *  `whole`: one rate applies to the entire per-item amount, chosen by which band the amount falls in. */
export interface EbayCategory { id: string; name: string; kind: 'marginal' | 'whole';
  /** `lt`: the band covers amounts strictly below `upTo` (eBay: "$150 or more" starts the next band). */
  bands: { upTo: number; rate: number; lt?: boolean }[];
  /** Per-item sale amount at/above which the per-order fee is not charged (athletic shoes ≥ $150). */
  noOrderFeeFrom?: number; }

const INF = Number.POSITIVE_INFINITY;
export const EBAY_CATEGORIES: EbayCategory[] = [
  { id: 'most', name: 'Most categories', kind: 'marginal', bands: [{ upTo: 7500, rate: 0.136 }, { upTo: INF, rate: 0.0235 }] },
  { id: 'media', name: 'Books & Magazines, Movies & TV, Music (except vinyl)', kind: 'marginal', bands: [{ upTo: 7500, rate: 0.153 }, { upTo: INF, rate: 0.0235 }] },
  { id: 'coins', name: 'Coins & Paper Money (except bullion)', kind: 'marginal', bands: [{ upTo: 7500, rate: 0.1325 }, { upTo: INF, rate: 0.0235 }] },
  { id: 'bullion', name: 'Coins & Paper Money > Bullion', kind: 'whole', bands: [{ upTo: 7500, rate: 0.136 }, { upTo: INF, rate: 0.07 }] },
  { id: 'cards', name: 'Trading cards, comics & collectible card games', kind: 'marginal', bands: [{ upTo: 7500, rate: 0.1325 }, { upTo: INF, rate: 0.0235 }] },
  { id: 'handbags', name: 'Women\'s Bags & Handbags', kind: 'whole', bands: [{ upTo: 2000, rate: 0.15 }, { upTo: INF, rate: 0.09 }] },
  { id: 'jewelry', name: 'Jewelry & Watches (except watches)', kind: 'whole', bands: [{ upTo: 5000, rate: 0.15 }, { upTo: INF, rate: 0.09 }] },
  { id: 'watches', name: 'Watches, Parts & Accessories', kind: 'marginal', bands: [{ upTo: 1000, rate: 0.15 }, { upTo: 7500, rate: 0.065 }, { upTo: INF, rate: 0.03 }] },
  { id: 'guitars', name: 'Guitars & Basses', kind: 'marginal', bands: [{ upTo: 7500, rate: 0.067 }, { upTo: INF, rate: 0.0235 }] },
  { id: 'sneakers', name: 'Men\'s & Women\'s Athletic Shoes', kind: 'whole', bands: [{ upTo: 150, rate: 0.136, lt: true }, { upTo: INF, rate: 0.08 }], noOrderFeeFrom: 150 },
  { id: 'heavy', name: 'Heavy equipment, commercial printing presses, food trucks', kind: 'marginal', bands: [{ upTo: 15000, rate: 0.03 }, { upTo: INF, rate: 0.005 }] },
];
export const EBAY_ORDER_FEE_LOW = 0.3;   // orders whose total amount of the sale is $10.00 or less
export const EBAY_ORDER_FEE_HIGH = 0.4;  // orders over $10.00
export const EBAY_ORDER_FEE_THRESHOLD = 10;
export const EBAY_INTL_RATE = 0.0165;    // buyer outside the US, not shipped with eBay International Shipping
export const EBAY_INSERTION_FEE = 0.35;  // only after the 250 free listings per month
export const EBAY_AD_MIN = 0.02, EBAY_AD_MAX = 1; // General (cost-per-sale) Promoted Listings ad rate: 2%–100%
/** Extra final value fee (percentage points of the total amount of the sale) for seller performance. */
export const EBAY_PERFORMANCE: { id: string; name: string; rate: number }[] = [
  { id: 'none', name: 'Above Standard / Top Rated (no surcharge)', rate: 0 },
  { id: 'below', name: 'Below Standard: +6%', rate: 0.06 },
  { id: 'below4', name: 'Below Standard 4+ months: +7%', rate: 0.07 },
  { id: 'inad', name: 'Very high "item not as described" rate: +5%', rate: 0.05 },
  { id: 'inad4', name: 'Very high INAD 4+ months: +6%', rate: 0.06 },
];

export interface EbayInput { price: number; qty: number; shipping: number; taxRate: number; category: string; adRate: number;
  international: boolean; performance: string; insertion: boolean; cost: number; label: number; }
export interface EbayResult { gross: number; tax: number; saleTotal: number; fvf: number; orderFee: number; ad: number; intl: number; performance: number;
  insertion: number; fees: number; costs: number; profit: number; margin: number; feePct: number; perUnit: number; breakEven: number | null; category: EbayCategory; }

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const nz = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);
export const ebayCategory = (id: string) => EBAY_CATEGORIES.find(c => c.id === id) ?? EBAY_CATEGORIES[0];
const perfRate = (id: string) => (EBAY_PERFORMANCE.find(p => p.id === id) ?? EBAY_PERFORMANCE[0]).rate;

export function cleanEbay(i: Partial<EbayInput>): EbayInput {
  const ad = nz(i.adRate);
  return { price: nz(i.price), qty: Math.max(1, Math.floor(nz(i.qty ?? 1)) || 1), shipping: nz(i.shipping), taxRate: Math.min(nz(i.taxRate), 0.5),
    category: ebayCategory(i.category ?? 'most').id, adRate: ad === 0 ? 0 : Math.min(Math.max(ad, EBAY_AD_MIN), EBAY_AD_MAX),
    international: i.international === true, performance: EBAY_PERFORMANCE.some(p => p.id === i.performance) ? i.performance! : 'none',
    insertion: i.insertion === true, cost: nz(i.cost), label: nz(i.label) };
}

/** Final value fee (variable part) on one item's total amount of the sale. */
export function fvfForItem(cat: EbayCategory, amount: number): number {
  if (amount <= 0) return 0;
  if (cat.kind === 'whole') { const b = cat.bands.find(x => (x.lt ? amount < x.upTo : amount <= x.upTo)) ?? cat.bands[cat.bands.length - 1]; return amount * b.rate; }
  let fee = 0, lo = 0;
  for (const b of cat.bands) { if (amount <= lo) break; fee += (Math.min(amount, b.upTo) - lo) * b.rate; lo = b.upTo; }
  return fee;
}

/** Fees for one eBay order of `qty` identical items. eBay's "total amount of the sale" includes item price, shipping and sales tax. */
export function calcEbay(input: Partial<EbayInput>): EbayResult {
  const i = cleanEbay(input); const cat = ebayCategory(i.category);
  const gross = i.price * i.qty + i.shipping;            // what the seller earns before fees (tax is passed through)
  const tax = gross * i.taxRate;                         // sales tax eBay collects on item + shipping
  const saleTotal = gross + tax;                         // eBay's "total amount of the sale"
  const perItem = saleTotal / i.qty;                     // tiers are "calculated per item"
  const fvf = fvfForItem(cat, perItem) * i.qty;
  const orderFee = saleTotal <= 0 || (cat.noOrderFeeFrom !== undefined && perItem >= cat.noOrderFeeFrom) ? 0
    : saleTotal <= EBAY_ORDER_FEE_THRESHOLD ? EBAY_ORDER_FEE_LOW : EBAY_ORDER_FEE_HIGH;
  const ad = i.adRate * saleTotal;
  const intl = i.international ? EBAY_INTL_RATE * saleTotal : 0;
  const performance = perfRate(i.performance) * saleTotal;
  const insertion = i.insertion ? EBAY_INSERTION_FEE : 0;
  const fees = fvf + orderFee + ad + intl + performance + insertion;
  const costs = i.cost * i.qty + i.label;
  const profit = gross - fees - costs;
  return { gross: r2(gross), tax: r2(tax), saleTotal: r2(saleTotal), fvf: r2(fvf), orderFee: r2(orderFee), ad: r2(ad), intl: r2(intl), performance: r2(performance),
    insertion: r2(insertion), fees: r2(fees), costs: r2(costs), profit: r2(profit), margin: gross ? profit / gross : 0, feePct: gross ? fees / gross : 0,
    perUnit: r2(profit / i.qty), breakEven: ebayPriceForMargin(i, 0), category: cat };
}

/** Smallest item price (whole cents) that reaches `margin` of profit on item + shipping. null if unreachable. */
export function ebayPriceForMargin(input: Partial<EbayInput>, margin: number): number | null {
  const i = cleanEbay(input); const cat = ebayCategory(i.category);
  const f = (p: number) => { const r = rawProfit({ ...i, price: p }); return r.profit - margin * r.gross; };
  // Price points where the fee schedule jumps (per-order fee step, whole-band switches, shoe threshold).
  const toPrice = (saleTotal: number) => (saleTotal / (1 + i.taxRate) - i.shipping) / i.qty;
  const perItemToPrice = (amt: number) => (amt * i.qty / (1 + i.taxRate) - i.shipping) / i.qty;
  const breaks = [toPrice(EBAY_ORDER_FEE_THRESHOLD), ...(cat.kind === 'whole' ? cat.bands.slice(0, -1).map(b => perItemToPrice(b.upTo)) : [])];
  return minPrice(f, breaks);
}
function rawProfit(i: EbayInput) {
  const cat = ebayCategory(i.category); const gross = i.price * i.qty + i.shipping; const saleTotal = gross * (1 + i.taxRate); const perItem = saleTotal / i.qty;
  const orderFee = saleTotal <= 0 || (cat.noOrderFeeFrom !== undefined && perItem >= cat.noOrderFeeFrom) ? 0 : saleTotal <= EBAY_ORDER_FEE_THRESHOLD ? EBAY_ORDER_FEE_LOW : EBAY_ORDER_FEE_HIGH;
  const fees = fvfForItem(cat, perItem) * i.qty + orderFee + (i.adRate + (i.international ? EBAY_INTL_RATE : 0) + perfRate(i.performance)) * saleTotal + (i.insertion ? EBAY_INSERTION_FEE : 0);
  return { gross, profit: gross - fees - i.cost * i.qty - i.label };
}

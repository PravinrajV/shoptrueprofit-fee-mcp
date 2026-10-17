// Etsy fee & profit calculator (pure functions). Rates verified Oct 13, 2026 against:
//  - Etsy Fees & Payments Policy https://www.etsy.com/legal/fees/
//  - Etsy Help "What are the Fees and Taxes for Selling on Etsy?" https://help.etsy.com/hc/en-us/articles/115014483627
//  - Etsy Help "What are Payment Processing Fees?" https://help.etsy.com/hc/en-us/articles/115015628847
export const LISTING_FEE = 0.2;        // USD per listing / per extra quantity sold (auto-renew)
export const TRANSACTION_RATE = 0.065; // on item price + shipping + gift wrap
export const OFFSITE_CAP = 100;        // USD per order
export interface Region { id: string; name: string; pct: number; flat: number; cur: string; }
export const REGIONS: Region[] = [
  { id: 'us', name: 'United States', pct: 0.03, flat: 0.25, cur: 'USD' },
  { id: 'ca-dom', name: 'Canada (domestic or US orders)', pct: 0.03, flat: 0.25, cur: 'CAD' },
  { id: 'ca-int', name: 'Canada (international orders)', pct: 0.04, flat: 0.25, cur: 'CAD' },
  { id: 'uk', name: 'United Kingdom', pct: 0.04, flat: 0.2, cur: 'GBP' },
  { id: 'eu', name: 'EU (Germany, France, Spain, Italy, Ireland, NL…)', pct: 0.04, flat: 0.3, cur: 'EUR' },
  { id: 'au-dom', name: 'Australia (domestic orders)', pct: 0.03, flat: 0.25, cur: 'AUD' },
  { id: 'au-int', name: 'Australia (international orders)', pct: 0.04, flat: 0.25, cur: 'AUD' },
  { id: 'nz-int', name: 'New Zealand (international orders)', pct: 0.04, flat: 0.3, cur: 'NZD' },
  { id: 'ch', name: 'Switzerland', pct: 0.04, flat: 0.5, cur: 'CHF' },
  { id: 'in', name: 'India', pct: 0.05, flat: 25, cur: 'INR' },
  { id: 'sg', name: 'Singapore', pct: 0.044, flat: 0.35, cur: 'SGD' },
  { id: 'hk', name: 'Hong Kong', pct: 0.044, flat: 2, cur: 'HKD' },
];
export interface CalcInput { price: number; qty: number; shipping: number; giftWrap: number; discount: number; cost: number; label: number;
  offsite: 0 | 0.12 | 0.15; region: string; taxRate: number; }
export interface CalcResult { gross: number; tax: number; listing: number; transaction: number; processing: number; offsite: number; fees: number;
  costs: number; profit: number; margin: number; feePct: number; perUnit: number; breakEven: number | null; region: Region; }

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const nz = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
export const regionOf = (id: string) => REGIONS.find(r => r.id === id) ?? REGIONS[0];

export function clean(i: Partial<CalcInput>): CalcInput {
  return { price: nz(i.price ?? 0), qty: Math.max(1, Math.floor(nz(i.qty ?? 1)) || 1), shipping: nz(i.shipping ?? 0), giftWrap: nz(i.giftWrap ?? 0),
    discount: nz(i.discount ?? 0), cost: nz(i.cost ?? 0), label: nz(i.label ?? 0), offsite: i.offsite === 0.12 || i.offsite === 0.15 ? i.offsite : 0,
    region: i.region ?? 'us', taxRate: Math.min(nz(i.taxRate ?? 0), 0.5) };
}

/** Fees for one order. Sales tax is paid by the buyer (not seller income) but payment processing is charged on it. */
export function calc(input: Partial<CalcInput>): CalcResult {
  const i = clean(input); const reg = regionOf(i.region);
  const items = Math.max(0, i.price * i.qty - i.discount);
  const gross = items + i.shipping + i.giftWrap;
  const tax = (items + i.shipping) * i.taxRate;
  const listing = LISTING_FEE * i.qty;
  const transaction = TRANSACTION_RATE * gross;
  const processing = gross > 0 ? reg.pct * (gross + tax) + reg.flat : 0;
  const offsite = Math.min(i.offsite * gross, OFFSITE_CAP);
  const fees = listing + transaction + processing + offsite;
  const costs = i.cost * i.qty + i.label;
  const profit = gross - fees - costs;
  return { gross: r2(gross), tax: r2(tax), listing: r2(listing), transaction: r2(transaction), processing: r2(processing), offsite: r2(offsite), fees: r2(fees),
    costs: r2(costs), profit: r2(profit), margin: gross ? profit / gross : 0, feePct: gross ? fees / gross : 0, perUnit: r2(profit / i.qty),
    breakEven: priceForMargin(i, 0), region: reg };
}

/** Item price (per unit, before discount) that gives the target profit margin on the order total. null if impossible. */
export function priceForMargin(input: Partial<CalcInput>, margin: number): number | null {
  const i = clean(input); const reg = regionOf(i.region);
  const solve = (rate: number, fixedAds: number) => {
    // profit(g) = g*(1 - T - pct*(1+t) - rate) + pct*t*giftWrap - listing - flat - costs - fixedAds ; want profit = margin*g
    const k = 1 - TRANSACTION_RATE - reg.pct * (1 + i.taxRate) - rate - margin;
    if (k <= 0) return null;
    const fixed = LISTING_FEE * i.qty + reg.flat + i.cost * i.qty + i.label + fixedAds - reg.pct * i.taxRate * i.giftWrap;
    return fixed / k;
  };
  let g = solve(i.offsite, 0);
  if (g !== null && i.offsite * g > OFFSITE_CAP) g = solve(0, OFFSITE_CAP);
  if (g === null) return null;
  const p = (g - i.shipping - i.giftWrap + i.discount) / i.qty;
  return p < 0 ? 0 : Math.ceil(p * 100) / 100;
}

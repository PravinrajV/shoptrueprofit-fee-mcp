// Amazon.com (US) referral, FBA and storage fee calculator. Pure functions.
// Rates verified Oct 16, 2026 against Amazon's official pages (see docs/fees-sources.md):
//  - Referral fees                 https://sellercentral.amazon.com/help/hub/reference/external/GTG4BAWSY39Z98Z3
//  - Selling plans / referral table https://sell.amazon.com/pricing
//  - 2026 US FBA fulfillment fees  https://sellercentral.amazon.com/help/hub/reference/external/GABBX6GZPA8MSZGW
//  - FBA fulfillment fee (surcharge, peak dates) https://sellercentral.amazon.com/help/hub/reference/external/GPDC3KPYAGDTVDJP
//  - Product size tiers            https://sellercentral.amazon.com/help/hub/reference/external/GG5KW835AHDJCH8W
//  - Dimensional / shipping weight https://sellercentral.amazon.com/help/hub/reference/external/G53Z9EKF8VVZVH29 , GEVWP48HPBLEFJEY
//  - Monthly storage fees          https://sellercentral.amazon.com/help/hub/reference/external/G3EDYEF6KUCFQTNM
//  - Closing fee / per-item fee / subscription  GKD9U5REK5DKB38Y , G8TPCFJRDFPKAZ6M , G67WTAUHB9TQ9M6U
import { minPrice } from './solve';

// ---------- Referral fees ----------
export interface AmzCategory { id: string; name: string; kind: 'flat' | 'whole' | 'marginal'; bands: { upTo: number; rate: number }[]; min: number; closing?: boolean; }
const INF = Number.POSITIVE_INFINITY;
const flat = (id: string, name: string, rate: number, min = 0.3, closing = false): AmzCategory => ({ id, name, kind: 'flat', bands: [{ upTo: INF, rate }], min, closing });
export const AMZ_CATEGORIES: AmzCategory[] = [
  flat('device-acc', 'Amazon Device Accessories', 0.45),
  flat('automotive', 'Automotive and Powersports', 0.12),
  { id: 'baby', name: 'Baby Products', kind: 'whole', bands: [{ upTo: 10, rate: 0.08 }, { upTo: INF, rate: 0.15 }], min: 0.3 },
  flat('luggage', 'Backpacks, Handbags, and Luggage', 0.15),
  flat('power-tools', 'Base Equipment Power Tools', 0.12),
  { id: 'beauty', name: 'Beauty, Health and Personal Care', kind: 'whole', bands: [{ upTo: 10, rate: 0.08 }, { upTo: INF, rate: 0.15 }], min: 0.3 },
  flat('business', 'Business, Industrial, and Scientific Supplies', 0.12),
  { id: 'clothing', name: 'Clothing and Accessories', kind: 'whole', bands: [{ upTo: 15, rate: 0.05 }, { upTo: 20, rate: 0.10 }, { upTo: INF, rate: 0.17 }], min: 0.3 },
  { id: 'compact-appliances', name: 'Compact Appliances', kind: 'marginal', bands: [{ upTo: 300, rate: 0.15 }, { upTo: INF, rate: 0.08 }], min: 0.3 },
  flat('computers', 'Computers', 0.08),
  flat('electronics', 'Consumer Electronics', 0.08),
  { id: 'electronics-acc', name: 'Electronics Accessories', kind: 'marginal', bands: [{ upTo: 100, rate: 0.15 }, { upTo: INF, rate: 0.08 }], min: 0.3 },
  flat('everything-else', 'Everything Else', 0.15),
  flat('eyewear', 'Eyewear', 0.15),
  // Seller Central lists no minimum ("--"); sell.amazon.com/pricing shows a $1.00 minimum on the first band. Flagged in docs/fees-sources.md.
  { id: 'fine-art', name: 'Fine Art', kind: 'marginal', bands: [{ upTo: 100, rate: 0.2 }, { upTo: 1000, rate: 0.15 }, { upTo: 5000, rate: 0.10 }, { upTo: INF, rate: 0.05 }], min: 0 },
  flat('footwear', 'Footwear', 0.15),
  flat('full-appliances', 'Full-Size Appliances', 0.08),
  { id: 'furniture', name: 'Furniture', kind: 'marginal', bands: [{ upTo: 200, rate: 0.15 }, { upTo: INF, rate: 0.10 }], min: 0.3 },
  flat('gift-cards', 'Gift Cards', 0.2, 0),
  { id: 'grocery', name: 'Grocery and Gourmet', kind: 'whole', bands: [{ upTo: 15, rate: 0.08 }, { upTo: INF, rate: 0.15 }], min: 0 },
  flat('home-kitchen', 'Home and Kitchen', 0.15),
  { id: 'jewelry', name: 'Jewelry', kind: 'marginal', bands: [{ upTo: 250, rate: 0.2 }, { upTo: INF, rate: 0.05 }], min: 0.3 },
  flat('lawn-garden', 'Lawn and Garden', 0.15),
  { id: 'mowers', name: 'Lawn Mowers and Snow Throwers', kind: 'whole', bands: [{ upTo: 500, rate: 0.15 }, { upTo: INF, rate: 0.08 }], min: 0.3 },
  flat('mattresses', 'Mattresses', 0.15),
  flat('media', 'Media: Books, DVD, Music, Software, Video', 0.15, 0, true),
  flat('musical', 'Musical Instruments and AV Production', 0.15),
  flat('office', 'Office Products', 0.15),
  flat('pet', 'Pet Products', 0.15),
  flat('pet-vet', 'Pet Products: veterinary diets', 0.22),
  flat('sports', 'Sports and Outdoors', 0.15),
  flat('tires', 'Tires', 0.10),
  flat('tools', 'Tools and Home Improvement', 0.15),
  flat('toys', 'Toys and Games', 0.15),
  flat('consoles', 'Video Game Consoles', 0.08, 0, true),
  flat('video-games', 'Video Games and Gaming Accessories', 0.15, 0, true),
  { id: 'watches', name: 'Watches', kind: 'marginal', bands: [{ upTo: 1500, rate: 0.16 }, { upTo: INF, rate: 0.03 }], min: 0.3 },
];
export const amzCategory = (id: string) => AMZ_CATEGORIES.find(c => c.id === id) ?? AMZ_CATEGORIES.find(c => c.id === 'home-kitchen')!;
export const CLOSING_FEE = 1.8;          // media, video games & accessories, video game consoles
export const PER_ITEM_FEE = 0.99;        // Individual plan, per unit sold
export const PRO_PLAN_MONTHLY = 39.99;   // Professional plan
export const FUEL_SURCHARGE = 0.035;     // on FBA fulfillment fees from Apr 17, 2026
export const SURCHARGE_FROM = '2026-04-17';
export const PEAK_FROM = '2026-10-15', PEAK_TO = '2027-01-14', NONPEAK_FROM = '2026-01-15';

/** Referral fee for one unit, on its total sales price (item + shipping + gift wrap, excluding tax). */
export function referralFee(cat: AmzCategory, total: number): number {
  if (total <= 0) return 0;
  let fee: number;
  if (cat.kind === 'marginal') { fee = 0; let lo = 0; for (const b of cat.bands) { if (total <= lo) break; fee += (Math.min(total, b.upTo) - lo) * b.rate; lo = b.upTo; } }
  else fee = total * (cat.bands.find(b => total <= b.upTo) ?? cat.bands[cat.bands.length - 1]).rate;
  return Math.max(fee, cat.min);
}

// ---------- FBA size tiers & fulfillment fees ----------
export type Tier = 'small-standard' | 'large-standard' | 'small-bulky' | 'large-bulky' | 'xl-50' | 'xl-70' | 'xl-150' | 'xl-150plus';
export const TIER_NAMES: Record<Tier, string> = { 'small-standard': 'Small standard', 'large-standard': 'Large standard', 'small-bulky': 'Small bulky', 'large-bulky': 'Large bulky',
  'xl-50': 'Extra-large 0 to 50 lb', 'xl-70': 'Extra-large 50+ to 70 lb', 'xl-150': 'Extra-large 70+ to 150 lb', 'xl-150plus': 'Extra-large 150+ lb' };
export type ProductType = 'standard' | 'apparel' | 'dangerous';
type Row3 = [number, number, number];
interface Card { ss: Row3[]; ls: Row3[]; ls3: Row3; big: Row3[]; }
/** 2026 US FBA fulfillment fee cards, columns: price < $10, $10–$50, > $50. Fuel & logistics surcharge NOT included.
 *  Transcribed programmatically from Amazon's "2026 US FBA fulfillment fee changes" page (GABBX6GZPA8MSZGW). */
export const FBA_2026: Record<`${ProductType}.${'nonpeak' | 'peak'}`, Card> = {
  'standard.nonpeak': { ss: [[2.43, 3.32, 3.58], [2.49, 3.42, 3.68], [2.56, 3.45, 3.71], [2.66, 3.54, 3.80], [2.77, 3.68, 3.94], [2.82, 3.78, 4.04], [2.92, 3.91, 4.17], [2.95, 3.96, 4.22]],
    ls: [[2.91, 3.73, 3.99], [3.13, 3.95, 4.21], [3.38, 4.20, 4.46], [3.78, 4.60, 4.86], [4.22, 5.04, 5.30], [4.60, 5.42, 5.68], [4.75, 5.57, 5.83], [5.00, 5.82, 6.08], [5.10, 5.92, 6.18], [5.28, 6.10, 6.36], [5.44, 6.26, 6.52], [5.85, 6.67, 6.93]],
    ls3: [6.15, 6.97, 7.23], big: [[6.78, 7.55, 7.55], [8.58, 9.35, 9.35], [25.56, 26.33, 26.33], [36.55, 37.32, 37.32], [50.55, 51.32, 51.32], [194.18, 194.95, 194.95]] },
  'standard.peak': { ss: [[2.62, 3.51, 3.77], [2.68, 3.61, 3.87], [2.76, 3.65, 3.91], [2.86, 3.74, 4.00], [2.98, 3.89, 4.15], [3.03, 3.99, 4.25], [3.14, 4.13, 4.39], [3.17, 4.18, 4.44]],
    ls: [[3.15, 3.97, 4.23], [3.39, 4.21, 4.47], [3.66, 4.48, 4.74], [4.07, 4.89, 5.15], [4.52, 5.34, 5.60], [4.91, 5.73, 5.99], [5.07, 5.89, 6.15], [5.33, 6.15, 6.41], [5.47, 6.29, 6.55], [5.67, 6.49, 6.75], [5.84, 6.66, 6.92], [6.26, 7.08, 7.34]],
    ls3: [6.69, 7.51, 7.77], big: [[7.82, 8.59, 8.59], [9.62, 10.39, 10.39], [28.29, 29.06, 29.06], [39.36, 40.13, 40.13], [54.97, 55.74, 55.74], [202.69, 203.46, 203.46]] },
  'apparel.nonpeak': { ss: [[2.62, 3.51, 3.77], [2.64, 3.54, 3.80], [2.68, 3.59, 3.85], [2.81, 3.69, 3.95], [3.00, 3.91, 4.17], [3.10, 4.09, 4.35], [3.20, 4.20, 4.46], [3.30, 4.25, 4.51]],
    ls: [[3.48, 4.30, 4.56], [3.68, 4.50, 4.76], [3.90, 4.72, 4.98], [4.35, 5.17, 5.43], [5.05, 5.87, 6.13], [5.22, 6.04, 6.30], [5.32, 6.14, 6.40], [5.43, 6.25, 6.51], [5.78, 6.60, 6.86], [5.90, 6.72, 6.98], [5.95, 6.77, 7.03], [6.08, 6.90, 7.16]],
    ls3: [6.15, 6.97, 7.23], big: [[6.78, 7.55, 7.55], [8.58, 9.35, 9.35], [25.56, 26.33, 26.33], [36.55, 37.32, 37.32], [50.55, 51.32, 51.32], [194.18, 194.95, 194.95]] },
  'apparel.peak': { ss: [[2.85, 3.74, 4.00], [2.87, 3.77, 4.03], [2.93, 3.84, 4.10], [3.06, 3.94, 4.20], [3.27, 4.18, 4.44], [3.37, 4.36, 4.62], [3.49, 4.49, 4.75], [3.59, 4.54, 4.80]],
    ls: [[3.79, 4.61, 4.87], [4.00, 4.82, 5.08], [4.23, 5.05, 5.31], [4.69, 5.51, 5.77], [5.42, 6.24, 6.50], [5.59, 6.41, 6.67], [5.71, 6.53, 6.79], [5.82, 6.64, 6.90], [6.22, 7.04, 7.30], [6.34, 7.16, 7.42], [6.41, 7.23, 7.49], [6.54, 7.36, 7.62]],
    ls3: [6.82, 7.64, 7.90], big: [[7.82, 8.59, 8.59], [9.62, 10.39, 10.39], [28.29, 29.06, 29.06], [39.36, 40.13, 40.13], [54.97, 55.74, 55.74], [202.69, 203.46, 203.46]] },
  'dangerous.nonpeak': { ss: [[3.40, 4.29, 4.55], [3.43, 4.36, 4.62], [3.48, 4.37, 4.63], [3.55, 4.43, 4.69], [3.64, 4.55, 4.81], [3.65, 4.61, 4.87], [3.73, 4.72, 4.98], [3.77, 4.78, 5.04]],
    ls: [[3.73, 4.55, 4.81], [3.94, 4.76, 5.02], [4.17, 4.99, 5.25], [4.37, 5.19, 5.45], [4.82, 5.64, 5.90], [5.20, 6.02, 6.28], [5.35, 6.17, 6.43], [5.49, 6.31, 6.57], [5.56, 6.38, 6.64], [5.74, 6.56, 6.82], [5.90, 6.72, 6.98], [6.31, 7.13, 7.39]],
    ls3: [6.61, 7.43, 7.69], big: [[7.50, 8.27, 8.27], [9.30, 10.07, 10.07], [27.67, 28.44, 28.44], [39.76, 40.53, 40.53], [57.68, 58.45, 58.45], [218.76, 219.53, 219.53]] },
  'dangerous.peak': { ss: [[3.74, 4.63, 4.89], [3.80, 4.73, 4.99], [3.88, 4.77, 5.03], [3.98, 4.86, 5.12], [4.10, 5.01, 5.27], [4.14, 5.10, 5.36], [4.25, 5.24, 5.50], [4.32, 5.33, 5.59]],
    ls: [[4.32, 5.14, 5.40], [4.56, 5.38, 5.64], [4.82, 5.64, 5.90], [5.04, 5.86, 6.12], [5.51, 6.33, 6.59], [5.91, 6.73, 6.99], [6.08, 6.90, 7.16], [6.24, 7.06, 7.32], [6.33, 7.15, 7.41], [6.53, 7.35, 7.61], [6.70, 7.52, 7.78], [7.12, 7.94, 8.20]],
    ls3: [7.51, 8.33, 8.59], big: [[9.06, 9.83, 9.83], [10.86, 11.63, 11.63], [31.71, 32.48, 32.48], [43.86, 44.63, 44.63], [64.04, 64.81, 64.81], [230.84, 231.61, 231.61]] },
};
const SS_OZ = [2, 4, 6, 8, 10, 12, 14, 16];
const LS_LB = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
const BIG: Tier[] = ['small-bulky', 'large-bulky', 'xl-50', 'xl-70', 'xl-150', 'xl-150plus'];
const BIG_STEP: [number, number][] = [[0.38, 1], [0.38, 1], [0.38, 1], [0.75, 51], [0.75, 71], [0.19, 151]]; // $ per lb interval above N lb
const EPS = 1e-9;
const up = (x: number) => Math.max(0, Math.ceil(x - EPS));

export interface Dims { length: number; width: number; height: number; weight: number; } // inches, pounds (packaged unit)
export interface TierInfo { tier: Tier; dimWeight: number; shipWeight: number; overmax: boolean; volume: number; }
/** Size tier and fee-shipping-weight from the packaged dimensions (any order) and unit weight. */
export function sizeTier(d: Dims): TierInfo {
  const [L, W, H] = [d.length, d.width, d.height].map(v => (Number.isFinite(v) && v > 0 ? v : 0)).sort((a, b) => b - a);
  const unit = Number.isFinite(d.weight) && d.weight > 0 ? d.weight : 0;
  const dim = (L * W * H) / 139;                                    // standard-size dimensional weight
  const dimB = (L * Math.max(W, 2) * Math.max(H, 2)) / 139;         // bulky / extra-large: 2-inch minimum width and height
  const girth = L + 2 * (W + H);
  const volume = (L * W * H) / 1728;
  const ship = Math.max(unit, dimB);
  if (unit <= 1 + EPS && L <= 15 && W <= 12 && H <= 0.75) return { tier: 'small-standard', dimWeight: dim, shipWeight: unit, overmax: false, volume };
  if (Math.max(unit, dim) <= 20 + EPS && L <= 18 && W <= 14 && H <= 8) return { tier: 'large-standard', dimWeight: dim, shipWeight: Math.max(unit, dim), overmax: false, volume };
  if (ship <= 50 + EPS && L <= 37 && W <= 28 && H <= 20 && girth <= 130) return { tier: 'small-bulky', dimWeight: dimB, shipWeight: ship, overmax: false, volume };
  if (ship <= 50 + EPS && L <= 59 && W <= 33 && H <= 33 && girth <= 130) return { tier: 'large-bulky', dimWeight: dimB, shipWeight: ship, overmax: false, volume };
  if (unit > 150) return { tier: 'xl-150plus', dimWeight: dimB, shipWeight: unit, overmax: false, volume };
  const tier: Tier = ship <= 50 + EPS ? 'xl-50' : ship <= 70 + EPS ? 'xl-70' : 'xl-150';
  return { tier, dimWeight: dimB, shipWeight: ship, overmax: L > 96 || girth > 130, volume };
}
export const priceBand = (price: number): 0 | 1 | 2 => (price < 10 ? 0 : price <= 50 ? 1 : 2);
/** FBA fulfillment fee from the 2026 card (before the fuel & logistics surcharge). */
export function fulfillmentFee(type: ProductType, season: 'nonpeak' | 'peak', t: TierInfo, price: number): number {
  const c = FBA_2026[`${type}.${season}`]; const b = priceBand(price); const w = t.shipWeight;
  if (t.tier === 'small-standard') { const oz = w * 16; const i = SS_OZ.findIndex(x => oz <= x + EPS); return c.ss[i < 0 ? 7 : i][b]; }
  if (t.tier === 'large-standard') {
    const i = LS_LB.findIndex(x => w <= x + EPS); if (i >= 0) return c.ls[i][b];
    const [step, size] = type === 'apparel' ? [0.16, 0.5] : [0.08, 0.25];
    return c.ls3[b] + step * up((w - 3) / size);
  }
  const k = BIG.indexOf(t.tier); const [rate, above] = BIG_STEP[k];
  return c.big[k][b] + rate * up(w - above);
}
/** Which 2026 fulfillment card applies on a ship date (YYYY-MM-DD). `known` is false outside Jan 15, 2026 – Jan 14, 2027. */
export function seasonOn(date: string): { season: 'nonpeak' | 'peak'; known: boolean } {
  if (date >= PEAK_FROM && date <= PEAK_TO) return { season: 'peak', known: true };
  return { season: 'nonpeak', known: date >= NONPEAK_FROM && date < PEAK_FROM };
}
/** Base monthly storage fee per cubic foot (storage utilization surcharge not included). */
export function storageRate(date: string, oversize: boolean, dangerous: boolean): number {
  const peak = ['10', '11', '12'].includes(date.slice(5, 7));
  if (dangerous) return oversize ? (peak ? 2.43 : 0.78) : (peak ? 3.63 : 0.99);
  return oversize ? (peak ? 1.40 : 0.56) : (peak ? 2.40 : 0.78);
}

// ---------- Calculator ----------
export interface AmzInput { price: number; shipping: number; giftWrap: number; category: string; fulfillment: 'fba' | 'fbm'; plan: 'pro' | 'individual'; unitsPerMonth: number;
  type: ProductType; length: number; width: number; height: number; weight: number; date: string; storageMonths: number; cost: number; inbound: number; label: number; }
export interface AmzResult { gross: number; referral: number; closing: number; perItem: number; fba: number; surcharge: number; storage: number; plan: number; fees: number; costs: number;
  profit: number; margin: number; feePct: number; breakEven: number | null; tier: TierInfo | null; season: 'nonpeak' | 'peak'; band: 0 | 1 | 2; warnings: string[]; category: AmzCategory; }

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const nz = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export function cleanAmz(i: Partial<AmzInput>, today = '2026-10-16'): AmzInput {
  const fba = i.fulfillment !== 'fbm';
  return { price: nz(i.price), shipping: fba ? 0 : nz(i.shipping), giftWrap: nz(i.giftWrap), category: amzCategory(i.category ?? '').id, fulfillment: fba ? 'fba' : 'fbm',
    plan: i.plan === 'individual' ? 'individual' : 'pro', unitsPerMonth: Math.floor(nz(i.unitsPerMonth)), type: i.type === 'apparel' || i.type === 'dangerous' ? i.type : 'standard',
    length: nz(i.length), width: nz(i.width), height: nz(i.height), weight: Math.min(nz(i.weight), 10000), date: isDate(i.date) ? i.date : today,
    storageMonths: i.storageMonths === undefined ? 1 : Math.min(nz(i.storageMonths), 120), cost: nz(i.cost), inbound: fba ? nz(i.inbound) : 0, label: fba ? 0 : nz(i.label) };
}

function parts(i: AmzInput) {
  const cat = amzCategory(i.category); const gross = i.price + i.shipping + i.giftWrap;
  const referral = referralFee(cat, gross); const closing = cat.closing && gross > 0 ? CLOSING_FEE : 0;
  const perItem = i.plan === 'individual' && gross > 0 ? PER_ITEM_FEE : 0;
  const plan = i.plan === 'pro' && i.unitsPerMonth > 0 ? PRO_PLAN_MONTHLY / i.unitsPerMonth : 0;
  const { season, known } = seasonOn(i.date); let fba = 0, surcharge = 0, storage = 0, tier: TierInfo | null = null;
  if (i.fulfillment === 'fba') {
    tier = sizeTier(i); fba = fulfillmentFee(i.type, season, tier, i.price);
    surcharge = i.date >= SURCHARGE_FROM ? r2(fba * FUEL_SURCHARGE) : 0;
    storage = tier.volume * storageRate(i.date, !tier.tier.endsWith('standard'), i.type === 'dangerous') * i.storageMonths;
  }
  const fees = referral + closing + perItem + plan + fba + surcharge + storage;
  const costs = i.cost + i.inbound + i.label;
  return { cat, gross, referral, closing, perItem, plan, fba, surcharge, storage, fees, costs, profit: gross - fees - costs, tier, season, known };
}

/** Fees and profit for ONE unit sold on Amazon.com. */
export function calcAmazon(input: Partial<AmzInput>, today?: string): AmzResult {
  const i = cleanAmz(input, today); const p = parts(i); const w: string[] = [];
  if (!p.known && i.fulfillment === 'fba') w.push(i.date < NONPEAK_FROM ? 'Dates before Jan 15, 2026 used 2025 fulfillment rates; 2026 non-peak rates are shown.' : 'Amazon has not published fulfillment rates after Jan 14, 2027 yet; 2026 non-peak rates are shown.');
  if (p.tier?.overmax) w.push('Overmax item (over 96 in. long or over 130 in. length + girth): Amazon adds an Overmax handling fee that is not included.');
  if (i.fulfillment === 'fba' && !(i.length && i.width && i.height && i.weight)) w.push('Enter all three package dimensions and the unit weight for an exact FBA fee.');
  return { gross: r2(p.gross), referral: r2(p.referral), closing: r2(p.closing), perItem: r2(p.perItem), fba: r2(p.fba), surcharge: r2(p.surcharge), storage: r2(p.storage), plan: r2(p.plan),
    fees: r2(p.fees), costs: r2(p.costs), profit: r2(p.profit), margin: p.gross ? p.profit / p.gross : 0, feePct: p.gross ? p.fees / p.gross : 0,
    breakEven: amazonPriceForMargin(i, 0, today), tier: p.tier, season: p.season, band: priceBand(i.price), warnings: w, category: p.cat };
}

/** Smallest item price (whole cents) that reaches `margin` of profit on the sale total. null if unreachable. */
export function amazonPriceForMargin(input: Partial<AmzInput>, margin: number, today?: string): number | null {
  const i = cleanAmz(input, today); const cat = amzCategory(i.category); const extra = i.shipping + i.giftWrap;
  const f = (price: number) => { const p = parts({ ...i, price }); return p.profit - margin * p.gross; };
  const breaks = [10, 50.000001, ...(cat.kind === 'whole' ? cat.bands.slice(0, -1).map(b => b.upTo - extra + 0.000001) : [])];
  return minPrice(f, breaks);
}

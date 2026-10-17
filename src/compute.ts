// Turns validated tool inputs into engine calls and wraps the engine's numbers in a self-describing result.
// Every money amount in a result comes straight from the vendored shoptrueprofit.com engine (src/engine/); this file
// adds no fee math of its own, only labels, assumptions and links.
import { calc, priceForMargin, regionOf, REGIONS, LISTING_FEE, TRANSACTION_RATE, OFFSITE_CAP, type CalcInput } from './engine/feecalc';
import { calcEbay, ebayPriceForMargin, EBAY_CATEGORIES, EBAY_PERFORMANCE, EBAY_ORDER_FEE_LOW, EBAY_ORDER_FEE_HIGH, EBAY_ORDER_FEE_THRESHOLD,
  EBAY_INTL_RATE, EBAY_INSERTION_FEE, type EbayInput, type EbayCategory } from './engine/marketplaces/ebay';
import { calcAmazon, amazonPriceForMargin, AMZ_CATEGORIES, TIER_NAMES, CLOSING_FEE, PER_ITEM_FEE, PRO_PLAN_MONTHLY, FUEL_SURCHARGE, SURCHARGE_FROM,
  PEAK_FROM, PEAK_TO, type AmzInput, type AmzCategory } from './engine/marketplaces/amazon';
import { DISCLAIMER, FEE_TABLES, SOURCES, calculatorUrl, todayET, MARKET_NAME, type FeeTable, type Marketplace, type Source } from './meta';
import type { AmazonFeesIn, AmazonProfitIn, AmazonTargetIn, CompareIn, EbayFeesIn, EbayProfitIn, EbayTargetIn, EtsyFeesIn, EtsyProfitIn, EtsyTargetIn } from './schemas';

export interface Line { code: string; label: string; amount: number; basis: string }
export interface ProfitBlock { profit: number; margin_pct: number; margin_ratio: number; profit_per_unit: number; break_even_price: number | null }
export interface PricingBlock { target_margin_pct: number; break_even_price: number | null; target_price: number | null; reachable: boolean;
  at_target_price: { revenue: number; fees: number; costs: number; profit: number; margin_pct: number } | null; max_reachable_margin_pct: number | null; note: string }
export interface CalcResultOut {
  tool: string; marketplace: Marketplace | 'all'; currency: string; summary: string; inputs: Record<string, unknown>;
  revenue?: { seller_revenue: number; sales_tax_collected_by_marketplace: number; note: string };
  fees?: { lines: Line[]; total: number; percent_of_revenue: number };
  costs?: { lines: Line[]; total: number };
  profit?: ProfitBlock; pricing?: PricingBlock; details?: Record<string, unknown>; comparison?: Record<string, unknown>;
  assumptions: string[]; warnings: string[]; fee_table: FeeTable | FeeTable[]; sources: Source[]; calculator_url: string | Record<string, string>; disclaimer: string;
}

const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const pct2 = (ratio: number) => Math.round(ratio * 10000) / 100;
const fmtPct = (rate: number) => `${+(rate * 100).toFixed(4)}%`;
const money = (x: number | null, cur = 'USD') => x === null ? 'not reachable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(x);
const base = (m: Marketplace) => ({ fee_table: FEE_TABLES[m], sources: SOURCES[m], calculator_url: calculatorUrl(m), disclaimer: DISCLAIMER });

/** Highest whole-0.1% margin the solver can reach (0..90), or null if not even break-even is reachable. Uses only the engine's solver. */
function maxReachable(solve: (marginRatio: number) => number | null): number | null {
  if (solve(0) === null) return null;
  if (solve(0.9) !== null) return 90;
  let lo = 0, hi = 900; // tenths of a percent
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (solve(mid / 1000) !== null) lo = mid; else hi = mid; }
  return lo / 10;
}
function pricing(targetPct: number, solve: (m: number) => number | null, at: (p: number) => { gross: number; fees: number; costs: number; profit: number; margin: number }, cur: string, perWhat: string): PricingBlock {
  const be = solve(0); const tp = solve(targetPct / 100); const reachable = tp !== null;
  const a = tp === null ? null : at(tp);
  const max = reachable ? null : maxReachable(solve);
  const note = reachable
    ? `List at ${money(tp, cur)} ${perWhat} for at least ${targetPct}% margin; ${money(be, cur)} breaks even. Prices are rounded UP to the cent, so the margin at that price can be slightly above target.`
    : max === null ? 'Not reachable at any price: per-order fees and costs cannot be covered (or the percentage fees reach 100%). Lower costs or ad rates.'
      : `A ${targetPct}% margin is not reachable at any price: percentage fees cap the margin at about ${max}%. Lower target_margin_pct, costs or ad rates.`;
  return { target_margin_pct: targetPct, break_even_price: be, target_price: tp, reachable,
    at_target_price: a && { revenue: a.gross, fees: a.fees, costs: a.costs, profit: a.profit, margin_pct: pct2(a.margin) }, max_reachable_margin_pct: max, note };
}

// =========================================================================================== Etsy
function etsyEngineInput(v: Partial<EtsyProfitIn> & Omit<EtsyFeesIn, 'price'> & { price?: number }): Partial<CalcInput> {
  // ad_spend is a per-order seller cost; the engine's per-order cost slot is `label`, so it is added there (same math as typing it into the label box).
  return { price: v.price ?? 0, qty: v.quantity, shipping: v.shipping_charged, giftWrap: v.gift_wrap, discount: v.discount, cost: v.item_cost ?? 0,
    label: (v.shipping_label_cost ?? 0) + (v.ad_spend ?? 0), offsite: v.offsite_ads_pct === 12 ? 0.12 : v.offsite_ads_pct === 15 ? 0.15 : 0,
    region: v.region, taxRate: v.sales_tax_pct / 100 };
}
function etsyAssumptions(v: { region: string; offsite_ads_pct: number }): string[] {
  const reg = regionOf(v.region);
  const a = [
    `Etsy Payments region "${reg.id}" (${reg.name}): payment processing ${fmtPct(reg.pct)} + ${reg.flat} ${reg.cur} per order, charged on the order total including sales tax.`,
    `Listing fee ${LISTING_FEE} per unit sold (Etsy renews the listing for each extra unit). Transaction fee ${fmtPct(TRANSACTION_RATE)} of item price + shipping + gift wrap (after discounts).`,
    v.offsite_ads_pct ? `Offsite Ads ${v.offsite_ads_pct}% of the order total, capped at ${OFFSITE_CAP} per order.` : 'Not an Offsite Ads sale (offsite_ads_pct 0).',
    'Sales tax is paid by the buyer and remitted by Etsy: it is not seller revenue, but the payment processing fee is charged on it.',
    'Not included: Etsy Ads (cost-per-click; pass it as ad_spend), Etsy Plus subscription, currency conversion (2.5%), Regulatory Operating Fee (UK/EU/TR sellers), Share & Save credits, shipping label purchases through Etsy (pass as shipping_label_cost), income tax.',
  ];
  if (reg.cur !== 'USD') a.push(`Amounts are in ${reg.cur}. The ${LISTING_FEE} listing fee and the ${OFFSITE_CAP} Offsite Ads cap are applied in ${reg.cur}, exactly as on shoptrueprofit.com; Etsy bills the listing fee as USD 0.20 converted at the current rate, so the real amount can differ by a few cents.`);
  return a;
}
function etsyFeeLines(r: ReturnType<typeof calc>, v: { quantity: number; offsite_ads_pct: number; sales_tax_pct: number }): Line[] {
  const cur = r.region.cur;
  return [
    { code: 'listing', label: 'Listing fee', amount: r.listing, basis: `${LISTING_FEE} x ${v.quantity} unit(s)` },
    { code: 'transaction', label: 'Transaction fee', amount: r.transaction, basis: `${fmtPct(TRANSACTION_RATE)} of ${money(r.gross, cur)} (items after discount + shipping + gift wrap)` },
    { code: 'processing', label: 'Payment processing fee', amount: r.processing, basis: `${fmtPct(r.region.pct)} of ${money(r2(r.gross + r.tax), cur)} (order total incl. ${v.sales_tax_pct}% sales tax) + ${r.region.flat} ${cur}` },
    { code: 'offsite_ads', label: 'Offsite Ads fee', amount: r.offsite, basis: v.offsite_ads_pct ? `${v.offsite_ads_pct}% of ${money(r.gross, cur)}, max ${OFFSITE_CAP} per order` : 'not an Offsite Ads sale' },
  ];
}
function etsyEcho(v: Record<string, unknown>) { return { ...v, currency: regionOf(String(v.region)).cur }; }

export function etsyFees(v: EtsyFeesIn): CalcResultOut {
  const r = calc(etsyEngineInput(v)); const cur = r.region.cur;
  return { tool: 'etsy_fees', marketplace: 'etsy', currency: cur,
    summary: `Etsy fees on a ${money(r.gross, cur)} order: ${money(r.fees, cur)} (${pct2(r.feePct)}% of revenue).`,
    inputs: etsyEcho(v), revenue: { seller_revenue: r.gross, sales_tax_collected_by_marketplace: r.tax, note: 'seller_revenue = item price x quantity - discount + shipping + gift wrap (sales tax excluded).' },
    fees: { lines: etsyFeeLines(r, v), total: r.fees, percent_of_revenue: pct2(r.feePct) },
    details: { region: r.region }, assumptions: etsyAssumptions(v), warnings: [], ...base('etsy') };
}
function etsyCostLines(v: EtsyProfitIn | EtsyTargetIn): Line[] {
  return [
    { code: 'item_cost', label: 'Item cost', amount: r2(v.item_cost * v.quantity), basis: `${v.item_cost} x ${v.quantity} unit(s)` },
    { code: 'shipping_label', label: 'Shipping label & packaging', amount: v.shipping_label_cost, basis: 'per order' },
    { code: 'ad_spend', label: 'Ad spend (your input)', amount: v.ad_spend, basis: 'per order' },
  ];
}
export function etsyProfit(v: EtsyProfitIn): CalcResultOut {
  const r = calc(etsyEngineInput(v)); const cur = r.region.cur;
  return { tool: 'etsy_profit', marketplace: 'etsy', currency: cur,
    summary: `Etsy profit ${money(r.profit, cur)} on ${money(r.gross, cur)} revenue (${pct2(r.margin)}% margin) after ${money(r.fees, cur)} fees and ${money(r.costs, cur)} costs. Break-even price ${money(r.breakEven, cur)} per unit.`,
    inputs: etsyEcho(v), revenue: { seller_revenue: r.gross, sales_tax_collected_by_marketplace: r.tax, note: 'seller_revenue = item price x quantity - discount + shipping + gift wrap (sales tax excluded).' },
    fees: { lines: etsyFeeLines(r, v), total: r.fees, percent_of_revenue: pct2(r.feePct) },
    costs: { lines: etsyCostLines(v), total: r.costs },
    profit: { profit: r.profit, margin_pct: pct2(r.margin), margin_ratio: r.margin, profit_per_unit: r.perUnit, break_even_price: r.breakEven },
    details: { region: r.region }, assumptions: [...etsyAssumptions(v), 'break_even_price is the per-unit item price (before discount) at which profit is zero, keeping every other input the same.'],
    warnings: r.profit < 0 ? ['This order loses money at the given price.'] : [], ...base('etsy') };
}
export function etsyTarget(v: EtsyTargetIn): CalcResultOut {
  const i = etsyEngineInput(v); const cur = regionOf(v.region).cur;
  const p = pricing(v.target_margin_pct, m => priceForMargin(i, m), price => calc({ ...i, price }), cur, 'per unit');
  return { tool: 'etsy_target_price', marketplace: 'etsy', currency: cur,
    summary: p.reachable ? `Etsy: list at ${money(p.target_price, cur)} per unit for a ${v.target_margin_pct}% margin; break-even ${money(p.break_even_price, cur)}.` : `Etsy: ${p.note}`,
    inputs: etsyEcho(v), pricing: p, costs: { lines: etsyCostLines(v), total: r2(v.item_cost * v.quantity + v.shipping_label_cost + v.ad_spend) },
    assumptions: [...etsyAssumptions(v), 'Prices are per-unit item prices before discount; margin = profit / seller revenue (items after discount + shipping + gift wrap).'],
    warnings: [], ...base('etsy') };
}

// =========================================================================================== eBay
function ebayEngineInput(v: Omit<EbayFeesIn, 'price'> & { price?: number; item_cost?: number; shipping_label_cost?: number; ad_spend?: number }): Partial<EbayInput> {
  return { price: v.price ?? 0, qty: v.quantity, shipping: v.shipping_charged, taxRate: v.sales_tax_pct / 100, category: v.category, adRate: v.promoted_listings_pct / 100,
    international: v.international, performance: v.seller_performance, insertion: v.insertion_fee, cost: v.item_cost ?? 0, label: (v.shipping_label_cost ?? 0) + (v.ad_spend ?? 0) };
}
export function describeEbayCategory(c: EbayCategory): string {
  const band = (b: { upTo: number; rate: number; lt?: boolean }, i: number, a: typeof c.bands) => {
    const lo = i === 0 ? 0 : a[i - 1].upTo; const r = fmtPct(b.rate);
    if (c.kind === 'marginal') return b.upTo === Infinity ? `${r} on the portion over $${lo.toLocaleString('en-US')}` : `${r} on the portion up to $${b.upTo.toLocaleString('en-US')}`;
    return b.upTo === Infinity ? `${r} of the whole amount if ${a[i - 1]?.lt ? 'at or above' : 'over'} $${lo.toLocaleString('en-US')}` : `${r} of the whole amount if ${b.lt ? 'under' : 'at or under'} $${b.upTo.toLocaleString('en-US')}`;
  };
  return c.bands.map(band).join('; ') + ' (per item, on the total amount of the sale incl. shipping and tax)' + (c.noOrderFeeFrom ? `; no per-order fee when the per-item amount is $${c.noOrderFeeFrom} or more` : '');
}
function ebayAssumptions(): string[] {
  return [
    'eBay.com (US) seller WITHOUT a Basic/Premium/Anchor/Enterprise Store (Starter Store rates are the same). Store subscribers pay different final value fees, not modelled.',
    'Final value fee is charged on the "total amount of the sale": item price + shipping + sales tax, with category tiers applied per item.',
    `Per-order fee: $${EBAY_ORDER_FEE_LOW.toFixed(2)} if the order total is $${EBAY_ORDER_FEE_THRESHOLD.toFixed(2)} or less, $${EBAY_ORDER_FEE_HIGH.toFixed(2)} above.`,
    'Sales tax is collected and remitted by eBay: it is not seller revenue, but eBay\'s fees are charged on it.',
    'Not included: Promoted Listings Priority (cost-per-click; pass as ad_spend), optional listing upgrades, eBay Motors vehicles, real estate, NFTs, $20 dispute fee, 3.25% currency conversion, income tax.',
  ];
}
function ebayFeeLines(r: ReturnType<typeof calcEbay>, v: EbayFeesIn | EbayProfitIn): Line[] {
  const perf = EBAY_PERFORMANCE.find(p => p.id === v.seller_performance)!;
  return [
    { code: 'final_value_fee', label: 'Final value fee (variable)', amount: r.fvf, basis: `${r.category.name}: ${describeEbayCategory(r.category)}; sale total ${money(r.saleTotal)}` },
    { code: 'per_order_fee', label: 'Final value fee (per order)', amount: r.orderFee, basis: r.orderFee === 0 ? 'not charged for this order' : `order total ${money(r.saleTotal)} ${r.saleTotal <= EBAY_ORDER_FEE_THRESHOLD ? '<=' : '>'} $${EBAY_ORDER_FEE_THRESHOLD}` },
    { code: 'promoted_listings', label: 'Promoted Listings (General)', amount: r.ad, basis: v.promoted_listings_pct ? `${v.promoted_listings_pct}% of ${money(r.saleTotal)}` : 'not promoted' },
    { code: 'international', label: 'International fee', amount: r.intl, basis: v.international ? `${fmtPct(EBAY_INTL_RATE)} of ${money(r.saleTotal)}` : 'domestic buyer or eBay International Shipping' },
    { code: 'performance', label: 'Seller performance surcharge', amount: r.performance, basis: perf.rate ? `${perf.name} of ${money(r.saleTotal)}` : perf.name },
    { code: 'insertion', label: 'Insertion fee', amount: r.insertion, basis: v.insertion_fee ? `$${EBAY_INSERTION_FEE} (beyond 250 free listings/month)` : 'within 250 free listings/month' },
  ];
}
const ebayDetails = (r: ReturnType<typeof calcEbay>) => ({ category: { id: r.category.id, name: r.category.name, rule: describeEbayCategory(r.category) }, sale_total_incl_tax: r.saleTotal });

export function ebayFees(v: EbayFeesIn): CalcResultOut {
  const r = calcEbay(ebayEngineInput(v));
  return { tool: 'ebay_fees', marketplace: 'ebay', currency: 'USD', summary: `eBay fees on a ${money(r.gross)} order: ${money(r.fees)} (${pct2(r.feePct)}% of revenue).`,
    inputs: v, revenue: { seller_revenue: r.gross, sales_tax_collected_by_marketplace: r.tax, note: 'seller_revenue = item price x quantity + shipping (sales tax excluded).' },
    fees: { lines: ebayFeeLines(r, v), total: r.fees, percent_of_revenue: pct2(r.feePct) }, details: ebayDetails(r), assumptions: ebayAssumptions(), warnings: [], ...base('ebay') };
}
function ebayCostLines(v: EbayProfitIn | EbayTargetIn): Line[] {
  return [
    { code: 'item_cost', label: 'Item cost', amount: r2(v.item_cost * v.quantity), basis: `${v.item_cost} x ${v.quantity} unit(s)` },
    { code: 'shipping_label', label: 'Shipping label & packaging', amount: v.shipping_label_cost, basis: 'per order' },
    { code: 'ad_spend', label: 'Other ad spend (your input)', amount: v.ad_spend, basis: 'per order' },
  ];
}
export function ebayProfit(v: EbayProfitIn): CalcResultOut {
  const r = calcEbay(ebayEngineInput(v));
  return { tool: 'ebay_profit', marketplace: 'ebay', currency: 'USD',
    summary: `eBay profit ${money(r.profit)} on ${money(r.gross)} revenue (${pct2(r.margin)}% margin) after ${money(r.fees)} fees and ${money(r.costs)} costs. Break-even price ${money(r.breakEven)} per unit.`,
    inputs: v, revenue: { seller_revenue: r.gross, sales_tax_collected_by_marketplace: r.tax, note: 'seller_revenue = item price x quantity + shipping (sales tax excluded).' },
    fees: { lines: ebayFeeLines(r, v), total: r.fees, percent_of_revenue: pct2(r.feePct) }, costs: { lines: ebayCostLines(v), total: r.costs },
    profit: { profit: r.profit, margin_pct: pct2(r.margin), margin_ratio: r.margin, profit_per_unit: r.perUnit, break_even_price: r.breakEven },
    details: ebayDetails(r), assumptions: [...ebayAssumptions(), 'break_even_price is the per-unit item price at which profit is zero, keeping every other input the same.'],
    warnings: r.profit < 0 ? ['This order loses money at the given price.'] : [], ...base('ebay') };
}
export function ebayTarget(v: EbayTargetIn): CalcResultOut {
  const i = ebayEngineInput(v);
  const p = pricing(v.target_margin_pct, m => ebayPriceForMargin(i, m), price => calcEbay({ ...i, price }), 'USD', 'per unit');
  return { tool: 'ebay_target_price', marketplace: 'ebay', currency: 'USD',
    summary: p.reachable ? `eBay: list at ${money(p.target_price)} per unit for a ${v.target_margin_pct}% margin; break-even ${money(p.break_even_price)}.` : `eBay: ${p.note}`,
    inputs: v, pricing: p, costs: { lines: ebayCostLines(v), total: r2(v.item_cost * v.quantity + v.shipping_label_cost + v.ad_spend) },
    assumptions: [...ebayAssumptions(), 'margin = profit / seller revenue (item price x quantity + shipping). Fee steps (the $10 per-order threshold, whole-amount category bands) are handled: the lowest price that reaches the target is returned.'],
    warnings: [], ...base('ebay') };
}

// =========================================================================================== Amazon
type AmzAny = Omit<AmazonFeesIn, 'price'> & { price?: number; item_cost?: number; inbound_cost?: number; shipping_label_cost?: number; ad_spend?: number };
function amazonEngineInput(v: AmzAny, date: string): Partial<AmzInput> {
  const fba = v.fulfillment === 'fba';
  // ad_spend is a per-unit seller cost; the engine's always-on per-unit cost slot is `cost`, so it is added there.
  return { price: v.price ?? 0, shipping: fba ? 0 : v.shipping_charged, giftWrap: v.gift_wrap, category: v.category, fulfillment: fba ? 'fba' : 'fbm', plan: v.selling_plan === 'individual' ? 'individual' : 'pro',
    unitsPerMonth: v.units_per_month, type: v.product_type as AmzInput['type'], length: v.length_in ?? 0, width: v.width_in ?? 0, height: v.height_in ?? 0, weight: v.weight_lb ?? 0,
    date, storageMonths: v.storage_months, cost: (v.item_cost ?? 0) + (v.ad_spend ?? 0), inbound: fba ? (v.inbound_cost ?? 0) : 0, label: fba ? 0 : (v.shipping_label_cost ?? 0) };
}
export function describeAmazonCategory(c: AmzCategory): string {
  const parts = c.bands.map((b, i, a) => {
    const lo = i === 0 ? 0 : a[i - 1].upTo; const r = fmtPct(b.rate);
    if (c.kind === 'flat') return r;
    if (c.kind === 'marginal') return b.upTo === Infinity ? `${r} on the portion over $${lo}` : `${r} on the portion up to $${b.upTo}`;
    return b.upTo === Infinity ? `${r} of the whole price if over $${lo}` : `${r} of the whole price if $${b.upTo} or less`;
  });
  return `${parts.join('; ')} of the total sales price (item + shipping + gift wrap, excl. tax)${c.min ? `; minimum $${c.min.toFixed(2)} per unit` : '; no minimum'}${c.closing ? `; plus $${CLOSING_FEE.toFixed(2)} closing fee` : ''}`;
}
function amazonAssumptions(v: AmzAny, date: string, defaulted: boolean): string[] {
  const fba = v.fulfillment === 'fba';
  const a = [
    'Amazon.com (US) marketplace, one unit sold. Referral fee on the total sales price (item + shipping + gift wrap, excluding tax), with the category minimum.',
    v.selling_plan === 'individual' ? `Individual plan: $${PER_ITEM_FEE} per unit sold.` : v.units_per_month > 0 ? `Professional plan: $${PRO_PLAN_MONTHLY}/month spread over ${v.units_per_month} units/month.` : `Professional plan: the $${PRO_PLAN_MONTHLY}/month subscription is NOT included (set units_per_month to spread it per unit).`,
    `Ship date ${date}${defaulted ? ' (today in US Eastern time, because ship_date was not given)' : ''}.`,
  ];
  if (fba) a.push(
    `FBA 2026 fee card "${v.product_type}"; peak rates apply to ship dates ${PEAK_FROM} to ${PEAK_TO}. Price band: under $10, $10-$50, over $50 (item price).`,
    `Fuel & logistics surcharge ${fmtPct(FUEL_SURCHARGE)} of the fulfillment fee from ${SURCHARGE_FROM}, rounded to the cent per unit (Amazon does not publish the rounding method).`,
    `Monthly storage: base rate per cubic foot for the ship-date month x ${v.storage_months} month(s). Storage utilization surcharge not included.`,
    'Not included: low-inventory-level fee, inbound placement fee, returns processing, aged-inventory surcharge, SIPP discounts, lithium battery fees, Overmax fee, removal/disposal, new-seller incentives, Multi-Channel Fulfillment.',
  );
  else {
    a.push('FBM: you ship the order, so no FBA fulfillment or storage fees; referral applies to item + shipping.');
    if (v.length_in || v.width_in || v.height_in || v.weight_lb) a.push('Package dimensions/weight were given but are not used for FBM.');
  }
  if (v.selling_plan === 'individual' && v.units_per_month > 0) a.push('units_per_month is ignored on the Individual plan (no monthly subscription).');
  a.push('Not included either way: Amazon Ads (pass as ad_spend), refunds and returns, income tax.');
  return a;
}
function amazonFeeLines(r: ReturnType<typeof calcAmazon>, v: AmzAny): Line[] {
  const lines: Line[] = [
    { code: 'referral', label: 'Referral fee', amount: r.referral, basis: `${r.category.name}: ${describeAmazonCategory(r.category)}; sales price ${money(r.gross)}` },
    { code: 'closing', label: 'Closing fee', amount: r.closing, basis: r.category.closing ? `$${CLOSING_FEE.toFixed(2)} per unit (media / video games)` : 'not charged in this category' },
    { code: 'per_item', label: 'Per-item fee (Individual plan)', amount: r.perItem, basis: v.selling_plan === 'individual' ? `$${PER_ITEM_FEE} per unit` : 'Professional plan' },
    { code: 'subscription', label: 'Professional plan share', amount: r.plan, basis: v.selling_plan === 'pro' && v.units_per_month > 0 ? `$${PRO_PLAN_MONTHLY} / ${v.units_per_month} units` : 'not allocated' },
  ];
  if (v.fulfillment === 'fba') lines.push(
    { code: 'fba_fulfillment', label: 'FBA fulfillment fee', amount: r.fba, basis: `${TIER_NAMES[r.tier!.tier]}, ${r2(r.tier!.shipWeight)} lb shipping weight, ${r.season === 'peak' ? 'peak' : 'non-peak'} ${v.product_type} card` },
    { code: 'fuel_surcharge', label: 'Fuel & logistics surcharge', amount: r.surcharge, basis: r.surcharge ? `${fmtPct(FUEL_SURCHARGE)} of the fulfillment fee` : `not charged before ${SURCHARGE_FROM}` },
    { code: 'storage', label: 'Monthly storage fee', amount: r.storage, basis: `${+r.tier!.volume.toFixed(4)} cu ft x ${v.storage_months} month(s)` },
  );
  return lines;
}
function amazonDetails(r: ReturnType<typeof calcAmazon>) {
  return { category: { id: r.category.id, name: r.category.name, rule: describeAmazonCategory(r.category) }, season: r.season,
    price_band: ['under $10', '$10 to $50', 'over $50'][r.band],
    size_tier: r.tier && { id: r.tier.tier, name: TIER_NAMES[r.tier.tier], shipping_weight_lb: r2(r.tier.shipWeight), dimensional_weight_lb: r2(r.tier.dimWeight), cubic_feet: +r.tier.volume.toFixed(4), overmax: r.tier.overmax } };
}
const shipDateOf = (v: { ship_date?: string }) => ({ date: v.ship_date ?? todayET(), defaulted: v.ship_date === undefined });
const amzEcho = (v: Record<string, unknown>, date: string) => ({ ...v, ship_date: date });

export function amazonFees(v: AmazonFeesIn): CalcResultOut {
  const { date, defaulted } = shipDateOf(v); const r = calcAmazon(amazonEngineInput(v, date), date);
  return { tool: 'amazon_fees', marketplace: 'amazon', currency: 'USD', summary: `Amazon ${v.fulfillment.toUpperCase()} fees on a ${money(r.gross)} sale: ${money(r.fees)} (${pct2(r.feePct)}% of revenue).`,
    inputs: amzEcho(v, date), revenue: { seller_revenue: r.gross, sales_tax_collected_by_marketplace: 0, note: 'seller_revenue = item price + shipping (FBM) + gift wrap. Amazon collects and remits sales tax separately; it is not in any fee base.' },
    fees: { lines: amazonFeeLines(r, v), total: r.fees, percent_of_revenue: pct2(r.feePct) }, details: amazonDetails(r), assumptions: amazonAssumptions(v, date, defaulted), warnings: r.warnings, ...base('amazon') };
}
function amazonCostLines(v: AmazonProfitIn | AmazonTargetIn): Line[] {
  const l: Line[] = [{ code: 'item_cost', label: 'Item cost', amount: v.item_cost, basis: 'per unit' }];
  if (v.fulfillment === 'fba') l.push({ code: 'inbound', label: 'Inbound shipping to Amazon', amount: v.inbound_cost, basis: 'per unit' });
  else l.push({ code: 'shipping_label', label: 'Shipping label', amount: v.shipping_label_cost, basis: 'per unit' });
  l.push({ code: 'ad_spend', label: 'Ad spend (your input)', amount: v.ad_spend, basis: 'per unit' });
  return l;
}
export function amazonProfit(v: AmazonProfitIn): CalcResultOut {
  const { date, defaulted } = shipDateOf(v); const r = calcAmazon(amazonEngineInput(v, date), date);
  return { tool: 'amazon_profit', marketplace: 'amazon', currency: 'USD',
    summary: `Amazon ${v.fulfillment.toUpperCase()} profit ${money(r.profit)} per unit on ${money(r.gross)} (${pct2(r.margin)}% margin) after ${money(r.fees)} fees and ${money(r.costs)} costs. Break-even price ${money(r.breakEven)}.`,
    inputs: amzEcho(v, date), revenue: { seller_revenue: r.gross, sales_tax_collected_by_marketplace: 0, note: 'seller_revenue = item price + shipping (FBM) + gift wrap.' },
    fees: { lines: amazonFeeLines(r, v), total: r.fees, percent_of_revenue: pct2(r.feePct) }, costs: { lines: amazonCostLines(v), total: r.costs },
    profit: { profit: r.profit, margin_pct: pct2(r.margin), margin_ratio: r.margin, profit_per_unit: r.profit, break_even_price: r.breakEven },
    details: amazonDetails(r), assumptions: [...amazonAssumptions(v, date, defaulted), 'break_even_price is the item price at which profit is zero, keeping every other input the same (FBA price bands are handled).'],
    warnings: [...r.warnings, ...(r.profit < 0 ? ['This unit loses money at the given price.'] : [])], ...base('amazon') };
}
export function amazonTarget(v: AmazonTargetIn): CalcResultOut {
  const { date, defaulted } = shipDateOf(v); const i = amazonEngineInput(v, date);
  const p = pricing(v.target_margin_pct, m => amazonPriceForMargin(i, m, date), price => calcAmazon({ ...i, price }, date), 'USD', 'per unit');
  const total = r2(v.item_cost + v.ad_spend + (v.fulfillment === 'fba' ? v.inbound_cost : v.shipping_label_cost));
  return { tool: 'amazon_target_price', marketplace: 'amazon', currency: 'USD',
    summary: p.reachable ? `Amazon ${v.fulfillment.toUpperCase()}: list at ${money(p.target_price)} for a ${v.target_margin_pct}% margin; break-even ${money(p.break_even_price)}.` : `Amazon: ${p.note}`,
    inputs: amzEcho(v, date), pricing: p, costs: { lines: amazonCostLines(v), total },
    assumptions: [...amazonAssumptions(v, date, defaulted), 'margin = profit / seller revenue (item price + FBM shipping + gift wrap). FBA price-band steps and whole-price referral bands are handled: the lowest price that reaches the target is returned.'],
    warnings: [], ...base('amazon') };
}

// =========================================================================================== Compare
export function compareMarketplaces(v: CompareIn): CalcResultOut {
  const common = { price: v.price, item_cost: v.item_cost, ad_spend: v.ad_spend };
  const etsy = etsyProfit({ ...common, quantity: 1, shipping_charged: v.shipping_charged, gift_wrap: 0, discount: 0, offsite_ads_pct: v.etsy.offsite_ads_pct, region: 'us',
    sales_tax_pct: v.sales_tax_pct, shipping_label_cost: v.shipping_label_cost });
  const ebay = ebayProfit({ ...common, quantity: 1, shipping_charged: v.shipping_charged, sales_tax_pct: v.sales_tax_pct, category: v.ebay.category,
    promoted_listings_pct: v.ebay.promoted_listings_pct, international: false, seller_performance: v.ebay.seller_performance, insertion_fee: false, shipping_label_cost: v.shipping_label_cost });
  const fba = v.amazon.fulfillment === 'fba';
  const amazon = amazonProfit({ ...v.amazon, ...common, gift_wrap: 0, shipping_charged: fba ? 0 : v.shipping_charged, shipping_label_cost: fba ? 0 : v.shipping_label_cost, inbound_cost: fba ? v.amazon.inbound_cost : 0 });
  const results = { etsy, ebay, amazon } as const;
  const target = v.target_margin_pct;
  const targets = target === undefined ? null : {
    etsy: etsyTarget({ quantity: 1, shipping_charged: v.shipping_charged, gift_wrap: 0, discount: 0, offsite_ads_pct: v.etsy.offsite_ads_pct, region: 'us', sales_tax_pct: v.sales_tax_pct,
      item_cost: v.item_cost, shipping_label_cost: v.shipping_label_cost, ad_spend: v.ad_spend, target_margin_pct: target }).pricing!,
    ebay: ebayTarget({ quantity: 1, shipping_charged: v.shipping_charged, sales_tax_pct: v.sales_tax_pct, category: v.ebay.category, promoted_listings_pct: v.ebay.promoted_listings_pct,
      international: false, seller_performance: v.ebay.seller_performance, insertion_fee: false, item_cost: v.item_cost, shipping_label_cost: v.shipping_label_cost, ad_spend: v.ad_spend, target_margin_pct: target }).pricing!,
    amazon: amazonTarget({ ...v.amazon, gift_wrap: 0, shipping_charged: fba ? 0 : v.shipping_charged, item_cost: v.item_cost, ad_spend: v.ad_spend, shipping_label_cost: fba ? 0 : v.shipping_label_cost,
      inbound_cost: fba ? v.amazon.inbound_cost : 0, target_margin_pct: target }).pricing!,
  };
  const ranking = (Object.keys(results) as Marketplace[]).map(m => {
    const r = results[m];
    return { marketplace: m, revenue: r.revenue!.seller_revenue, fees: r.fees!.total, fee_pct_of_revenue: r.fees!.percent_of_revenue, costs: r.costs!.total, profit: r.profit!.profit,
      margin_pct: r.profit!.margin_pct, break_even_price: r.profit!.break_even_price, ...(targets ? { target_price: targets[m].target_price } : {}) };
  }).sort((a, b) => b.profit - a.profit || a.marketplace.localeCompare(b.marketplace));
  const best = ranking[0]; const tie = ranking.filter(x => x.profit === best.profit).map(x => MARKET_NAME[x.marketplace]);
  const line = ranking.map(x => `${MARKET_NAME[x.marketplace]} ${money(x.profit)} (${x.margin_pct}%)`).join(', ');
  return { tool: 'compare_marketplaces', marketplace: 'all', currency: 'USD',
    summary: `${tie.length > 1 ? `Tie: ${tie.join(' and ')}` : `${MARKET_NAME[best.marketplace]} pays the most`} for a ${money(v.price)} item: ${line}.`,
    inputs: v, comparison: { best: best.marketplace, ranking, ...(targets ? { target_margin_pct: target, target_prices: targets } : {}), results },
    assumptions: [
      'Quantity 1 on every marketplace. Etsy: US region (USD), no discount or gift wrap. eBay: domestic buyer, no Store subscription, no insertion fee. Amazon: as configured in the amazon object.',
      fba ? 'Amazon FBA: shipping_charged and shipping_label_cost are NOT applied (Amazon sets FBA shipping and the FBA fee covers delivery); inbound_cost is applied instead. Revenue on Amazon is therefore the item price only.'
        : 'Amazon FBM: shipping_charged and shipping_label_cost are applied the same as on Etsy and eBay.',
      'Each marketplace\'s full assumptions are in comparison.results.<marketplace>.assumptions.',
    ],
    warnings: ranking.filter(x => x.profit < 0).map(x => `${MARKET_NAME[x.marketplace]} loses money at this price.`),
    fee_table: [FEE_TABLES.etsy, FEE_TABLES.ebay, FEE_TABLES.amazon], sources: [...SOURCES.etsy, ...SOURCES.ebay, ...SOURCES.amazon],
    calculator_url: { etsy: calculatorUrl('etsy'), ebay: calculatorUrl('ebay'), amazon: calculatorUrl('amazon') }, disclaimer: DISCLAIMER };
}

// =========================================================================================== Reference lists
export function listEbayCategories() {
  return { tool: 'list_ebay_categories', marketplace: 'ebay' as const, count: EBAY_CATEGORIES.length,
    items: EBAY_CATEGORIES.map(c => ({ id: c.id, name: c.name, final_value_fee: describeEbayCategory(c) })),
    seller_performance_options: EBAY_PERFORMANCE.map(p => ({ id: p.id, name: p.name, surcharge_pct: +(p.rate * 100).toFixed(4) })),
    per_order_fee: `$${EBAY_ORDER_FEE_LOW.toFixed(2)} if the order total is $${EBAY_ORDER_FEE_THRESHOLD.toFixed(2)} or less, else $${EBAY_ORDER_FEE_HIGH.toFixed(2)}`,
    note: 'Use the id as the category argument of ebay_fees, ebay_profit, ebay_target_price and compare_marketplaces. Rates are for sellers without a Store subscription.', ...base('ebay') };
}
export function listAmazonCategories() {
  return { tool: 'list_amazon_categories', marketplace: 'amazon' as const, count: AMZ_CATEGORIES.length,
    items: AMZ_CATEGORIES.map(c => ({ id: c.id, name: c.name, referral_fee: describeAmazonCategory(c), minimum_fee: c.min, closing_fee: c.closing ? CLOSING_FEE : 0 })),
    size_tiers: Object.entries(TIER_NAMES).map(([id, name]) => ({ id, name })),
    note: 'Use the id as the category argument of amazon_fees, amazon_profit, amazon_target_price and compare_marketplaces.', ...base('amazon') };
}
export function listEtsyRegions() {
  return { tool: 'list_etsy_regions', marketplace: 'etsy' as const, count: REGIONS.length,
    items: REGIONS.map(r => ({ id: r.id, name: r.name, currency: r.cur, processing_pct: +(r.pct * 100).toFixed(4), processing_fixed: r.flat })),
    other_fees: { listing_fee: LISTING_FEE, transaction_fee_pct: TRANSACTION_RATE * 100, offsite_ads_pct_options: [12, 15], offsite_ads_cap: OFFSITE_CAP },
    note: 'Use the id as the region argument of etsy_fees, etsy_profit and etsy_target_price. Amounts are in the region currency.', ...base('etsy') };
}

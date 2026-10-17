// Tool registry: one place that defines every tool's name, agent-facing description, input schema and handler.
// Used by the MCP server (stdio + HTTP) and by the Apify batch mode, so validation and results are identical everywhere.
import * as z from 'zod';
import * as S from './schemas';
import * as C from './compute';

export interface ToolDef { name: string; title: string; description: string; input: z.ZodType; charged: boolean; run: (args: any) => object }

const COMMON = 'Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.';
const PCT = 'Percent arguments (*_pct) are percents: 8.25 means 8.25%. Money is in whole cents.';

export const TOOLS: ToolDef[] = [
  { name: 'etsy_fees', title: 'Etsy fees for one order', charged: true, input: S.etsyFeesInput, run: C.etsyFees,
    description: `Calculate Etsy seller fees for one order: listing ($0.20/unit), 6.5% transaction, payment processing (by Etsy Payments region, charged on the total incl. sales tax) and Offsite Ads (12%/15%, capped). Use when you need what Etsy takes from a sale; use etsy_profit when you also know your costs. ${PCT} ${COMMON}` },
  { name: 'ebay_fees', title: 'eBay fees for one order', charged: true, input: S.ebayFeesInput, run: C.ebayFees,
    description: `Calculate eBay.com (US) seller fees for one order: category final value fee (tiered per item, on item + shipping + sales tax), per-order fee ($0.30/$0.40), Promoted Listings General ad rate, international fee, seller-performance surcharges and insertion fee. Rates for sellers without a paid Store subscription. Call list_ebay_categories for category ids. ${PCT} ${COMMON}` },
  { name: 'amazon_fees', title: 'Amazon FBA or FBM fees for one unit', charged: true, input: S.amazonFeesInput, run: C.amazonFees,
    description: `Calculate Amazon.com (US) fees for one unit, FBA or FBM: referral fee (by category, with minimums), closing fee, Individual-plan per-item fee or Professional-plan share, and for FBA the 2026 fulfillment fee (size tier from package dimensions and weight, peak/non-peak by ship date, apparel and dangerous-goods cards), the fuel & logistics surcharge and monthly storage. FBA requires length_in, width_in, height_in and weight_lb. Call list_amazon_categories for category ids. ${COMMON}` },
  { name: 'etsy_profit', title: 'Etsy profit and margin', charged: true, input: S.etsyProfitInput, run: C.etsyProfit,
    description: `Calculate profit, margin and break-even price for an Etsy order from price, quantity, shipping, item cost, label/packaging cost and ads (Offsite Ads rate plus any Etsy Ads spend you attribute to the order). Margin = profit / seller revenue (sales tax excluded). ${PCT} ${COMMON}` },
  { name: 'ebay_profit', title: 'eBay profit and margin', charged: true, input: S.ebayProfitInput, run: C.ebayProfit,
    description: `Calculate profit, margin and break-even price for an eBay.com (US) order from price, quantity, shipping, item cost, label cost and ads (Promoted Listings General rate plus any other ad spend). Margin = profit / seller revenue (sales tax excluded). ${PCT} ${COMMON}` },
  { name: 'amazon_profit', title: 'Amazon profit and margin (FBA or FBM)', charged: true, input: S.amazonProfitInput, run: C.amazonProfit,
    description: `Calculate profit, margin and break-even price for one unit sold on Amazon.com (US), FBA or FBM, from price, category, item cost, inbound cost (FBA) or label cost (FBM) and ad spend. FBA requires package dimensions and weight. ${COMMON}` },
  { name: 'etsy_target_price', title: 'Etsy break-even and target-margin price', charged: true, input: S.etsyTargetInput, run: C.etsyTarget,
    description: `Find the lowest Etsy item price (per unit, before discount) that breaks even and the lowest that reaches target_margin_pct, given shipping, costs and ads. Also shows fees and profit at the target price, or the highest reachable margin if the target is impossible. ${PCT} ${COMMON}` },
  { name: 'ebay_target_price', title: 'eBay break-even and target-margin price', charged: true, input: S.ebayTargetInput, run: C.ebayTarget,
    description: `Find the lowest eBay.com (US) item price that breaks even and the lowest that reaches target_margin_pct, handling fee steps (the $10 per-order threshold and whole-amount category bands). Also shows fees and profit at the target price, or the highest reachable margin if the target is impossible. ${PCT} ${COMMON}` },
  { name: 'amazon_target_price', title: 'Amazon break-even and target-margin price', charged: true, input: S.amazonTargetInput, run: C.amazonTarget,
    description: `Find the lowest Amazon.com (US) item price that breaks even and the lowest that reaches target_margin_pct, FBA or FBM, handling FBA price bands and whole-price referral bands. Also shows fees and profit at the target price, or the highest reachable margin if the target is impossible. ${COMMON}` },
  { name: 'compare_marketplaces', title: 'Compare Etsy, eBay and Amazon for one product', charged: true, input: S.compareInput, run: C.compareMarketplaces,
    description: `Compare the same product on Etsy, eBay and Amazon: fees, profit, margin and break-even price on each, ranked by profit, plus the price needed on each for target_margin_pct if given. The amazon object (category, fulfillment, and dimensions/weight for FBA) is required. One call, one charge. ${PCT} ${COMMON}` },
  { name: 'list_ebay_categories', title: 'List eBay fee categories', charged: false, input: S.emptyInput, run: C.listEbayCategories,
    description: 'List the eBay final value fee category ids and rules, and the seller performance options, accepted by the eBay tools. Free (not charged).' },
  { name: 'list_amazon_categories', title: 'List Amazon referral fee categories', charged: false, input: S.emptyInput, run: C.listAmazonCategories,
    description: 'List the Amazon referral fee category ids, rates, minimums and closing fees, and the FBA size tiers, accepted by the Amazon tools. Free (not charged).' },
  { name: 'list_etsy_regions', title: 'List Etsy Payments regions', charged: false, input: S.emptyInput, run: C.listEtsyRegions,
    description: 'List the Etsy Payments region ids with currency and payment processing rates, plus Etsy\'s listing, transaction and Offsite Ads rates, accepted by the Etsy tools. Free (not charged).' },
];
export const TOOL_NAMES = TOOLS.map(t => t.name);
export const toolByName = (n: string) => TOOLS.find(t => t.name === n);

/** Validate + run outside MCP (batch mode, tests). Same schema, same messages as the MCP path. */
export function runTool(name: string, args: unknown): { ok: true; result: object; charged: boolean } | { ok: false; error: string } {
  const t = toolByName(name);
  if (!t) return { ok: false, error: `Unknown tool "${name}". Available: ${TOOL_NAMES.join(', ')}.` };
  const p = t.input.safeParse(args ?? {});
  if (!p.success) return { ok: false, error: `Invalid arguments for ${name}: ${p.error.issues.map(i => i.path.length ? `${i.message} (at ${i.path.join('.')})` : i.message).join('; ')}` };
  return { ok: true, result: t.run(p.data), charged: t.charged };
}

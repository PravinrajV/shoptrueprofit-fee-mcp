import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import { TOOLS, COMMON, COMMON_APIFY } from './tools';
import { freeBiller, type Biller } from './billing';
import { SERVER_NAME, SERVER_VERSION, SITE, isApify } from './meta';

const line = z.object({ code: z.string(), label: z.string(), amount: z.number(), basis: z.string() });
const feeTable = z.object({ id: z.string(), marketplace: z.string(), region: z.string(), verified_on: z.string(), engine_file: z.string(), engine_sha256: z.string(), documentation: z.string() });
const source = z.object({ title: z.string(), url: z.string() });
export const calcOutput = z.looseObject({
  tool: z.string(), marketplace: z.enum(['etsy', 'ebay', 'amazon', 'all']), currency: z.string(), summary: z.string(),
  inputs: z.record(z.string(), z.unknown()),
  revenue: z.object({ seller_revenue: z.number(), sales_tax_collected_by_marketplace: z.number(), note: z.string() }).optional(),
  fees: z.object({ lines: z.array(line), total: z.number(), percent_of_revenue: z.number() }).optional(),
  costs: z.object({ lines: z.array(line), total: z.number() }).optional(),
  profit: z.object({ profit: z.number(), margin_pct: z.number(), margin_ratio: z.number(), profit_per_unit: z.number(), break_even_price: z.number().nullable() }).optional(),
  pricing: z.looseObject({ target_margin_pct: z.number(), break_even_price: z.number().nullable(), target_price: z.number().nullable(), reachable: z.boolean(), note: z.string() }).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  comparison: z.record(z.string(), z.unknown()).optional(),
  assumptions: z.array(z.string()), warnings: z.array(z.string()),
  fee_table: z.union([feeTable, z.array(feeTable)]), sources: z.array(source),
  calculator_url: z.union([z.string(), z.record(z.string(), z.string())]), disclaimer: z.string(),
});
// Apify Store variants: identical except that results carry no calculator_url.
const calcOutputApify = calcOutput.omit({ calculator_url: true });
export const listOutput = z.looseObject({ tool: z.string(), marketplace: z.enum(['etsy', 'ebay', 'amazon']), count: z.number(), items: z.array(z.record(z.string(), z.unknown())),
  note: z.string(), fee_table: feeTable, sources: z.array(source), calculator_url: z.string() });
const listOutputApify = listOutput.omit({ calculator_url: true });

export const INSTRUCTIONS = `ShopTrueProfit Fee & Profit: seller fee, profit and pricing math for Etsy, eBay.com (US) and Amazon.com (US, FBA and FBM), using the same engine as the free calculators at ${SITE}.
- Fees only: etsy_fees, ebay_fees, amazon_fees. With costs: *_profit. Price to charge: *_target_price. Which marketplace pays most: compare_marketplaces.
- Category and region ids: list_ebay_categories, list_amazon_categories, list_etsy_regions (free).
- Percent arguments are percents (8.25 = 8.25%). Money is in dollars with up to 2 decimals (24.99 = $24.99). Amazon FBA needs package length_in, width_in, height_in and weight_lb.
- Every result includes summary, itemized fee lines, assumptions, warnings, fee_table (version + verified_on date), sources and calculator_url. Quote the summary and mention material assumptions to the user.`;

/** Apify Store instructions: same guidance, no website link (Apify Store Publishing Terms 2.2.4.2). */
export const INSTRUCTIONS_APIFY = `ShopTrueProfit Fee & Profit: seller fee, profit and pricing math for Etsy, eBay.com (US) and Amazon.com (US, FBA and FBM), using the ShopTrueProfit fee engine.
- Fees only: etsy_fees, ebay_fees, amazon_fees. With costs: *_profit. Price to charge: *_target_price. Which marketplace pays most: compare_marketplaces.
- Category and region ids: list_ebay_categories, list_amazon_categories, list_etsy_regions (free).
- Percent arguments are percents (8.25 = 8.25%). Money is in dollars with up to 2 decimals (24.99 = $24.99). Amazon FBA needs package length_in, width_in, height_in and weight_lb.
- Every result includes summary, itemized fee lines, assumptions, warnings, fee_table (version + verified_on date) and official sources. Quote the summary and mention material assumptions to the user.`;

/** Instructions for the current distribution (see meta.distribution). */
export const instructions = () => (isApify() ? INSTRUCTIONS_APIFY : INSTRUCTIONS);
/** MCP serverInfo for the current distribution: the website link is omitted on Apify. */
export const serverInfo = () => ({ name: SERVER_NAME, version: SERVER_VERSION, title: 'ShopTrueProfit Fee & Profit', ...(isApify() ? {} : { websiteUrl: SITE }) });

/** Build a fresh MCP server. Stateless: safe to create one per HTTP request. */
export function createServer(biller: Biller = freeBiller): McpServer {
  const apify = isApify();
  const server = new McpServer(serverInfo(), { instructions: instructions() });
  for (const t of TOOLS) {
    server.registerTool(t.name, {
      title: t.title, description: apify ? t.description.replace(COMMON, COMMON_APIFY) : t.description, inputSchema: t.input as z.ZodObject,
      outputSchema: t.charged ? (apify ? calcOutputApify : calcOutput) : (apify ? listOutputApify : listOutput),
      annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { charged: t.charged },
    }, async (args: unknown): Promise<CallToolResult> => {
      const result = t.run(args) as Record<string, unknown>;
      if (t.charged) {
        const c = await biller.charge(t.name);
        if (!c.ok) return { isError: true, content: [{ type: 'text', text: c.reason ?? 'Not charged.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
    });
  }
  return server;
}

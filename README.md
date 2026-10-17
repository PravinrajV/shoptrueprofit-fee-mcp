# ShopTrueProfit Fee & Profit MCP: Etsy, eBay and Amazon FBA/FBM

**Give your AI agent exact marketplace fee math.** Etsy, eBay.com and Amazon.com (FBA and FBM) seller fees, profit, margin, break-even price and "what price do I need for a 30% margin", in one MCP server.

It runs the **same fee engine as the free calculators on [shoptrueprofit.com](https://shoptrueprofit.com)**, byte for byte. Every answer comes with an itemized fee breakdown, the assumptions used, the fee-table version and the date it was checked, links to the official Etsy, eBay and Amazon fee pages, and a link to the matching free calculator so a person can double-check it.

- **13 tools**: fees, profit and target price for each marketplace, a 3-way comparison, and free category and region lookups
- **Current 2026 tables**: Amazon's 2026 FBA cards (standard, apparel, dangerous goods) with **peak-season rates (Oct 15 to Jan 14)**, the 3.5% fuel & logistics surcharge, monthly storage, the 37 referral categories with minimums and closing fees; eBay's 11 final value fee categories with per-item tiers, the $0.30/$0.40 per-order fee, Promoted Listings, the international fee and performance surcharges; Etsy's listing, transaction, payment processing for 12 regions, and Offsite Ads with the $100 cap
- **Built for agents**: tight JSON schemas with enums, a one-line `summary` on every result, and clear errors. Bad input is rejected with a message naming the field. It is never quietly "fixed".
- **Deterministic and private**: pure math. No scraping, no logins, no marketplace API keys, and nothing you send is stored.

> Not affiliated with Etsy, eBay or Amazon. Results are estimates from published fee schedules; your marketplace statement is the final word.

## Tools

| Tool | What it answers | Billing |
|---|---|---|
| `etsy_fees` | What does Etsy take from this order? | 1 event |
| `ebay_fees` | What does eBay take from this order? | 1 event |
| `amazon_fees` | Amazon referral + FBA (or FBM) fees for one unit | 1 event |
| `etsy_profit` | Profit, margin and break-even price on Etsy, given costs and ads | 1 event |
| `ebay_profit` | Same for eBay | 1 event |
| `amazon_profit` | Same for Amazon, FBA or FBM | 1 event |
| `etsy_target_price` | Lowest price that breaks even and that reaches X% margin on Etsy | 1 event |
| `ebay_target_price` | Same for eBay (handles the $10 per-order step and whole-amount bands) | 1 event |
| `amazon_target_price` | Same for Amazon (handles FBA price bands and referral bands) | 1 event |
| `compare_marketplaces` | The same product on Etsy, eBay and Amazon, ranked by profit | 1 event |
| `list_ebay_categories` | eBay category ids and fee rules | free |
| `list_amazon_categories` | Amazon category ids, referral rates, minimums, size tiers | free |
| `list_etsy_regions` | Etsy Payments regions, currencies, processing rates | free |

Every argument is documented in the [tool reference](https://github.com/PravinrajV/shoptrueprofit-fee-mcp/blob/main/docs/tool-reference.md). Money amounts are in dollars with at most 2 decimal places (`24.99` means $24.99), and percent arguments are percents (`8.25` means 8.25%).

## Example

Ask your agent: *"I sell a $25 item on eBay with $5 shipping. It costs me $8 and the label is $4. I promote at 5%. What do I make, and what should I charge for a 30% margin?"*

The agent calls `ebay_profit`:

```json
{ "price": 25, "shipping_charged": 5, "item_cost": 8, "shipping_label_cost": 4, "promoted_listings_pct": 5 }
```

and gets back (shortened):

```json
{
  "summary": "eBay profit $12.02 on $30.00 revenue (40.07% margin) after $5.98 fees and $12.00 costs. Break-even price $10.24 per unit.",
  "fees": { "total": 5.98, "percent_of_revenue": 19.93, "lines": [
    { "code": "final_value_fee", "amount": 4.08, "basis": "Most categories: 13.6% on the portion up to $7,500; ..." },
    { "code": "per_order_fee", "amount": 0.40, "basis": "order total $30.00 > $10" },
    { "code": "promoted_listings", "amount": 1.50, "basis": "5% of $30.00" } ] },
  "profit": { "profit": 12.02, "margin_pct": 40.07, "break_even_price": 10.24 },
  "assumptions": ["eBay.com (US) seller WITHOUT a Basic/Premium/Anchor/Enterprise Store ...", "..."],
  "fee_table": { "id": "ebay-us-2026-10-16", "verified_on": "2026-10-16" },
  "sources": [{ "title": "eBay: Selling fees", "url": "https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822" }],
  "calculator_url": "https://shoptrueprofit.com/ebay-fee-calculator?utm_source=mcp&utm_medium=tool&utm_campaign=stp-fee-mcp"
}
```

## Connect

### Hosted on Apify (MCP over streamable HTTP)

Endpoint: `https://<standby-url-from-the-Endpoints-tab>/mcp`, with header `Authorization: Bearer <your Apify API token>`.

```json
{
  "mcpServers": {
    "shoptrueprofit-fees": {
      "type": "streamable-http",
      "url": "https://<standby-url>/mcp",
      "headers": { "Authorization": "Bearer ${APIFY_TOKEN}" }
    }
  }
}
```

### Batch runs on Apify

Start the Actor normally with input `{ "tool": "...", "arguments": { ... } }`, or many at once with `{ "calls": [ { "tool": "...", "arguments": { ... } } ] }` (up to 1,000). Each result is one dataset item with `ok`, `result` or `error`. Rejected items are listed with the reason and are not charged.

### Local (stdio, free, open source)

**Claude Desktop and other MCPB clients:** download `shoptrueprofit-fee-mcp-1.0.0.mcpb` from the [latest release](https://github.com/PravinrajV/shoptrueprofit-fee-mcp/releases/latest) and open it. It has no dependencies and needs no network access.

**From source:**

```bash
git clone https://github.com/PravinrajV/shoptrueprofit-fee-mcp.git && cd shoptrueprofit-fee-mcp
npm install && npm run build
node dist/stdio.js            # stdio MCP server
PORT=3000 node dist/http.js   # streamable HTTP at http://127.0.0.1:3000/mcp
```

```json
{ "mcpServers": { "shoptrueprofit-fees": { "command": "node", "args": ["/path/to/shoptrueprofit-fee-mcp/dist/stdio.js"] } } }
```

## Pricing

Pay per event: **one `fee-calculation` event per successful calculation** (one MCP tool call, or one batch item). The `list_*` lookups and rejected inputs are free. On Apify's Standby (MCP) endpoint, Apify also bills its small platform usage for the time the server runs; see Apify's [Standby billing](https://docs.apify.com/actors/running/standby#are-the-standby-runs-billed-differently).

## What's included, what isn't

Included and kept current: everything in the fee tables listed above. Each result's `assumptions` lists exactly what was applied.

Not modelled (each result says so): eBay Store subscription rates; Etsy Ads cost-per-click, Etsy Plus, currency conversion and the Regulatory Operating Fee; Amazon low-inventory, inbound placement, returns processing, aged-inventory and storage-utilization surcharges, lithium battery fees, removal/disposal, the Overmax handling fee, and FBA rates after Jan 14, 2027 (not yet published; 2026 non-peak rates are used, with a warning). Ad spend you pay per click can be passed in as `ad_spend`.

## Accuracy

- The fee engine is a verbatim copy of the shoptrueprofit.com source (`src/engine/`, never edited by hand). `npm run check-engine` verifies it by SHA-256. In the maintainers' workspace, the test suite also compares this server's output field by field with the website's own functions on 1,700+ cases, including Amazon's and eBay's own published worked examples. In a fresh clone without the app source, those cross-checks are skipped and the other suites still run.
- Fee tables were verified against the official pages on the date in `fee_table.verified_on` (Etsy 2026-10-13, eBay and Amazon 2026-10-16).

## Development

```bash
npm install
npm run typecheck && npm run build && npm test   # 125 tests: cross-checks, schemas, stdio + HTTP protocol, Apify SDK, distribution modes, packaging
npm run sync-engine                              # maintainers: re-copy the engine from the ShopTrueProfit app after a fee update
npm run gen-reference                            # regenerate docs/tool-reference.md
npm run pack:mcpb                                # build build/shoptrueprofit-fee-mcp-<version>.mcpb (local Claude Desktop / Smithery bundle)
```

## Privacy

- **Local (stdio / MCPB):** everything runs on your computer. The server makes no network requests and stores, logs and sends nothing.
- **Hosted (Apify):** your tool arguments are processed in memory to compute the answer and are not stored by the server. Apify runs the infrastructure and handles your account, billing and platform logs under [Apify's privacy policy](https://docs.apify.com/legal/privacy-policy). Batch runs write results to your own Apify dataset, which you control and can delete.
- No personal data is needed. Inputs are prices, costs, dimensions and categories.
- Contact: [support@shoptrueprofit.com](mailto:support@shoptrueprofit.com) or [GitHub issues](https://github.com/PravinrajV/shoptrueprofit-fee-mcp/issues). Full policy, including the "Fee & Profit MCP server and API" section: [shoptrueprofit.com/#privacy](https://shoptrueprofit.com/#privacy).

## Cursor plugin

This repository is also a Cursor plugin (`.cursor-plugin/plugin.json`, `mcp.json` and the `marketplace-fees` skill in `skills/`). It starts the server with `npx shoptrueprofit-fee-mcp`, so it works once the package is published to npm.

## License

MIT. See [LICENSE](LICENSE). Made by [ShopTrueProfit](https://shoptrueprofit.com), the profit dashboard for Etsy, eBay and Amazon sellers.

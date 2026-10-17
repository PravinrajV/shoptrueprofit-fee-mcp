---
name: marketplace-fees
description: Calculate Etsy, eBay or Amazon seller fees, profit, margin, break-even or target-margin price with the shoptrueprofit-fees MCP tools. Use when the user asks what a marketplace takes, what they make, what to charge, or which marketplace pays best.
---

# Marketplace fees and pricing

Use the `shoptrueprofit-fees` MCP tools; do not estimate fees from memory, because rates, tiers and seasonal cards change.

- Fees only: `etsy_fees`, `ebay_fees`, `amazon_fees`.
- Profit and margin when costs are known: `etsy_profit`, `ebay_profit`, `amazon_profit`.
- "What should I charge?": `*_target_price` with `target_margin_pct`.
- "Where should I sell?": `compare_marketplaces`.
- Look up ids first with `list_ebay_categories`, `list_amazon_categories` or `list_etsy_regions` when unsure.

Percent arguments are percents (8.25 means 8.25%). Amazon FBA needs package `length_in`, `width_in`, `height_in` and `weight_lb`.
Quote the result's `summary`, show the main fee lines, mention any `warnings`, and give the `calculator_url` so the user can check it.

# Tool reference

Generated from the tool registry by `node scripts/gen-reference.mjs`. Do not edit by hand.

| Tool | Charged | What it does |
|---|---|---|
| `etsy_fees` | yes, 1 event | Etsy fees for one order |
| `ebay_fees` | yes, 1 event | eBay fees for one order |
| `amazon_fees` | yes, 1 event | Amazon FBA or FBM fees for one unit |
| `etsy_profit` | yes, 1 event | Etsy profit and margin |
| `ebay_profit` | yes, 1 event | eBay profit and margin |
| `amazon_profit` | yes, 1 event | Amazon profit and margin (FBA or FBM) |
| `etsy_target_price` | yes, 1 event | Etsy break-even and target-margin price |
| `ebay_target_price` | yes, 1 event | eBay break-even and target-margin price |
| `amazon_target_price` | yes, 1 event | Amazon break-even and target-margin price |
| `compare_marketplaces` | yes, 1 event | Compare Etsy, eBay and Amazon for one product |
| `list_ebay_categories` | free | List eBay fee categories |
| `list_amazon_categories` | free | List Amazon referral fee categories |
| `list_etsy_regions` | free | List Etsy Payments regions |

## `etsy_fees`

Calculate Etsy seller fees for one order: listing ($0.20/unit), 6.5% transaction, payment processing (by Etsy Payments region, charged on the total incl. sales tax) and Offsite Ads (12%/15%, capped). Use when you need what Etsy takes from a sale; use etsy_profit when you also know your costs. Percent arguments (*_pct) are percents: 8.25 means 8.25%. Money is in whole cents. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `price` | number (> 0, <= 1000000) | yes |  | Item price per unit, before any discount, in the shop's region currency (USD for "us"). |
| `quantity` | integer (>= 1, <= 10000) | no | `1` | Units in the order (same item). Default 1. |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | Shipping the buyer pays for the whole order. Default 0. |
| `gift_wrap` | number (>= 0, <= 1000000) | no | `0` | Gift wrap charge paid by the buyer. Default 0. |
| `discount` | number (>= 0, <= 1000000) | no | `0` | Total discount on the order (coupon or sale), in currency, not percent. Default 0. |
| `offsite_ads_pct` | 0 / 12 / 15 | no | `0` | Etsy Offsite Ads fee if this order came from an Offsite Ad: 15 (shops under $10k/yr sales), 12 (over $10k/yr), or 0 (not an Offsite Ads sale). Default 0. Capped at 100 per order. |
| `region` | `us`, `ca-dom`, `ca-int`, `uk`, `eu`, `au-dom`, `au-int`, `nz-int`, `ch`, `in`, `sg`, `hk` | no | `"us"` | Seller's Etsy Payments region, which sets the payment processing rate and currency. Default "us". See list_etsy_regions. |
| `sales_tax_pct` | number (>= 0, <= 50) | no | `0` | Sales tax / VAT rate the buyer pays on items + shipping (Etsy collects it; it is not seller income, but payment processing is charged on it). Default 0. |

## `ebay_fees`

Calculate eBay.com (US) seller fees for one order: category final value fee (tiered per item, on item + shipping + sales tax), per-order fee ($0.30/$0.40), Promoted Listings General ad rate, international fee, seller-performance surcharges and insertion fee. Rates for sellers without a paid Store subscription. Call list_ebay_categories for category ids. Percent arguments (*_pct) are percents: 8.25 means 8.25%. Money is in whole cents. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `price` | number (> 0, <= 1000000) | yes |  | Item price per unit in USD. |
| `quantity` | integer (>= 1, <= 10000) | no | `1` | Units in the order (same item). Fee tiers apply per item; the per-order fee once. Default 1. |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | Shipping and handling the buyer pays for the whole order, USD. Default 0. |
| `sales_tax_pct` | number (>= 0, <= 50) | no | `0` | Buyer's sales tax rate in percent. eBay charges its final value fee on the total INCLUDING tax, but the tax is not seller income. Default 0. |
| `category` | `most`, `media`, `coins`, `bullion`, `cards`, `handbags`, `jewelry`, `watches`, `guitars`, `sneakers`, `heavy` | no | `"most"` | eBay final value fee category id. Default "most" (Most categories, 13.6%). See list_ebay_categories. |
| `promoted_listings_pct` | number (>= 0, <= 100) | no | `0` | eBay Promoted Listings General (cost-per-sale) ad rate in percent, charged on the total sale amount incl. shipping and tax. 0 (not promoted, or no sale via ad) or 2 to 100. Default 0. |
| `international` | boolean | no | `false` | true if the buyer is outside the US and the item is NOT shipped with eBay International Shipping (adds the 1.65% international fee). Default false. |
| `seller_performance` | `none`, `below`, `below4`, `inad`, `inad4` | no | `"none"` | Seller performance surcharge: none (Above Standard / Top Rated), below (+6%), below4 (+7%, 4+ months), inad (+5%, very high "not as described"), inad4 (+6%). Default none. |
| `insertion_fee` | boolean | no | `false` | true if this listing used up your 250 free monthly listings and paid the $0.35 insertion fee. Default false. |

## `amazon_fees`

Calculate Amazon.com (US) fees for one unit, FBA or FBM: referral fee (by category, with minimums), closing fee, Individual-plan per-item fee or Professional-plan share, and for FBA the 2026 fulfillment fee (size tier from package dimensions and weight, peak/non-peak by ship date, apparel and dangerous-goods cards), the fuel & logistics surcharge and monthly storage. FBA requires length_in, width_in, height_in and weight_lb. Call list_amazon_categories for category ids. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `price` | number (> 0, <= 1000000) | yes |  | Item price per unit in USD (what the buyer pays for the item, excluding tax). |
| `category` | `device-acc`, `automotive`, `baby`, `luggage`, `power-tools`, `beauty`, `business`, `clothing`, `compact-appliances`, `computers`, `electronics`, `electronics-acc`, `everything-else`, `eyewear`, `fine-art`, `footwear`, `full-appliances`, `furniture`, `gift-cards`, `grocery`, `home-kitchen`, `jewelry`, `lawn-garden`, `mowers`, `mattresses`, `media`, `musical`, `office`, `pet`, `pet-vet`, `sports`, `tires`, `tools`, `toys`, `consoles`, `video-games`, `watches` | yes |  | Amazon referral fee category id (required). See list_amazon_categories. |
| `fulfillment` | `fba`, `fbm` | yes |  | "fba" (Fulfilled by Amazon: FBA fulfillment + storage fees, needs package dimensions and weight) or "fbm" (merchant fulfilled: you ship; referral applies to item + shipping). |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | FBM only: shipping the buyer pays, USD. Must be 0 or omitted for FBA (Amazon sets FBA shipping). Default 0. |
| `gift_wrap` | number (>= 0, <= 1000000) | no | `0` | Gift wrap charge paid by the buyer, USD. Default 0. |
| `selling_plan` | `pro`, `individual` | no | `"pro"` | "pro" (Professional, $39.99/month) or "individual" ($0.99 per unit sold). Default "pro". |
| `units_per_month` | integer (>= 0, <= 10000000) | no | `0` | Professional plan only: units you sell per month, to spread the $39.99 subscription per unit. 0 = do not include the subscription. Default 0. |
| `product_type` | `standard`, `apparel`, `dangerous` | no | `"standard"` | FBA fee card: "standard", "apparel", or "dangerous" (hazmat). Default "standard". |
| `length_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged length in inches. Sides may be given in any order. |
| `width_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged width in inches. |
| `height_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged height in inches. |
| `weight_lb` | number (> 0, <= 10000) | no |  | FBA (required): packaged unit weight in pounds (16 oz = 1 lb). |
| `ship_date` | string | no |  | Date the unit ships (YYYY-MM-DD). Sets peak (Oct 15 - Jan 14) vs non-peak FBA rates, the fuel surcharge (from 2026-04-17) and storage season. Default: today in US Eastern time. |
| `storage_months` | number (>= 0, <= 120) | no | `1` | FBA: months the unit sits in Amazon storage before it sells (monthly storage fee x months, at the ship-date month's rate). Default 1. |

## `etsy_profit`

Calculate profit, margin and break-even price for an Etsy order from price, quantity, shipping, item cost, label/packaging cost and ads (Offsite Ads rate plus any Etsy Ads spend you attribute to the order). Margin = profit / seller revenue (sales tax excluded). Percent arguments (*_pct) are percents: 8.25 means 8.25%. Money is in whole cents. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `price` | number (> 0, <= 1000000) | yes |  | Item price per unit, before any discount, in the shop's region currency (USD for "us"). |
| `quantity` | integer (>= 1, <= 10000) | no | `1` | Units in the order (same item). Default 1. |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | Shipping the buyer pays for the whole order. Default 0. |
| `gift_wrap` | number (>= 0, <= 1000000) | no | `0` | Gift wrap charge paid by the buyer. Default 0. |
| `discount` | number (>= 0, <= 1000000) | no | `0` | Total discount on the order (coupon or sale), in currency, not percent. Default 0. |
| `offsite_ads_pct` | 0 / 12 / 15 | no | `0` | Etsy Offsite Ads fee if this order came from an Offsite Ad: 15 (shops under $10k/yr sales), 12 (over $10k/yr), or 0 (not an Offsite Ads sale). Default 0. Capped at 100 per order. |
| `region` | `us`, `ca-dom`, `ca-int`, `uk`, `eu`, `au-dom`, `au-int`, `nz-int`, `ch`, `in`, `sg`, `hk` | no | `"us"` | Seller's Etsy Payments region, which sets the payment processing rate and currency. Default "us". See list_etsy_regions. |
| `sales_tax_pct` | number (>= 0, <= 50) | no | `0` | Sales tax / VAT rate the buyer pays on items + shipping (Etsy collects it; it is not seller income, but payment processing is charged on it). Default 0. |
| `item_cost` | number (>= 0, <= 1000000) | no | `0` | Your cost per unit (materials, product, packaging per item). Default 0. |
| `shipping_label_cost` | number (>= 0, <= 1000000) | no | `0` | What you pay for the shipping label and packaging for the whole order. Default 0. |
| `ad_spend` | number (>= 0, <= 1000000) | no | `0` | Ad spend you attribute to this order (e.g. Etsy Ads cost-per-click budget per sale). Not an Etsy fee; counted as a cost. Default 0. |

## `ebay_profit`

Calculate profit, margin and break-even price for an eBay.com (US) order from price, quantity, shipping, item cost, label cost and ads (Promoted Listings General rate plus any other ad spend). Margin = profit / seller revenue (sales tax excluded). Percent arguments (*_pct) are percents: 8.25 means 8.25%. Money is in whole cents. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `price` | number (> 0, <= 1000000) | yes |  | Item price per unit in USD. |
| `quantity` | integer (>= 1, <= 10000) | no | `1` | Units in the order (same item). Fee tiers apply per item; the per-order fee once. Default 1. |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | Shipping and handling the buyer pays for the whole order, USD. Default 0. |
| `sales_tax_pct` | number (>= 0, <= 50) | no | `0` | Buyer's sales tax rate in percent. eBay charges its final value fee on the total INCLUDING tax, but the tax is not seller income. Default 0. |
| `category` | `most`, `media`, `coins`, `bullion`, `cards`, `handbags`, `jewelry`, `watches`, `guitars`, `sneakers`, `heavy` | no | `"most"` | eBay final value fee category id. Default "most" (Most categories, 13.6%). See list_ebay_categories. |
| `promoted_listings_pct` | number (>= 0, <= 100) | no | `0` | eBay Promoted Listings General (cost-per-sale) ad rate in percent, charged on the total sale amount incl. shipping and tax. 0 (not promoted, or no sale via ad) or 2 to 100. Default 0. |
| `international` | boolean | no | `false` | true if the buyer is outside the US and the item is NOT shipped with eBay International Shipping (adds the 1.65% international fee). Default false. |
| `seller_performance` | `none`, `below`, `below4`, `inad`, `inad4` | no | `"none"` | Seller performance surcharge: none (Above Standard / Top Rated), below (+6%), below4 (+7%, 4+ months), inad (+5%, very high "not as described"), inad4 (+6%). Default none. |
| `insertion_fee` | boolean | no | `false` | true if this listing used up your 250 free monthly listings and paid the $0.35 insertion fee. Default false. |
| `item_cost` | number (>= 0, <= 1000000) | no | `0` | Your cost per unit, USD. Default 0. |
| `shipping_label_cost` | number (>= 0, <= 1000000) | no | `0` | What you pay for the shipping label and packaging for the whole order, USD. Default 0. |
| `ad_spend` | number (>= 0, <= 1000000) | no | `0` | Other ad spend you attribute to this order, USD (e.g. Promoted Listings Priority cost-per-click). Counted as a cost. Default 0. |

## `amazon_profit`

Calculate profit, margin and break-even price for one unit sold on Amazon.com (US), FBA or FBM, from price, category, item cost, inbound cost (FBA) or label cost (FBM) and ad spend. FBA requires package dimensions and weight. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `price` | number (> 0, <= 1000000) | yes |  | Item price per unit in USD (what the buyer pays for the item, excluding tax). |
| `category` | `device-acc`, `automotive`, `baby`, `luggage`, `power-tools`, `beauty`, `business`, `clothing`, `compact-appliances`, `computers`, `electronics`, `electronics-acc`, `everything-else`, `eyewear`, `fine-art`, `footwear`, `full-appliances`, `furniture`, `gift-cards`, `grocery`, `home-kitchen`, `jewelry`, `lawn-garden`, `mowers`, `mattresses`, `media`, `musical`, `office`, `pet`, `pet-vet`, `sports`, `tires`, `tools`, `toys`, `consoles`, `video-games`, `watches` | yes |  | Amazon referral fee category id (required). See list_amazon_categories. |
| `fulfillment` | `fba`, `fbm` | yes |  | "fba" (Fulfilled by Amazon: FBA fulfillment + storage fees, needs package dimensions and weight) or "fbm" (merchant fulfilled: you ship; referral applies to item + shipping). |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | FBM only: shipping the buyer pays, USD. Must be 0 or omitted for FBA (Amazon sets FBA shipping). Default 0. |
| `gift_wrap` | number (>= 0, <= 1000000) | no | `0` | Gift wrap charge paid by the buyer, USD. Default 0. |
| `selling_plan` | `pro`, `individual` | no | `"pro"` | "pro" (Professional, $39.99/month) or "individual" ($0.99 per unit sold). Default "pro". |
| `units_per_month` | integer (>= 0, <= 10000000) | no | `0` | Professional plan only: units you sell per month, to spread the $39.99 subscription per unit. 0 = do not include the subscription. Default 0. |
| `product_type` | `standard`, `apparel`, `dangerous` | no | `"standard"` | FBA fee card: "standard", "apparel", or "dangerous" (hazmat). Default "standard". |
| `length_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged length in inches. Sides may be given in any order. |
| `width_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged width in inches. |
| `height_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged height in inches. |
| `weight_lb` | number (> 0, <= 10000) | no |  | FBA (required): packaged unit weight in pounds (16 oz = 1 lb). |
| `ship_date` | string | no |  | Date the unit ships (YYYY-MM-DD). Sets peak (Oct 15 - Jan 14) vs non-peak FBA rates, the fuel surcharge (from 2026-04-17) and storage season. Default: today in US Eastern time. |
| `storage_months` | number (>= 0, <= 120) | no | `1` | FBA: months the unit sits in Amazon storage before it sells (monthly storage fee x months, at the ship-date month's rate). Default 1. |
| `item_cost` | number (>= 0, <= 1000000) | no | `0` | Your cost per unit (product + packaging), USD. Default 0. |
| `inbound_cost` | number (>= 0, <= 1000000) | no | `0` | FBA only: your cost per unit to ship inventory into Amazon warehouses, USD. Default 0. |
| `shipping_label_cost` | number (>= 0, <= 1000000) | no | `0` | FBM only: what you pay per unit for the shipping label, USD. Default 0. |
| `ad_spend` | number (>= 0, <= 1000000) | no | `0` | Ad spend you attribute to this unit (e.g. Sponsored Products cost per sale), USD. Counted as a cost. Default 0. |

## `etsy_target_price`

Find the lowest Etsy item price (per unit, before discount) that breaks even and the lowest that reaches target_margin_pct, given shipping, costs and ads. Also shows fees and profit at the target price, or the highest reachable margin if the target is impossible. Percent arguments (*_pct) are percents: 8.25 means 8.25%. Money is in whole cents. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `quantity` | integer (>= 1, <= 10000) | no | `1` | Units in the order (same item). Default 1. |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | Shipping the buyer pays for the whole order. Default 0. |
| `gift_wrap` | number (>= 0, <= 1000000) | no | `0` | Gift wrap charge paid by the buyer. Default 0. |
| `discount` | number (>= 0, <= 1000000) | no | `0` | Total discount on the order (coupon or sale), in currency, not percent. Default 0. |
| `offsite_ads_pct` | 0 / 12 / 15 | no | `0` | Etsy Offsite Ads fee if this order came from an Offsite Ad: 15 (shops under $10k/yr sales), 12 (over $10k/yr), or 0 (not an Offsite Ads sale). Default 0. Capped at 100 per order. |
| `region` | `us`, `ca-dom`, `ca-int`, `uk`, `eu`, `au-dom`, `au-int`, `nz-int`, `ch`, `in`, `sg`, `hk` | no | `"us"` | Seller's Etsy Payments region, which sets the payment processing rate and currency. Default "us". See list_etsy_regions. |
| `sales_tax_pct` | number (>= 0, <= 50) | no | `0` | Sales tax / VAT rate the buyer pays on items + shipping (Etsy collects it; it is not seller income, but payment processing is charged on it). Default 0. |
| `item_cost` | number (>= 0, <= 1000000) | no | `0` | Your cost per unit (materials, product, packaging per item). Default 0. |
| `shipping_label_cost` | number (>= 0, <= 1000000) | no | `0` | What you pay for the shipping label and packaging for the whole order. Default 0. |
| `ad_spend` | number (>= 0, <= 1000000) | no | `0` | Ad spend you attribute to this order (e.g. Etsy Ads cost-per-click budget per sale). Not an Etsy fee; counted as a cost. Default 0. |
| `target_margin_pct` | number (>= 0, <= 90) | yes |  | Desired profit as a percent of seller revenue (0 = break-even, 30 = 30% margin). 0 to 90. |

## `ebay_target_price`

Find the lowest eBay.com (US) item price that breaks even and the lowest that reaches target_margin_pct, handling fee steps (the $10 per-order threshold and whole-amount category bands). Also shows fees and profit at the target price, or the highest reachable margin if the target is impossible. Percent arguments (*_pct) are percents: 8.25 means 8.25%. Money is in whole cents. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `quantity` | integer (>= 1, <= 10000) | no | `1` | Units in the order (same item). Fee tiers apply per item; the per-order fee once. Default 1. |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | Shipping and handling the buyer pays for the whole order, USD. Default 0. |
| `sales_tax_pct` | number (>= 0, <= 50) | no | `0` | Buyer's sales tax rate in percent. eBay charges its final value fee on the total INCLUDING tax, but the tax is not seller income. Default 0. |
| `category` | `most`, `media`, `coins`, `bullion`, `cards`, `handbags`, `jewelry`, `watches`, `guitars`, `sneakers`, `heavy` | no | `"most"` | eBay final value fee category id. Default "most" (Most categories, 13.6%). See list_ebay_categories. |
| `promoted_listings_pct` | number (>= 0, <= 100) | no | `0` | eBay Promoted Listings General (cost-per-sale) ad rate in percent, charged on the total sale amount incl. shipping and tax. 0 (not promoted, or no sale via ad) or 2 to 100. Default 0. |
| `international` | boolean | no | `false` | true if the buyer is outside the US and the item is NOT shipped with eBay International Shipping (adds the 1.65% international fee). Default false. |
| `seller_performance` | `none`, `below`, `below4`, `inad`, `inad4` | no | `"none"` | Seller performance surcharge: none (Above Standard / Top Rated), below (+6%), below4 (+7%, 4+ months), inad (+5%, very high "not as described"), inad4 (+6%). Default none. |
| `insertion_fee` | boolean | no | `false` | true if this listing used up your 250 free monthly listings and paid the $0.35 insertion fee. Default false. |
| `item_cost` | number (>= 0, <= 1000000) | no | `0` | Your cost per unit, USD. Default 0. |
| `shipping_label_cost` | number (>= 0, <= 1000000) | no | `0` | What you pay for the shipping label and packaging for the whole order, USD. Default 0. |
| `ad_spend` | number (>= 0, <= 1000000) | no | `0` | Other ad spend you attribute to this order, USD (e.g. Promoted Listings Priority cost-per-click). Counted as a cost. Default 0. |
| `target_margin_pct` | number (>= 0, <= 90) | yes |  | Desired profit as a percent of seller revenue (0 = break-even, 30 = 30% margin). 0 to 90. |

## `amazon_target_price`

Find the lowest Amazon.com (US) item price that breaks even and the lowest that reaches target_margin_pct, FBA or FBM, handling FBA price bands and whole-price referral bands. Also shows fees and profit at the target price, or the highest reachable margin if the target is impossible. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `category` | `device-acc`, `automotive`, `baby`, `luggage`, `power-tools`, `beauty`, `business`, `clothing`, `compact-appliances`, `computers`, `electronics`, `electronics-acc`, `everything-else`, `eyewear`, `fine-art`, `footwear`, `full-appliances`, `furniture`, `gift-cards`, `grocery`, `home-kitchen`, `jewelry`, `lawn-garden`, `mowers`, `mattresses`, `media`, `musical`, `office`, `pet`, `pet-vet`, `sports`, `tires`, `tools`, `toys`, `consoles`, `video-games`, `watches` | yes |  | Amazon referral fee category id (required). See list_amazon_categories. |
| `fulfillment` | `fba`, `fbm` | yes |  | "fba" (Fulfilled by Amazon: FBA fulfillment + storage fees, needs package dimensions and weight) or "fbm" (merchant fulfilled: you ship; referral applies to item + shipping). |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | FBM only: shipping the buyer pays, USD. Must be 0 or omitted for FBA (Amazon sets FBA shipping). Default 0. |
| `gift_wrap` | number (>= 0, <= 1000000) | no | `0` | Gift wrap charge paid by the buyer, USD. Default 0. |
| `selling_plan` | `pro`, `individual` | no | `"pro"` | "pro" (Professional, $39.99/month) or "individual" ($0.99 per unit sold). Default "pro". |
| `units_per_month` | integer (>= 0, <= 10000000) | no | `0` | Professional plan only: units you sell per month, to spread the $39.99 subscription per unit. 0 = do not include the subscription. Default 0. |
| `product_type` | `standard`, `apparel`, `dangerous` | no | `"standard"` | FBA fee card: "standard", "apparel", or "dangerous" (hazmat). Default "standard". |
| `length_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged length in inches. Sides may be given in any order. |
| `width_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged width in inches. |
| `height_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged height in inches. |
| `weight_lb` | number (> 0, <= 10000) | no |  | FBA (required): packaged unit weight in pounds (16 oz = 1 lb). |
| `ship_date` | string | no |  | Date the unit ships (YYYY-MM-DD). Sets peak (Oct 15 - Jan 14) vs non-peak FBA rates, the fuel surcharge (from 2026-04-17) and storage season. Default: today in US Eastern time. |
| `storage_months` | number (>= 0, <= 120) | no | `1` | FBA: months the unit sits in Amazon storage before it sells (monthly storage fee x months, at the ship-date month's rate). Default 1. |
| `item_cost` | number (>= 0, <= 1000000) | no | `0` | Your cost per unit (product + packaging), USD. Default 0. |
| `inbound_cost` | number (>= 0, <= 1000000) | no | `0` | FBA only: your cost per unit to ship inventory into Amazon warehouses, USD. Default 0. |
| `shipping_label_cost` | number (>= 0, <= 1000000) | no | `0` | FBM only: what you pay per unit for the shipping label, USD. Default 0. |
| `ad_spend` | number (>= 0, <= 1000000) | no | `0` | Ad spend you attribute to this unit (e.g. Sponsored Products cost per sale), USD. Counted as a cost. Default 0. |
| `target_margin_pct` | number (>= 0, <= 90) | yes |  | Desired profit as a percent of seller revenue (0 = break-even, 30 = 30% margin). 0 to 90. |

## `compare_marketplaces`

Compare the same product on Etsy, eBay and Amazon: fees, profit, margin and break-even price on each, ranked by profit, plus the price needed on each for target_margin_pct if given. The amazon object (category, fulfillment, and dimensions/weight for FBA) is required. One call, one charge. Percent arguments (*_pct) are percents: 8.25 means 8.25%. Money is in whole cents. Uses the same fee engine as the free calculators on shoptrueprofit.com. Returns an itemized fee breakdown, the assumptions used, the fee table version and date, official source URLs and a link to the matching free calculator. Inputs are validated strictly: invalid or unknown arguments are rejected with a message naming the field, never silently adjusted.

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `price` | number (> 0, <= 1000000) | yes |  | Item price per unit in USD, used on all three marketplaces. |
| `shipping_charged` | number (>= 0, <= 1000000) | no | `0` | Shipping the buyer pays, USD. Applied on Etsy, eBay and Amazon FBM; not on Amazon FBA (Amazon sets FBA shipping). Default 0. |
| `sales_tax_pct` | number (>= 0, <= 50) | no | `0` | Buyer's sales tax rate in percent (affects Etsy processing and eBay final value fee bases; Amazon referral excludes tax). Default 0. |
| `item_cost` | number (>= 0, <= 1000000) | no | `0` | Your cost per unit, USD. Default 0. |
| `shipping_label_cost` | number (>= 0, <= 1000000) | no | `0` | Your label + packaging cost per order, USD. Applied on Etsy, eBay and Amazon FBM (FBA covers shipping). Default 0. |
| `ad_spend` | number (>= 0, <= 1000000) | no | `0` | Ad spend you attribute to one sale, USD, applied equally on each marketplace. Default 0. |
| `target_margin_pct` | number (>= 0, <= 90) | no |  | Desired profit as a percent of seller revenue (0 = break-even, 30 = 30% margin). 0 to 90. |
| `etsy` | object (see below) | no | `{"offsite_ads_pct":0}` | Etsy options. The comparison uses the US region (USD) and quantity 1. |
| `ebay` | object (see below) | no | `{"category":"most","promoted_listings_pct":0,"seller_performance":"none"}` | eBay options. Quantity 1, domestic buyer. |
| `amazon` | object (see below) | yes |  | Amazon options (required): category and fulfillment, plus package dimensions and weight for FBA. |

**`etsy` object**

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `offsite_ads_pct` | 0 / 12 / 15 | no | `0` | Etsy Offsite Ads fee if this order came from an Offsite Ad: 15 (shops under $10k/yr sales), 12 (over $10k/yr), or 0 (not an Offsite Ads sale). Default 0. Capped at 100 per order. |

**`ebay` object**

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `category` | `most`, `media`, `coins`, `bullion`, `cards`, `handbags`, `jewelry`, `watches`, `guitars`, `sneakers`, `heavy` | no | `"most"` | eBay final value fee category id. Default "most" (Most categories, 13.6%). See list_ebay_categories. |
| `promoted_listings_pct` | number (>= 0, <= 100) | no | `0` | eBay Promoted Listings General (cost-per-sale) ad rate in percent, charged on the total sale amount incl. shipping and tax. 0 (not promoted, or no sale via ad) or 2 to 100. Default 0. |
| `seller_performance` | `none`, `below`, `below4`, `inad`, `inad4` | no | `"none"` | Seller performance surcharge: none (Above Standard / Top Rated), below (+6%), below4 (+7%, 4+ months), inad (+5%, very high "not as described"), inad4 (+6%). Default none. |

**`amazon` object**

| Argument | Type | Required | Default | Description |
|---|---|---|---|---|
| `category` | `device-acc`, `automotive`, `baby`, `luggage`, `power-tools`, `beauty`, `business`, `clothing`, `compact-appliances`, `computers`, `electronics`, `electronics-acc`, `everything-else`, `eyewear`, `fine-art`, `footwear`, `full-appliances`, `furniture`, `gift-cards`, `grocery`, `home-kitchen`, `jewelry`, `lawn-garden`, `mowers`, `mattresses`, `media`, `musical`, `office`, `pet`, `pet-vet`, `sports`, `tires`, `tools`, `toys`, `consoles`, `video-games`, `watches` | yes |  | Amazon referral fee category id (required). See list_amazon_categories. |
| `fulfillment` | `fba`, `fbm` | yes |  | "fba" (Fulfilled by Amazon: FBA fulfillment + storage fees, needs package dimensions and weight) or "fbm" (merchant fulfilled: you ship; referral applies to item + shipping). |
| `selling_plan` | `pro`, `individual` | no | `"pro"` | "pro" (Professional, $39.99/month) or "individual" ($0.99 per unit sold). Default "pro". |
| `units_per_month` | integer (>= 0, <= 10000000) | no | `0` | Professional plan only: units you sell per month, to spread the $39.99 subscription per unit. 0 = do not include the subscription. Default 0. |
| `product_type` | `standard`, `apparel`, `dangerous` | no | `"standard"` | FBA fee card: "standard", "apparel", or "dangerous" (hazmat). Default "standard". |
| `length_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged length in inches. Sides may be given in any order. |
| `width_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged width in inches. |
| `height_in` | number (> 0, <= 1200) | no |  | FBA (required): packaged height in inches. |
| `weight_lb` | number (> 0, <= 10000) | no |  | FBA (required): packaged unit weight in pounds (16 oz = 1 lb). |
| `ship_date` | string | no |  | Date the unit ships (YYYY-MM-DD). Sets peak (Oct 15 - Jan 14) vs non-peak FBA rates, the fuel surcharge (from 2026-04-17) and storage season. Default: today in US Eastern time. |
| `storage_months` | number (>= 0, <= 120) | no | `1` | FBA: months the unit sits in Amazon storage before it sells (monthly storage fee x months, at the ship-date month's rate). Default 1. |
| `inbound_cost` | number (>= 0, <= 1000000) | no | `0` | FBA only: your cost per unit to ship inventory into Amazon warehouses, USD. Default 0. |

## `list_ebay_categories`

List the eBay final value fee category ids and rules, and the seller performance options, accepted by the eBay tools. Free (not charged).

_No arguments._

## `list_amazon_categories`

List the Amazon referral fee category ids, rates, minimums and closing fees, and the FBA size tiers, accepted by the Amazon tools. Free (not charged).

_No arguments._

## `list_etsy_regions`

List the Etsy Payments region ids with currency and payment processing rates, plus Etsy's listing, transaction and Offsite Ads rates, accepted by the Etsy tools. Free (not charged).

_No arguments._


// Product metadata: fee-table versions, official sources, calculator links. Every number lives in src/engine/ (verbatim
// copy of the shoptrueprofit.com engine); this file only describes where those numbers come from.
import SOURCE from './engine/SOURCE.json';

declare const __STP_VERSION__: string;
export const SERVER_NAME = 'shoptrueprofit-fee-mcp';
export const SERVER_VERSION: string = typeof __STP_VERSION__ === 'string' ? __STP_VERSION__ : '0.0.0-dev';
export const SITE = 'https://shoptrueprofit.com';
export const UTM = 'utm_source=mcp&utm_medium=tool&utm_campaign=stp-fee-mcp';
export type Marketplace = 'etsy' | 'ebay' | 'amazon';

export interface Source { title: string; url: string }
export interface FeeTable { id: string; marketplace: Marketplace; region: string; verified_on: string; engine_file: string; engine_sha256: string; documentation: string }

const sha = (f: keyof typeof SOURCE.files) => SOURCE.files[f];
const DOCS = `${SITE}/guides`;

export const FEE_TABLES: Record<Marketplace, FeeTable> = {
  etsy: { id: 'etsy-2026-10-13', marketplace: 'etsy', region: 'Etsy Payments regions (see list_etsy_regions)', verified_on: '2026-10-13',
    engine_file: 'feecalc.ts', engine_sha256: sha('feecalc.ts'), documentation: DOCS },
  ebay: { id: 'ebay-us-2026-10-16', marketplace: 'ebay', region: 'eBay.com (US), no Store subscription / Starter Store', verified_on: '2026-10-16',
    engine_file: 'marketplaces/ebay.ts', engine_sha256: sha('marketplaces/ebay.ts'), documentation: DOCS },
  amazon: { id: 'amazon-us-2026-10-16', marketplace: 'amazon', region: 'Amazon.com (US)', verified_on: '2026-10-16',
    engine_file: 'marketplaces/amazon.ts', engine_sha256: sha('marketplaces/amazon.ts'), documentation: DOCS },
};

export const SOURCES: Record<Marketplace, Source[]> = {
  etsy: [
    { title: 'Etsy Fees & Payments Policy', url: 'https://www.etsy.com/legal/fees/' },
    { title: 'Etsy Help: What are the fees and taxes for selling on Etsy?', url: 'https://help.etsy.com/hc/en-us/articles/115014483627' },
    { title: 'Etsy Help: What are payment processing fees?', url: 'https://help.etsy.com/hc/en-us/articles/115015628847' },
  ],
  ebay: [
    { title: 'eBay: Selling fees', url: 'https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822' },
    { title: 'eBay: Store selling fees (not modelled, for reference)', url: 'https://www.ebay.com/help/selling/fees-credits-invoices/store-selling-fees?id=4809' },
    { title: 'eBay: Promoted Listings general campaign strategy', url: 'https://www.ebay.com/help/selling/ebay-advertising/promoted-listings/general-campaign-strategy?id=4164' },
  ],
  amazon: [
    { title: 'Amazon Seller Central: Referral fees', url: 'https://sellercentral.amazon.com/help/hub/reference/external/GTG4BAWSY39Z98Z3' },
    { title: 'Amazon: Selling plans and pricing', url: 'https://sell.amazon.com/pricing' },
    { title: 'Amazon Seller Central: 2026 US FBA fulfillment fee changes', url: 'https://sellercentral.amazon.com/help/hub/reference/external/GABBX6GZPA8MSZGW' },
    { title: 'Amazon Seller Central: FBA fulfillment fee (fuel & logistics surcharge, peak dates)', url: 'https://sellercentral.amazon.com/help/hub/reference/external/GPDC3KPYAGDTVDJP' },
    { title: 'Amazon Seller Central: Product size tiers', url: 'https://sellercentral.amazon.com/help/hub/reference/external/GG5KW835AHDJCH8W' },
    { title: 'Amazon Seller Central: Dimensional weight', url: 'https://sellercentral.amazon.com/help/hub/reference/external/G53Z9EKF8VVZVH29' },
    { title: 'Amazon Seller Central: Shipping weight', url: 'https://sellercentral.amazon.com/help/hub/reference/external/GEVWP48HPBLEFJEY' },
    { title: 'Amazon Seller Central: Monthly storage fees', url: 'https://sellercentral.amazon.com/help/hub/reference/external/G3EDYEF6KUCFQTNM' },
    { title: 'Amazon Seller Central: Closing fee', url: 'https://sellercentral.amazon.com/help/hub/reference/external/GKD9U5REK5DKB38Y' },
    { title: 'Amazon Seller Central: Per-item fee (Individual plan)', url: 'https://sellercentral.amazon.com/help/hub/reference/external/G8TPCFJRDFPKAZ6M' },
    { title: 'Amazon Seller Central: Professional plan subscription', url: 'https://sellercentral.amazon.com/help/hub/reference/external/G67WTAUHB9TQ9M6U' },
  ],
};

const PAGES: Record<Marketplace, string> = { etsy: 'etsy-fee-calculator', ebay: 'ebay-fee-calculator', amazon: 'amazon-fba-fee-calculator' };
export const calculatorUrl = (m: Marketplace) => `${SITE}/${PAGES[m]}?${UTM}`;
export const MARKET_NAME: Record<Marketplace, string> = { etsy: 'Etsy', ebay: 'eBay', amazon: 'Amazon' };

export const DISCLAIMER = 'Estimate from published fee schedules (see sources and fee_table.verified_on). Marketplaces change fees; your statement is the final word. '
  + 'Not affiliated with Etsy, eBay or Amazon. Not tax, legal or financial advice.';

/** Today's date in America/New_York (YYYY-MM-DD); used as the default Amazon ship date. */
export function todayET(now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t: string) => p.find(x => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

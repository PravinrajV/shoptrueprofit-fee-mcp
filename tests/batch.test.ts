import { describe, it, expect } from 'vitest';
import { runBatch, normalizeBatch, MAX_CALLS } from '../src/batch';
import { CHARGE_EVENT } from '../src/billing';

function fakeActor(budget = Infinity) {
  const items: { item: any; event?: string }[] = []; let status = '';
  return { items, get status() { return status; },
    pushData: async (item: any, event?: string) => {
      if (event) { const can = budget > 0; if (can) { items.push({ item, event }); budget--; } return { chargedCount: can ? 1 : 0, eventChargeLimitReached: budget <= 0 }; }
      items.push({ item }); return undefined;
    },
    setStatusMessage: async (m: string) => { status = m; } };
}

describe('Apify standard-run batch mode', () => {
  it('single tool input: one dataset item, charged once', async () => {
    const a = fakeActor(); const r = await runBatch(a, { tool: 'etsy_fees', arguments: { price: 25 } });
    expect(r).toMatchObject({ ok: 1, failed: 0, charged: 1 }); expect(a.items).toHaveLength(1); expect(a.items[0].event).toBe(CHARGE_EVENT);
    expect(a.items[0].item.result.fees.total).toBe(2.83);
  });
  it('calls array: valid charged, list tools free, invalid pushed uncharged with the reason', async () => {
    const a = fakeActor();
    const r = await runBatch(a, { calls: [{ tool: 'ebay_fees', arguments: { price: 25 } }, { tool: 'list_ebay_categories' }, { tool: 'ebay_fees', arguments: { price: -2 } }, { tool: 'bogus' }] });
    expect(r).toMatchObject({ ok: 2, failed: 2, charged: 1 });
    expect(a.items.map(x => [x.item.tool, x.item.ok, x.event ?? null])).toEqual([['ebay_fees', true, CHARGE_EVENT], ['list_ebay_categories', true, null], ['ebay_fees', false, null], ['bogus', false, null]]);
    expect(a.items[2].item.error).toMatch(/price must be greater than 0/); expect(a.status).toMatch(/2 calculation\(s\) done, 2 rejected/);
  });
  it('stops at the user\'s max cost per run', async () => {
    const a = fakeActor(2); const calls = Array.from({ length: 5 }, () => ({ tool: 'etsy_fees', arguments: { price: 10 } }));
    const r = await runBatch(a, { calls }); expect(r).toMatchObject({ charged: 2, limitReached: true }); expect(a.items).toHaveLength(2); expect(a.status).toMatch(/maximum cost per run/);
  });
  it('rejects empty, malformed and oversized input', () => {
    expect(normalizeBatch(null)).toHaveProperty('error'); expect(normalizeBatch({})).toHaveProperty('error');
    expect(normalizeBatch({ calls: 'x' as any })).toHaveProperty('error');
    expect((normalizeBatch({ calls: Array.from({ length: MAX_CALLS + 1 }, () => ({ tool: 'etsy_fees' })) }) as any).error).toMatch(/maximum/);
  });
});

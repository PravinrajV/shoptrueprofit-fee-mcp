// Standard (non-Standby) Apify run: input { tool, arguments } or { calls: [{ tool, arguments }, ...] }.
// Each successful calculation is pushed to the default dataset AND charged as one `fee-calculation` event in the same
// call (Actor.pushData(item, eventName)). Errors are pushed uncharged so the user sees exactly what failed and why.
import { runTool, TOOL_NAMES } from './tools';
import { CHARGE_EVENT } from './billing';

export interface BatchCall { tool: string; arguments?: unknown }
export interface BatchInput { tool?: string; arguments?: unknown; calls?: BatchCall[] }
export const MAX_CALLS = 1000;
export interface ActorLike {
  pushData(item: object, eventName?: string): Promise<unknown>;
  setStatusMessage?(msg: string): Promise<unknown>;
}

export function normalizeBatch(input: BatchInput | null | undefined): { calls: BatchCall[] } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'Input is empty. Provide "tool" and "arguments", or "calls": [{ "tool", "arguments" }].' };
  const calls: BatchCall[] = [];
  if (input.tool !== undefined) calls.push({ tool: input.tool, arguments: input.arguments ?? {} });
  if (input.calls !== undefined) {
    if (!Array.isArray(input.calls)) return { error: '"calls" must be an array of { "tool", "arguments" } objects.' };
    calls.push(...input.calls);
  }
  if (!calls.length) return { error: `Nothing to do. Set "tool" (one of: ${TOOL_NAMES.join(', ')}) and "arguments", or a "calls" array.` };
  if (calls.length > MAX_CALLS) return { error: `Too many calls (${calls.length}); the maximum per run is ${MAX_CALLS}.` };
  return { calls };
}

export async function runBatch(actor: ActorLike, input: BatchInput | null | undefined): Promise<{ ok: number; failed: number; charged: number; limitReached: boolean; error?: string }> {
  const n = normalizeBatch(input);
  if ('error' in n) { await actor.setStatusMessage?.(n.error); return { ok: 0, failed: 0, charged: 0, limitReached: false, error: n.error }; }
  let ok = 0, failed = 0, charged = 0, limitReached = false;
  for (const [index, c] of n.calls.entries()) {
    const r = runTool(String(c?.tool ?? ''), c?.arguments);
    if (!r.ok) { failed++; await actor.pushData({ index, tool: c?.tool ?? null, ok: false, error: r.error }); continue; }
    if (r.charged) {
      const res = await actor.pushData({ index, tool: c.tool, ok: true, result: r.result }, CHARGE_EVENT) as { chargedCount?: number; eventChargeLimitReached?: boolean } | undefined;
      if (res && res.chargedCount === 0 && res.eventChargeLimitReached) { limitReached = true; break; } // over the user's max cost per run
      ok++; if (res?.chargedCount) charged++;
      if (res?.eventChargeLimitReached) { limitReached = n.calls.length > index + 1; break; }
    } else { ok++; await actor.pushData({ index, tool: c.tool, ok: true, result: r.result }); }
  }
  const msg = `${ok} calculation(s) done${failed ? `, ${failed} rejected (see dataset items with ok=false)` : ''}${limitReached ? '. Stopped early: your maximum cost per run was reached' : ''}.`;
  await actor.setStatusMessage?.(msg);
  return { ok, failed, charged, limitReached };
}

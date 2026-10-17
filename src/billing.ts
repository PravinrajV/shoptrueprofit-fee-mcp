// Billing seam. The MCP layer calls `charge()` once per successful calculation tool call, AFTER the result is computed
// and BEFORE it is returned. Validation errors and reference-list tools are never charged.
export const CHARGE_EVENT = 'fee-calculation';

export interface ChargeOutcome { ok: boolean; reason?: string }
export interface Biller { readonly name: string; charge(tool: string): Promise<ChargeOutcome> }

/** Local / self-hosted use: free, nothing is recorded. */
export const freeBiller: Biller = { name: 'free', charge: async () => ({ ok: true }) };

/** Test double: records every charge. */
export function recordingBiller(): Biller & { calls: string[] } {
  const calls: string[] = [];
  return { name: 'recording', calls, charge: async (tool: string) => { calls.push(tool); return { ok: true }; } };
}

/** Apify pay-per-event: one `fee-calculation` event per tool call via Actor.charge (the SDK handles idempotency and the
 *  user's max-charge limit). When the Actor is not on pay-per-event pricing (free / pay-per-usage, or local runs), calls
 *  are served without charging. On PPE it fails closed: if the event could not be charged, the result is withheld. */
export function apifyBiller(actor: { charge(o: { eventName: string; count?: number }): Promise<{ chargedCount: number; eventChargeLimitReached: boolean }> },
  log: (msg: string, data?: Record<string, unknown>) => void = () => {}, isPayPerEvent: () => boolean = () => true): Biller {
  return {
    name: 'apify-ppe',
    async charge(tool) {
      if (!isPayPerEvent()) return { ok: true };
      try {
        const r = await actor.charge({ eventName: CHARGE_EVENT });
        if (r.chargedCount < 1) return { ok: false, reason: 'Your Apify spending limit for this run has been reached, so this calculation was not charged or returned. Raise the maximum cost per run and try again.' };
        return { ok: true };
      } catch (e) {
        log('charge failed', { tool, error: e instanceof Error ? e.message : String(e) });
        return { ok: false, reason: 'Billing is temporarily unavailable, so this calculation was not charged or returned. Please retry in a moment.' };
      }
    },
  };
}

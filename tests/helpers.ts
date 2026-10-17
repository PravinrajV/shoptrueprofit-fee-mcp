import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runTool } from '../src/tools';

export const APP_SRC = resolve(process.env.STP_APP_DIR ?? resolve(__dirname, '../../etsy-profit-dashboard'), 'src');
export const HAS_APP = existsSync(resolve(APP_SRC, 'feecalc.ts'));

/** Run a tool and fail loudly if it was rejected. */
export function ok(name: string, args: unknown): any {
  const r = runTool(name, args);
  if (!r.ok) throw new Error(`${name} rejected valid input: ${r.error}`);
  return r.result;
}
export function err(name: string, args: unknown): string {
  const r = runTool(name, args);
  if (r.ok) throw new Error(`${name} accepted invalid input ${JSON.stringify(args)}`);
  return r.error;
}
/** Deterministic PRNG (mulberry32) so the generated cases are the same on every run. */
export function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const cents = (r: () => number, max: number) => Math.round(r() * max * 100) / 100;
export const pick = <T,>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];
export const line = (res: any, code: string) => { const l = (res.fees?.lines ?? []).find((x: any) => x.code === code); return l ? l.amount : 0; };

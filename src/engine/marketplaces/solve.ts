// Shared price solver for the marketplace calculators.
/** Smallest price p ≥ 0 (rounded up to a cent) with f(p) ≥ 0, where f is continuous and increasing between the given
 *  break points but may jump down at them. Searches each segment in order, so the first (lowest) solution wins. */
export function minPrice(f: (p: number) => number, breaks: number[], max = 1e7): number | null {
  const pts = [0, ...breaks.filter(b => b > 0 && b < max && Number.isFinite(b)).sort((a, b) => a - b), max];
  const ceilC = (p: number) => Math.ceil(Math.round(p * 1e6) / 1e4) / 100;
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], b = pts[s + 1] - 1e-7;
    if (f(a) >= 0) return check(ceilC(a));
    if (f(b) < 0) continue;
    let lo = a, hi = b;
    for (let k = 0; k < 200 && hi - lo > 1e-7; k++) { const m = (lo + hi) / 2; if (f(m) >= 0) hi = m; else lo = m; }
    const p = check(ceilC(hi)); if (p !== null) return p;
  }
  return null;
  function check(p: number): number | null { for (let k = 0; k < 5; k++) { const q = Math.round((p + k / 100) * 100) / 100; if (f(q) >= -1e-9) return q; } return null; }
}

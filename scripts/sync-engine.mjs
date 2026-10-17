// Copies the fee engine VERBATIM (byte-for-byte) from the ShopTrueProfit app so this server's numbers match
// shoptrueprofit.com exactly. Never edit files under src/engine/ by hand: change the app, then run `npm run sync-engine`.
//   node scripts/sync-engine.mjs           copy + write src/engine/SOURCE.json (SHA-256 of every file)
//   node scripts/sync-engine.mjs --check   verify src/engine/ still matches SOURCE.json (and the app, if present)
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(process.env.STP_APP_DIR ?? join(root, '..', 'etsy-profit-dashboard'));
const FILES = ['feecalc.ts', 'marketplaces/ebay.ts', 'marketplaces/amazon.ts', 'marketplaces/solve.ts'];
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const manifestPath = join(root, 'src/engine/SOURCE.json');

if (process.argv.includes('--check')) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8')); let bad = 0;
  for (const f of FILES) {
    const local = sha(join(root, 'src/engine', f));
    if (local !== m.files[f]) { console.error(`MODIFIED: src/engine/${f} differs from SOURCE.json`); bad++; }
    const ap = join(app, 'src', f);
    if (existsSync(ap) && sha(ap) !== local) { console.error(`DRIFT: app src/${f} changed since the last sync. Run npm run sync-engine and re-test.`); bad++; }
  }
  if (bad) process.exit(1);
  console.log(`engine OK: ${FILES.length} files match SOURCE.json${existsSync(app) ? ' and the app' : ' (app folder not present, skipped app comparison)'}`);
} else {
  const files = {};
  for (const f of FILES) {
    const src = join(app, 'src', f); const dst = join(root, 'src/engine', f);
    mkdirSync(dirname(dst), { recursive: true }); copyFileSync(src, dst); files[f] = sha(dst);
  }
  writeFileSync(manifestPath, JSON.stringify({ note: 'Verbatim copy of the ShopTrueProfit fee engine. Do not edit; run npm run sync-engine.', app: 'etsy-profit-dashboard/src', syncedAt: new Date().toISOString(), files }, null, 2) + '\n');
  console.log('synced', Object.keys(files).join(', '));
}

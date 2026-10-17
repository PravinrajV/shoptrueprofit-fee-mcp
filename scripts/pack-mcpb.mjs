// Builds a local MCPB bundle (build/shoptrueprofit-fee-mcp.mcpb) for Claude Desktop / Smithery local installs.
// Fills the manifest tool list from the registry, bundles the stdio server with all dependencies into one file, zips it.
import { build } from 'esbuild';
import { mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const out = 'build/mcpb'; rmSync('build', { recursive: true, force: true }); mkdirSync(`${out}/server`, { recursive: true });
await build({ entryPoints: ['src/stdio.ts'], outfile: `${out}/server/index.mjs`, bundle: true, platform: 'node', target: 'node20', format: 'esm',
  define: { __STP_VERSION__: JSON.stringify(pkg.version) }, banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  minify: false, legalComments: 'eof', logLevel: 'warning' });
const ref = 'node_modules/.cache/stp-mcpb-tools.mjs';
await build({ entryPoints: ['src/tools.ts'], outfile: ref, bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { __STP_VERSION__: '"x"' }, logLevel: 'error' });
const { TOOLS } = await import(new URL(`../${ref}`, import.meta.url).href);
const manifest = JSON.parse(readFileSync('mcpb/manifest.json', 'utf8'));
manifest.version = pkg.version; manifest.tools = TOOLS.map(t => ({ name: t.name, description: t.title }));
writeFileSync('mcpb/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
copyFileSync('LICENSE', `${out}/LICENSE`); copyFileSync('assets/icon-512.png', `${out}/icon.png`); copyFileSync('README.md', `${out}/README.md`);
const file = `build/${pkg.name}-${pkg.version}.mcpb`;
execFileSync('python3', ['-c', `import shutil; shutil.make_archive('${file}', 'zip', '${out}')`]);
execFileSync('mv', [`${file}.zip`, file]);
console.log('wrote', file);

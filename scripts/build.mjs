// Bundles the server into dist/ with esbuild. The vendored engine keeps the app's extensionless imports, so bundling
// (not tsc emit) is what makes it run on plain Node. Runtime deps stay external and are installed from package.json.
import { build } from 'esbuild';
import { readFileSync, rmSync, chmodSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: { main: 'src/main.ts', stdio: 'src/stdio.ts', http: 'src/http-main.ts' },
  outdir: 'dist', bundle: true, platform: 'node', format: 'esm', target: 'node20', sourcemap: true,
  external: Object.keys(pkg.dependencies), logLevel: 'warning',
  define: { __STP_VERSION__: JSON.stringify(pkg.version) },
});
chmodSync('dist/stdio.js', 0o755);
console.log('built dist/main.js dist/stdio.js dist/http.js');

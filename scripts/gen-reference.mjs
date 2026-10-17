// Generates docs/tool-reference.md from the live tool registry, so the argument docs can never drift from the schemas.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const out = join(process.cwd(), 'node_modules', '.cache', 'stp-ref-tools.mjs');
await build({ entryPoints: ['src/tools.ts'], outfile: out, bundle: true, platform: 'node', format: 'esm', packages: 'external', define: { __STP_VERSION__: '"ref"' }, logLevel: 'error' });
const { TOOLS } = await import(out); const z = await import('zod');
const esc = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const typeOf = p => p.enum ? p.enum.map(v => `\`${v}\``).join(', ') : p.anyOf ? p.anyOf.map(a => a.const ?? a.type).join(' / ') : p.type === 'object' ? 'object (see below)' : p.type;
let md = '# Tool reference\n\nGenerated from the tool registry by `node scripts/gen-reference.mjs`. Do not edit by hand.\n\n';
md += '| Tool | Charged | What it does |\n|---|---|---|\n' + TOOLS.map(t => `| \`${t.name}\` | ${t.charged ? 'yes, 1 event' : 'free'} | ${esc(t.title)} |`).join('\n') + '\n\n';
const table = (js) => {
  const req = new Set(js.required ?? []); let s = '| Argument | Type | Required | Default | Description |\n|---|---|---|---|---|\n';
  for (const [k, p] of Object.entries(js.properties ?? {})) {
    const range = [p.exclusiveMinimum !== undefined ? `> ${p.exclusiveMinimum}` : p.minimum !== undefined ? `>= ${p.minimum}` : '', p.maximum !== undefined ? `<= ${p.maximum}` : ''].filter(Boolean).join(', ');
    s += `| \`${k}\` | ${esc(typeOf(p))}${range ? ` (${range})` : ''} | ${req.has(k) ? 'yes' : 'no'} | ${p.default === undefined ? '' : `\`${JSON.stringify(p.default)}\``} | ${esc(p.description ?? '')} |\n`;
  }
  return s;
};
for (const t of TOOLS) {
  const js = z.toJSONSchema(t.input, { io: 'input' });
  md += `## \`${t.name}\`\n\n${t.description}\n\n` + (Object.keys(js.properties ?? {}).length ? table(js) : '_No arguments._\n');
  for (const [k, p] of Object.entries(js.properties ?? {})) if (p.type === 'object' && p.properties) md += `\n**\`${k}\` object**\n\n` + table(p);
  md += '\n';
}
writeFileSync('docs/tool-reference.md', md); console.log('wrote docs/tool-reference.md', md.length, 'chars');

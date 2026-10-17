// Packaging invariants: Apify actor config, input schema and listing drafts stay in sync with the tool registry.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { TOOLS, TOOL_NAMES } from '../src/tools';
import { SERVER_VERSION } from '../src/meta';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const pkg = json('package.json');

describe('packaging', () => {
  it('actor.json enables Standby MCP at /mcp and wires the schemas', () => {
    const a = json('.actor/actor.json');
    expect(a.usesStandbyMode).toBe(true);
    expect(a.webServerMcpPath).toBe('/mcp');
    expect(a.input).toBe('./input_schema.json');
    expect(String(a.version)).toBe(pkg.version.split('.').slice(0, 2).join('.'));
    expect(existsSync(new URL('../.actor/pay_per_event.json', import.meta.url))).toBe(false); // no real price set in the repo
  });
  it('input schema tool enum matches the registry', () => {
    const i = json('.actor/input_schema.json');
    expect(i.properties.tool.enum).toEqual(TOOL_NAMES);
  });
  it('proposed PPE file uses the event the code charges', () => {
    const p = json('docs/pay_per_event.proposed.json');
    expect(Object.keys(p.actorChargeEvents ?? p)).toContain('fee-calculation');
  });
  it('listing drafts list exactly the registry tools and the package version', () => {
    const m = json('mcpb/manifest.json');
    expect(m.tools.map((t: any) => t.name)).toEqual(TOOL_NAMES);
    expect(m.version).toBe(pkg.version);
    const s = json('docs/listings/server.json');
    expect(s.version).toBe(pkg.version);
    expect(s.packages[0].version).toBe(pkg.version);
    expect(SERVER_VERSION).toBe(pkg.version);
  });
  it('tool reference doc is up to date', () => {
    const md = readFileSync(new URL('../docs/tool-reference.md', import.meta.url), 'utf8');
    for (const t of TOOLS) expect(md).toContain(`## \`${t.name}\``);
  });
});

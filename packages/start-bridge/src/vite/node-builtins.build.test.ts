import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuilder } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { startBridgeNodeBuiltinsPlugin } from './rsc';

// A native-SSR Worker bundle (Calendar: rsc disabled) of a CommonJS
// dependency that requires a Node built-in, as googleapis' `debug` does.
const root = mkdtempSync(join(tmpdir(), 'start-bridge-node-builtins-'));
writeFileSync(
  join(root, 'dep.cjs'),
  "const tty = require('tty');\nmodule.exports = { isatty: (fd) => tty.isatty(fd) };\n"
);
writeFileSync(
  join(root, 'entry.js'),
  "import dep from './dep.cjs';\nexport default { fetch: () => new Response(String(dep.isatty(1))) };\n"
);

async function buildSsr(plugins: { name: string }[], outDir: string) {
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins,
    environments: {
      ssr: {
        resolve: { noExternal: true },
        build: {
          ssr: join(root, 'entry.js'),
          outDir: join(root, outDir),
          rollupOptions: { platform: 'neutral' },
        },
      },
    },
  });
  const ssr = builder.environments.ssr;
  if (!ssr) throw new Error('missing ssr environment');
  await builder.build(ssr);
  const dir = join(root, outDir);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.js') || file.endsWith('.mjs'))
    .map((file) => readFileSync(join(dir, file), 'utf8'))
    .join('\n');
}

describe('startBridgeNodeBuiltinsPlugin build', () => {
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('imports a required built-in instead of a throwing require stub', async () => {
    const stub = await buildSsr([], 'without');
    expect(stub).not.toMatch(/from\s*["'](?:node:)?tty["']/u);
    expect(stub).toMatch(/require\w*\(["']tty["']\)/u);

    const converted = await buildSsr([startBridgeNodeBuiltinsPlugin()], 'with');
    expect(converted).toMatch(/from\s*["'](?:node:)?tty["']/u);
    expect(converted).not.toMatch(/require\w*\(["']tty["']\)/u);
  }, 60_000);
});

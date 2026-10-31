import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specifier = '@tuturuuu/supabase/shared-cookie-domains';
const importer = resolve(root, 'packages/utils/src/shared-cookie.ts');
const source = resolve(root, 'packages/supabase/src/shared-cookie-domains.ts');

for (const conditions of [[], ['types'], ['browser'], ['bun']]) {
  test(`shared cookie leaf resolves to source with Node conditions ${conditions}`, () => {
    const resolved = execFileSync(
      process.execPath,
      [
        ...conditions.map((condition) => `--conditions=${condition}`),
        '--input-type=module',
        '--eval',
        `console.log(import.meta.resolve(${JSON.stringify(specifier)}))`,
      ],
      { cwd: resolve(root, 'packages/utils'), encoding: 'utf8' }
    ).trim();
    assert.equal(fileURLToPath(resolved), source);
  });
}

test('shared cookie default export resolves to source without a Bun condition', () => {
  assert.equal(createRequire(importer).resolve(specifier), source);
});

for (const conditions of [
  ['module', 'browser', 'development|production'],
  ['bun', 'module', 'browser', 'development|production'],
  ['node', 'development|production'],
]) {
  test(`Vite resolves the portable cookie leaf with ${conditions}`, async () => {
    const server = await createServer({
      root,
      configFile: false,
      resolve: { conditions },
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      const resolved =
        await server.environments.client.pluginContainer.resolveId(
          specifier,
          importer
        );
      assert.equal(resolved?.id, source);
    } finally {
      await server.close();
    }
  });
}

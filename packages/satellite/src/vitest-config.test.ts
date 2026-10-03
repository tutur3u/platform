// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, loadConfigFromFile } from 'vite';
import { expect, it } from 'vitest';

it('resolves the real budget source even when package exports select a native CommonJS entry', async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'satellite-budget-resolution-'))
  );
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    resolve(__dirname, '../vitest.config.mts')
  );
  const dependency = join(root, 'node_modules/@tuturuuu/storage-core');
  await mkdir(join(dependency, 'dist'), { recursive: true });
  await writeFile(
    join(dependency, 'package.json'),
    JSON.stringify({
      name: '@tuturuuu/storage-core',
      exports: {
        './profile-upload-budget': './dist/profile-upload-budget.cjs',
      },
    })
  );
  // Resolution fixture only: no compilation or fabricated upload error class.
  await writeFile(
    join(dependency, 'dist/profile-upload-budget.cjs'),
    'require("server-only");\n'
  );
  const source = resolve(
    __dirname,
    '../../storage-core/src/lib/profile-upload-budget.ts'
  );
  const aliases = loaded?.config.resolve?.alias;
  expect(Array.isArray(aliases)).toBe(true);
  const budgetAlias = (
    aliases as { find: string | RegExp; replacement: string }[]
  ).find((alias) => alias.replacement === source);
  expect(budgetAlias).toBeDefined();
  const resolveBudget = async (alias: typeof aliases) => {
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: { alias },
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true, watch: null },
    });
    try {
      return (
        await server.environments.client.pluginContainer.resolveId(
          '@tuturuuu/storage-core/profile-upload-budget',
          join(root, 'test.ts')
        )
      )?.id;
    } finally {
      await server.close();
    }
  };
  try {
    // Negative control proves the fixture selects the native dependency entry.
    expect(await resolveBudget([])).toBe(
      join(dependency, 'dist/profile-upload-budget.cjs')
    );
    expect(await resolveBudget(aliases)).toBe(source);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

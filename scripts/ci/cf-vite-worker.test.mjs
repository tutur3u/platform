// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: disposable harness environment fixtures.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BUILD_OUTPUT_ROOT, startCfViteWorker } from './cf-vite-worker.mjs';

const ENV_KEYS = [
  'CF_HARNESS_TEST_SECRET',
  'CLOUDFLARE_INCLUDE_PROCESS_ENV',
  'CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV',
  'CLOUDFLARE_VITE_FORCE_LOCAL',
];

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'cf-harness-'));
  const root = join(directory, 'app');
  const cwd = join(directory, 'cwd');
  mkdirSync(root);
  mkdirSync(cwd);
  const previousCwd = process.cwd();
  const previousEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]])
  );
  t.after(() => {
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  process.chdir(cwd);
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  process.env.CF_HARNESS_TEST_SECRET = 'prior-disposable';
  writeFileSync(join(root, 'package.json'), '{}');
  mkdirSync(join(root, BUILD_OUTPUT_ROOT), { recursive: true });
  writeFileSync(join(root, BUILD_OUTPUT_ROOT, 'config.json'), '{}');
  return { root, cwd };
}

function fakeVite(root, fail = false) {
  const vite = join(root, 'node_modules/vite');
  mkdirSync(vite, { recursive: true });
  writeFileSync(
    join(vite, 'package.json'),
    JSON.stringify({ type: 'module', main: 'index.js' })
  );
  writeFileSync(
    join(vite, 'index.js'),
    `
    const create = () => ({
      httpServer: { address: () => ({ port: 12345 }) },
      listen: async () => { ${fail ? "throw new Error('fixture listen failed')" : ''} },
      close: async () => {},
    });
    export async function createServer() { return create(); }
    export async function preview() {
      ${fail ? "throw new Error('fixture preview failed');" : 'return create();'}
    }
  `
  );
}

for (const mode of ['source', 'build-output']) {
  for (const location of ['root', 'cwd']) {
    for (const name of [
      '.dev.vars',
      '.dev.vars.production',
      '.env',
      '.env.local',
    ]) {
      test(`${mode} refuses ${name} in ${location} before mutating secrets`, async (t) => {
        const paths = fixture(t);
        writeFileSync(
          join(paths[location], name),
          'CF_HARNESS_TEST_SECRET=unsafe-fixture'
        );
        const before = { ...process.env };
        await assert.rejects(
          startCfViteWorker({
            root: paths.root,
            mode,
            secrets: { CF_HARNESS_TEST_SECRET: 'disposable' },
          }),
          /Refusing to start with local secret files/
        );
        assert.deepEqual({ ...process.env }, before);
      });
    }
  }

  for (const failure of ['import', 'listen']) {
    test(`${mode} restores environment after ${failure} failure`, async (t) => {
      const { root } = fixture(t);
      if (failure === 'listen') fakeVite(root, true);
      const before = { ...process.env };
      await assert.rejects(
        startCfViteWorker({
          root,
          mode,
          secrets: { CF_HARNESS_TEST_SECRET: 'disposable' },
        })
      );
      assert.deepEqual({ ...process.env }, before);
    });
  }

  test(`${mode} applies disposable secrets and restores environment on close`, async (t) => {
    const { root, cwd } = fixture(t);
    fakeVite(root);
    for (const directory of [root, cwd])
      writeFileSync(join(directory, '.env.example'), 'TEMPLATE=true');
    const before = { ...process.env };
    const worker = await startCfViteWorker({
      root,
      mode,
      secrets: { CF_HARNESS_TEST_SECRET: 'disposable' },
    });
    try {
      assert.equal(process.env.CF_HARNESS_TEST_SECRET, 'disposable');
      for (const key of ENV_KEYS.slice(1))
        assert.equal(process.env[key], 'true');
    } finally {
      await worker.close();
    }
    assert.deepEqual({ ...process.env }, before);
  });
}

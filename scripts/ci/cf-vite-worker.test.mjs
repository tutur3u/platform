// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: disposable harness environment fixtures.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { BUILD_OUTPUT_ROOT, startCfViteWorker } from './cf-vite-worker.mjs';

const CONTROL_ENV = {
  CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
  CLOUDFLARE_VITE_FORCE_LOCAL: 'true',
};
const ENV_KEYS = [
  'CF_HARNESS_TEST_SECRET',
  'CF_HARNESS_OTHER_SECRET',
  'WEB_ORIGIN',
  ...Object.keys(CONTROL_ENV),
];
const FIXTURE_SECRETS = { CF_HARNESS_TEST_SECRET: 'disposable' };
const DEFAULT_BINDINGS = {
  CF_HARNESS_TEST_SECRET: { type: 'secret' },
  WEB_ORIGIN: { type: 'text', value: 'https://declared.example.invalid' },
};

function writeConfig(root, env = DEFAULT_BINDINGS) {
  const config = { worker: { env } };
  writeFileSync(
    join(root, 'cloudflare.config.ts'),
    `export default ${JSON.stringify(config)};`
  );
  const output = join(root, BUILD_OUTPUT_ROOT);
  mkdirSync(join(output, 'workers/default'), { recursive: true });
  writeFileSync(join(output, 'config.json'), '{}');
  writeFileSync(
    join(output, 'workers/default/worker.config.json'),
    JSON.stringify({
      ...config.worker,
      manifest: { type: 'complete', mainModule: 'index.js' },
    })
  );
}

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
  for (const key of Object.keys(CONTROL_ENV))
    process.env[key] = 'prior-control';
  process.env.CF_HARNESS_TEST_SECRET = 'prior-disposable';
  process.env.CF_HARNESS_OTHER_SECRET = 'shell-must-not-fill-missing-fixture';
  process.env.WEB_ORIGIN = 'https://shell.example.invalid';
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeConfig(root);
  return { root, cwd };
}

async function fakeVite(root, { fail, failClose = false } = {}) {
  const vite = join(root, 'node_modules/vite');
  mkdirSync(vite, { recursive: true });
  writeFileSync(
    join(vite, 'package.json'),
    JSON.stringify({ type: 'module', main: 'index.js' })
  );
  const file = join(vite, 'index.js');
  writeFileSync(
    file,
    `
    export const calls = [];
    const record = (name) => calls.push({ name, env: { ...process.env } });
    const create = () => ({
      httpServer: { address: () => {
        record('address');
        ${fail === 'address' ? "throw new Error('fixture address failed');" : ''}
        return { port: 12345 };
      } },
      listen: async () => {
        record('listen');
        ${fail === 'listen' ? "throw new Error('fixture listen failed');" : ''}
      },
      close: async () => {
        record('close');
        ${failClose ? "throw new Error('fixture close failed');" : ''}
      },
    });
    export async function createServer() {
      record('createServer');
      return create();
    }
    export async function preview() {
      record('preview');
      ${fail === 'preview' ? "throw new Error('fixture preview failed');" : 'return create();'}
    }
  `
  );
  return import(pathToFileURL(file).href);
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
            secrets: FIXTURE_SECRETS,
          }),
          /Refusing to start with local secret files/
        );
        assert.deepEqual({ ...process.env }, before);
      });
    }
  }

  test(`${mode} restores environment after Vite import failure`, async (t) => {
    const { root } = fixture(t);
    const before = { ...process.env };
    await assert.rejects(
      startCfViteWorker({ root, mode, secrets: FIXTURE_SECRETS }),
      (error) => error.code === 'MODULE_NOT_FOUND' && /vite/.test(error.message)
    );
    assert.deepEqual({ ...process.env }, before);
  });

  const startupFailure = mode === 'source' ? 'listen' : 'preview';
  test(`${mode} restores environment after intended ${startupFailure} failure`, async (t) => {
    const { root } = fixture(t);
    const { calls } = await fakeVite(root, { fail: startupFailure });
    const before = { ...process.env };
    await assert.rejects(
      startCfViteWorker({ root, mode, secrets: FIXTURE_SECRETS }),
      new RegExp(`fixture ${startupFailure} failed`)
    );
    assert.ok(calls.some(({ name }) => name === startupFailure));
    assert.equal(
      calls.filter(({ name }) => name === 'close').length,
      mode === 'source' ? 1 : 0
    );
    assert.deepEqual({ ...process.env }, before);
  });

  test(`${mode} masks shell defaults, writes each secret twice and restores its first value`, async (t) => {
    const { root, cwd } = fixture(t);
    const { calls } = await fakeVite(root);
    for (const directory of [root, cwd])
      writeFileSync(join(directory, '.env.example'), 'TEMPLATE=true');
    const before = { ...process.env };
    const worker = await startCfViteWorker({
      root,
      mode,
      secrets: FIXTURE_SECRETS,
    });
    try {
      assert.equal(process.env.CF_HARNESS_TEST_SECRET, 'disposable');
      assert.equal(process.env.WEB_ORIGIN, undefined);
      for (const [key, value] of Object.entries(CONTROL_ENV))
        assert.equal(process.env[key], value);
      const { env } = calls[0];
      assert.equal(env.CF_HARNESS_TEST_SECRET, 'disposable');
      assert.equal(env.WEB_ORIGIN, undefined);
      assert.equal(worker.origin, 'http://127.0.0.1:12345');
    } finally {
      await worker.close();
    }
    assert.equal(calls.at(-1).name, 'close');
    assert.deepEqual({ ...process.env }, before);
  });

  test(`${mode} restores previously absent environment keys`, async (t) => {
    const { root } = fixture(t);
    await fakeVite(root);
    for (const key of ENV_KEYS) delete process.env[key];
    const before = { ...process.env };
    const worker = await startCfViteWorker({
      root,
      mode,
      secrets: FIXTURE_SECRETS,
    });
    await worker.close();
    assert.deepEqual({ ...process.env }, before);
  });

  test(`${mode} rejects missing declared secret even when the shell provides it`, async (t) => {
    const { root } = fixture(t);
    const { calls } = await fakeVite(root);
    writeConfig(root, {
      ...DEFAULT_BINDINGS,
      CF_HARNESS_OTHER_SECRET: { type: 'secret' },
    });
    const before = { ...process.env };
    await assert.rejects(
      startCfViteWorker({ root, mode, secrets: FIXTURE_SECRETS }),
      /Missing disposable fixtures for declared secrets: CF_HARNESS_OTHER_SECRET/
    );
    assert.equal(calls.length, 0);
    assert.deepEqual({ ...process.env }, before);
  });

  for (const key of Object.keys(CONTROL_ENV)) {
    test(`${mode} rejects fixture/control overlap ${key}`, async (t) => {
      const { root } = fixture(t);
      const { calls } = await fakeVite(root);
      writeConfig(root, { ...DEFAULT_BINDINGS, [key]: { type: 'secret' } });
      const before = { ...process.env };
      await assert.rejects(
        startCfViteWorker({
          root,
          mode,
          secrets: { ...FIXTURE_SECRETS, [key]: 'disposable' },
        }),
        new RegExp(`reserved Worker binding ${key}`)
      );
      assert.equal(calls.length, 0);
      assert.deepEqual({ ...process.env }, before);
    });
  }

  for (const secrets of [
    { ...FIXTURE_SECRETS, WEB_ORIGIN: 'undeclared' },
    { ...FIXTURE_SECRETS, CLOUDFLARE_VITE_FORCE_LOCAL: 'false' },
    {},
    { CF_HARNESS_TEST_SECRET: '' },
    { CF_HARNESS_TEST_SECRET: 123 },
    null,
    [],
  ]) {
    test(`${mode} rejects invalid fixture shape ${JSON.stringify(secrets)}`, async (t) => {
      const { root } = fixture(t);
      const { calls } = await fakeVite(root);
      const before = { ...process.env };
      await assert.rejects(
        startCfViteWorker({ root, mode, secrets }),
        /Undeclared fixture secret|Missing disposable fixtures|Expected a fixture secrets object/
      );
      assert.equal(calls.length, 0);
      assert.deepEqual({ ...process.env }, before);
    });
  }

  test(`${mode} restores environment when close fails`, async (t) => {
    const { root } = fixture(t);
    await fakeVite(root, { failClose: true });
    const before = { ...process.env };
    const worker = await startCfViteWorker({
      root,
      mode,
      secrets: FIXTURE_SECRETS,
    });
    await assert.rejects(worker.close(), /fixture close failed/);
    assert.deepEqual({ ...process.env }, before);
  });

  test(`${mode} cleans up when address discovery fails`, async (t) => {
    const { root } = fixture(t);
    const { calls } = await fakeVite(root, { fail: 'address' });
    const before = { ...process.env };
    await assert.rejects(
      startCfViteWorker({ root, mode, secrets: FIXTURE_SECRETS }),
      /fixture address failed/
    );
    assert.equal(calls.at(-1).name, 'close');
    assert.deepEqual({ ...process.env }, before);
  });
}

test('source restores environment when both listen and cleanup fail', async (t) => {
  const { root } = fixture(t);
  const { calls } = await fakeVite(root, { fail: 'listen', failClose: true });
  const before = { ...process.env };
  await assert.rejects(
    startCfViteWorker({ root, mode: 'source', secrets: FIXTURE_SECRETS }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map(({ message }) => message),
        ['fixture listen failed', 'fixture close failed']
      );
      return true;
    }
  );
  assert.equal(calls.at(-1).name, 'close');
  assert.deepEqual({ ...process.env }, before);
});

test('source supports an explicit resolved config loader', async (t) => {
  const { root } = fixture(t);
  await fakeVite(root);
  let loadedRoot;
  const before = { ...process.env };
  const worker = await startCfViteWorker({
    root,
    mode: 'source',
    secrets: FIXTURE_SECRETS,
    loadSourceConfig: async (appRoot) => {
      loadedRoot = appRoot;
      return { worker: { env: DEFAULT_BINDINGS } };
    },
  });
  assert.equal(loadedRoot, root);
  await worker.close();
  assert.deepEqual({ ...process.env }, before);
});

test('source config loader failure does not mutate environment or start Vite', async (t) => {
  const { root } = fixture(t);
  const { calls } = await fakeVite(root);
  const before = { ...process.env };
  await assert.rejects(
    startCfViteWorker({
      root,
      mode: 'source',
      secrets: FIXTURE_SECRETS,
      loadSourceConfig: async () => {
        throw new Error('fixture config failed');
      },
    }),
    /fixture config failed/
  );
  assert.equal(calls.length, 0);
  assert.deepEqual({ ...process.env }, before);
});

for (const config of [
  {},
  { worker: { env: null } },
  { worker: { env: [] } },
  { worker: { env: { S: 'secret' } } },
]) {
  test(`source rejects unresolved/malformed binding config ${JSON.stringify(config)}`, async (t) => {
    const { root } = fixture(t);
    const { calls } = await fakeVite(root);
    const before = { ...process.env };
    await assert.rejects(
      startCfViteWorker({
        root,
        mode: 'source',
        loadSourceConfig: async () => config,
      }),
      /Expected resolved cf|Unsupported or reserved Worker binding/
    );
    assert.equal(calls.length, 0);
    assert.deepEqual({ ...process.env }, before);
  });
}

test('source rejects dynamic default exports instead of guessing declared secrets', async (t) => {
  const { root } = fixture(t);
  const { calls } = await fakeVite(root);
  writeFileSync(
    join(root, 'cloudflare.config.ts'),
    'export default () => ({ worker: { env: {} } });'
  );
  const before = { ...process.env };
  await assert.rejects(
    startCfViteWorker({ root, mode: 'source', secrets: FIXTURE_SECRETS }),
    /Expected resolved cf worker.env bindings/
  );
  assert.equal(calls.length, 0);
  assert.deepEqual({ ...process.env }, before);
});

test('build-output reads emitted bindings instead of source config or loader', async (t) => {
  const { root } = fixture(t);
  const { calls } = await fakeVite(root);
  writeFileSync(
    join(root, 'cloudflare.config.ts'),
    'throw new Error("source must not load");'
  );
  const before = { ...process.env };
  const worker = await startCfViteWorker({
    root,
    mode: 'build-output',
    secrets: FIXTURE_SECRETS,
    loadSourceConfig: async () => {
      throw new Error('loader must not run');
    },
  });
  await worker.close();
  assert.equal(calls[0].name, 'preview');
  assert.deepEqual({ ...process.env }, before);
});

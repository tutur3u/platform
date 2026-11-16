const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { resolveWebVitest, runWebTests } = require('./run-web-tests.js');

test('direct Web entry carries the owned fixture and Vitest arguments', async () => {
  const signal = new AbortController().signal;
  const env = {
    LIVE_MINT_TEST_REDIS_DISPOSABLE: '1',
    LIVE_MINT_TEST_REDIS_PORT: '16310',
  };
  let spawned;
  let cleaned = false;
  const result = await runWebTests({
    root: '/synthetic/repo',
    args: ['--coverage', '--maxWorkers=1'],
    resolveVitest: (webDir) => {
      assert.equal(webDir, '/synthetic/repo/apps/web');
      return '/synthetic/web-vitest/vitest.mjs';
    },
    fixture: async (options) => {
      assert.deepEqual(options.packages, ['@tuturuuu/web']);
      try {
        return await options.run(env, signal);
      } finally {
        cleaned = true;
      }
    },
    spawnImpl: (command, args, options) => {
      spawned = { command, args, options };
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 0));
      return child;
    },
  });
  assert.equal(result, 0);
  assert.equal(cleaned, true);
  assert.equal(spawned.command, process.execPath);
  assert.deepEqual(spawned.args, [
    '/synthetic/web-vitest/vitest.mjs',
    'run',
    '--coverage',
    '--maxWorkers=1',
  ]);
  assert.equal(spawned.options.cwd, '/synthetic/repo/apps/web');
  assert.equal(spawned.options.env, env);
  assert.equal(spawned.options.signal, signal);
  assert.equal(spawned.options.stdio, 'inherit');
});

test('failed tests retain their exit status and finish fixture cleanup', async () => {
  let cleaned = false;
  const result = await runWebTests({
    fixture: async (options) => {
      try {
        return await options.run({}, undefined);
      } finally {
        cleaned = true;
      }
    },
    spawnImpl: () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 7));
      return child;
    },
  });
  assert.equal(result, 7);
  assert.equal(cleaned, true);
});

test('spawn failure and signal termination cannot report a passing test run', async () => {
  let cleaned = 0;
  const fixture = async (options) => {
    try {
      return await options.run({}, undefined);
    } finally {
      cleaned++;
    }
  };
  await assert.rejects(
    runWebTests({
      fixture,
      spawnImpl: () => {
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('error', new Error('spawn failed')));
        return child;
      },
    }),
    /spawn failed/
  );
  assert.equal(
    await runWebTests({
      fixture,
      spawnImpl: () => {
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
        return child;
      },
    }),
    1
  );
  assert.equal(cleaned, 2);
});

test('fixture refusal happens before any test child starts', async () => {
  let spawned = false;
  await assert.rejects(
    runWebTests({
      fixture: async () => {
        throw new Error('explicit fixture required');
      },
      spawnImpl: () => {
        spawned = true;
      },
    }),
    /explicit fixture required/
  );
  assert.equal(spawned, false);
});

test('the default entry is the Vitest copy that apps/web test files import', () => {
  const root = path.resolve(__dirname, '../..');
  const webDir = path.join(root, 'apps/web');
  const imported = path.dirname(
    require.resolve('vitest/package.json', { paths: [webDir] })
  );
  assert.equal(resolveWebVitest(webDir), path.join(imported, 'vitest.mjs'));
});

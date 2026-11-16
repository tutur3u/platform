const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { REDIS_IMAGE, withDisposableRedis } = require('./disposable-redis.js');

const root = path.resolve(__dirname, '../..');
const web = ['@tuturuuu/web'];
const ci = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted' };
const id = 'a'.repeat(64);

function fixture(overrides = {}) {
  const calls = [];
  const signals = new EventEmitter();
  const docker = async (args) => {
    calls.push(args);
    if (args[0] === 'port') return { stdout: '127.0.0.1:32123\n' };
    if (args[0] === 'exec') return { stdout: 'PONG\n' };
    if (args[0] === 'container') return { stdout: id };
    return { stdout: '' };
  };
  return {
    calls,
    signals,
    options: {
      packages: web,
      env: ci,
      platform: 'linux',
      docker,
      sleep: async () => {},
      signals,
      run: async () => 0,
      ...overrides,
    },
  };
}

test('web CI provisions the pinned image and supplies only its loopback endpoint', async () => {
  let supplied;
  const f = fixture({
    env: {
      ...ci,
      REDIS_URL: 'https://production.invalid',
      LIVE_MINT_TEST_REDIS_SOCKET: '/foreign.sock',
    },
    run: async (env) => {
      supplied = env;
      return 7;
    },
  });
  assert.equal(await withDisposableRedis(f.options), 7);
  assert.deepEqual(f.calls[0], ['pull', REDIS_IMAGE]);
  assert.match(REDIS_IMAGE, /^docker\.io\/library\/redis@sha256:[a-f0-9]{64}$/);
  const create = f.calls.find((args) => args[0] === 'create');
  for (const value of [
    '64m',
    '0.5',
    '64',
    'ALL',
    'no-new-privileges',
    '--read-only',
    '127.0.0.1::6379',
    '16mb',
    'noeviction',
  ]) {
    assert.ok(create.includes(value), value);
  }
  assert.deepEqual(create.slice(-8), [
    '--save',
    '',
    '--appendonly',
    'no',
    '--maxmemory',
    '16mb',
    '--maxmemory-policy',
    'noeviction',
  ]);
  assert.equal(supplied.LIVE_MINT_TEST_REDIS_DISPOSABLE, '1');
  assert.equal(supplied.LIVE_MINT_TEST_REDIS_PORT, '32123');
  assert.equal(supplied.LIVE_MINT_TEST_REDIS_SOCKET, undefined);
  assert.deepEqual(f.calls.at(-1), ['rm', '--force', '--volumes', id]);
  const cleanup = f.calls.find((args) => args[0] === 'container');
  const name = create[create.indexOf('--name') + 1];
  const label = create[create.indexOf('--label') + 1];
  assert.ok(cleanup.includes(`name=^/${name}$`));
  assert.ok(cleanup.includes(`label=${label}`));
  assert.equal(f.signals.listenerCount('SIGTERM'), 0);
});

test('non-web and paused-runtime-only shards never provision Redis', async () => {
  for (const packages of [
    ['@tuturuuu/meet'],
    ['@tuturuuu/tanstack-web'],
    ['@tuturuuu/backend'],
  ]) {
    const f = fixture({ packages });
    assert.equal(await withDisposableRedis(f.options), 0);
    assert.deepEqual(f.calls, []);
  }
});

test('local reuse requires explicit fixture opt-in and exactly one local endpoint', async () => {
  for (const env of [
    {},
    { REDIS_URL: 'redis://production.invalid' },
    { LIVE_MINT_TEST_REDIS_DISPOSABLE: '1' },
    {
      LIVE_MINT_TEST_REDIS_DISPOSABLE: '1',
      LIVE_MINT_TEST_REDIS_PORT: '65536',
    },
    {
      LIVE_MINT_TEST_REDIS_DISPOSABLE: '1',
      LIVE_MINT_TEST_REDIS_SOCKET: 'relative.sock',
    },
  ]) {
    const f = fixture({ env, platform: 'darwin' });
    await assert.rejects(
      withDisposableRedis(f.options),
      /disposable Redis|Disposable Redis/
    );
    assert.deepEqual(f.calls, []);
  }
  for (const endpoint of [
    { LIVE_MINT_TEST_REDIS_PORT: '16310' },
    { LIVE_MINT_TEST_REDIS_SOCKET: '/tmp/owned.sock' },
  ]) {
    let received;
    const env = { LIVE_MINT_TEST_REDIS_DISPOSABLE: '1', ...endpoint };
    const f = fixture({
      env,
      platform: 'darwin',
      run: async (value) => {
        received = value;
      },
    });
    await withDisposableRedis(f.options);
    assert.deepEqual(received, env);
    assert.deepEqual(f.calls, []);
  }
});

test('automatic provisioning refuses Studio and self-hosted CI', async () => {
  for (const [platform, env] of [
    ['darwin', ci],
    ['linux', { ...ci, RUNNER_ENVIRONMENT: 'self-hosted' }],
  ]) {
    const f = fixture({ platform, env });
    await assert.rejects(withDisposableRedis(f.options), /ephemeral/);
    assert.deepEqual(f.calls, []);
  }
});

test('cleanup runs after test errors and nonzero exits', async () => {
  const f = fixture({
    run: async () => {
      throw new Error('test failed');
    },
  });
  await assert.rejects(withDisposableRedis(f.options), /test failed/);
  assert.deepEqual(f.calls.at(-1), ['rm', '--force', '--volumes', id]);
});

test('readiness is bounded and failed startup cleans only the owned container', async () => {
  const f = fixture();
  const docker = f.options.docker;
  f.options.docker = async (args) => {
    const result = await docker(args);
    if (args[0] === 'exec') throw new Error('not ready');
    return result;
  };
  await assert.rejects(withDisposableRedis(f.options), /readiness deadline/);
  assert.equal(f.calls.filter((args) => args[0] === 'exec').length, 30);
  assert.deepEqual(f.calls.at(-1), ['rm', '--force', '--volumes', id]);
});

test('a create command with unknown outcome reconciles ownership before cleanup', async () => {
  const f = fixture();
  const docker = f.options.docker;
  f.options.docker = async (args) => {
    const result = await docker(args);
    if (args[0] === 'create') throw new Error('create timed out');
    return result;
  };
  await assert.rejects(withDisposableRedis(f.options), /create timed out/);
  assert.deepEqual(f.calls.at(-1), ['rm', '--force', '--volumes', id]);
});

test('cleanup failure is a failed run, never a clean receipt', async () => {
  const f = fixture();
  const docker = f.options.docker;
  f.options.docker = async (args) => {
    const result = await docker(args);
    if (args[0] === 'rm') throw new Error('cleanup failed');
    return result;
  };
  await assert.rejects(withDisposableRedis(f.options), /cleanup failed/);
});

test('SIGINT and SIGTERM abort the owned test and clean its fixture', async () => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const f = fixture();
    f.options.run = async (_env, abort) => {
      f.signals.emit(signal);
      abort.throwIfAborted();
    };
    await assert.rejects(withDisposableRedis(f.options), /aborted/);
    assert.deepEqual(f.calls.at(-1), ['rm', '--force', '--volumes', id]);
    assert.equal(f.signals.listenerCount(signal), 0);
  }
});

test('Turbo admits fixture identity and endpoint without relying on production Redis', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'turbo.json')));
  assert.ok(config.tasks.test.env.includes('LIVE_MINT_TEST_REDIS_DISPOSABLE'));
  assert.ok(
    config.tasks.test.passThroughEnv.includes('LIVE_MINT_TEST_REDIS_PORT')
  );
  assert.ok(
    config.tasks.test.passThroughEnv.includes('LIVE_MINT_TEST_REDIS_SOCKET')
  );
  const runner = fs.readFileSync(
    path.join(root, 'scripts/ci/run-test-shard.js'),
    'utf8'
  );
  assert.match(runner, /withDisposableRedis\(/);
  const publicRunner = fs.readFileSync(
    path.join(root, 'scripts/ci/public-test-shard.js'),
    'utf8'
  );
  assert.match(publicRunner, /scripts\/ci\/run-test-shard\.js/);
  const workflow = fs.readFileSync(
    path.join(root, '.github/workflows/turbo-unit-tests.yaml'),
    'utf8'
  );
  assert.match(workflow, /node scripts\/ci\/run-test-shard\.js/);
});

test('the actual web shard runner passes the opted-in fixture to its test child', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'owned-shard-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'child.json');
  const binary = path.join(directory, 'bun');
  fs.writeFileSync(
    binary,
    `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.FIXTURE_RESULT, JSON.stringify({args:process.argv.slice(2), opt:process.env.LIVE_MINT_TEST_REDIS_DISPOSABLE, port:process.env.LIVE_MINT_TEST_REDIS_PORT}));\n`,
    { mode: 0o700 }
  );
  const { discoverPackages, planShards } = require('./test-shards.js');
  const index = planShards(discoverPackages(root), 4).findIndex((shard) =>
    shard.packages.includes('@tuturuuu/web')
  );
  execFileSync(
    process.execPath,
    ['scripts/ci/run-test-shard.js', String(index), '4'],
    {
      cwd: root,
      timeout: 15000,
      env: {
        PATH: directory + path.delimiter + process.env.PATH,
        HOME: directory,
        FIXTURE_RESULT: output,
        LIVE_MINT_TEST_REDIS_DISPOSABLE: '1',
        LIVE_MINT_TEST_REDIS_PORT: '16310',
      },
    }
  );
  const child = JSON.parse(fs.readFileSync(output));
  assert.equal(child.opt, '1');
  assert.equal(child.port, '16310');
  assert.ok(child.args.includes('--filter=@tuturuuu/web'));
});

test('pull failure does not create or remove any container', async () => {
  const f = fixture({
    docker: async (args) => {
      assert.equal(args[0], 'pull');
      throw new Error('pull failed');
    },
  });
  await assert.rejects(withDisposableRedis(f.options), /pull failed/);
  assert.equal(f.signals.listenerCount('SIGTERM'), 0);
});

test('non-loopback publication is rejected and the owned fixture is removed', async () => {
  const f = fixture();
  const docker = f.options.docker;
  f.options.docker = async (args) => {
    const result = await docker(args);
    return args[0] === 'port' ? { stdout: '0.0.0.0:32123' } : result;
  };
  await assert.rejects(withDisposableRedis(f.options), /not loopback/);
  assert.deepEqual(f.calls.at(-1), ['rm', '--force', '--volumes', id]);
});

test('ambiguous cleanup refuses to remove foreign container identifiers', async () => {
  const f = fixture();
  const docker = f.options.docker;
  f.options.docker = async (args) => {
    const result = await docker(args);
    return args[0] === 'container'
      ? { stdout: id + '\n' + 'b'.repeat(64) }
      : result;
  };
  await assert.rejects(
    withDisposableRedis(f.options),
    /ownership is ambiguous/
  );
  assert.equal(f.calls.filter((args) => args[0] === 'rm').length, 0);
});

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  createTasksSatelliteEnv,
  getTasksSatelliteDependencyBuildArgs,
  getTasksSatellitePortlessEnv,
  getTasksSatellitePlaywrightEnv,
  getTasksSatelliteUrl,
  shouldDiscoverTasksSatelliteFromTestList,
  shouldStartTasksSatellite,
  startTasksSatellite,
  waitForTasksSatellite,
} = require('./e2e-tasks-satellite.js');

test('starts the Tasks satellite for full, focused, and explicitly enabled E2E runs', () => {
  assert.equal(shouldStartTasksSatellite([], {}), true);
  assert.equal(
    shouldStartTasksSatellite(['tasks-workspace-lifecycle.noauth.spec.ts'], {}),
    true
  );
  assert.equal(
    shouldStartTasksSatellite(['--shard=1/4'], {
      E2E_TASKS_SATELLITE_ENABLED: '1',
    }),
    true
  );
  assert.equal(
    shouldStartTasksSatellite(['--shard=3/4'], {
      E2E_TASKS_SATELLITE_ENABLED: '0',
    }),
    false
  );
  assert.equal(
    shouldStartTasksSatellite(
      ['--shard=3/4'],
      {},
      'tasks-workspace-lifecycle.noauth.spec.ts'
    ),
    true
  );
  assert.equal(
    shouldStartTasksSatellite(['--shard=1/4'], {}, 'auth.spec.ts'),
    false
  );
});

test('discovers sharded Tasks lifecycle ownership without forcing every shard', () => {
  assert.equal(
    shouldDiscoverTasksSatelliteFromTestList(['--shard=1/4'], {}),
    true
  );
  assert.equal(
    shouldDiscoverTasksSatelliteFromTestList(
      ['tasks-workspace-lifecycle.noauth.spec.ts'],
      {}
    ),
    false
  );
  assert.equal(
    shouldDiscoverTasksSatelliteFromTestList(['--shard=1/4'], {
      E2E_TASKS_SATELLITE_ENABLED: '1',
    }),
    false
  );
  assert.equal(
    shouldDiscoverTasksSatelliteFromTestList(['--shard=1/4'], {
      E2E_TASKS_SATELLITE_ENABLED: '0',
    }),
    false
  );
});

test('builds only Tasks workspace dependencies before satellite startup', () => {
  assert.deepEqual(getTasksSatelliteDependencyBuildArgs(), [
    'turbo:local',
    'run',
    'build',
    '--filter=@tuturuuu/tasks^...',
  ]);
});

test('builds host-safe Tasks runtime and Portless environments', () => {
  const env = {
    BASE_URL: 'https://tuturuuu.localhost:1355',
    DOCKER_WEB_PROXY_HOST_PORT: '7803',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
    PORTLESS_PORT: '1355',
  };
  const runtime = createTasksSatelliteEnv(env);
  const portless = getTasksSatellitePortlessEnv(env);
  const playwright = getTasksSatellitePlaywrightEnv(env);

  assert.equal(
    getTasksSatelliteUrl(env),
    'https://tasks.tuturuuu.localhost:1355'
  );
  assert.equal(runtime.BASE_URL, 'https://tasks.tuturuuu.localhost:1355');
  assert.equal(runtime.TTR_URL, 'https://tuturuuu.localhost:1355');
  assert.equal(runtime.INTERNAL_WEB_API_ORIGIN, 'http://127.0.0.1:7803');
  assert.equal(runtime.SUPABASE_SERVER_URL, 'http://127.0.0.1:8001');
  assert.equal(runtime.UPSTASH_REDIS_REST_URL, 'http://127.0.0.1:8079');
  assert.equal(portless.PORTLESS_ROUTE_NAME, 'tasks.tuturuuu');
  assert.equal(portless.DOCKER_WEB_PROXY_HOST_PORT, '7809');
  assert.equal(
    playwright.TASKS_BASE_URL,
    'https://tasks.tuturuuu.localhost:1355'
  );
});

test('starts the Tasks dev server and reports an early exit during readiness', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = () => true;
  const calls = [];
  const closedFds = [];
  const runtime = startTasksSatellite({
    env: { PORTLESS_PORT: '1355' },
    fsImpl: {
      closeSync(fd) {
        closedFds.push(fd);
      },
      mkdirSync() {},
      openSync() {
        return 42;
      },
    },
    rootDir: '/repo',
    spawnImpl(command, args, options) {
      calls.push({ args, command, options });
      return child;
    },
  });

  assert.equal(calls[0].command, 'bun');
  assert.deepEqual(calls[0].args, ['run', 'dev:app']);
  assert.equal(calls[0].options.cwd, '/repo/apps/tasks');
  assert.equal(calls[0].options.env.PORT, '7809');
  assert.deepEqual(calls[0].options.stdio, ['ignore', 42, 42]);
  assert.deepEqual(closedFds, [42]);

  const readiness = waitForTasksSatellite(runtime, () => new Promise(() => {}));
  child.emit('exit', 1, null);
  await assert.rejects(readiness, /stopped before it became ready.*exit=1/u);
});

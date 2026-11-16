const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { isAbsolute } = require('node:path');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');

// Official library/redis 7.4-alpine manifest index, verified against the registry.
const REDIS_IMAGE =
  'docker.io/library/redis@sha256:7f7d30b7fdd09467bac58198a1f166dd69789d348d4fe859cccb20e0cf287fbe';
const LABEL = 'com.tuturuuu.ci.redis-owner';
const execute = promisify(execFile);

function fixtureEnv(env, endpoint) {
  const result = { ...env, LIVE_MINT_TEST_REDIS_DISPOSABLE: '1' };
  delete result.LIVE_MINT_TEST_REDIS_PORT;
  delete result.LIVE_MINT_TEST_REDIS_SOCKET;
  return { ...result, ...endpoint };
}

function ownedLocalEndpoint(env) {
  if (env.LIVE_MINT_TEST_REDIS_DISPOSABLE !== '1') {
    throw new Error(
      'Web tests require explicit owned disposable Redis opt-in.'
    );
  }
  const port = env.LIVE_MINT_TEST_REDIS_PORT;
  const socket = env.LIVE_MINT_TEST_REDIS_SOCKET;
  if (socket && !port && isAbsolute(socket)) {
    return { LIVE_MINT_TEST_REDIS_SOCKET: socket };
  }
  if (!socket && /^[1-9]\d*$/.test(port ?? '') && Number(port) <= 65535) {
    return { LIVE_MINT_TEST_REDIS_PORT: port };
  }
  throw new Error(
    'Disposable Redis requires one local port or absolute socket.'
  );
}

async function cleanupOwnedRedis(docker, name, owner) {
  const result = await docker([
    'container',
    'ls',
    '-aq',
    '--filter',
    `name=^/${name}$`,
    '--filter',
    `label=${LABEL}=${owner}`,
  ]);
  const ids = result.stdout.trim().split(/\s+/).filter(Boolean);
  if (ids.length > 1 || ids.some((id) => !/^[a-f0-9]{12,64}$/.test(id))) {
    throw new Error('Disposable Redis cleanup ownership is ambiguous.');
  }
  if (ids.length) await docker(['rm', '--force', '--volumes', ids[0]]);
}

async function withDisposableRedis({
  packages,
  run,
  env = process.env,
  platform = process.platform,
  docker = (args, timeout = 10_000) =>
    execute('docker', args, {
      timeout,
      maxBuffer: 1024 * 1024,
      env: Object.fromEntries(
        ['PATH', 'HOME', 'TMPDIR'].flatMap((key) =>
          env[key] === undefined ? [] : [[key, env[key]]]
        )
      ),
    }),
  sleep = delay,
  signals = process,
}) {
  if (!packages.includes('@tuturuuu/web')) return run(env);
  if (env.GITHUB_ACTIONS !== 'true') {
    return run(fixtureEnv(env, ownedLocalEndpoint(env)));
  }
  if (platform !== 'linux' || env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error(
      'Automatic Redis fixtures require an ephemeral GitHub-hosted Linux runner.'
    );
  }
  const owner = randomUUID();
  const name = `ttr-test-redis-${owner}`;
  const controller = new AbortController();
  const stop = () => controller.abort();
  let createAttempted = false;
  signals.on('SIGINT', stop);
  signals.on('SIGTERM', stop);
  try {
    // Pull once, by digest, only on the admitted ephemeral Linux runner.
    await docker(['pull', REDIS_IMAGE], 120_000);
    controller.signal.throwIfAborted();
    createAttempted = true;
    await docker(
      [
        'create',
        '--name',
        name,
        '--label',
        `${LABEL}=${owner}`,
        '--memory',
        '64m',
        '--memory-swap',
        '64m',
        '--cpus',
        '0.5',
        '--pids-limit',
        '64',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--read-only',
        '--user',
        '999:999',
        '--publish',
        '127.0.0.1::6379',
        REDIS_IMAGE,
        'redis-server',
        '--bind',
        '0.0.0.0',
        '--protected-mode',
        'no',
        '--save',
        '',
        '--appendonly',
        'no',
        '--maxmemory',
        '16mb',
        '--maxmemory-policy',
        'noeviction',
      ],
      30_000
    );
    controller.signal.throwIfAborted();
    await docker(['start', name]);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      controller.signal.throwIfAborted();
      try {
        const result = await docker(['exec', name, 'redis-cli', 'PING'], 1000);
        if (result.stdout.trim() === 'PONG') {
          ready = true;
          break;
        }
      } catch {
        /* A bounded readiness attempt may precede server startup. */
      }
      await sleep(200);
    }
    if (!ready)
      throw new Error('Disposable Redis readiness deadline exceeded.');
    const { stdout } = await docker(['port', name, '6379/tcp']);
    const match = /^127\.0\.0\.1:([1-9]\d*)$/.exec(stdout.trim());
    if (!match || Number(match[1]) > 65535)
      throw new Error('Redis published endpoint is not loopback.');
    controller.signal.throwIfAborted();
    return await run(
      fixtureEnv(env, { LIVE_MINT_TEST_REDIS_PORT: match[1] }),
      controller.signal
    );
  } finally {
    signals.off('SIGINT', stop);
    signals.off('SIGTERM', stop);
    // Wait for create/start to settle before reconciling an unknown command exit.
    // The random name plus ownership label fences every cleanup operation.
    if (createAttempted) await cleanupOwnedRedis(docker, name, owner);
  }
}

module.exports = { REDIS_IMAGE, withDisposableRedis };

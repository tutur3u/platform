const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LOCAL_E2E_AUTH_BYPASS,
  LOCAL_E2E_BASE_URL,
  LOCAL_E2E_PORTLESS_PORT,
  LOCAL_E2E_SUPERMEMORY_ENABLED,
  LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD,
  LOCAL_E2E_SUPABASE_URL,
} = require('./e2e-local-environment.js');
const {
  DNS_IPV4_FIRST_NODE_OPTION,
  DEFAULT_PORTLESS_HEALTH_URL,
  DEFAULT_PORTLESS_PROXY_TLS_MARKER,
  DEFAULT_E2E_COMPARE_REPORT_PATH,
  DEFAULT_TANSTACK_PORTLESS_BASE_URL,
  DEFAULT_TANSTACK_DIRECT_HOST_PORT,
  DEFAULT_REUSABLE_LOCAL_REDIS_REST_PROBE_URL,
  DEFAULT_REUSABLE_LOCAL_REDIS_REST_TOKEN,
  DEFAULT_REUSABLE_LOCAL_REDIS_REST_URL,
  DEFAULT_REUSABLE_WEB_IMAGE_COLOR,
  DEFAULT_REUSABLE_WEB_IMAGE_PROJECT,
  createE2ECompareReport,
  ensurePortlessRoute,
  ensureLocalE2EEnvFile,
  formatBlueGreenStages,
  getPortlessCommandEnv,
  getE2ECompareReportPath,
  getE2EPlaywrightJsonReportPath,
  getE2EPortlessRouteName,
  getE2EPortlessTargetPort,
  getDockerComposeDiagnosticArgs,
  getDockerMemoryLimit,
  getE2EComposeProjectName,
  getE2EDiagnosticLogTail,
  getDockerWebDownArgs,
  getDockerWebUpArgs,
  getPortlessHealthUrl,
  getPortlessProxyStartArgs,
  getTanStackDirectHostPort,
  getFrontendE2EEnv,
  getReadinessFetchOptions,
  getDockerImageRefCandidates,
  getReusableLocalRedisRuntime,
  getReusableWebImageProject,
  getReusableWebImageRef,
  getReusableWebImageSource,
  getReusableWebImageTargets,
  getE2EDockerNativeBuildValue,
  getReusableHiveImageRef,
  getReusableSupportImageRef,
  getReusableSupportImageSpecs,
  getPlaywrightJsonSummary,
  getFrontendE2EBaseUrl,
  getWebProxyHealthUrl,
  getWebProxyHostPort,
  isPortlessProxyConfigMismatchError,
  isPortlessProxyStartExitError,
  isPortlessNotReadyBody,
  isE2EComposeProjectName,
  isReusableLocalRedisResponse,
  isReusingLocalRedis,
  parseE2EProjectImageTags,
  parseE2EFrontendArgs,
  probeReusableLocalRedis,
  prepareReusableWebImage,
  prepareReusableSupportImages,
  printE2EFailureDiagnostics,
  readReusableWebImageColor,
  removeE2EProjectImages,
  removePortlessProxyTlsMarker,
  resolveReusableLocalRedisRuntime,
  resolveReusableWebImageSourceFromList,
  routeListHasPortlessAlias,
  shouldKeepStack,
  waitForUrl,
  withPlaywrightJsonReporterArgs,
  writeE2ECompareReport,
} = require('./run-web-e2e-docker.js');

test('getDockerWebUpArgs starts production blue-green Docker with reset local Supabase', () => {
  assert.deepEqual(getDockerWebUpArgs('tmp/e2e/web.env', {}), [
    'up',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    '--reset-supabase',
    '--build-memory',
    'auto',
    '--build-cpus',
    '4',
    '--build-max-parallelism',
    '1',
    '--env-file',
    'tmp/e2e/web.env',
  ]);
  assert.deepEqual(
    getDockerWebUpArgs('tmp/e2e/web.env', {
      E2E_DOCKER_BUILD_CPUS: '2',
      E2E_DOCKER_BUILD_MAX_PARALLELISM: '1',
      E2E_DOCKER_BUILD_MEMORY: '8g',
    }).slice(6, 12),
    [
      '--build-memory',
      '8g',
      '--build-cpus',
      '2',
      '--build-max-parallelism',
      '1',
    ]
  );
});

test('getDockerWebUpArgs reuses a detected local Redis bridge', () => {
  assert.deepEqual(
    getDockerWebUpArgs('tmp/e2e/web.env', {
      E2E_REUSED_LOCAL_REDIS: '1',
    }),
    [
      'up',
      '--mode',
      'prod',
      '--strategy',
      'blue-green',
      '--reset-supabase',
      '--without-redis',
      '--build-memory',
      'auto',
      '--build-cpus',
      '4',
      '--build-max-parallelism',
      '1',
      '--env-file',
      'tmp/e2e/web.env',
    ]
  );
});

test('getE2EDockerNativeBuildValue defaults E2E to host-built web artifacts', () => {
  assert.equal(getE2EDockerNativeBuildValue({}), '1');
  assert.equal(
    getE2EDockerNativeBuildValue({ DOCKER_WEB_NATIVE_BUILD: '0' }),
    '0'
  );
  assert.equal(
    getE2EDockerNativeBuildValue({
      DOCKER_WEB_NATIVE_BUILD: '0',
      E2E_DOCKER_NATIVE_BUILD: '1',
    }),
    '1'
  );
});

test('getDockerWebDownArgs stops the same production blue-green Docker stack', () => {
  assert.deepEqual(getDockerWebDownArgs('tmp/e2e/web.env'), [
    'down',
    '--mode',
    'prod',
    '--strategy',
    'blue-green',
    '--env-file',
    'tmp/e2e/web.env',
    '--volumes',
    '--rmi',
    'local',
  ]);
  assert.deepEqual(
    getDockerWebDownArgs('tmp/e2e/web.env', {
      DOCKER_WEB_REUSED_WEB_IMAGE_SOURCE: 'tuturuuu-web-blue',
    }),
    [
      'down',
      '--mode',
      'prod',
      '--strategy',
      'blue-green',
      '--env-file',
      'tmp/e2e/web.env',
      '--volumes',
    ]
  );
  assert.deepEqual(
    getDockerWebDownArgs('tmp/e2e/web.env', {
      E2E_REUSED_LOCAL_REDIS: 'true',
    }),
    [
      'down',
      '--mode',
      'prod',
      '--strategy',
      'blue-green',
      '--without-redis',
      '--env-file',
      'tmp/e2e/web.env',
      '--volumes',
      '--rmi',
      'local',
    ]
  );
  assert.deepEqual(
    getDockerWebDownArgs('tmp/e2e/web.env', {}, { preserveImages: true }),
    [
      'down',
      '--mode',
      'prod',
      '--strategy',
      'blue-green',
      '--env-file',
      'tmp/e2e/web.env',
      '--volumes',
    ]
  );
});

test('ensureLocalE2EEnvFile writes a local-only web env file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttr-e2e-env-'));
  const envFilePath = path.join(tempDir, 'web.env');

  try {
    ensureLocalE2EEnvFile(envFilePath);
    const content = fs.readFileSync(envFilePath, 'utf8');

    assert.match(content, new RegExp(`BASE_URL=${LOCAL_E2E_BASE_URL}`));
    assert.match(
      content,
      new RegExp(`NEXT_PUBLIC_APP_URL=${LOCAL_E2E_BASE_URL}`)
    );
    assert.match(
      content,
      new RegExp(`NEXT_PUBLIC_WEB_APP_URL=${LOCAL_E2E_BASE_URL}`)
    );
    assert.match(
      content,
      new RegExp(`NEXT_PUBLIC_SUPABASE_URL=${LOCAL_E2E_SUPABASE_URL}`)
    );
    assert.match(
      content,
      new RegExp(`TUTURUUU_LOCAL_E2E_AUTH_BYPASS=${LOCAL_E2E_AUTH_BYPASS}`)
    );
    assert.match(
      content,
      new RegExp(`DOCKER_SUPERMEMORY_ENABLED=${LOCAL_E2E_SUPERMEMORY_ENABLED}`)
    );
    assert.match(
      content,
      new RegExp(`SUPERMEMORY_ENABLED=${LOCAL_E2E_SUPERMEMORY_ENABLED}`)
    );
    assert.match(content, new RegExp(LOCAL_E2E_SUPERMEMORY_POSTGRES_PASSWORD));
    assert.match(content, new RegExp(`WEB_APP_URL=${LOCAL_E2E_BASE_URL}`));
    assert.match(
      content,
      new RegExp(`PORTLESS_PORT=${LOCAL_E2E_PORTLESS_PORT}`)
    );
    assert.doesNotMatch(content, /supabase\.(co|in)/iu);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('ensureLocalE2EEnvFile writes reusable Redis overrides', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttr-e2e-env-'));
  const envFilePath = path.join(tempDir, 'web.env');

  try {
    ensureLocalE2EEnvFile(envFilePath, {
      DOCKER_UPSTASH_REDIS_REST_TOKEN: 'reuse-token',
      DOCKER_UPSTASH_REDIS_REST_URL: 'http://host.docker.internal:8079',
      UPSTASH_REDIS_REST_TOKEN: 'reuse-token',
      UPSTASH_REDIS_REST_URL: 'http://host.docker.internal:8079',
    });
    const content = fs.readFileSync(envFilePath, 'utf8');

    assert.match(content, /DOCKER_UPSTASH_REDIS_REST_TOKEN=reuse-token/u);
    assert.match(
      content,
      /DOCKER_UPSTASH_REDIS_REST_URL=http:\/\/host\.docker\.internal:8079/u
    );
    assert.match(content, /UPSTASH_REDIS_REST_TOKEN=reuse-token/u);
    assert.match(
      content,
      /UPSTASH_REDIS_REST_URL=http:\/\/host\.docker\.internal:8079/u
    );
    assert.doesNotMatch(content, /serverless-redis-http/u);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('shouldKeepStack supports explicit local debugging opt-in', () => {
  assert.equal(shouldKeepStack({}), false);
  assert.equal(shouldKeepStack({ E2E_KEEP_DOCKER_STACK: '1' }), true);
  assert.equal(shouldKeepStack({ E2E_KEEP_DOCKER_STACK: 'true' }), true);
  assert.equal(shouldKeepStack({ E2E_KEEP_DOCKER_STACK: 'on' }), true);
  assert.equal(shouldKeepStack({ E2E_KEEP_DOCKER_STACK: 'false' }), false);
});

test('getReusableLocalRedisRuntime defaults to the local Redis app bridge', () => {
  assert.equal(isReusingLocalRedis({}), false);
  assert.equal(isReusingLocalRedis({ E2E_REUSED_LOCAL_REDIS: '1' }), true);
  assert.deepEqual(getReusableLocalRedisRuntime({}), {
    probeUrl: DEFAULT_REUSABLE_LOCAL_REDIS_REST_PROBE_URL,
    token: DEFAULT_REUSABLE_LOCAL_REDIS_REST_TOKEN,
    url: DEFAULT_REUSABLE_LOCAL_REDIS_REST_URL,
  });
  assert.deepEqual(
    getReusableLocalRedisRuntime({
      DOCKER_UPSTASH_REDIS_REST_TOKEN: 'docker-token',
      DOCKER_UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
      E2E_REUSE_LOCAL_REDIS_REST_PROBE_URL: 'http://127.0.0.1:18079/',
      E2E_REUSE_LOCAL_REDIS_REST_TOKEN: 'local-token',
      E2E_REUSE_LOCAL_REDIS_REST_URL: 'http://host.docker.internal:18079',
    }),
    {
      probeUrl: 'http://127.0.0.1:18079/',
      token: 'local-token',
      url: 'http://host.docker.internal:18079',
    }
  );
});

test('resolveReusableLocalRedisRuntime reuses a reachable local bridge', async () => {
  const chunks = [];
  const runtime = await resolveReusableLocalRedisRuntime({
    env: {},
    fetchImpl: async (url, options = {}) => {
      assert.equal(url, DEFAULT_REUSABLE_LOCAL_REDIS_REST_PROBE_URL);
      assert.equal(options.redirect, 'manual');

      return {
        status: 200,
        text: async () => '"Welcome to Serverless Redis HTTP!"',
      };
    },
    output: {
      write(chunk) {
        chunks.push(String(chunk));
      },
    },
  });

  assert.deepEqual(runtime, getReusableLocalRedisRuntime({}));
  assert.equal(
    isReusableLocalRedisResponse(
      { status: 404 },
      '{"error":"SRH: Endpoint not found."}'
    ),
    true
  );
  assert.equal(
    await probeReusableLocalRedis(getReusableLocalRedisRuntime({}), {
      fetchImpl: async () => ({
        status: 200,
        text: async () => '"Welcome to Serverless Redis HTTP!"',
      }),
    }),
    true
  );
  assert.match(chunks.join(''), /Reusing local Redis HTTP bridge/u);
});

test('resolveReusableLocalRedisRuntime preserves bundled Redis fallback by default', async () => {
  assert.equal(
    await resolveReusableLocalRedisRuntime({
      env: {},
      fetchImpl: async () => {
        throw new Error('connection refused');
      },
      output: {
        write() {},
      },
    }),
    null
  );
  assert.equal(
    await resolveReusableLocalRedisRuntime({
      env: { E2E_REUSE_LOCAL_REDIS: 'false' },
      fetchImpl: async () => {
        throw new Error('should not probe');
      },
      output: {
        write() {},
      },
    }),
    null
  );

  await assert.rejects(
    () =>
      resolveReusableLocalRedisRuntime({
        env: { E2E_REUSE_LOCAL_REDIS: 'true' },
        fetchImpl: async () => ({
          status: 200,
          text: async () => '<html>different service</html>',
        }),
        output: {
          write() {},
        },
      }),
    /Expected a Serverless Redis HTTP bridge/u
  );
});

test('getReusableWebImageSource defaults to the active serve:web:docker:bg lane', () => {
  const fsImpl = {
    existsSync: () => true,
    readFileSync: () => 'green\n',
  };

  assert.equal(
    getReusableWebImageProject({}),
    DEFAULT_REUSABLE_WEB_IMAGE_PROJECT
  );
  assert.equal(
    getReusableWebImageProject({
      E2E_DOCKER_REUSE_WEB_IMAGE_PROJECT: 'platform-prod',
    }),
    'platform-prod'
  );
  assert.equal(readReusableWebImageColor({ env: {}, fsImpl }), 'green');
  assert.equal(
    getReusableWebImageSource(
      {
        E2E_DOCKER_REUSE_WEB_IMAGE: '1',
        E2E_DOCKER_REUSE_WEB_IMAGE_PROJECT: 'platform-prod',
      },
      { fsImpl }
    ),
    'platform-prod-web-green'
  );
});

test('getReusableWebImageSource supports explicit source and color overrides', () => {
  assert.equal(getReusableWebImageSource({}), null);
  assert.equal(
    getReusableWebImageSource({ E2E_DOCKER_REUSE_WEB_IMAGE: 'false' }),
    null
  );
  assert.equal(
    getReusableWebImageSource({
      E2E_DOCKER_REUSE_WEB_IMAGE: 'registry.local/web:debug',
    }),
    'registry.local/web:debug'
  );
  assert.equal(
    getReusableWebImageSource({
      E2E_DOCKER_REUSE_WEB_IMAGE: '1',
      E2E_DOCKER_REUSE_WEB_IMAGE_COLOR: 'blue',
      E2E_DOCKER_REUSE_WEB_IMAGE_SOURCE: 'tuturuuu-web-custom:latest',
    }),
    'tuturuuu-web-custom:latest'
  );
  assert.equal(
    readReusableWebImageColor({
      env: { E2E_DOCKER_REUSE_WEB_IMAGE_COLOR: 'green' },
    }),
    'green'
  );
  assert.equal(
    readReusableWebImageColor({
      activeColorFile: '/tmp/missing-active-color',
      env: { E2E_DOCKER_REUSE_WEB_IMAGE_COLOR: 'auto' },
      fsImpl: {
        existsSync: () => false,
      },
    }),
    DEFAULT_REUSABLE_WEB_IMAGE_COLOR
  );
  assert.throws(
    () =>
      readReusableWebImageColor({
        env: { E2E_DOCKER_REUSE_WEB_IMAGE_COLOR: 'purple' },
      }),
    /must be "blue", "green", or "auto"/u
  );
});

test('prepareReusableWebImage retags the source image for both E2E lanes', async () => {
  const calls = [];
  const chunks = [];
  const output = {
    write(chunk) {
      chunks.push(String(chunk));
    },
  };
  const env = {
    E2E_DOCKER_REUSE_WEB_IMAGE_SOURCE: 'tuturuuu-web-blue',
    PATH: 'test-path',
  };

  assert.deepEqual(getReusableWebImageTargets('ttr-e2e-local-123'), [
    'ttr-e2e-local-123-web-blue',
    'ttr-e2e-local-123-web-green',
  ]);
  assert.equal(getReusableWebImageRef('tuturuuu', 'blue'), 'tuturuuu-web-blue');

  await prepareReusableWebImage({
    env,
    output,
    projectName: 'ttr-e2e-local-123',
    runCommand: async (command, args, options = {}) => {
      calls.push({ args, command, env: options.env });
    },
    runCommandForOutput: async (command, args, options = {}) => {
      calls.push({ args, command, env: options.env });
      return { stderr: '', stdout: '[]\n' };
    },
  });

  assert.deepEqual(
    calls.map(({ command, args }) => [command, args]),
    [
      ['docker', ['image', 'inspect', 'tuturuuu-web-blue']],
      ['docker', ['tag', 'tuturuuu-web-blue', 'ttr-e2e-local-123-web-blue']],
      ['docker', ['tag', 'tuturuuu-web-blue', 'ttr-e2e-local-123-web-green']],
    ]
  );
  assert.ok(calls.every((call) => call.env === env));
  assert.match(
    chunks.join(''),
    /Reusing Docker web image tuturuuu-web-blue as ttr-e2e-local-123-web-blue, ttr-e2e-local-123-web-green/u
  );
});

test('prepareReusableWebImage resolves source tags through docker image ls fallback', async () => {
  const calls = [];

  assert.deepEqual(getDockerImageRefCandidates('tuturuuu-web-blue'), [
    'tuturuuu-web-blue',
    'tuturuuu-web-blue:latest',
  ]);
  assert.deepEqual(getDockerImageRefCandidates('registry:5000/web'), [
    'registry:5000/web',
    'registry:5000/web:latest',
  ]);
  assert.deepEqual(getDockerImageRefCandidates('repo/web:debug'), [
    'repo/web:debug',
  ]);
  assert.equal(
    resolveReusableWebImageSourceFromList(
      'tuturuuu-web-blue',
      'tuturuuu-web-blue:latest sha256:source-id\n'
    ),
    'sha256:source-id'
  );

  const result = await prepareReusableWebImage({
    env: {
      E2E_DOCKER_REUSE_WEB_IMAGE_SOURCE: 'tuturuuu-web-blue',
      PATH: 'test-path',
    },
    output: {
      write() {},
    },
    projectName: 'ttr-e2e-local-456',
    runCommand: async (command, args) => {
      calls.push({ args, command });
    },
    runCommandForOutput: async (command, args) => {
      calls.push({ args, command });

      if (args[0] === 'image' && args[1] === 'inspect') {
        if (args[2] === 'tuturuuu-web-blue') {
          throw new Error('No such image: tuturuuu-web-blue');
        }

        return { stderr: '', stdout: '[]\n' };
      }

      return {
        stderr: '',
        stdout: 'tuturuuu-web-blue:latest sha256:source-id\n',
      };
    },
  });

  assert.equal(result.sourceRef, 'sha256:source-id');
  assert.deepEqual(
    calls.map(({ command, args }) => [command, args]),
    [
      ['docker', ['image', 'inspect', 'tuturuuu-web-blue']],
      [
        'docker',
        ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}} {{.ID}}'],
      ],
      ['docker', ['image', 'inspect', 'sha256:source-id']],
      ['docker', ['tag', 'sha256:source-id', 'ttr-e2e-local-456-web-blue']],
      ['docker', ['tag', 'sha256:source-id', 'ttr-e2e-local-456-web-green']],
    ]
  );
});

test('prepareReusableSupportImages retags a complete blue-green support image set', async () => {
  const calls = [];
  const chunks = [];
  const output = {
    write(chunk) {
      chunks.push(String(chunk));
    },
  };
  const env = {
    E2E_DOCKER_REUSE_WEB_IMAGE: '1',
    E2E_DOCKER_REUSE_WEB_IMAGE_COLOR: 'blue',
    E2E_DOCKER_REUSE_WEB_IMAGE_PROJECT: 'tuturuuu',
    PATH: 'test-path',
  };
  const specs = getReusableSupportImageSpecs({
    sourceColor: 'blue',
    sourceProject: 'tuturuuu',
    targetProject: 'ttr-e2e-local-789',
  });

  assert.equal(
    getReusableHiveImageRef('tuturuuu', 'blue'),
    'tuturuuu-hive-blue'
  );
  assert.equal(
    getReusableSupportImageRef('tuturuuu', 'backend'),
    'tuturuuu-backend'
  );
  assert.deepEqual(specs[0], {
    source: 'tuturuuu-hive-blue',
    targets: ['ttr-e2e-local-789-hive-blue', 'ttr-e2e-local-789-hive-green'],
  });

  const result = await prepareReusableSupportImages({
    env,
    output,
    projectName: 'ttr-e2e-local-789',
    runCommand: async (command, args, options = {}) => {
      calls.push({ args, command, env: options.env });
    },
    runCommandForOutput: async (command, args, options = {}) => {
      calls.push({ args, command, env: options.env });
      return { stderr: '', stdout: '[]\n' };
    },
  });

  assert.equal(result.complete, true);
  assert.deepEqual(result.missing, []);
  assert.ok(calls.every((call) => call.env === env));
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === 'docker' &&
        args.join(' ') === 'tag tuturuuu-hive-blue ttr-e2e-local-789-hive-green'
    )
  );
  assert.ok(
    calls.some(
      ({ command, args }) =>
        command === 'docker' &&
        args.join(' ') ===
          'tag tuturuuu-web-cron-runner ttr-e2e-local-789-web-cron-runner'
    )
  );
  assert.match(
    chunks.join(''),
    /Reusing Docker support images from tuturuuu blue as/u
  );
});

test('prepareReusableSupportImages falls back when the support image set is incomplete', async () => {
  const calls = [];
  const chunks = [];
  const output = {
    write(chunk) {
      chunks.push(String(chunk));
    },
  };
  const env = {
    E2E_DOCKER_REUSE_WEB_IMAGE: '1',
    E2E_DOCKER_REUSE_WEB_IMAGE_COLOR: 'blue',
    E2E_DOCKER_REUSE_WEB_IMAGE_PROJECT: 'tuturuuu',
    PATH: 'test-path',
  };

  const result = await prepareReusableSupportImages({
    env,
    output,
    projectName: 'ttr-e2e-local-987',
    runCommand: async (command, args, options = {}) => {
      calls.push({ args, command, env: options.env });
    },
    runCommandForOutput: async (command, args, options = {}) => {
      calls.push({ args, command, env: options.env });

      if (args[0] === 'image' && args[1] === 'inspect') {
        if (args[2] === 'tuturuuu-supermemory') {
          throw new Error('No such image: tuturuuu-supermemory');
        }

        return { stderr: '', stdout: '[]\n' };
      }

      return {
        stderr: '',
        stdout: 'tuturuuu-backend:latest sha256:backend\n',
      };
    },
  });

  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ['tuturuuu-supermemory']);
  assert.ok(
    calls.every(
      ({ args }) =>
        args.join(' ') !==
        'tag tuturuuu-supermemory ttr-e2e-local-987-supermemory'
    )
  );
  assert.match(chunks.join(''), /Support services will be built normally/u);
});

test('getDockerMemoryLimit reads Docker Desktop memory when available', async () => {
  assert.equal(
    await getDockerMemoryLimit({
      env: { PATH: 'test-path' },
      runCommandForOutput: async () => ({
        stderr: '',
        stdout: `${9364279296}\n`,
      }),
    }),
    '9364279296'
  );
  assert.equal(
    await getDockerMemoryLimit({
      env: { PATH: 'test-path' },
      runCommandForOutput: async () => {
        throw new Error('docker unavailable');
      },
    }),
    null
  );
});

test('getE2EComposeProjectName only accepts E2E-scoped projects', () => {
  assert.equal(isE2EComposeProjectName('ttr-e2e-local-123'), true);
  assert.equal(isE2EComposeProjectName('tuturuuu'), false);
  assert.equal(
    getE2EComposeProjectName({
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'ttr-e2e-local-123',
    }),
    'ttr-e2e-local-123'
  );
  assert.equal(
    getE2EComposeProjectName({
      DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu',
    }),
    null
  );
});

test('getDockerComposeDiagnosticArgs scopes diagnostics to the E2E project', () => {
  assert.deepEqual(
    getDockerComposeDiagnosticArgs(
      {
        DOCKER_WEB_COMPOSE_PROJECT_NAME: 'ttr-e2e-local-123',
        DOCKER_WEB_ENV_FILE: 'tmp/e2e/web.env',
      },
      'ps',
      '-a'
    ),
    [
      'compose',
      '--env-file',
      'tmp/e2e/web.env',
      '-f',
      path.join(path.resolve(__dirname, '..'), 'docker-compose.web.prod.yml'),
      '-p',
      'ttr-e2e-local-123',
      'ps',
      '-a',
    ]
  );
  assert.deepEqual(getDockerComposeDiagnosticArgs({}, 'ps', '-a'), [
    'compose',
    '-f',
    path.join(path.resolve(__dirname, '..'), 'docker-compose.web.prod.yml'),
    'ps',
    '-a',
  ]);
});

test('getPortlessHealthUrl targets the browser-facing local E2E login route', () => {
  assert.equal(getPortlessHealthUrl({}), DEFAULT_PORTLESS_HEALTH_URL);
  assert.equal(
    getPortlessHealthUrl({
      BASE_URL: 'https://tuturuuu.localhost/personal/tasks?view=board',
    }),
    'https://tuturuuu.localhost/login'
  );
  assert.equal(
    getPortlessHealthUrl({
      BASE_URL: DEFAULT_TANSTACK_PORTLESS_BASE_URL,
      E2E_PORTLESS_HEALTH_PATH: '/',
    }),
    `${DEFAULT_TANSTACK_PORTLESS_BASE_URL}/`
  );
});

test('parseE2EFrontendArgs strips frontend flags before Playwright runs', () => {
  assert.deepEqual(
    parseE2EFrontendArgs(['--frontend', 'tanstack', '--project', 'chromium']),
    {
      frontend: 'tanstack',
      playwrightArgs: ['--project', 'chromium'],
    }
  );
  assert.deepEqual(
    parseE2EFrontendArgs(['--frontend=compare', 'auth.spec.ts']),
    {
      frontend: 'compare',
      playwrightArgs: ['auth.spec.ts'],
    }
  );
});

test('withPlaywrightJsonReporterArgs forces JSON reporter evidence for compare mode', () => {
  assert.deepEqual(
    withPlaywrightJsonReporterArgs([
      '--project',
      'chromium',
      '--reporter',
      'line',
      'auth.spec.ts',
    ]),
    ['--project', 'chromium', 'auth.spec.ts', '--reporter=json']
  );
  assert.deepEqual(withPlaywrightJsonReporterArgs(['--reporter=html']), [
    '--reporter=json',
  ]);
});

test('getPlaywrightJsonSummary extracts executed test counts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-json-'));
  const reportPath = path.join(tempDir, 'report.json');

  try {
    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        stats: {
          expected: 7,
          flaky: 1,
          skipped: 2,
          unexpected: 1,
        },
      })
    );

    assert.deepEqual(getPlaywrightJsonSummary(reportPath), {
      executedCount: 9,
      failedCount: 1,
      flakyCount: 1,
      passedCount: 7,
      skippedCount: 2,
      testCount: 11,
    });
    assert.match(
      getE2EPlaywrightJsonReportPath('tanstack', {
        E2E_PLAYWRIGHT_JSON_REPORT_DIR: tempDir,
      }),
      /tanstack-report\.json$/u
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('createE2ECompareReport summarizes next and TanStack results', () => {
  const report = createE2ECompareReport(
    {
      next: {
        durationMs: 1000,
        executedCount: 4,
        failedCount: 0,
        flakyCount: 0,
        origin: 'https://tuturuuu.localhost',
        passed: true,
        passedCount: 4,
        playwright: {
          reporter: 'json',
          reportPath: 'tmp/e2e/web-migration/playwright-json/next-report.json',
        },
        skippedCount: 1,
        status: 'passed',
        testCount: 5,
      },
      tanstack: {
        durationMs: 1200,
        executedCount: 4,
        failedCount: 0,
        flakyCount: 0,
        passed: true,
        passedCount: 4,
        skippedCount: 0,
        status: 'passed',
        testCount: 4,
      },
    },
    new Date('2026-06-20T00:00:00.000Z')
  );

  assert.deepEqual(report, {
    frontend: 'compare',
    frontends: {
      next: {
        durationMs: 1000,
        executedCount: 4,
        failedCount: 0,
        flakyCount: 0,
        origin: 'https://tuturuuu.localhost',
        passed: true,
        passRate: 1,
        passedCount: 4,
        playwright: {
          reporter: 'json',
          reportPath: 'tmp/e2e/web-migration/playwright-json/next-report.json',
        },
        skippedCount: 1,
        status: 'passed',
        testCount: 5,
        wallMs: 1000,
      },
      tanstack: {
        durationMs: 1200,
        executedCount: 4,
        failedCount: 0,
        flakyCount: 0,
        origin: null,
        passed: true,
        passRate: 1,
        passedCount: 4,
        skippedCount: 0,
        status: 'passed',
        testCount: 4,
        wallMs: 1200,
      },
    },
    generatedAt: '2026-06-20T00:00:00.000Z',
    origins: {
      next: 'https://tuturuuu.localhost',
      tanstack: null,
    },
    passed: true,
    status: 'passed',
  });
  assert.deepEqual(
    createE2ECompareReport({
      next: { durationMs: 1000, passed: true, status: 'passed' },
      tanstack: {
        durationMs: 1200,
        passed: true,
        passRate: 0.95,
        status: 'passed',
        wallMs: 1300,
      },
    }).frontends.tanstack,
    {
      durationMs: 1200,
      origin: null,
      passed: true,
      passRate: 0.95,
      status: 'passed',
      wallMs: 1300,
    }
  );
  assert.equal(
    createE2ECompareReport({
      next: { passed: true, status: 'passed' },
      tanstack: { error: 'failed', passed: false, status: 'failed' },
    }).status,
    'failed'
  );
});

test('writeE2ECompareReport writes ignored cutover evidence under tmp by default', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-report-'));
  const reportPath = path.join(tempDir, 'tmp', 'e2e', 'compare-report.json');
  const unsafeReportPath = path.join(
    tempDir,
    'apps',
    'web',
    'compare-report.json'
  );
  const chunks = [];

  try {
    assert.equal(
      getE2ECompareReportPath({
        E2E_COMPARE_REPORT_PATH: reportPath,
      }),
      reportPath
    );
    assert.equal(
      DEFAULT_E2E_COMPARE_REPORT_PATH.endsWith(
        path.join('tmp', 'e2e', 'web-migration', 'compare-report.json')
      ),
      true
    );

    writeE2ECompareReport({
      output: {
        write(chunk) {
          chunks.push(String(chunk));
        },
      },
      report: { frontend: 'compare', passed: true, status: 'passed' },
      reportPath,
      rootDir: tempDir,
    });

    assert.deepEqual(JSON.parse(fs.readFileSync(reportPath, 'utf8')), {
      frontend: 'compare',
      passed: true,
      status: 'passed',
    });
    assert.match(chunks.join(''), /Docker E2E compare report/u);
    assert.throws(
      () =>
        writeE2ECompareReport({
          output: {
            write() {},
          },
          report: { frontend: 'compare', passed: true, status: 'passed' },
          reportPath: unsafeReportPath,
          rootDir: tempDir,
        }),
      /Docker E2E compare reports must be written under tmp/u
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('getFrontendE2EEnv points TanStack runs at the TanStack route', () => {
  const env = getFrontendE2EEnv('tanstack', {});

  assert.equal(getFrontendE2EBaseUrl('next', {}), LOCAL_E2E_BASE_URL);
  assert.equal(
    getFrontendE2EBaseUrl('next', {
      BASE_URL: 'https://custom.localhost/path',
    }),
    'https://custom.localhost/path'
  );
  assert.equal(env.BASE_URL, DEFAULT_TANSTACK_PORTLESS_BASE_URL);
  assert.equal(env.DOCKER_WEB_FRONTEND, 'tanstack');
  assert.equal(env.E2E_PORTLESS_HEALTH_PATH, '/');
  assert.equal(getE2EPortlessRouteName(env), 'tanstack.tuturuuu');
  assert.equal(getE2EPortlessTargetPort(env), getWebProxyHostPort(env));
  assert.equal(getFrontendE2EEnv('next', {}).BASE_URL, LOCAL_E2E_BASE_URL);
  assert.equal(getFrontendE2EEnv('next', {}).DOCKER_WEB_FRONTEND, 'next');
});

test('getE2EPortlessTargetPort routes Docker TanStack frontend through web proxy', () => {
  assert.equal(getE2EPortlessTargetPort({}), '7803');
  assert.equal(
    getTanStackDirectHostPort({}),
    DEFAULT_TANSTACK_DIRECT_HOST_PORT
  );
  assert.equal(
    getE2EPortlessTargetPort(getFrontendE2EEnv('tanstack', {})),
    '7803'
  );
  assert.equal(
    getE2EPortlessTargetPort({
      PORTLESS_ROUTE_NAME: 'tanstack.tuturuuu',
    }),
    '7824'
  );
  assert.equal(
    getE2EPortlessTargetPort({
      DOCKER_TANSTACK_WEB_DIRECT_HOST_PORT: '17824',
      PORTLESS_ROUTE_NAME: 'tanstack.tuturuuu',
    }),
    '17824'
  );
  assert.throws(
    () =>
      getE2EPortlessTargetPort({
        DOCKER_TANSTACK_WEB_DIRECT_HOST_PORT: '7803',
        PORTLESS_ROUTE_NAME: 'tanstack.tuturuuu',
      }),
    /Refusing to alias the TanStack Portless route to the Next web proxy port 7803/u
  );
  assert.equal(
    getE2EPortlessTargetPort({
      DOCKER_TANSTACK_WEB_DIRECT_HOST_PORT: '7803',
      DOCKER_WEB_FRONTEND: 'tanstack',
      E2E_ALLOW_TANSTACK_WEB_PROXY_PORT: '1',
      PORTLESS_ROUTE_NAME: 'tanstack.tuturuuu',
    }),
    '7803'
  );
});

test('getWebProxyHealthUrl targets the direct Docker web proxy readiness route', () => {
  assert.equal(getWebProxyHostPort({}), '7803');
  assert.equal(
    getWebProxyHostPort({ DOCKER_WEB_PROXY_HOST_PORT: '17803' }),
    '17803'
  );
  assert.equal(
    getWebProxyHostPort({ DOCKER_WEB_PROXY_HOST_PORT: 'not-a-port' }),
    '7803'
  );
  assert.equal(getWebProxyHealthUrl({}), 'http://127.0.0.1:7803/login');
  assert.equal(
    getWebProxyHealthUrl({
      DOCKER_WEB_PROXY_HOST_PORT: '17803',
    }),
    'http://127.0.0.1:17803/login'
  );
  assert.equal(
    getWebProxyHealthUrl({
      DOCKER_WEB_FRONTEND: 'tanstack',
    }),
    'http://127.0.0.1:7803/'
  );
  assert.equal(
    getWebProxyHealthUrl({
      DOCKER_WEB_FRONTEND: 'tanstack',
      DOCKER_WEB_PROXY_HOST_PORT: '17803',
    }),
    'http://127.0.0.1:17803/'
  );
  assert.equal(
    getWebProxyHealthUrl({
      E2E_WEB_PROXY_HEALTH_URL: 'http://docker-host.localhost/ready',
    }),
    'http://docker-host.localhost/ready'
  );
});

test('getPortlessProxyStartArgs pins the wildcard proxy to the configured port', () => {
  assert.deepEqual(getPortlessProxyStartArgs({}), [
    'portless',
    'proxy',
    'start',
    '--wildcard',
  ]);
  assert.deepEqual(getPortlessProxyStartArgs({ PORTLESS_PORT: '1355' }), [
    'portless',
    'proxy',
    'start',
    '--wildcard',
    '--port',
    '1355',
    '--https',
  ]);
  assert.deepEqual(getPortlessProxyStartArgs({ PORTLESS_PORT: 'nope' }), [
    'portless',
    'proxy',
    'start',
    '--wildcard',
  ]);
});

test('getPortlessCommandEnv makes Portless prefer IPv4 localhost resolution', () => {
  assert.equal(
    getPortlessCommandEnv({ PATH: 'test-path' }).NODE_OPTIONS,
    DNS_IPV4_FIRST_NODE_OPTION
  );
  assert.equal(
    getPortlessCommandEnv({
      NODE_OPTIONS: '--trace-warnings',
      PATH: 'test-path',
    }).NODE_OPTIONS,
    `--trace-warnings ${DNS_IPV4_FIRST_NODE_OPTION}`
  );

  const env = {
    NODE_OPTIONS: `--trace-warnings ${DNS_IPV4_FIRST_NODE_OPTION}`,
    PATH: 'test-path',
  };

  assert.equal(getPortlessCommandEnv(env), env);
});

test('removePortlessProxyTlsMarker clears stale local proxy markers', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttr-portless-'));
  const markerPath = path.join(tempDir, 'proxy.tls');
  const chunks = [];

  try {
    fs.writeFileSync(markerPath, '1');

    assert.ok(DEFAULT_PORTLESS_PROXY_TLS_MARKER.endsWith('proxy.tls'));
    assert.equal(
      removePortlessProxyTlsMarker({
        markerPath,
        output: {
          write(chunk) {
            chunks.push(String(chunk));
          },
        },
      }),
      true
    );
    assert.equal(fs.existsSync(markerPath), false);
    assert.match(chunks.join(''), /Removed stale Portless TLS marker/u);
    assert.equal(
      removePortlessProxyTlsMarker({
        markerPath,
        output: {
          write() {},
        },
      }),
      false
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('isPortlessProxyConfigMismatchError detects recoverable proxy config conflicts', () => {
  assert.equal(
    isPortlessProxyConfigMismatchError(
      new Error(
        'Proxy is already running on port 1355 with a different config.\nrequested HTTPS, but the running proxy is using HTTP'
      )
    ),
    true
  );
  assert.equal(
    isPortlessProxyConfigMismatchError(new Error('portless failed')),
    false
  );
});

test('isPortlessProxyStartExitError detects spawned proxy start exits', () => {
  const proxyStartArgs = [
    'portless',
    'proxy',
    'start',
    '--wildcard',
    '--port',
    '1355',
    '--https',
  ];

  assert.equal(
    isPortlessProxyStartExitError(
      new Error(
        'bunx portless proxy start --wildcard --port 1355 --https exited with 1'
      ),
      proxyStartArgs
    ),
    true
  );
  assert.equal(
    isPortlessProxyStartExitError(
      new Error('bunx portless alias tuturuuu 7803 --force exited with 1'),
      proxyStartArgs
    ),
    false
  );
});

test('routeListHasPortlessAlias requires the expected alias and proxy port', () => {
  assert.equal(
    routeListHasPortlessAlias(
      'Active routes:\n  https://tuturuuu.localhost -> localhost:7803 (alias)\n',
      {}
    ),
    true
  );
  assert.equal(
    routeListHasPortlessAlias(
      'Active routes:\n  https://tuturuuu.localhost -> localhost:17803 (alias)\n',
      {}
    ),
    false
  );
  assert.equal(
    routeListHasPortlessAlias(
      'Active routes:\n  https://other.localhost -> localhost:7803 (alias)\n',
      {}
    ),
    false
  );
  assert.equal(
    routeListHasPortlessAlias(
      'Active routes:\n  https://tuturuuu.localhost -> localhost:17803 (alias)\n',
      { DOCKER_WEB_PROXY_HOST_PORT: '17803' }
    ),
    true
  );
  assert.equal(
    routeListHasPortlessAlias(
      'Active routes:\n  https://tanstack.tuturuuu.localhost -> localhost:7824 (alias)\n',
      getFrontendE2EEnv('tanstack', {})
    ),
    false
  );
  assert.equal(
    routeListHasPortlessAlias(
      'Active routes:\n  https://tanstack.tuturuuu.localhost -> localhost:7803 (alias)\n',
      getFrontendE2EEnv('tanstack', {})
    ),
    true
  );
});

test('isPortlessNotReadyBody detects Portless placeholder responses', () => {
  assert.equal(
    isPortlessNotReadyBody(
      'No app registered for <strong>tuturuuu.localhost</strong>. No apps running.'
    ),
    true
  );
  assert.equal(isPortlessNotReadyBody('<html>Login</html>'), false);
});

test('waitForUrl keeps retrying while Portless has no registered app', async () => {
  const statuses = [];

  await waitForUrl('https://tuturuuu.localhost/login', {
    acceptedStatusCodes: [404],
    fetchImpl: async () => {
      statuses.push(statuses.length === 0 ? 404 : 200);

      return {
        status: statuses.at(-1),
        text: async () =>
          statuses.length === 1
            ? 'No app registered for <strong>tuturuuu.localhost</strong>. No apps running.'
            : '<html>Login</html>',
      };
    },
    intervalMs: 0,
    sleep: async () => {},
    timeoutMs: 5_000,
  });

  assert.deepEqual(statuses, [404, 200]);
});

test('waitForUrl accepts configured app-level readiness statuses', async () => {
  const statuses = [];

  await waitForUrl('https://tuturuuu.localhost/login', {
    acceptedStatusCodes: [404],
    fetchImpl: async () => {
      statuses.push(404);

      return {
        status: 404,
        text: async () =>
          '<html><head><title>Sign In to Tuturuuu | Tuturuuu</title></head><body><h1>404</h1></body></html>',
      };
    },
    intervalMs: 0,
    sleep: async () => {
      throw new Error('should not retry accepted app responses');
    },
    timeoutMs: 5_000,
  });

  assert.deepEqual(statuses, [404]);
});

test('waitForUrl keeps retrying while the upstream returns server errors', async () => {
  const statuses = [];

  await waitForUrl('https://tuturuuu.localhost/login', {
    acceptedStatusCodes: [404],
    fetchImpl: async () => {
      statuses.push(statuses.length === 0 ? 502 : 200);

      return {
        status: statuses.at(-1),
        text: async () =>
          statuses.length === 1
            ? '<title>502 - Bad Gateway</title>'
            : '<html>Login</html>',
      };
    },
    intervalMs: 0,
    sleep: async () => {},
    timeoutMs: 5_000,
  });

  assert.deepEqual(statuses, [502, 200]);
});

test('waitForUrl uses local-only insecure TLS options for Portless readiness', async () => {
  const seenOptions = [];

  await waitForUrl('https://tuturuuu.localhost:1355/login', {
    fetchImpl: async (_url, options = {}) => {
      seenOptions.push(options);

      return {
        status: 200,
        text: async () => '<html>Login</html>',
      };
    },
    intervalMs: 0,
    sleep: async () => {
      throw new Error('should not retry a ready local response');
    },
    timeoutMs: 5_000,
  });

  assert.equal(seenOptions.length, 1);
  assert.equal(seenOptions[0].redirect, 'manual');
  assert.equal(seenOptions[0].rejectUnauthorized, false);
});

test('getReadinessFetchOptions refuses insecure TLS for non-local HTTPS origins', () => {
  assert.equal(
    getReadinessFetchOptions('https://tuturuuu.com/login').rejectUnauthorized,
    undefined
  );
  assert.equal(
    getReadinessFetchOptions('http://127.0.0.1:7803/login').rejectUnauthorized,
    undefined
  );
  assert.equal(
    getReadinessFetchOptions('https://tuturuuu.localhost:1355/login')
      .rejectUnauthorized,
    false
  );
  assert.equal(
    getReadinessFetchOptions('https://tanstack.tuturuuu.localhost:1355/')
      .rejectUnauthorized,
    false
  );
});

test('waitForUrl timeout keeps nested fetch failure causes visible', async () => {
  await assert.rejects(
    () =>
      waitForUrl('https://tuturuuu.localhost:1355/login', {
        fetchImpl: async () => {
          const error = new Error('fetch failed');
          error.cause = new Error('self-signed certificate');
          throw error;
        },
        intervalMs: 0,
        sleep: async () => {},
        timeoutMs: 20,
      }),
    /Timed out waiting for https:\/\/tuturuuu\.localhost:1355\/login: fetch failed: self-signed certificate/u
  );
});

test('ensurePortlessRoute starts the wildcard proxy and refreshes the route', async () => {
  const calls = [];
  const chunks = [];

  await ensurePortlessRoute({
    env: { PATH: 'test-path' },
    output: {
      write(chunk) {
        chunks.push(String(chunk));
      },
    },
    runCommand: async (command, args, options = {}) => {
      calls.push([command, args, options]);

      if (args.includes('--remove')) {
        throw new Error('route not registered yet');
      }
    },
    runCommandForOutput: async (command, args, options = {}) => {
      calls.push([command, args, options]);

      return {
        stderr: '',
        stdout:
          'Active routes:\n  https://tuturuuu.localhost  ->  localhost:7803  (alias)\n',
      };
    },
  });

  assert.deepEqual(
    calls.map(([command, args]) => [command, args]),
    [
      ['bunx', ['portless', 'proxy', 'start', '--wildcard']],
      ['bunx', ['portless', 'alias', '--remove', 'tuturuuu']],
      ['bunx', ['portless', 'alias', 'tuturuuu', '7803', '--force']],
      ['bunx', ['portless', 'list']],
    ]
  );
  assert.ok(
    calls.every(([, , options]) =>
      options.env.NODE_OPTIONS.includes(DNS_IPV4_FIRST_NODE_OPTION)
    )
  );
  assert.match(chunks.join(''), /https:\/\/tuturuuu\.localhost/u);
});

test('ensurePortlessRoute points the Docker TanStack host at the web proxy port', async () => {
  const calls = [];

  await ensurePortlessRoute({
    env: getFrontendE2EEnv('tanstack', { PATH: 'test-path' }),
    output: {
      write() {},
    },
    runCommand: async (command, args, options = {}) => {
      calls.push([command, args, options]);

      if (args.includes('--remove')) {
        throw new Error('route not registered yet');
      }
    },
    runCommandForOutput: async (command, args, options = {}) => {
      calls.push([command, args, options]);

      return {
        stderr: '',
        stdout:
          'Active routes:\n  https://tanstack.tuturuuu.localhost  ->  localhost:7803  (alias)\n',
      };
    },
  });

  assert.deepEqual(
    calls.map(([command, args]) => [command, args]),
    [
      ['bunx', ['portless', 'proxy', 'start', '--wildcard']],
      ['bunx', ['portless', 'alias', '--remove', 'tanstack.tuturuuu']],
      ['bunx', ['portless', 'alias', 'tanstack.tuturuuu', '7803', '--force']],
      ['bunx', ['portless', 'list']],
    ]
  );
});

test('ensurePortlessRoute honors the configured proxy host and Portless ports', async () => {
  const calls = [];

  await ensurePortlessRoute({
    env: {
      DOCKER_WEB_PROXY_HOST_PORT: '17803',
      PATH: 'test-path',
      PORTLESS_PORT: '1355',
    },
    output: {
      write() {},
    },
    runCommand: async (command, args, options = {}) => {
      calls.push([command, args, options]);
    },
    runCommandForOutput: async (command, args, options = {}) => {
      calls.push([command, args, options]);

      return {
        stderr: '',
        stdout:
          'Active routes:\n  https://tuturuuu.localhost  ->  localhost:17803  (alias)\n',
      };
    },
  });

  assert.deepEqual(
    calls.map(([command, args]) => [command, args]),
    [
      [
        'bunx',
        [
          'portless',
          'proxy',
          'start',
          '--wildcard',
          '--port',
          '1355',
          '--https',
        ],
      ],
      ['bunx', ['portless', 'alias', '--remove', 'tuturuuu']],
      ['bunx', ['portless', 'alias', 'tuturuuu', '17803', '--force']],
      ['bunx', ['portless', 'list']],
    ]
  );
  assert.ok(
    calls.every(([, , options]) =>
      options.env.NODE_OPTIONS.includes(DNS_IPV4_FIRST_NODE_OPTION)
    )
  );
});

test('ensurePortlessRoute restarts Portless when proxy config differs', async () => {
  const calls = [];
  const chunks = [];
  let startAttempts = 0;

  await ensurePortlessRoute({
    env: {
      PATH: 'test-path',
      PORTLESS_PORT: '1355',
    },
    output: {
      write(chunk) {
        chunks.push(String(chunk));
      },
    },
    runCommand: async (command, args, options = {}) => {
      calls.push([command, args, options]);

      if (
        args.join(' ') === 'portless proxy start --wildcard --port 1355 --https'
      ) {
        startAttempts += 1;

        if (startAttempts === 1) {
          throw new Error(
            'Proxy is already running on port 1355 with a different config.\nrequested HTTPS, but the running proxy is using HTTP'
          );
        }
      }
    },
    runCommandForOutput: async (command, args, options = {}) => {
      calls.push([command, args, options]);

      return {
        stderr: '',
        stdout:
          'Active routes:\n  https://tuturuuu.localhost:1355  ->  localhost:7803  (alias)\n',
      };
    },
  });

  assert.deepEqual(
    calls.map(([command, args]) => [command, args]),
    [
      [
        'bunx',
        [
          'portless',
          'proxy',
          'start',
          '--wildcard',
          '--port',
          '1355',
          '--https',
        ],
      ],
      ['bunx', ['portless', 'proxy', 'stop']],
      [
        'bunx',
        [
          'portless',
          'proxy',
          'start',
          '--wildcard',
          '--port',
          '1355',
          '--https',
        ],
      ],
      ['bunx', ['portless', 'alias', '--remove', 'tuturuuu']],
      ['bunx', ['portless', 'alias', 'tuturuuu', '7803', '--force']],
      ['bunx', ['portless', 'list']],
    ]
  );
  assert.match(chunks.join(''), /Restarting Portless proxy/u);
});

test('ensurePortlessRoute retries and fails when Portless does not register the alias', async () => {
  const calls = [];
  const chunks = [];
  const sleeps = [];

  await assert.rejects(
    () =>
      ensurePortlessRoute({
        env: {
          PATH: 'test-path',
          PORTLESS_ALIAS_VERIFY_ATTEMPTS: '2',
          PORTLESS_ALIAS_VERIFY_DELAY_MS: '7',
        },
        output: {
          write(chunk) {
            chunks.push(String(chunk));
          },
        },
        runCommand: async (command, args, options = {}) => {
          calls.push([command, args, options]);
        },
        runCommandForOutput: async (command, args, options = {}) => {
          calls.push([command, args, options]);

          return {
            stderr: '',
            stdout:
              'Active routes:\n  https://other.localhost  ->  localhost:7803  (alias)\n',
          };
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      }),
    /Portless alias tuturuuu\.localhost was not registered for localhost:7803/u
  );

  assert.deepEqual(
    calls.map(([command, args]) => [command, args]),
    [
      ['bunx', ['portless', 'proxy', 'start', '--wildcard']],
      ['bunx', ['portless', 'alias', '--remove', 'tuturuuu']],
      ['bunx', ['portless', 'alias', 'tuturuuu', '7803', '--force']],
      ['bunx', ['portless', 'list']],
      ['bunx', ['portless', 'list']],
    ]
  );
  assert.deepEqual(sleeps, [7]);
  assert.match(chunks.join(''), /https:\/\/other\.localhost/u);
});

test('getE2EDiagnosticLogTail accepts positive numeric overrides only', () => {
  assert.equal(
    getE2EDiagnosticLogTail({ E2E_DIAGNOSTIC_LOG_TAIL: '42' }),
    '42'
  );
  assert.equal(
    getE2EDiagnosticLogTail({ E2E_DIAGNOSTIC_LOG_TAIL: '0' }),
    '300'
  );
  assert.equal(
    getE2EDiagnosticLogTail({ E2E_DIAGNOSTIC_LOG_TAIL: 'nope' }),
    '300'
  );
});

test('formatBlueGreenStages keeps failed stage details readable', () => {
  assert.deepEqual(
    formatBlueGreenStages([
      {
        buildServices: ['web-green'],
        color: 'green',
        durationMs: 123,
        id: 'web-build',
        serviceNames: ['web-green'],
        status: 'succeeded',
      },
      {
        failureReason: 'web-proxy returned 502',
        id: 'proxy-reload',
        serviceNames: ['web-proxy'],
        status: 'failed',
      },
    ]),
    [
      '- web-build | succeeded | color=green | build=web-green | services=web-green | durationMs=123',
      '- proxy-reload | failed | services=web-proxy | failure=web-proxy returned 502',
    ]
  );
});

test('printE2EFailureDiagnostics prints compose logs without masking diagnostics errors', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttr-e2e-diag-'));
  const calls = [];
  const chunks = [];
  const output = {
    write(chunk) {
      chunks.push(String(chunk));
    },
  };
  const error = new Error('web stack failed');
  error.blueGreenStages = [
    {
      failureReason: 'proxy route check failed',
      id: 'proxy-reload',
      serviceNames: ['web-proxy'],
      status: 'failed',
    },
  ];

  try {
    const lastRunPath = path.join(
      tempDir,
      'apps',
      'web',
      'test-results',
      '.last-run.json'
    );
    fs.mkdirSync(path.dirname(lastRunPath), { recursive: true });
    fs.writeFileSync(lastRunPath, '{"status":"failed"}\n');

    await printE2EFailureDiagnostics({
      env: {
        DOCKER_WEB_COMPOSE_PROJECT_NAME: 'ttr-e2e-local-123',
        DOCKER_WEB_ENV_FILE: 'tmp/e2e/web.env',
        E2E_DIAGNOSTIC_LOG_TAIL: '42',
        GITHUB_ACTIONS: 'true',
        UPSTASH_REDIS_REST_TOKEN: 'diagnostic-token',
      },
      error,
      output,
      rootDir: tempDir,
      runCommand: async (command, args, options = {}) => {
        calls.push({ args, command, options });

        if (args.includes('logs')) {
          throw new Error('docker logs unavailable');
        }
      },
    });

    assert.equal(calls.length, 7);
    assert.deepEqual(calls[0].args, [
      'ps',
      '-a',
      '--filter',
      'label=com.docker.compose.project=ttr-e2e-local-123',
      '--format',
      'table {{.Names}}\t{{.Status}}\t{{.Image}}',
    ]);
    assert.deepEqual(calls[1].args.slice(0, 5), [
      'compose',
      '--env-file',
      'tmp/e2e/web.env',
      '-f',
      path.join(path.resolve(__dirname, '..'), 'docker-compose.web.prod.yml'),
    ]);
    assert.deepEqual(calls[1].args.slice(5, 7), ['-p', 'ttr-e2e-local-123']);
    assert.deepEqual(calls[1].args.slice(-2), ['ps', '-a']);
    assert.deepEqual(calls[2].args.slice(-4), [
      'backend',
      'markitdown',
      'storage-unzip-proxy',
      'web-cron-runner',
    ]);
    assert.ok(calls[2].args.includes('--tail'));
    assert.ok(calls[2].args.includes('42'));
    assert.deepEqual(calls[3].args, [
      '-i',
      '--max-time',
      '10',
      'http://127.0.0.1:7803/login',
    ]);
    assert.deepEqual(calls[4].args, ['portless', 'list']);
    assert.deepEqual(calls[5].args, [
      '-k',
      '-i',
      '--max-time',
      '10',
      'https://tuturuuu.localhost:1355/login',
    ]);
    assert.deepEqual(calls[6].args, ['sb:status']);
    assert.ok(
      calls.every(
        ({ options }) =>
          options.cwd === tempDir &&
          options.env.COMPOSE_PROJECT_NAME === 'ttr-e2e-local-123' &&
          options.env.UPSTASH_REDIS_REST_TOKEN === 'diagnostic-token' &&
          options.stdio === 'inherit'
      )
    );

    const text = chunks.join('');
    assert.match(text, /::group::E2E failure summary/u);
    assert.match(text, /Primary failure: web stack failed/u);
    assert.match(text, /proxy route check failed/u);
    assert.match(text, /\{"status":"failed"\}/u);
    assert.match(text, /Diagnostic command failed: docker logs unavailable/u);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('parseE2EProjectImageTags selects only current E2E project images', () => {
  assert.deepEqual(
    parseE2EProjectImageTags(
      [
        'ttr-e2e-local-123-web-blue:latest',
        'ttr-e2e-local-123-web-green:latest',
        'ttr-e2e-local-123-web-cache:abc123',
        'ttr-e2e-local-456-web-blue:latest',
        'postgres:16-alpine',
        '<none>:<none>',
      ].join('\n'),
      'ttr-e2e-local-123'
    ),
    [
      'ttr-e2e-local-123-web-blue:latest',
      'ttr-e2e-local-123-web-cache:abc123',
      'ttr-e2e-local-123-web-green:latest',
    ]
  );
});

test('removeE2EProjectImages removes current project image tags', async () => {
  const calls = [];

  const removed = await removeE2EProjectImages({
    env: { DOCKER_WEB_COMPOSE_PROJECT_NAME: 'ttr-e2e-local-123' },
    runCommand: async (command, args) => {
      calls.push([command, args]);
    },
    runCommandForOutput: async (command, args) => {
      calls.push([command, args]);
      return {
        stderr: '',
        stdout: [
          'ttr-e2e-local-123-web-blue:latest',
          'ttr-e2e-local-456-web-blue:latest',
        ].join('\n'),
      };
    },
  });

  assert.deepEqual(removed, ['ttr-e2e-local-123-web-blue:latest']);
  assert.deepEqual(calls, [
    ['docker', ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}']],
    ['docker', ['image', 'rm', 'ttr-e2e-local-123-web-blue:latest']],
  ]);
});

test('removeE2EProjectImages skips non-E2E project names', async () => {
  const removed = await removeE2EProjectImages({
    env: { DOCKER_WEB_COMPOSE_PROJECT_NAME: 'tuturuuu' },
    runCommand: async () => {
      throw new Error('should not remove images');
    },
    runCommandForOutput: async () => {
      throw new Error('should not list images');
    },
  });

  assert.deepEqual(removed, []);
});

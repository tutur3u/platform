const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  readDockerProdComposeMergedText,
} = require('./docker-web/prod-compose-include.js');

const {
  getAutoDockerNodeMaxOldSpaceSizeMb,
  getDockerNextBuildArgs,
  getDockerNextBuildCpus,
  getDockerNodeMaxOldSpaceSizeMb,
  getDockerStaticGenerationMaxConcurrency,
  getEffectiveDockerMemoryMb,
  getNextBuildEnvironment,
  isNativeWebBuildEnabled,
  mergeNodeOptions,
  parseMemoryToMb,
} = require('./run-web-docker-next-build.js');

const {
  BACKEND_DOCKERFILE_PATH,
  CRON_RUNNER_DOCKERFILE_PATH,
  CHAT_REALTIME_DOCKERFILE_PATH,
  DOCKER_CONTROL_DOCKERFILE_PATH,
  DOCKER_BAKE_WEB_PROD_PATH,
  DOCKER_SETUP_WORKFLOW_PATH,
  DOCKERIGNORE_PATH,
  EMPTY_BUILDKIT_SECRET_PATH,
  HIVE_DB_MIGRATE_SCRIPT_PATH,
  HIVE_DOCKERFILE_PATH,
  HIVE_REALTIME_DOCKERFILE_PATH,
  MARKITDOWN_DOCKERFILE_PATH,
  MEET_REALTIME_DOCKERFILE_PATH,
  NATIVE_WEB_RUNNER_DOCKERFILE_PATH,
  NATIVE_WEB_RUNNER_DOCKERIGNORE_PATH,
  ROOT_DIR,
  SUPERMEMORY_DOCKERFILE_PATH,
  TANSTACK_DUAL_COMPOSE_FILE_PATH,
  TANSTACK_WEB_DOCKERFILE_PATH,
  TANSTACK_WEB_SERVER_PATH,
  WATCHER_DOCKERFILE_PATH,
  WEB_COMPOSE_FILE_PATH,
  WEB_DOCKERFILE_PATH,
  checkDockerWebSetup,
  getCopiedRelativePaths,
  getCopiedWorkspaceManifestPaths,
  getStageContent,
  listFileDependencyPaths,
  listWorkspacePackageJsonPaths,
  validateBackendDockerfile,
  validateChatRealtimeDockerfile,
  validateDockerCompose,
  validateDockerControlDockerfile,
  validateDockerSetupWorkflow,
  validateDockerBakeFile,
  validateDockerProdCompose,
  validateDockerignore,
  validateEmptyBuildkitSecret,
  validateDockerfile,
  validateCronRunnerDockerfile,
  validateHiveDockerfile,
  validateHiveDbMigrateScript,
  validateHiveRealtimeDockerfile,
  validateMarkitdownDockerfile,
  validateMeetRealtimeDockerfile,
  validateNativeWebRunnerDockerfile,
  validateSupermemoryDockerfile,
  validateTanstackDualCompose,
  validateTanstackWebDockerfile,
  validateTanstackWebServer,
  validateWatcherDockerfile,
} = require('./check-docker-web.js');

function assertRetryWrappedBunInstall(dockerfileContent, installCommand) {
  assert.ok(dockerfileContent.includes('set -eu;'));
  assert.ok(dockerfileContent.includes('attempt=1;'));
  assert.ok(dockerfileContent.includes('while [ "$attempt" -le 3 ]; do'));
  assert.ok(dockerfileContent.includes(`if ${installCommand}; then`));
  assert.ok(dockerfileContent.includes('bun pm cache rm 2>/dev/null || true'));
  assert.ok(
    dockerfileContent.includes(
      'bun install failed after 3 attempts. Try: docker builder prune'
    )
  );
  assert.ok(dockerfileContent.includes('sleep 5;'));
}

test('listWorkspacePackageJsonPaths discovers current workspace manifests', () => {
  const workspacePackageJsonPaths = listWorkspacePackageJsonPaths();

  assert.ok(workspacePackageJsonPaths.includes('apps/web/package.json'));
  assert.ok(workspacePackageJsonPaths.includes('packages/ui/package.json'));
});

test('getCopiedWorkspaceManifestPaths keeps Docker COPY paths in sync', () => {
  const depsStage = getStageContent(
    fs.readFileSync(WEB_DOCKERFILE_PATH, 'utf8'),
    'deps'
  );

  assert.ok(depsStage);
  assert.ok(
    getCopiedWorkspaceManifestPaths(depsStage).includes('apps/web/package.json')
  );
});

test('getCopiedRelativePaths accepts COPY flags before the source path', () => {
  assert.deepEqual(
    getCopiedRelativePaths(
      'COPY --from=builder --chown=nextjs:nodejs apps/web/package.json ./apps/web/package.json'
    ),
    ['apps/web/package.json']
  );
});

test('listFileDependencyPaths discovers vendored file dependencies', () => {
  const fileDependencyPaths = listFileDependencyPaths();

  assert.ok(fileDependencyPaths.includes('packages/ui/vendor/xlsx-0.20.3.tgz'));
});

test('validateDockerfile accepts the current web Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(WEB_DOCKERFILE_PATH, 'utf8');
  const fileDependencyPaths = listFileDependencyPaths();
  const workspacePackageJsonPaths = listWorkspacePackageJsonPaths();

  assert.deepEqual(
    validateDockerfile({
      dockerfileContent,
      fileDependencyPaths,
      workspacePackageJsonPaths,
    }),
    []
  );
});

test('validateDockerSetupWorkflow keeps TanStack Docker paths covered', () => {
  const workflowContent = fs.readFileSync(DOCKER_SETUP_WORKFLOW_PATH, 'utf8');

  assert.deepEqual(validateDockerSetupWorkflow(workflowContent), []);
  assert.match(
    validateDockerSetupWorkflow(
      workflowContent
        .replaceAll('      - "apps/tanstack-web/**"\n', '')
        .replace(
          'docker compose -f docker-compose.tanstack-dual.yml config > /tmp/docker-compose.tanstack-dual.yml',
          ''
        )
    ).join('\n'),
    /apps\/tanstack-web|docker-compose\.tanstack-dual\.yml/
  );
  assert.match(
    validateDockerSetupWorkflow(
      workflowContent.replace(
        'docker compose -f docker-compose.web.prod.yml --profile cloudflared config > /tmp/docker-compose.web.prod.cloudflared.yml',
        ''
      )
    ).join('\n'),
    /cloudflared/
  );
  assert.match(
    validateDockerSetupWorkflow(
      workflowContent.replace(
        '--cache-from type=gha,scope=docker-tanstack-web-prod',
        ''
      )
    ).join('\n'),
    /docker-tanstack-web-prod/
  );
  assert.match(
    validateDockerSetupWorkflow(
      workflowContent.replace(
        'Free runner disk before Docker image builds',
        'Free runner disk after Docker image builds'
      )
    ).join('\n'),
    /free runner disk before Docker image builds/
  );
});

test('validateDockerignore accepts the current Docker context excludes', () => {
  const dockerignoreContent = fs.readFileSync(DOCKERIGNORE_PATH, 'utf8');

  assert.deepEqual(validateDockerignore(dockerignoreContent), []);
});

test('portable BuildKit secret placeholder remains exactly empty', () => {
  const emptySecretContent = fs.readFileSync(
    EMPTY_BUILDKIT_SECRET_PATH,
    'utf8'
  );

  assert.deepEqual(validateEmptyBuildkitSecret(emptySecretContent), []);
  assert.match(
    validateEmptyBuildkitSecret('placeholder').join('\n'),
    /must remain exactly zero bytes/
  );
});

test('validateBackendDockerfile accepts the current backend Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(BACKEND_DOCKERFILE_PATH, 'utf8');

  assert.deepEqual(validateBackendDockerfile(dockerfileContent), []);
});

test('validateTanstackWebDockerfile accepts the current TanStack Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(
    TANSTACK_WEB_DOCKERFILE_PATH,
    'utf8'
  );

  assert.deepEqual(validateTanstackWebDockerfile(dockerfileContent), []);
  assert.match(
    validateTanstackWebDockerfile(
      dockerfileContent.replace(
        'COPY packages/offline/package.json ./packages/offline/package.json\n',
        ''
      )
    ).join('\n'),
    /apps\/tanstack-web\/Dockerfile deps stage is missing workspace package manifests: packages\/offline\/package\.json/u
  );
  assert.match(
    validateTanstackWebDockerfile(
      dockerfileContent.replace(
        'COPY --from=builder /workspace/apps/tanstack-web/docker/server.mjs ./docker/server.mjs\n',
        ''
      )
    ).join('\n'),
    /docker\/server\.mjs/u
  );
  assert.match(
    validateTanstackWebDockerfile(
      dockerfileContent.replace(
        'bun install --frozen-lockfile --filter tutur3u --filter @tuturuuu/tanstack-web',
        'bun install --frozen-lockfile --filter @tuturuuu/tanstack-web'
      )
    ).join('\n'),
    /filter tutur3u/u
  );
  assert.match(
    validateTanstackWebDockerfile(
      dockerfileContent.replace(
        'bun run turbo:local run build:docker -F @tuturuuu/tanstack-web',
        ''
      )
    ).join('\n'),
    /build:docker -F @tuturuuu\/tanstack-web/u
  );
  assert.match(
    validateTanstackWebDockerfile(
      dockerfileContent.replace(
        'HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "docker/healthcheck.mjs"]',
        'HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "true"]'
      )
    ).join('\n'),
    /docker\/healthcheck\.mjs/u
  );
});

test('tanstack web healthcheck probes the runner and backend health endpoint', async () => {
  const healthcheckModule = await import(
    pathToFileURL(
      path.join(ROOT_DIR, 'apps', 'tanstack-web', 'docker', 'healthcheck.mjs')
    ).href
  );
  const urls = [];

  await healthcheckModule.runTanStackWebHealthcheck({
    env: {
      BACKEND_INTERNAL_URL: 'http://backend:7820',
      PORT: '9123',
    },
    fetchImpl: async (url) => {
      urls.push(String(url));

      return new Response('', {
        status: 200,
      });
    },
  });

  assert.deepEqual(urls, [
    'http://127.0.0.1:9123/__platform/drain-status',
    'http://backend:7820/healthz',
  ]);
});

test('tanstack web healthcheck fails when the backend probe is not ok', async () => {
  const healthcheckModule = await import(
    pathToFileURL(
      path.join(ROOT_DIR, 'apps', 'tanstack-web', 'docker', 'healthcheck.mjs')
    ).href
  );

  await assert.rejects(
    () =>
      healthcheckModule.runTanStackWebHealthcheck({
        env: {
          BACKEND_INTERNAL_URL: 'backend:7820',
          PORT: '9123',
        },
        fetchImpl: async (url) =>
          new Response('', {
            status: String(url).endsWith('/healthz') ? 503 : 200,
          }),
      }),
    /Backend healthcheck returned HTTP 503/u
  );
});

test('validateTanstackWebServer requires the internal drain-status route', () => {
  const serverContent = fs.readFileSync(TANSTACK_WEB_SERVER_PATH, 'utf8');

  assert.deepEqual(validateTanstackWebServer(serverContent), []);
  assert.match(
    validateTanstackWebServer(
      serverContent.replace('/__platform/drain-status', '/api/health')
    ).join('\n'),
    /__platform\/drain-status/u
  );
});

test('validateTanstackWebServer requires resilient server entry resolution', () => {
  const serverContent = fs.readFileSync(TANSTACK_WEB_SERVER_PATH, 'utf8');

  assert.match(
    validateTanstackWebServer(
      serverContent.replace("path.join(serverDir, 'index.js')", '')
    ).join('\n'),
    /index\.js/u
  );
  assert.match(
    validateTanstackWebServer(
      serverContent.replace("path.join(serverDir, 'assets')", '')
    ).join('\n'),
    /assets/u
  );
});

test('validateDockerignore reports generated app artifacts in the context', () => {
  const dockerignoreContent = fs
    .readFileSync(DOCKERIGNORE_PATH, 'utf8')
    .replace('**/.next\n', '')
    .replace('**/.next/**\n', '')
    .replace('apps/mobile/build\n', '');

  const errors = validateDockerignore(dockerignoreContent).join('\n');

  assert.match(errors, /\.dockerignore must exclude \*\*\/\.next/);
  assert.match(errors, /\.dockerignore must exclude \*\*\/\.next\/\*\*/);
  assert.match(errors, /\.dockerignore must exclude apps\/mobile\/build/);
});

test('web Docker build script delegates Next to the real Node wrapper', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'apps', 'web', 'package.json'), 'utf8')
  );
  const wrapper = fs.readFileSync(
    path.join(ROOT_DIR, 'scripts', 'run-web-docker-next-build.js'),
    'utf8'
  );

  assert.equal(
    packageJson.scripts['build:docker'],
    'bun ../../scripts/run-web-docker-next-build.js'
  );
  assert.match(wrapper, /process\.env\.DOCKER_WEB_NODE_BINARY \|\| 'node'/u);
  assert.match(wrapper, /NODE_MAX_OLD_SPACE_SIZE_BUCKETS_MB/u);
  assert.match(wrapper, /DEFAULT_NEXT_BUILD_ENGINE = 'turbopack'/u);
  assert.match(wrapper, /DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE/u);
  assert.match(wrapper, /DOCKER_WEB_NEXT_APP_ONLY/u);
  assert.match(wrapper, /DOCKER_WEB_NEXT_BUILD_ENGINE/u);
  assert.match(wrapper, /getDockerNextBuildArgs/u);
  assert.match(wrapper, /--experimental-app-only/u);
});

test('Hive realtime Docker image hoists production dependencies for Bun runtime resolution', () => {
  const dockerfileContent = fs.readFileSync(
    HIVE_REALTIME_DOCKERFILE_PATH,
    'utf8'
  );

  assert.match(
    dockerfileContent,
    /bun install --frozen-lockfile --production --filter @tuturuuu\/hive-realtime --linker hoisted/u
  );
});

test('Hive Docker image installs root toolchain and routes the Next build through Turbo', () => {
  const dockerfileContent = fs.readFileSync(HIVE_DOCKERFILE_PATH, 'utf8');
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'apps', 'hive', 'package.json'), 'utf8')
  );

  assert.deepEqual(validateHiveDockerfile(dockerfileContent), []);
  assert.equal(
    packageJson.scripts['build:docker'],
    'node ../../scripts/run-hive-docker-next-build.js'
  );
  assert.match(
    dockerfileContent,
    /bun install --frozen-lockfile --filter tutur3u --filter @tuturuuu\/hive/u
  );
  assert.match(
    dockerfileContent,
    /bun --env-file=\/tmp\/web\.env run turbo:local run build:docker -F @tuturuuu\/hive/u
  );
});

test('Hive Docker image copies every workspace manifest before frozen install', () => {
  const dockerfileContent = fs.readFileSync(HIVE_DOCKERFILE_PATH, 'utf8');
  const driftedDockerfileContent = dockerfileContent.replace(
    'COPY apps/inventory/package.json ./apps/inventory/package.json\n',
    ''
  );

  assert.match(
    validateHiveDockerfile(driftedDockerfileContent).join('\n'),
    /apps\/hive\/Dockerfile deps stage is missing workspace package manifests: apps\/inventory\/package\.json/
  );
});

test('Hive DB migration runner enforces forward-only deployment guards', () => {
  const scriptContent = fs.readFileSync(HIVE_DB_MIGRATE_SCRIPT_PATH, 'utf8');

  assert.deepEqual(validateHiveDbMigrateScript(scriptContent), []);
  assert.match(scriptContent, /hive_schema_migrations/u);
  assert.match(scriptContent, /pending migration .* timestamp/u);
  assert.match(scriptContent, /last recorded migration time/u);
  assert.match(scriptContent, /devops-admin/u);
});

test('Hive realtime Docker image copies every workspace manifest before frozen install', () => {
  const dockerfileContent = fs.readFileSync(
    HIVE_REALTIME_DOCKERFILE_PATH,
    'utf8'
  );
  const driftedDockerfileContent = dockerfileContent.replace(
    'COPY apps/inventory/package.json ./apps/inventory/package.json\n',
    ''
  );

  assert.deepEqual(validateHiveRealtimeDockerfile(dockerfileContent), []);
  assert.match(
    validateHiveRealtimeDockerfile(driftedDockerfileContent).join('\n'),
    /apps\/hive-realtime\/Dockerfile deps stage is missing workspace package manifests: apps\/inventory\/package\.json/
  );
});

test('Production Docker images retry filtered Bun installs and clear install cache', () => {
  const dockerfiles = [
    {
      content: fs.readFileSync(HIVE_DOCKERFILE_PATH, 'utf8'),
      installCommand:
        'bun install --frozen-lockfile --filter tutur3u --filter @tuturuuu/hive',
      validate: validateHiveDockerfile,
    },
    {
      content: fs.readFileSync(HIVE_REALTIME_DOCKERFILE_PATH, 'utf8'),
      installCommand:
        'bun install --frozen-lockfile --production --filter @tuturuuu/hive-realtime --linker hoisted',
      validate: validateHiveRealtimeDockerfile,
    },
    {
      content: fs.readFileSync(MEET_REALTIME_DOCKERFILE_PATH, 'utf8'),
      installCommand:
        'bun install --frozen-lockfile --production --filter @tuturuuu/realtime --linker hoisted',
      validate: validateMeetRealtimeDockerfile,
    },
    {
      content: fs.readFileSync(CHAT_REALTIME_DOCKERFILE_PATH, 'utf8'),
      installCommand:
        'bun install --frozen-lockfile --production --filter @tuturuuu/realtime --linker hoisted',
      validate: validateChatRealtimeDockerfile,
    },
    {
      content: fs.readFileSync(SUPERMEMORY_DOCKERFILE_PATH, 'utf8'),
      installCommand:
        'bun install --frozen-lockfile --production --filter @tuturuuu/supermemory --linker hoisted',
      validate: validateSupermemoryDockerfile,
    },
  ];

  for (const { content, installCommand, validate } of dockerfiles) {
    assert.deepEqual(validate(content), []);
    assertRetryWrappedBunInstall(content, installCommand);
  }
});

test('Meet realtime Docker image copies every workspace manifest before frozen install', () => {
  const dockerfileContent = fs.readFileSync(
    MEET_REALTIME_DOCKERFILE_PATH,
    'utf8'
  );
  const driftedDockerfileContent = dockerfileContent.replace(
    'COPY apps/inventory/package.json ./apps/inventory/package.json\n',
    ''
  );

  assert.deepEqual(validateMeetRealtimeDockerfile(dockerfileContent), []);
  assert.match(
    validateMeetRealtimeDockerfile(driftedDockerfileContent).join('\n'),
    /apps\/meet-realtime\/Dockerfile deps stage is missing workspace package manifests: apps\/inventory\/package\.json/
  );
  assert.match(
    dockerfileContent,
    /bun install --frozen-lockfile --production --filter @tuturuuu\/realtime --linker hoisted/u
  );
  assert.match(
    dockerfileContent,
    /CMD \["bun", "apps\/meet-realtime\/src\/index.ts"\]/u
  );
});

test('Chat realtime Docker image copies every workspace manifest before frozen install', () => {
  const dockerfileContent = fs.readFileSync(
    CHAT_REALTIME_DOCKERFILE_PATH,
    'utf8'
  );
  const driftedDockerfileContent = dockerfileContent.replace(
    'COPY apps/inventory/package.json ./apps/inventory/package.json\n',
    ''
  );

  assert.deepEqual(validateChatRealtimeDockerfile(dockerfileContent), []);
  assert.match(
    validateChatRealtimeDockerfile(driftedDockerfileContent).join('\n'),
    /apps\/chat-realtime\/Dockerfile deps stage is missing workspace package manifests: apps\/inventory\/package\.json/
  );
  assert.match(
    dockerfileContent,
    /bun install --frozen-lockfile --production --filter @tuturuuu\/realtime --linker hoisted/u
  );
  assert.match(
    dockerfileContent,
    /CMD \["bun", "apps\/chat-realtime\/src\/index.ts"\]/u
  );
});

test('Docker web build args default to App Router only builds', () => {
  const defaultArgs = getDockerNextBuildArgs({});

  assert.ok(defaultArgs.includes('--turbopack'));
  assert.ok(defaultArgs.includes('--experimental-app-only'));

  assert.equal(
    getDockerNextBuildArgs({ DOCKER_WEB_NEXT_APP_ONLY: '0' }).includes(
      '--experimental-app-only'
    ),
    false
  );
});

test('Docker web build heap auto-scales from Docker memory buckets', () => {
  assert.equal(parseMemoryToMb('12g'), 12 * 1024);
  assert.equal(parseMemoryToMb('16gb'), 16 * 1024);
  assert.equal(parseMemoryToMb('24576m'), 24 * 1024);
  assert.equal(parseMemoryToMb('34359738368'), 32 * 1024);

  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '8g' }),
    4096
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '10g' }),
    8192
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '12g' }),
    8192
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '16g' }),
    12288
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '24g' }),
    16384
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '32g' }),
    16384
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '64g' }),
    16384
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({
      DOCKER_WEB_BUILD_MEMORY: '16g',
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '8g',
    }),
    4096
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({
      DOCKER_WEB_BUILD_MEMORY: '12g',
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '16g',
    }),
    8192
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({
      DOCKER_WEB_BUILD_MEMORY: '24g',
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '16g',
    }),
    12288
  );
  assert.equal(
    getEffectiveDockerMemoryMb({
      DOCKER_WEB_BUILD_MEMORY: '24g',
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '16g',
    }),
    16 * 1024
  );
});

test('Docker web build NODE_OPTIONS always includes at least a 4 GB heap', () => {
  assert.equal(
    getDockerNodeMaxOldSpaceSizeMb({
      DOCKER_WEB_BUILD_MEMORY: '16g',
      DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE: 'auto',
    }),
    12288
  );
  assert.equal(
    mergeNodeOptions('--max-old-space-size=2048 --trace-warnings', {
      DOCKER_WEB_BUILD_MEMORY: '12g',
    }),
    '--trace-warnings --max-old-space-size=8192 --experimental-require-module'
  );
  assert.throws(
    () =>
      getDockerNodeMaxOldSpaceSizeMb({
        DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE: '2048',
      }),
    /at least 4096/
  );
});

test('Docker web build static generation concurrency leaves room on small Docker allocations', () => {
  assert.equal(
    getDockerStaticGenerationMaxConcurrency({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '8g',
    }),
    1
  );
  assert.equal(
    getDockerStaticGenerationMaxConcurrency({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '12g',
    }),
    2
  );
  assert.equal(
    getDockerStaticGenerationMaxConcurrency({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '16g',
    }),
    4
  );
  assert.equal(
    getDockerStaticGenerationMaxConcurrency({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '8g',
      DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY: '3',
    }),
    3
  );
});

test('Docker web build CPU count leaves room on small Docker allocations', () => {
  assert.equal(
    getDockerNextBuildCpus({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '8g',
    }),
    1
  );
  assert.equal(
    getDockerNextBuildCpus({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '12g',
    }),
    2
  );
  assert.equal(
    getDockerNextBuildCpus({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '16g',
    }),
    4
  );
  assert.equal(
    getDockerNextBuildCpus({
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '8g',
      DOCKER_WEB_NEXT_BUILD_CPUS: '3',
    }),
    3
  );
});

test('native Docker web build leaves worker counts to Next by default', () => {
  const env = getNextBuildEnvironment({
    DOCKER_WEB_BUILD_MEMORY: '64g',
    DOCKER_WEB_DOCKER_MEMORY_LIMIT: '64g',
    DOCKER_WEB_NATIVE_BUILD: '1',
  });

  assert.equal(isNativeWebBuildEnabled(env), true);
  assert.equal(env.DOCKER_WEB_NEXT_BUILD_CPUS, undefined);
  assert.equal(env.DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY, undefined);
  assert.match(env.NODE_OPTIONS, /--max-old-space-size=/u);
});

test('native Docker web build preserves explicit worker count overrides', () => {
  const env = getNextBuildEnvironment({
    DOCKER_WEB_NATIVE_BUILD: '1',
    DOCKER_WEB_NEXT_BUILD_CPUS: '6',
    DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY: '5',
  });

  assert.equal(env.DOCKER_WEB_NEXT_BUILD_CPUS, '6');
  assert.equal(env.DOCKER_WEB_STATIC_GENERATION_MAX_CONCURRENCY, '5');
});

test('validateDockerfile reports missing workspace manifest copies', () => {
  const dockerfileContent = fs
    .readFileSync(WEB_DOCKERFILE_PATH, 'utf8')
    .replace('COPY apps/web/package.json ./apps/web/package.json\n', '');
  const fileDependencyPaths = listFileDependencyPaths();
  const workspacePackageJsonPaths = listWorkspacePackageJsonPaths();

  const errors = validateDockerfile({
    dockerfileContent,
    fileDependencyPaths,
    workspacePackageJsonPaths,
  });

  assert.match(
    errors.join('\n'),
    /missing workspace package manifests: apps\/web\/package\.json/
  );
});

test('validateDockerfile reports missing file-backed dependency copies', () => {
  const dockerfileContent = fs
    .readFileSync(WEB_DOCKERFILE_PATH, 'utf8')
    .replace(
      'COPY packages/ui/vendor/xlsx-0.20.3.tgz ./packages/ui/vendor/xlsx-0.20.3.tgz\n',
      ''
    );
  const fileDependencyPaths = listFileDependencyPaths();
  const workspacePackageJsonPaths = listWorkspacePackageJsonPaths();

  const errors = validateDockerfile({
    dockerfileContent,
    fileDependencyPaths,
    workspacePackageJsonPaths,
  });

  assert.match(
    errors.join('\n'),
    /missing file-backed dependencies required by package manifests: packages\/ui\/vendor\/xlsx-0\.20\.3\.tgz/
  );
});

test('validateDockerfile reports a drifted internal healthcheck path', () => {
  const dockerfileContent = fs
    .readFileSync(WEB_DOCKERFILE_PATH, 'utf8')
    .replace('/__platform/drain-status', '/api/health');
  const fileDependencyPaths = listFileDependencyPaths();
  const workspacePackageJsonPaths = listWorkspacePackageJsonPaths();

  const errors = validateDockerfile({
    dockerfileContent,
    fileDependencyPaths,
    workspacePackageJsonPaths,
  });

  assert.match(
    errors.join('\n'),
    /runner stage must health-check the internal \/__platform\/drain-status endpoint/
  );
});

test('validateDockerfile reports missing version badge metadata env wiring', () => {
  const dockerfileContent = fs
    .readFileSync(WEB_DOCKERFILE_PATH, 'utf8')
    .replaceAll('ARG PLATFORM_BUILD_COMMIT_HASH=\n', '')
    .replaceAll(
      /ENV PLATFORM_BUILD_COMMIT_HASH=\$\{PLATFORM_BUILD_COMMIT_HASH\}\n/gu,
      ''
    );
  const fileDependencyPaths = listFileDependencyPaths();
  const workspacePackageJsonPaths = listWorkspacePackageJsonPaths();

  const errors = validateDockerfile({
    dockerfileContent,
    fileDependencyPaths,
    workspacePackageJsonPaths,
  });

  assert.match(errors.join('\n'), /PLATFORM_BUILD_COMMIT_HASH/);
});

test('validateDockerCompose accepts the current compose file', () => {
  const composeContent = fs.readFileSync(WEB_COMPOSE_FILE_PATH, 'utf8');

  assert.deepEqual(validateDockerCompose(composeContent), []);
});

test('validateTanstackDualCompose accepts the current dual compose file', () => {
  const composeContent = fs.readFileSync(
    TANSTACK_DUAL_COMPOSE_FILE_PATH,
    'utf8'
  );

  assert.deepEqual(validateTanstackDualCompose(composeContent), []);
});

test('validateTanstackDualCompose requires E2E cache and Turbo secret wiring', () => {
  const composeContent = fs
    .readFileSync(TANSTACK_DUAL_COMPOSE_FILE_PATH, 'utf8')
    .replace('DOCKER_WEB_CACHE_BACKEND_FROM', 'REMOVED_BACKEND_CACHE_FROM')
    .replace('DOCKER_WEB_CACHE_TANSTACK_TO', 'REMOVED_TANSTACK_CACHE_TO')
    .replace('DOCKER_WEB_TURBO_TOKEN_SECRET_FILE', 'REMOVED_TURBO_TOKEN_FILE');

  const errors = validateTanstackDualCompose(composeContent).join('\n');

  assert.match(errors, /DOCKER_WEB_CACHE_BACKEND_FROM/);
  assert.match(errors, /DOCKER_WEB_CACHE_TANSTACK_TO/);
  assert.match(errors, /DOCKER_WEB_TURBO_TOKEN_SECRET_FILE/);
});

test('validateTanstackDualCompose reports missing runner and health gate wiring', () => {
  const composeContent = fs
    .readFileSync(TANSTACK_DUAL_COMPOSE_FILE_PATH, 'utf8')
    .replace('      target: runner', '      target: dev')
    .replace(
      '        condition: service_healthy',
      '        condition: service_started'
    );

  const errors = validateTanstackDualCompose(composeContent).join('\n');

  assert.match(errors, /target: runner/);
  assert.match(errors, /condition: service_healthy/);
});

test('validateTanstackDualCompose requires the Node runner healthcheck', () => {
  const composeContent = fs
    .readFileSync(TANSTACK_DUAL_COMPOSE_FILE_PATH, 'utf8')
    .replace('          "node",', '          "bun",');

  const errors = validateTanstackDualCompose(composeContent).join('\n');

  assert.match(errors, /"node"/);
});

test('validateTanstackDualCompose requires the shared TanStack healthcheck script', () => {
  const composeContent = fs
    .readFileSync(TANSTACK_DUAL_COMPOSE_FILE_PATH, 'utf8')
    .replace('"docker/healthcheck.mjs"', '"-e"');

  const errors = validateTanstackDualCompose(composeContent).join('\n');

  assert.match(errors, /docker\/healthcheck\.mjs/);
});

test('validateDockerCompose reports public local Redis port mappings', () => {
  const composeContent = fs
    .readFileSync(WEB_COMPOSE_FILE_PATH, 'utf8')
    .replace('"127.0.0.1:6379:6379"', '"6379:6379"')
    .replace('"127.0.0.1:8079:80"', '"8079:80"');

  const errors = validateDockerCompose(composeContent).join('\n');

  assert.match(errors, /127\.0\.0\.1:6379:6379/);
  assert.match(errors, /127\.0\.0\.1:8079:80/);
});

test('validateDockerCompose reports missing bind mounts', () => {
  const composeContent = fs
    .readFileSync(WEB_COMPOSE_FILE_PATH, 'utf8')
    .replaceAll('      - .:/workspace\n', '');

  const errors = validateDockerCompose(composeContent);

  assert.ok(errors.join('\n').includes('- .:/workspace'));
});

test('validateDockerCompose reports missing package-local artifact isolation', () => {
  const composeContent = fs
    .readFileSync(WEB_COMPOSE_FILE_PATH, 'utf8')
    .replaceAll(
      '      - platform-web-ui-node_modules:/workspace/packages/ui/node_modules\n',
      ''
    );

  const errors = validateDockerCompose(composeContent);

  assert.ok(
    errors
      .join('\n')
      .includes(
        'platform-web-ui-node_modules:/workspace/packages/ui/node_modules'
      )
  );
});

test('validateDockerProdCompose accepts the current production compose file', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR);

  assert.deepEqual(validateDockerProdCompose(composeContent), []);
});

test('validateDockerProdCompose requires inert per-service E2E cache wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR)
    .replace('DOCKER_WEB_CACHE_WEB_FROM', 'REMOVED_WEB_CACHE_FROM')
    .replace('DOCKER_WEB_CACHE_BACKEND_TO', 'REMOVED_BACKEND_CACHE_TO')
    .replace(
      'DOCKER_WEB_CACHE_STORAGE_UNZIP_FROM',
      'REMOVED_STORAGE_UNZIP_CACHE_FROM'
    );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /DOCKER_WEB_CACHE_WEB_FROM/);
  assert.match(errors, /DOCKER_WEB_CACHE_BACKEND_TO/);
  assert.match(errors, /DOCKER_WEB_CACHE_STORAGE_UNZIP_FROM/);
});

test('validateDockerProdCompose requires restart policies on durable production services', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR)
    .replace(
      '  init: true\n  restart: unless-stopped\n  volumes:',
      '  init: true\n  volumes:'
    )
    .replace(
      '  init: true\n  restart: unless-stopped\n  depends_on:\n    backend:',
      '  init: true\n  depends_on:\n    backend:'
    )
    .replace(
      '    restart: unless-stopped\n\n  cloudflared:',
      '\n  cloudflared:'
    )
    .replace(
      '    restart: unless-stopped\n\n  serverless-redis-http:',
      '\n  serverless-redis-http:'
    )
    .replace(
      '    restart: unless-stopped\n\n  storage-unzip-proxy:',
      '\n  storage-unzip-proxy:'
    )
    .replace(
      /^[ ]{2}web-blue-green-watcher:\n(?:(?:[ ]{4,}.+\n)|(?:\s*\n))*/mu,
      (block) => block.replace('    restart: unless-stopped\n', '')
    )
    .replace(
      /^[ ]{2}web-cron-runner:\n(?:(?:[ ]{4,}.+\n)|(?:\s*\n))*/mu,
      (block) => block.replace('    restart: unless-stopped\n', '')
    );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /x-web-service/u);
  assert.match(errors, /x-tanstack-web-service/u);
  assert.match(errors, /web-proxy/u);
  assert.match(errors, /redis/u);
  assert.match(errors, /markitdown/u);
  assert.match(errors, /web-blue-green-watcher/u);
  assert.match(errors, /web-cron-runner/u);
});

test('validateDockerBakeFile accepts the current production bake file', () => {
  const bakeContent = fs.readFileSync(DOCKER_BAKE_WEB_PROD_PATH, 'utf8');

  assert.deepEqual(validateDockerBakeFile(bakeContent), []);
});

test('validateDockerBakeFile reports missing meet realtime image loading target', () => {
  const composeProjectNameVariable = '${' + 'COMPOSE_PROJECT_NAME' + '}';
  const bakeContent = fs
    .readFileSync(DOCKER_BAKE_WEB_PROD_PATH, 'utf8')
    .replace(
      `target "meet-realtime" {\n  inherits = ["_platform_local"]\n  tags = ["${composeProjectNameVariable}-meet-realtime"]\n}\n\n`,
      ''
    );

  const errors = validateDockerBakeFile(bakeContent).join('\n');

  assert.match(errors, /target "meet-realtime"/);
  assert.match(errors, /\$\{COMPOSE_PROJECT_NAME\}-meet-realtime/);
});

test('validateDockerProdCompose reports missing Docker web build args', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    [
      '    args:',
      '      DOCKER_WEB_BUILD_MEMORY: $' +
        '{' +
        'DOCKER_WEB_BUILD_MEMORY:-12g' +
        '}',
      '      DOCKER_WEB_BUILD_MAX_PARALLELISM: $' +
        '{' +
        'DOCKER_WEB_BUILD_MAX_PARALLELISM:-1' +
        '}',
      '      DOCKER_WEB_DOCKER_MEMORY_LIMIT: $' +
        '{' +
        'DOCKER_WEB_DOCKER_MEMORY_LIMIT:-' +
        '}',
      '      DOCKER_WEB_NEXT_APP_ONLY: $' +
        '{' +
        'DOCKER_WEB_NEXT_APP_ONLY:-1' +
        '}',
      '      DOCKER_WEB_NEXT_BUILD_ENGINE: $' +
        '{' +
        'DOCKER_WEB_NEXT_BUILD_ENGINE:-turbopack' +
        '}',
      '      DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE: $' +
        '{' +
        'DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE:-auto' +
        '}',
      '      DOCKER_WEB_REACT_COMPILER: $' +
        '{' +
        'DOCKER_WEB_REACT_COMPILER:-1' +
        '}',
      '      DOCKER_WEB_TURBO_CONCURRENCY: $' +
        '{' +
        'DOCKER_WEB_TURBO_CONCURRENCY:-' +
        '}',
      '',
    ].join('\n'),
    ''
  );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /DOCKER_WEB_BUILD_MEMORY/);
  assert.match(errors, /DOCKER_WEB_BUILD_MAX_PARALLELISM/);
  assert.match(errors, /DOCKER_WEB_DOCKER_MEMORY_LIMIT/);
  assert.match(errors, /DOCKER_WEB_NEXT_APP_ONLY/);
  assert.match(errors, /DOCKER_WEB_NEXT_BUILD_ENGINE/);
  assert.match(errors, /DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE/);
  assert.match(errors, /DOCKER_WEB_REACT_COMPILER/);
  assert.match(errors, /DOCKER_WEB_TURBO_CONCURRENCY/);
});

test('validateDockerProdCompose reports missing version badge metadata env wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR)
    .replace(
      / {6}PLATFORM_BUILD_COMMIT_HASH: \$\{PLATFORM_BUILD_COMMIT_HASH:-\}\n/u,
      ''
    )
    .replace('    - PLATFORM_BUILD_COMMIT_HASH\n', '');

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /PLATFORM_BUILD_COMMIT_HASH/);
});

test('validateDockerProdCompose reports missing TanStack backend health dependency', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    [
      '  depends_on:',
      '    backend:',
      '      condition: service_healthy',
      '',
    ].join('\n'),
    ''
  );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /x-tanstack-web-service/);
  assert.match(errors, /backend/);
  assert.match(errors, /service_healthy/);
});

test('validateDockerProdCompose requires script-backed TanStack healthchecks', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '"docker/healthcheck.mjs"',
    '"-e"'
  );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /docker\/healthcheck\.mjs/u);
});

test('validateDockerProdCompose rejects public production port mappings and fallback token', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR)
    .replace(
      '"127.0.0.1:$' + '{' + 'DOCKER_WEB_DIRECT_HOST_PORT:-7803' + '}:7803"',
      '"$' + '{' + 'DOCKER_WEB_DIRECT_HOST_PORT:-7803' + '}:7803"'
    )
    .replace(
      '"127.0.0.1:$' + '{' + 'DOCKER_WEB_PROXY_HOST_PORT:-7803' + '}:7803"',
      '"$' + '{' + 'DOCKER_WEB_PROXY_HOST_PORT:-7803' + '}:7803"'
    )
    .replace(
      '"127.0.0.1:$' + '{' + 'DOCKER_HIVE_PROXY_HOST_PORT:-7814' + '}:7814"',
      '"$' + '{' + 'DOCKER_HIVE_PROXY_HOST_PORT:-7814' + '}:7814"'
    )
    .replace(
      '"127.0.0.1:$' +
        '{' +
        'DOCKER_MEET_REALTIME_PROXY_HOST_PORT:-7816' +
        '}:7816"',
      '"$' + '{' + 'DOCKER_MEET_REALTIME_PROXY_HOST_PORT:-7816' + '}:7816"'
    )
    .replace(
      '"127.0.0.1:$' + '{' + 'DOCKER_WEB_REDIS_HOST_PORT:-6379' + '}:6379"',
      '"$' + '{' + 'DOCKER_WEB_REDIS_HOST_PORT:-6379' + '}:6379"'
    )
    .replace(
      '"127.0.0.1:$' +
        '{' +
        'DOCKER_WEB_SERVERLESS_REDIS_HTTP_HOST_PORT:-8079' +
        '}:80"',
      '"$' + '{' + 'DOCKER_WEB_SERVERLESS_REDIS_HTTP_HOST_PORT:-8079' + '}:80"'
    )
    .replace(
      '$' +
        '{' +
        'UPSTASH_REDIS_REST_TOKEN:?UPSTASH_REDIS_REST_TOKEN is required' +
        '}',
      '$' + '{' + 'UPSTASH_REDIS_REST_TOKEN:-platform-local-redis-token' + '}'
    );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /production direct web port must bind to 127\.0\.0\.1/);
  assert.match(errors, /production web proxy port must bind to 127\.0\.0\.1/);
  assert.match(errors, /production Hive proxy port must bind to 127\.0\.0\.1/);
  assert.match(
    errors,
    /production Meet realtime proxy port must bind to 127\.0\.0\.1/
  );
  assert.match(
    errors,
    /production Redis native port must bind to 127\.0\.0\.1/
  );
  assert.match(
    errors,
    /production Redis HTTP bridge port must bind to 127\.0\.0\.1/
  );
  assert.match(errors, /must not use the local fallback token/);
});

test('validateDockerProdCompose reports missing blue-green proxy wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '      - ../tmp/docker-web/prod/nginx.conf:/etc/nginx/conf.d/default.conf:ro\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.ok(
    errors
      .join('\n')
      .includes(
        '../tmp/docker-web/prod/nginx.conf:/etc/nginx/conf.d/default.conf:ro'
      )
  );
});

test('validateDockerProdCompose reports missing watcher container wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replaceAll(
    '      - /var/run/docker.sock:/var/run/docker.sock\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /\/var\/run\/docker\.sock/);
});

test('production watcher service does not keep BuildKit running while idle', () => {
  const opsComposeContent = fs.readFileSync(
    path.join(ROOT_DIR, 'docker-compose', 'compose.web.prod.ops.yml'),
    'utf8'
  );
  const watcherServiceBlock =
    opsComposeContent.match(
      /^ {2}web-blue-green-watcher:\n(?:(?: {4,}.+\n)|(?:\s*\n))*/mu
    )?.[0] ?? '';

  assert.match(
    watcherServiceBlock,
    /DOCKER_WEB_BUILDKIT_ENDPOINT=tcp:\/\/buildkit:1234/u
  );
  assert.match(watcherServiceBlock, /^\s+- DOCKER_WEB_BUILD_MEMORY$/mu);
  assert.match(watcherServiceBlock, /^\s+- DOCKER_WEB_BUILD_CPUS$/mu);
  assert.match(watcherServiceBlock, /^\s+- DOCKER_WEB_FRONTEND$/mu);
  assert.match(
    watcherServiceBlock,
    /^\s+- DOCKER_WEB_BUILD_MAX_PARALLELISM$/mu
  );
  assert.match(
    watcherServiceBlock,
    /^\s+- DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE$/mu
  );
  assert.match(watcherServiceBlock, /^\s+- DOCKER_WEB_NEXT_BUILD_CPUS$/mu);
  assert.doesNotMatch(watcherServiceBlock, /^\s+buildkit:\s*$/mu);
});

test('validateDockerProdCompose reports missing watcher build env wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR)
    .replace('      - DOCKER_WEB_BUILD_MEMORY\n', '')
    .replace('      - DOCKER_WEB_NEXT_BUILD_CPUS\n', '');

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /DOCKER_WEB_BUILD_MEMORY/);
  assert.match(errors.join('\n'), /DOCKER_WEB_NEXT_BUILD_CPUS/);
});

test('validateDockerProdCompose reports missing frontend selector env wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replaceAll(
    '      - DOCKER_WEB_FRONTEND\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /DOCKER_WEB_FRONTEND/);
  assert.match(errors.join('\n'), /web-blue-green-watcher/);
  assert.match(errors.join('\n'), /web-cron-runner/);
});

test('validateDockerProdCompose reports missing cron runner wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '  web-cron-runner:\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /web-cron-runner/);
});

test('validateDockerProdCompose requires watcher companion healthchecks', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR)
    .replace(
      /^[ ]{2}web-blue-green-watcher:\n(?:(?:[ ]{4,}.+\n)|(?:\s*\n))*/mu,
      (block) => block.replace('    healthcheck:', '    x-healthcheck:')
    )
    .replace(
      /^[ ]{2}web-cron-runner:\n(?:(?:[ ]{4,}.+\n)|(?:\s*\n))*/mu,
      (block) => block.replace('    healthcheck:', '    x-healthcheck:')
    );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /web-blue-green-watcher.*healthcheck/u);
  assert.match(errors, /web-cron-runner.*healthcheck/u);
});

test('validateDockerProdCompose requires cron runner heartbeat healthcheck', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '/usr/local/bin/cron-runner-entrypoint.js',
    '/bin/true'
  );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /cron-runner-entrypoint\.js --healthcheck/u);
});

test('validateDockerProdCompose reports missing watcher host workspace wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replaceAll(
    '      - ..:' +
      '${' +
      'PLATFORM_HOST_WORKSPACE_DIR:-/workspace-host' +
      '}\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /PLATFORM_HOST_WORKSPACE_DIR/);
});

test('validateDockerProdCompose reports missing watcher linked-worktree Git metadata wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR)
    .replaceAll('      - DOCKER_WEB_GIT_COMMON_DIR\n', '')
    .replaceAll(
      '      - ${' +
        'DOCKER_WEB_GIT_COMMON_DIR:-../.git' +
        '}:${' +
        'DOCKER_WEB_GIT_COMMON_DIR:-/workspace-git-common' +
        '}\n',
      ''
    );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /DOCKER_WEB_GIT_COMMON_DIR/);
});

test('validateDockerProdCompose reports missing watcher project registry wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replaceAll(
    '      - PLATFORM_LOG_DRAIN_DATABASE_URL=postgres://platform_log_drain:platform_log_drain@log-drain-postgres:5432/platform_log_drain\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /PLATFORM_LOG_DRAIN_DATABASE_URL/);
});

test('validateDockerProdCompose rejects log-drain dependencies on runtime services', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '  healthcheck:\n    test:\n      [',
    [
      '  depends_on:',
      '    log-drain-postgres:',
      '      condition: service_started',
      '      required: false',
      '  healthcheck:',
      '    test:',
      '      [',
    ].join('\n')
  );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /must not depend_on log-drain-postgres/u);
});

test('validateDockerProdCompose reports missing monitoring runtime mount', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '    - ../tmp/docker-web:/app/runtime/docker-web:ro\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(
    errors.join('\n'),
    /\.\.\/tmp\/docker-web:\/app\/runtime\/docker-web:ro/
  );
});

test('validateDockerProdCompose rejects include-relative repo paths', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '      context: ../apps/storage-unzip-proxy\n',
    '      context: apps/storage-unzip-proxy\n'
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /include-relative repo path/);
});

test('validateDockerProdCompose reports missing monitoring env wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '    - PLATFORM_BLUE_GREEN_MONITORING_DIR=/app/runtime/docker-web\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(
    errors.join('\n'),
    /PLATFORM_BLUE_GREEN_MONITORING_DIR=\/app\/runtime\/docker-web/
  );
});

test('validateDockerProdCompose reports a drifted proxy healthcheck path', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replaceAll(
    '/__platform/drain-status',
    '/api/health'
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(
    errors.join('\n'),
    /http:\/\/127\.0\.0\.1:7803\/__platform\/drain-status/
  );
});

test('validateDockerProdCompose reports missing sidecar healthchecks', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR)
    .replace('http://127.0.0.1:8788/health', 'http://127.0.0.1:8788/')
    .replace('["PING"]', '["ECHO","ok"]')
    .replace("ps | grep -q '[w]atch-blue-green-deploy.js'", 'ps');

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /http:\/\/127\.0\.0\.1:8788\/health/);
  assert.match(errors, /\["PING"\]/);
  assert.match(errors, /\[w\]atch-blue-green-deploy\.js/);
});

test('validateDockerProdCompose reports missing MarkItDown Supabase URL env', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '      - SUPABASE_URL\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /SUPABASE_URL/);
});

test('validateWatcherDockerfile accepts the current watcher Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(WATCHER_DOCKERFILE_PATH, 'utf8');

  assert.deepEqual(validateWatcherDockerfile(dockerfileContent), []);
});

test('validateDockerControlDockerfile accepts the current Docker control Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(
    DOCKER_CONTROL_DOCKERFILE_PATH,
    'utf8'
  );

  assert.deepEqual(validateDockerControlDockerfile(dockerfileContent), []);
});

test('validateCronRunnerDockerfile accepts the current cron runner Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(
    CRON_RUNNER_DOCKERFILE_PATH,
    'utf8'
  );

  assert.deepEqual(validateCronRunnerDockerfile(dockerfileContent), []);
});

test('validateNativeWebRunnerDockerfile accepts the native runtime image files', () => {
  const dockerfileContent = fs.readFileSync(
    NATIVE_WEB_RUNNER_DOCKERFILE_PATH,
    'utf8'
  );
  const dockerignoreContent = fs.readFileSync(
    NATIVE_WEB_RUNNER_DOCKERIGNORE_PATH,
    'utf8'
  );

  assert.deepEqual(
    validateNativeWebRunnerDockerfile(dockerfileContent, dockerignoreContent),
    []
  );
});

test('validateNativeWebRunnerDockerfile reports missing runtime file copies', () => {
  const dockerfileContent = fs
    .readFileSync(NATIVE_WEB_RUNNER_DOCKERFILE_PATH, 'utf8')
    .replace(
      'COPY --chown=nextjs:nodejs apps/web/docker/request-tracker.js ./apps/web/docker/request-tracker.js\n',
      ''
    );
  const dockerignoreContent = fs
    .readFileSync(NATIVE_WEB_RUNNER_DOCKERIGNORE_PATH, 'utf8')
    .replace('!apps/web/docker/request-tracker.js\n', '');

  const errors = validateNativeWebRunnerDockerfile(
    dockerfileContent,
    dockerignoreContent
  ).join('\n');

  assert.match(errors, /request-tracker\.js/);
});

test('validateNativeWebRunnerDockerfile reports missing version badge metadata env wiring', () => {
  const dockerfileContent = fs
    .readFileSync(NATIVE_WEB_RUNNER_DOCKERFILE_PATH, 'utf8')
    .replace('ARG PLATFORM_BUILD_COMMIT_HASH=\n', '')
    .replace(
      /ENV PLATFORM_BUILD_COMMIT_HASH=\$\{PLATFORM_BUILD_COMMIT_HASH\}\n/u,
      ''
    );
  const dockerignoreContent = fs.readFileSync(
    NATIVE_WEB_RUNNER_DOCKERIGNORE_PATH,
    'utf8'
  );

  const errors = validateNativeWebRunnerDockerfile(
    dockerfileContent,
    dockerignoreContent
  ).join('\n');

  assert.match(errors, /PLATFORM_BUILD_COMMIT_HASH/);
});

test('validateMarkitdownDockerfile accepts the current MarkItDown Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(MARKITDOWN_DOCKERFILE_PATH, 'utf8');

  assert.deepEqual(validateMarkitdownDockerfile(dockerfileContent), []);
});

test('validateMarkitdownDockerfile requires cache-free uv sync', () => {
  const dockerfileContent = fs
    .readFileSync(MARKITDOWN_DOCKERFILE_PATH, 'utf8')
    .replace(' --no-cache', '');

  const errors = validateMarkitdownDockerfile(dockerfileContent);

  assert.match(errors.join('\n'), /uv sync --locked --no-dev --no-cache/);
});

test('validateHiveDockerfile reports missing Turbo cache mount', () => {
  const dockerfileContent = fs
    .readFileSync(HIVE_DOCKERFILE_PATH, 'utf8')
    .replace(
      '--mount=type=cache,id=platform-hive-turbo,target=/workspace/.turbo',
      ''
    );

  const errors = validateHiveDockerfile(dockerfileContent);

  assert.match(errors.join('\n'), /platform-hive-turbo/);
});

test('validateHiveDockerfile reports missing Turbo build command', () => {
  const dockerfileContent = fs
    .readFileSync(HIVE_DOCKERFILE_PATH, 'utf8')
    .replace(
      'bun --env-file=/tmp/web.env run turbo:local run build:docker -F @tuturuuu/hive',
      ''
    );

  const errors = validateHiveDockerfile(dockerfileContent);

  assert.match(errors.join('\n'), /build:docker -F @tuturuuu\/hive/u);
});

test('validateWatcherDockerfile reports missing docker cli tooling', () => {
  const dockerfileContent = fs
    .readFileSync(WATCHER_DOCKERFILE_PATH, 'utf8')
    .replace(
      'RUN apk add --no-cache docker-cli docker-cli-buildx docker-cli-compose git openssh-client\n',
      ''
    );

  const errors = validateWatcherDockerfile(dockerfileContent);

  assert.match(
    errors.join('\n'),
    /docker-cli docker-cli-buildx docker-cli-compose git openssh-client/
  );
});

test('checkDockerWebSetup passes for the current repository', () => {
  assert.deepEqual(checkDockerWebSetup({ rootDir: ROOT_DIR }), []);
});

test('checkDockerWebSetup uses rootDir for default docker reads', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'check-docker-web-rootdir-')
  );

  try {
    fs.mkdirSync(path.join(tempDir, '.github', 'workflows'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'docker'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'backend'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'chat-realtime'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'discord'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'hive'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'hive', 'db'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'hive-realtime'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'meet-realtime'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'supermemory'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'tanstack-web'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'tanstack-web', 'docker'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'web', 'Dockerfile'),
      'FROM scratch AS deps\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'backend', 'Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'chat-realtime', 'Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(
        tempDir,
        'apps',
        'web',
        'docker',
        'blue-green-watcher.Dockerfile'
      ),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'web', 'docker', 'cron-runner.Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'web', 'docker', 'docker-control.Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'web', 'docker', 'native-runner.Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(
        tempDir,
        'apps',
        'web',
        'docker',
        'native-runner.Dockerfile.dockerignore'
      ),
      ''
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'discord', 'Dockerfile.markitdown'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'hive', 'Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'hive', 'db', 'migrate-forward.sh'),
      ''
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'hive-realtime', 'Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'meet-realtime', 'Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'supermemory', 'Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'tanstack-web', 'Dockerfile'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'tanstack-web', 'docker', 'server.mjs'),
      ''
    );
    fs.writeFileSync(
      path.join(tempDir, 'docker-compose.web.yml'),
      'services:\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'docker-compose.web.prod.yml'),
      'services:\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'docker-compose.tanstack-dual.yml'),
      'services:\n'
    );
    fs.writeFileSync(path.join(tempDir, 'docker-bake.web.prod.hcl'), '');
    fs.writeFileSync(path.join(tempDir, '.dockerignore'), '');
    fs.writeFileSync(
      path.join(tempDir, '.github', 'workflows', 'docker-setup-check.yaml'),
      ''
    );

    const errors = checkDockerWebSetup({
      rootDir: tempDir,
      fileDependencyPaths: [],
      workspacePackageJsonPaths: [],
    });

    assert.match(errors.join('\n'), /missing the dev stage/);
    assert.ok(errors.join('\n').includes('  web:'));
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

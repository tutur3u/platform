const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  readDockerProdComposeMergedText,
} = require('./docker-web/prod-compose-include.js');

const {
  getAutoDockerNodeMaxOldSpaceSizeMb,
  getDockerNodeMaxOldSpaceSizeMb,
  mergeNodeOptions,
  parseMemoryToMb,
} = require('./run-web-docker-next-build.js');

const {
  CRON_RUNNER_DOCKERFILE_PATH,
  DOCKERIGNORE_PATH,
  MARKITDOWN_DOCKERFILE_PATH,
  ROOT_DIR,
  WATCHER_DOCKERFILE_PATH,
  WEB_COMPOSE_FILE_PATH,
  WEB_DOCKERFILE_PATH,
  checkDockerWebSetup,
  getCopiedRelativePaths,
  getCopiedWorkspaceManifestPaths,
  getStageContent,
  listFileDependencyPaths,
  listWorkspacePackageJsonPaths,
  validateDockerCompose,
  validateDockerProdCompose,
  validateDockerignore,
  validateDockerfile,
  validateCronRunnerDockerfile,
  validateMarkitdownDockerfile,
  validateWatcherDockerfile,
} = require('./check-docker-web.js');

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

test('validateDockerignore accepts the current Docker context excludes', () => {
  const dockerignoreContent = fs.readFileSync(DOCKERIGNORE_PATH, 'utf8');

  assert.deepEqual(validateDockerignore(dockerignoreContent), []);
});

test('validateDockerignore reports generated app artifacts in the context', () => {
  const dockerignoreContent = fs
    .readFileSync(DOCKERIGNORE_PATH, 'utf8')
    .replace('**/.next\n', '')
    .replace('apps/mobile/build\n', '');

  const errors = validateDockerignore(dockerignoreContent).join('\n');

  assert.match(errors, /\.dockerignore must exclude \*\*\/\.next/);
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
  assert.match(wrapper, /DEFAULT_NEXT_BUILD_ENGINE = 'webpack'/u);
  assert.match(wrapper, /DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE/u);
  assert.match(wrapper, /DOCKER_WEB_NEXT_BUILD_ENGINE/u);
  assert.match(wrapper, /NEXT_BUILD_ENGINES\.get\(nextBuildEngine\)/u);
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
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '12g' }),
    6144
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '16g' }),
    8192
  );
  assert.equal(
    getAutoDockerNodeMaxOldSpaceSizeMb({ DOCKER_WEB_BUILD_MEMORY: '24g' }),
    12288
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
      DOCKER_WEB_BUILD_MEMORY: '24g',
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: '16g',
    }),
    8192
  );
});

test('Docker web build NODE_OPTIONS always includes at least a 4 GB heap', () => {
  assert.equal(
    getDockerNodeMaxOldSpaceSizeMb({
      DOCKER_WEB_BUILD_MEMORY: '16g',
      DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE: 'auto',
    }),
    8192
  );
  assert.equal(
    mergeNodeOptions('--max-old-space-size=2048 --trace-warnings', {
      DOCKER_WEB_BUILD_MEMORY: '12g',
    }),
    '--trace-warnings --max-old-space-size=6144 --experimental-require-module'
  );
  assert.throws(
    () =>
      getDockerNodeMaxOldSpaceSizeMb({
        DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE: '2048',
      }),
    /at least 4096/
  );
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

test('validateDockerCompose accepts the current compose file', () => {
  const composeContent = fs.readFileSync(WEB_COMPOSE_FILE_PATH, 'utf8');

  assert.deepEqual(validateDockerCompose(composeContent), []);
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
    .replace('      - .:/workspace\n', '');

  const errors = validateDockerCompose(composeContent);

  assert.ok(errors.join('\n').includes('- .:/workspace'));
});

test('validateDockerCompose reports missing package-local artifact isolation', () => {
  const composeContent = fs
    .readFileSync(WEB_COMPOSE_FILE_PATH, 'utf8')
    .replace(
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

test('validateDockerProdCompose reports missing Docker web build args', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    [
      '    args:',
      '      DOCKER_WEB_BUILD_MEMORY: $' +
        '{' +
        'DOCKER_WEB_BUILD_MEMORY:-12g' +
        '}',
      '      DOCKER_WEB_DOCKER_MEMORY_LIMIT: $' +
        '{' +
        'DOCKER_WEB_DOCKER_MEMORY_LIMIT:-' +
        '}',
      '      DOCKER_WEB_NEXT_BUILD_ENGINE: $' +
        '{' +
        'DOCKER_WEB_NEXT_BUILD_ENGINE:-webpack' +
        '}',
      '      DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE: $' +
        '{' +
        'DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE:-auto' +
        '}',
      '',
    ].join('\n'),
    ''
  );

  const errors = validateDockerProdCompose(composeContent).join('\n');

  assert.match(errors, /DOCKER_WEB_BUILD_MEMORY/);
  assert.match(errors, /DOCKER_WEB_DOCKER_MEMORY_LIMIT/);
  assert.match(errors, /DOCKER_WEB_NEXT_BUILD_ENGINE/);
  assert.match(errors, /DOCKER_WEB_NODE_MAX_OLD_SPACE_SIZE/);
});

test('validateDockerProdCompose rejects public Redis mappings and fallback token', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR)
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

test('validateDockerProdCompose reports missing cron runner wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replace(
    '  web-cron-runner:\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /web-cron-runner/);
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

test('validateDockerProdCompose reports missing watcher project registry wiring', () => {
  const composeContent = readDockerProdComposeMergedText(ROOT_DIR).replaceAll(
    '      - PLATFORM_LOG_DRAIN_DATABASE_URL=postgres://platform_log_drain:platform_log_drain@log-drain-postgres:5432/platform_log_drain\n',
    ''
  );

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /PLATFORM_LOG_DRAIN_DATABASE_URL/);
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

test('validateCronRunnerDockerfile accepts the current cron runner Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(
    CRON_RUNNER_DOCKERFILE_PATH,
    'utf8'
  );

  assert.deepEqual(validateCronRunnerDockerfile(dockerfileContent), []);
});

test('validateMarkitdownDockerfile accepts the current MarkItDown Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(MARKITDOWN_DOCKERFILE_PATH, 'utf8');

  assert.deepEqual(validateMarkitdownDockerfile(dockerfileContent), []);
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
    fs.mkdirSync(path.join(tempDir, 'apps', 'web', 'docker'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(tempDir, 'apps', 'discord'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tempDir, 'apps', 'web', 'Dockerfile'),
      'FROM scratch AS deps\n'
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
      path.join(tempDir, 'apps', 'discord', 'Dockerfile.markitdown'),
      'FROM scratch\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'docker-compose.web.yml'),
      'services:\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'docker-compose.web.prod.yml'),
      'services:\n'
    );
    fs.writeFileSync(path.join(tempDir, '.dockerignore'), '');

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

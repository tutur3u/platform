const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ROOT_DIR,
  WATCHER_DOCKERFILE_PATH,
  WEB_COMPOSE_FILE_PATH,
  WEB_DOCKERFILE_PATH,
  WEB_PROD_COMPOSE_FILE_PATH,
  checkDockerWebSetup,
  getCopiedRelativePaths,
  getCopiedWorkspaceManifestPaths,
  getStageContent,
  listFileDependencyPaths,
  listWorkspacePackageJsonPaths,
  validateDockerCompose,
  validateDockerProdCompose,
  validateDockerfile,
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
  const composeContent = fs.readFileSync(WEB_PROD_COMPOSE_FILE_PATH, 'utf8');

  assert.deepEqual(validateDockerProdCompose(composeContent), []);
});

test('validateDockerProdCompose reports missing blue-green proxy wiring', () => {
  const composeContent = fs
    .readFileSync(WEB_PROD_COMPOSE_FILE_PATH, 'utf8')
    .replace(
      '      - ./tmp/docker-web/prod/nginx.conf:/etc/nginx/conf.d/default.conf:ro\n',
      ''
    );

  const errors = validateDockerProdCompose(composeContent);

  assert.ok(
    errors
      .join('\n')
      .includes(
        './tmp/docker-web/prod/nginx.conf:/etc/nginx/conf.d/default.conf:ro'
      )
  );
});

test('validateDockerProdCompose reports missing watcher container wiring', () => {
  const composeContent = fs
    .readFileSync(WEB_PROD_COMPOSE_FILE_PATH, 'utf8')
    .replace('      - /var/run/docker.sock:/var/run/docker.sock\n', '');

  const errors = validateDockerProdCompose(composeContent);

  assert.match(errors.join('\n'), /\/var\/run\/docker\.sock/);
});

test('validateDockerProdCompose reports a drifted proxy healthcheck path', () => {
  const composeContent = fs
    .readFileSync(WEB_PROD_COMPOSE_FILE_PATH, 'utf8')
    .replace('/__platform/drain-status', '/api/health');

  const errors = validateDockerProdCompose(composeContent);

  assert.match(
    errors.join('\n'),
    /http:\/\/127\.0\.0\.1:7803\/__platform\/drain-status/
  );
});

test('validateWatcherDockerfile accepts the current watcher Dockerfile', () => {
  const dockerfileContent = fs.readFileSync(WATCHER_DOCKERFILE_PATH, 'utf8');

  assert.deepEqual(validateWatcherDockerfile(dockerfileContent), []);
});

test('validateWatcherDockerfile reports missing docker cli tooling', () => {
  const dockerfileContent = fs
    .readFileSync(WATCHER_DOCKERFILE_PATH, 'utf8')
    .replace('RUN apk add --no-cache docker-cli git openssh-client\n', '');

  const errors = validateWatcherDockerfile(dockerfileContent);

  assert.match(errors.join('\n'), /docker-cli git openssh-client/);
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
      path.join(tempDir, 'docker-compose.web.yml'),
      'services:\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'docker-compose.web.prod.yml'),
      'services:\n'
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

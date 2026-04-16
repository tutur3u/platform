const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  ROOT_DIR,
  WEB_COMPOSE_FILE_PATH,
  WEB_DOCKERFILE_PATH,
  checkDockerWebSetup,
  getCopiedWorkspaceManifestPaths,
  getStageContent,
  listFileDependencyPaths,
  listWorkspacePackageJsonPaths,
  validateDockerCompose,
  validateDockerfile,
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

test('validateDockerCompose accepts the current compose file', () => {
  const composeContent = fs.readFileSync(WEB_COMPOSE_FILE_PATH, 'utf8');

  assert.deepEqual(validateDockerCompose(composeContent), []);
});

test('validateDockerCompose reports missing bind mounts', () => {
  const composeContent = fs
    .readFileSync(WEB_COMPOSE_FILE_PATH, 'utf8')
    .replace('      - .:/workspace\n', '');

  const errors = validateDockerCompose(composeContent);

  assert.match(
    errors.join('\n'),
    /missing the expected snippet: {7}- \.:\/workspace/
  );
});

test('checkDockerWebSetup passes for the current repository', () => {
  assert.deepEqual(checkDockerWebSetup({ rootDir: ROOT_DIR }), []);
});

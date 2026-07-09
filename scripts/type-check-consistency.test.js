const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const expectedTypeScriptVersion = '7.0.2';
const expectedNativePreviewVersion = '7.0.0-dev.20260707.2';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function getWorkspacePackageJsonPaths() {
  return ['apps', 'packages'].flatMap((workspaceDir) => {
    const absoluteWorkspaceDir = path.join(repoRoot, workspaceDir);

    return fs
      .readdirSync(absoluteWorkspaceDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(workspaceDir, entry.name, 'package.json'))
      .filter((relativePath) =>
        fs.existsSync(path.join(repoRoot, relativePath))
      );
  });
}

function getNextBuildPackageJsonPaths() {
  return getWorkspacePackageJsonPaths().filter((packageJsonPath) => {
    const packageJson = readJson(packageJsonPath);
    const buildScript = packageJson.scripts?.build;

    return (
      typeof buildScript === 'string' && /\bnext\s+build\b/.test(buildScript)
    );
  });
}

test('type-check turbo task invalidates on root dependency/runtime changes', () => {
  const turboConfig = readJson('turbo.json');

  assert.equal(turboConfig.tasks['type-check'].cache, undefined);
  assert.ok(turboConfig.tasks['type-check'].inputs.includes('bun.lock'));
  assert.ok(turboConfig.tasks['type-check'].inputs.includes('package.json'));
});

test('type-check workflow Bun version matches the repo packageManager pin', () => {
  const rootPackageJson = readJson('package.json');
  const expectedBunVersion = rootPackageJson.packageManager.replace(
    /^bun@/,
    ''
  );
  const workflowSource = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/type-check.yaml'),
    'utf8'
  );
  const bunVersionMatch = workflowSource.match(/bun-version:\s*([^\s]+)/);

  assert.ok(bunVersionMatch, 'Expected bun-version in type-check workflow');
  assert.equal(bunVersionMatch[1], expectedBunVersion);
});

test('workspace tsc build type-check scripts use the cache-invalidation wrapper', () => {
  const invalidScripts = [];

  for (const packageJsonPath of getWorkspacePackageJsonPaths()) {
    const packageJson = readJson(packageJsonPath);
    const typeCheckScript = packageJson.scripts?.['type-check'];

    if (!typeCheckScript?.includes('--build')) {
      continue;
    }

    if (
      typeCheckScript !== 'node ../../scripts/run-tsc-build.js --build' ||
      typeCheckScript.includes('--force')
    ) {
      invalidScripts.push({
        file: packageJsonPath,
        script: typeCheckScript,
      });
    }
  }

  assert.deepEqual(invalidScripts, []);
});

test('workspace build and dev scripts do not use legacy tsgo', () => {
  const invalidScripts = [];

  for (const packageJsonPath of getWorkspacePackageJsonPaths()) {
    const packageJson = readJson(packageJsonPath);

    for (const scriptName of ['build', 'dev']) {
      const script = packageJson.scripts?.[scriptName];

      if (typeof script === 'string' && /\btsgo\b/.test(script)) {
        invalidScripts.push({
          file: packageJsonPath,
          script: scriptName,
          command: script,
        });
      }
    }
  }

  assert.deepEqual(invalidScripts, []);
});

test('workspace direct tsc scripts own the TypeScript 7 binary', () => {
  const invalidPackages = [];

  for (const packageJsonPath of getWorkspacePackageJsonPaths()) {
    const packageJson = readJson(packageJsonPath);

    for (const scriptName of ['build', 'dev', 'type-check']) {
      const script = packageJson.scripts?.[scriptName];

      if (
        typeof script !== 'string' ||
        !/\btsc\b/.test(script) ||
        script.includes('run-tsc-build.js')
      ) {
        continue;
      }

      if (
        packageJson.devDependencies?.typescript !== expectedTypeScriptVersion
      ) {
        invalidPackages.push({
          file: packageJsonPath,
          script: scriptName,
          command: script,
          version: packageJson.devDependencies?.typescript,
        });
      }
    }
  }

  assert.deepEqual(invalidPackages, []);
});

test('workspace TypeScript dependencies use TypeScript 7', () => {
  const invalidPackages = [];

  for (const packageJsonPath of [
    'package.json',
    ...getWorkspacePackageJsonPaths(),
  ]) {
    const packageJson = readJson(packageJsonPath);

    for (const dependencyField of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const version = packageJson[dependencyField]?.typescript;

      if (version && version !== expectedTypeScriptVersion) {
        invalidPackages.push({
          file: packageJsonPath,
          dependencyField,
          version,
        });
      }
    }
  }

  assert.deepEqual(invalidPackages, []);
});

test('Next build workspaces declare native-preview TypeScript for TS7 builds', () => {
  const invalidPackages = [];

  for (const packageJsonPath of getNextBuildPackageJsonPaths()) {
    const packageJson = readJson(packageJsonPath);
    const version = packageJson.devDependencies?.['@typescript/native-preview'];

    if (version !== expectedNativePreviewVersion) {
      invalidPackages.push({
        file: packageJsonPath,
        version,
      });
    }
  }

  assert.deepEqual(invalidPackages, []);
});

test('non-Next workspaces do not declare native-preview TypeScript', () => {
  const invalidPackages = [];
  const allowedPackageJsonPaths = new Set(getNextBuildPackageJsonPaths());

  for (const packageJsonPath of [
    'package.json',
    ...getWorkspacePackageJsonPaths(),
  ]) {
    const packageJson = readJson(packageJsonPath);

    for (const dependencyField of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const version =
        packageJson[dependencyField]?.['@typescript/native-preview'];

      if (
        version &&
        (!allowedPackageJsonPaths.has(packageJsonPath) ||
          dependencyField !== 'devDependencies' ||
          version !== expectedNativePreviewVersion)
      ) {
        invalidPackages.push({
          file: packageJsonPath,
          dependencyField,
          version,
        });
      }
    }
  }

  assert.deepEqual(invalidPackages, []);
});

test('workspace manifests do not declare legacy compiler compatibility packages', () => {
  const invalidPackages = [];
  const legacyCompilerPackages = [
    ['@typescript', 'type' + 'script' + '6'].join('/'),
  ];

  for (const packageJsonPath of [
    'package.json',
    ...getWorkspacePackageJsonPaths(),
  ]) {
    const packageJson = readJson(packageJsonPath);

    for (const dependencyField of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      for (const packageName of legacyCompilerPackages) {
        const version = packageJson[dependencyField]?.[packageName];

        if (version) {
          invalidPackages.push({
            file: packageJsonPath,
            dependencyField,
            packageName,
            version,
          });
        }
      }
    }
  }

  assert.deepEqual(invalidPackages, []);
});

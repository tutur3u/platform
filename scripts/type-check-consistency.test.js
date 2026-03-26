const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

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

test('workspace tsgo build type-check scripts use the cache-invalidation wrapper', () => {
  const invalidScripts = [];

  for (const packageJsonPath of getWorkspacePackageJsonPaths()) {
    const packageJson = readJson(packageJsonPath);
    const typeCheckScript = packageJson.scripts?.['type-check'];

    if (!typeCheckScript?.includes('--build')) {
      continue;
    }

    if (
      typeCheckScript !== 'node ../../scripts/run-tsgo-build.js --build' ||
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

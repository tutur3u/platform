const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  findViolations,
  formatViolation,
} = require('./package-release-dependency-guard.js');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createRepo(packages, releasedDirs) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-dep-guard-'));

  writeJson(path.join(repoRoot, 'package.json'), {
    name: 'fixture',
    workspaces: ['packages/*'],
  });

  for (const [dir, packageJson] of Object.entries(packages)) {
    writeJson(path.join(repoRoot, 'packages', dir, 'package.json'), {
      version: '1.0.0',
      ...packageJson,
    });
  }

  const workflowsDir = path.join(repoRoot, '.github', 'workflows');
  fs.mkdirSync(workflowsDir, { recursive: true });
  for (const dir of releasedDirs) {
    fs.writeFileSync(
      path.join(workflowsDir, `release-${dir}-package.yaml`),
      `run: node scripts/ci/package-release-readiness.js gate-package-release "packages/${dir}/package.json"\n`
    );
  }

  return repoRoot;
}

test('accepts released packages that only depend on released packages', () => {
  const repoRoot = createRepo(
    {
      app: { name: '@fixture/app', dependencies: { '@fixture/lib': '1.0.0' } },
      lib: { name: '@fixture/lib' },
    },
    ['app', 'lib']
  );

  assert.deepEqual(findViolations(repoRoot), []);
});

test('rejects private and unreleased workspace dependencies in installed fields', () => {
  const repoRoot = createRepo(
    {
      app: {
        name: '@fixture/app',
        dependencies: {
          '@fixture/private': 'workspace:*',
          '@fixture/unreleased': 'workspace:*',
        },
        optionalDependencies: { '@fixture/unreleased': 'workspace:*' },
        peerDependencies: { '@fixture/private': 'workspace:*' },
      },
      private: { name: '@fixture/private', private: true },
      unreleased: { name: '@fixture/unreleased' },
    },
    ['app']
  );

  assert.deepEqual(findViolations(repoRoot).map(formatViolation), [
    '@fixture/app dependencies -> @fixture/private is private',
    '@fixture/app peerDependencies -> @fixture/private is private',
    '@fixture/app dependencies -> @fixture/unreleased has no release-*-package.yaml workflow',
    '@fixture/app optionalDependencies -> @fixture/unreleased has no release-*-package.yaml workflow',
  ]);
});

test('ignores devDependencies, external packages and unpublished dependents', () => {
  const repoRoot = createRepo(
    {
      app: {
        name: '@fixture/app',
        dependencies: { react: '^19.0.0' },
        devDependencies: { '@fixture/private': 'workspace:*' },
      },
      internal: {
        name: '@fixture/internal',
        dependencies: { '@fixture/private': 'workspace:*' },
      },
      private: { name: '@fixture/private', private: true },
    },
    ['app']
  );

  assert.deepEqual(findViolations(repoRoot), []);
});

test('the repository publishes no package with private or unreleased workspace dependencies', () => {
  assert.deepEqual(findViolations().map(formatViolation), []);
});

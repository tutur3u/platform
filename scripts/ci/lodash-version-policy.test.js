const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const reviewedLodashVersion = '4.18.1';
const directLodashConsumers = [
  'apps/nova/package.json',
  'apps/rewise/package.json',
  'apps/web/package.json',
  'packages/ui/package.json',
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

test('direct lodash consumers and the lockfile stay on the reviewed artifact', () => {
  const rootPackageJson = readJson('package.json');

  assert.equal(
    rootPackageJson.overrides?.lodash,
    reviewedLodashVersion,
    'root overrides must force transitive lodash to the reviewed artifact'
  );

  for (const packageJsonPath of directLodashConsumers) {
    const packageJson = readJson(packageJsonPath);

    assert.equal(
      packageJson.dependencies?.lodash,
      reviewedLodashVersion,
      `${packageJsonPath} must publish/install the reviewed lodash version`
    );
  }

  const lockfile = fs.readFileSync(path.join(repoRoot, 'bun.lock'), 'utf8');

  assert.match(
    lockfile,
    /"lodash": \["lodash@4\.18\.1"/,
    'bun.lock must resolve lodash to the reviewed artifact'
  );
  assert.doesNotMatch(
    lockfile,
    /^\s*"lodash": \["lodash@(?!4\.18\.1\b)[^"]+"/m,
    'bun.lock must not resolve lodash to unreviewed artifacts'
  );
});

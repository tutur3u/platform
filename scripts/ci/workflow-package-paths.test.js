const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const workflowsDir = path.join(repoRoot, '.github/workflows');

function readWorkflows() {
  return fs
    .readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
    .map((name) => ({
      name,
      source: fs.readFileSync(path.join(workflowsDir, name), 'utf8'),
    }));
}

function packageReferences(source) {
  const references = new Set();
  for (const match of source.matchAll(
    /(?<![\w./-])packages\/([A-Za-z0-9._-]+)\//gu
  )) {
    references.add(match[1]);
  }
  return [...references].sort();
}

// A renamed or removed workspace package must not leave stale path filters
// behind: GitHub silently skips a workflow whose filters match nothing, so a
// stale `packages/<old-name>/**` entry drops CI coverage without any error.
test('every packages/<name>/ path in a workflow names an existing workspace package', () => {
  const missing = [];
  for (const { name, source } of readWorkflows()) {
    for (const packageName of packageReferences(source)) {
      if (!fs.existsSync(path.join(repoRoot, 'packages', packageName))) {
        missing.push(`${name}: packages/${packageName}/`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('no workflow still filters on the retired packages/turnstile path', () => {
  const stale = readWorkflows()
    .filter(({ source }) => source.includes('packages/turnstile'))
    .map(({ name }) => name);
  assert.deepEqual(stale, []);
});

test('Cloudflare app workflows that build the shared closure watch packages/cloudflare', () => {
  for (const name of ['pay-cloudflare.yaml', 'playground-cloudflare.yaml']) {
    const source = fs.readFileSync(path.join(workflowsDir, name), 'utf8');
    const filters = source.match(/^\s+'packages\/cloudflare\/\*\*',$/gmu) ?? [];
    assert.equal(
      filters.length,
      2,
      `${name} should list packages/cloudflare/** in both pull_request and push paths`
    );
  }
});

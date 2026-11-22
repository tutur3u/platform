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

// Cron Control's qualified artifact and its already-serving proof come from a
// push run at the exact production SHA, so the workflow must run whenever a
// workspace package bundled into the Worker changes.
test('Cron Control watches every workspace dependency in both pull_request and push paths', () => {
  const readJson = (file) =>
    JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
  const manifest = readJson('apps/cron-control/package.json');
  const workspaceNames = Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })
    .filter(([, version]) => String(version).startsWith('workspace:'))
    .map(([name]) => name);
  assert.ok(workspaceNames.length > 0, 'expected a workspace dependency');
  const packageDirs = new Map(
    fs
      .readdirSync(path.join(repoRoot, 'packages'))
      .filter((dir) =>
        fs.existsSync(path.join(repoRoot, 'packages', dir, 'package.json'))
      )
      .map((dir) => [readJson(`packages/${dir}/package.json`).name, dir])
  );
  const source = fs.readFileSync(
    path.join(workflowsDir, 'cron-control-cloudflare.yaml'),
    'utf8'
  );
  for (const name of workspaceNames) {
    const dir = packageDirs.get(name);
    assert.ok(dir, `${name} should be a packages/ workspace`);
    const filters =
      source.match(new RegExp(`^\\s+- 'packages/${dir}/\\*\\*'$`, 'gmu')) ?? [];
    assert.equal(
      filters.length,
      2,
      `cron-control-cloudflare.yaml should list packages/${dir}/** in both pull_request and push paths`
    );
  }
});

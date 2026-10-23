const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const root = resolve(__dirname, '../..');
const renovate = JSON.parse(
  readFileSync(resolve(root, 'renovate.json'), 'utf8')
);

test('Renovate holds cf prereleases for an explicitly qualified upgrade', () => {
  const rules = renovate.packageRules.filter((rule) =>
    rule.matchPackageNames?.includes('cf')
  );
  assert.equal(rules.length, 1);
  const rule = rules[0];
  assert.equal(rule.enabled, false);
  const current = new RegExp(rule.matchCurrentVersion.slice(1, -1));
  for (const version of ['1.0.0-beta.20', '1.0.0-beta.21', '2.0.0-alpha.1'])
    assert.ok(current.test(version), version);
  assert.equal(current.test('1.0.0'), false);
  for (const app of ['cron-control', 'devbox-control', 'coordination']) {
    const manifest = JSON.parse(
      readFileSync(resolve(root, `apps/${app}/package.json`), 'utf8')
    );
    if (manifest.devDependencies.cf) {
      assert.match(manifest.devDependencies.cf, /^\d+\.\d+\.\d+-beta\.\d+$/);
      assert.ok(current.test(manifest.devDependencies.cf));
    }
  }
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workflowsDir = path.resolve(__dirname, '../../.github/workflows');
const files = fs
  .readdirSync(workflowsDir)
  .filter(
    (file) =>
      file === 'vercel-production.yaml' ||
      /^vercel-production-.+\.yaml$/u.test(file)
  )
  .sort();
const EXPRESSION =
  "${{ vars.PRODUCTION_RUNNER_LABELS && fromJSON(vars.PRODUCTION_RUNNER_LABELS) || 'ubuntu-latest' }}";
const select = (value) =>
  vm.runInNewContext(EXPRESSION.replace(/^\$\{\{\s*|\s*\}\}$/g, ''), {
    vars: { PRODUCTION_RUNNER_LABELS: value },
    fromJSON: JSON.parse,
  });

test('the production deployment workflows are discovered', () => {
  assert.ok(files.includes('vercel-production.yaml'));
  assert.ok(files.length > 20, `${files.length} workflows`);
});

test('production runner selection defaults to hosted and accepts a label list', () => {
  assert.equal(select(undefined), 'ubuntu-latest');
  assert.equal(select(''), 'ubuntu-latest');
  assert.deepEqual(select('["self-hosted","Linux","X64","rex-prod-i9"]'), [
    'self-hosted',
    'Linux',
    'X64',
    'rex-prod-i9',
  ]);
});

for (const file of files) {
  test(`${file}: every job selects its runner through the production variable`, () => {
    const text = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    const runsOn = [...text.matchAll(/^\s+runs-on:\s*(.+)$/gm)].map((match) =>
      match[1].trim()
    );
    assert.ok(runsOn.length > 0, 'at least one job');
    for (const value of runsOn) assert.equal(value, EXPRESSION);
    const preamble = text.slice(0, text.indexOf('\njobs:\n'));
    assert.doesNotMatch(
      preamble,
      /^\s{2}pull_request(_target)?:/mu,
      'production workflows never run for pull requests'
    );
  });
}

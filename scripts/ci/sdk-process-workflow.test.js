const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('a process-helper-only change selects package qualification', () => {
  const repo = path.resolve(__dirname, '../..');
  const workflow = fs.readFileSync(
    path.join(repo, '.github/workflows/sdk-package-qualification.yaml'),
    'utf8'
  );
  const rules = [
    ...workflow.split('workflow_dispatch:')[0].matchAll(/^ {6}- "([^"]+)"$/gm),
  ].map((match) => match[1]);
  const helperRule = 'scripts/ci/sdk-package-process*';
  for (const helper of [
    'scripts/ci/sdk-package-process.js',
    'scripts/ci/sdk-package-process.test.js',
  ]) {
    const selected = (paths) =>
      paths.some((rule) => path.matchesGlob(helper, rule));
    assert.equal(
      selected(rules.filter((rule) => rule !== helperRule)),
      false,
      'prior trigger excluded helper-only changes'
    );
    assert.equal(
      selected(rules),
      true,
      `${helper} must run the drain controls`
    );
  }
});

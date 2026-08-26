const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot } = require('./workflow-config-test-helpers.js');

test('fork package smoke builds skip repository-secret steps', () => {
  const workflow = fs.readFileSync(
    path.join(
      repoRoot,
      '.github',
      'workflows',
      'external-internal-packages.yaml'
    ),
    'utf8'
  );

  assert.match(
    workflow,
    /if: >-\n {6}github\.event_name != 'pull_request' \|\|\n {6}github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
    'fork pull requests must skip the build that requires repository secrets'
  );
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  readWorkflowJobBlock,
  repoRoot,
} = require('./workflow-config-test-helpers.js');

const rootPackageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
);
const expectedBiomeVersion = rootPackageJson.devDependencies[
  '@biomejs/biome'
].replace(/^[^\d]*/u, '');
const expectedBiomePattern = expectedBiomeVersion.replaceAll('.', '\\.');
const releaseJob = readWorkflowJobBlock(
  'release-please.yaml',
  'release-please'
);

test('Release Please normalizes generated files before approving the PR', () => {
  const createIndex = releaseJob.indexOf('Create or update release PR');
  const formatIndex = releaseJob.indexOf(
    'Normalize generated release formatting'
  );
  const approveIndex = releaseJob.indexOf('Approve untouched release PR');

  assert.ok(createIndex >= 0);
  assert.ok(formatIndex > createIndex);
  assert.ok(approveIndex > formatIndex);
  assert.match(releaseJob, /ref: production/);
  assert.match(releaseJob, /fetch-depth: 0/);
  assert.match(
    releaseJob,
    /uses: actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7/
  );
});

test('generated formatting is path-scoped and race-safe', () => {
  const formatIndex = releaseJob.indexOf(
    'Normalize generated release formatting'
  );
  const formatStep = releaseJob.slice(
    formatIndex,
    releaseJob.indexOf('Delete tagged overflow release notes')
  );

  assert.match(
    formatStep,
    new RegExp(
      `npx --yes @biomejs/biome@${expectedBiomePattern} format --write`
    )
  );
  assert.match(
    formatStep,
    /git diff --name-only -z origin\/production\.\.\.HEAD/
  );
  assert.match(
    formatStep,
    /trap 'git switch --detach origin\/production >\/dev\/null' EXIT/
  );
  assert.match(formatStep, /git add -- "\$\{changed_files\[@\]\}"/);
  assert.doesNotMatch(formatStep, /git add --all|git add \./);
  assert.match(formatStep, /git commit --amend --no-edit/);
  assert.match(
    formatStep,
    /--force-with-lease="refs\/heads\/\$\{RELEASE_BRANCH\}:\$\{release_sha\}"/
  );
});

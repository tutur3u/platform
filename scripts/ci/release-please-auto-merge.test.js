const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { repoRoot } = require('./workflow-config-test-helpers.js');

const workflowName = 'release-please-auto-merge.yaml';
const workflowPath = path.join(repoRoot, '.github', 'workflows', workflowName);
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('release merge runs on a three-day schedule and can be triggered by hand', () => {
  assert.match(workflow, /^ {2}schedule:$/m);
  assert.match(
    workflow,
    /- cron: "0 6 \*\/3 \* \*"/,
    'the release merge must run every third day'
  );
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
});

test('release merge never races another run', () => {
  assert.match(
    workflow,
    /^concurrency:\n {2}group: release-please-auto-merge$/m
  );
  assert.match(
    workflow,
    /cancel-in-progress: false/,
    'cancelling a half-finished release merge would leave main and production split'
  );
});

test('release merge reuses the local scripts instead of reimplementing them', () => {
  // The whole point of this workflow: the merge rules live in one place, and
  // the scheduled path exercises the same code the release flow runs locally.
  assert.match(workflow, /^ {8}run: bun git-release-please$/m);
  assert.match(workflow, /^ {8}run: bun git-sync$/m);
  assert.match(workflow, /^ {8}run: bun git-sync --no-push$/m);
});

test('release merge skips cleanly when there is nothing to merge', () => {
  assert.match(workflow, /should_merge=false/);
  assert.match(
    workflow,
    /merge-base --is-ancestor "\$\{branch\}" origin\/main/,
    'an already-merged release branch must not be merged twice'
  );
  assert.match(
    workflow,
    /if: steps\.plan\.outputs\.should_merge == 'true'/,
    'the merge steps must be gated on the plan'
  );
});

test('release merge prefers the production release branch and ignores overflow notes', () => {
  assert.match(workflow, /origin\/release-please--branches--production/);
  assert.match(
    workflow,
    /grep -v -- '--release-notes\$'/,
    'the overflow release-notes branch is not a merge candidate'
  );
});

test('release merge ends with main and production on the same commit', () => {
  assert.match(workflow, /needs_sync=true/);
  assert.match(
    workflow,
    /- name: Verify main and production point at the same commit/
  );
  assert.match(
    workflow,
    /main \(\$\{main_sha\}\) and production \(\$\{prod_sha\}\) are not aligned/,
    'a split between main and production must fail the run, not pass quietly'
  );
});

test('release merge holds write access at the job, not the workflow', () => {
  const jobsIndex = workflow.indexOf('\njobs:');
  const preamble = workflow.slice(0, jobsIndex);

  assert.match(preamble, /^permissions: \{\}$/m);
  assert.match(workflow, /^ {4}permissions:\n {6}contents: write$/m);
  assert.doesNotMatch(
    preamble,
    /contents: write/,
    'write access must not be granted to every job in the file'
  );
});

test('release merge checks out main with push-capable credentials and full history', () => {
  assert.match(workflow, /ref: main/);
  assert.match(
    workflow,
    /fetch-depth: 0/,
    'the merge needs real history, not a shallow clone'
  );
  assert.match(
    workflow,
    /token: \$\{\{ secrets\.RELEASE_PLEASE_TOKEN \|\| github\.token \}\}/
  );
});

test('release merge follows the repo CI tooling conventions', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  );
  const bunVersion = packageJson.packageManager.replace(/^bun@/, '');

  assert.doesNotMatch(workflow, /oven-sh\/setup-bun/);
  assert.doesNotMatch(workflow, /^\s*run:\s*bun (?:install|setup)\b/m);
  assert.doesNotMatch(workflow, /^\s*run:\s*bunx\b/m);
  assert.match(
    workflow,
    new RegExp(`bun-version: ${bunVersion.replaceAll('.', '\\.')}`)
  );
  assert.match(
    workflow,
    /run: bash scripts\/ci\/run-with-backoff\.sh bun install --frozen-lockfile/
  );
  assert.ok(
    workflow.indexOf('actions/checkout') <
      workflow.indexOf('./.github/actions/setup-bun-with-retry'),
    'the repo must be checked out before the local Bun setup action runs'
  );
});

test('release merge keeps ref names out of inline shell', () => {
  const summaryStepIndex = workflow.indexOf('- name: Write run summary');
  const summaryStep = workflow.slice(summaryStepIndex);

  assert.match(
    summaryStep,
    /MERGED_BRANCH: \$\{\{ steps\.plan\.outputs\.branch \}\}/
  );
  assert.doesNotMatch(
    summaryStep,
    /run: \|[\s\S]*\$\{\{ steps\.plan\.outputs\.branch \}\}/,
    'ref names must reach the script through the environment'
  );
});

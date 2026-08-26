const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { repoRoot } = require('./workflow-config-test-helpers.js');

const workflowName = 'release-please-auto-merge.yaml';
const workflowPath = path.join(repoRoot, '.github', 'workflows', workflowName);
const workflow = fs.readFileSync(workflowPath, 'utf8');
const releasePleaseWorkflow = fs.readFileSync(
  path.join(repoRoot, '.github', 'workflows', 'release-please.yaml'),
  'utf8'
);

test('release merge runs daily at 7 AM Vietnam time and can be triggered by hand', () => {
  assert.match(workflow, /^ {2}schedule:$/m);
  assert.match(
    workflow,
    /- cron: "0 0 \* \* \*"/,
    'the release merge must run daily at 00:00 UTC (07:00 in Vietnam)'
  );
  assert.match(workflow, /07:00 in Vietnam, UTC\+7/);
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
});

test('release merge never races release generation or another merge run', () => {
  assert.match(
    workflow,
    /^concurrency:\n {2}group: release-please-production$/m
  );
  assert.match(
    releasePleaseWorkflow,
    /^concurrency:\n {2}group: release-please-production$/m,
    'release generation must hold the same lock as release merging'
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

test('release merge builds the dist-only packages before running bun check', () => {
  // The turbo `test` task depends on `transit`, not `^build`, so nothing else
  // in the run produces `dist/**`. Locally `bun setup` covers this; CI has to
  // do it explicitly or every suite importing @tuturuuu/types,
  // @tuturuuu/supabase or @tuturuuu/internal-api dies on ERR_MODULE_NOT_FOUND.
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  );
  const setupFilters = [...packageJson.scripts.setup.matchAll(/-F (\S+)/g)].map(
    ([, name]) => name
  );

  assert.ok(
    setupFilters.length > 0,
    'the setup script must still build packages with -F filters'
  );

  const buildIndex = workflow.indexOf('- name: Build workspace setup');

  assert.ok(buildIndex !== -1, 'the workspace build step must exist');
  assert.ok(
    buildIndex < workflow.indexOf('- name: Merge release-please branch'),
    'the workspace must be built before bun check runs'
  );

  for (const filter of setupFilters) {
    assert.ok(
      workflow.includes(`--filter=${filter}`),
      `the workflow must build ${filter}, the same package bun setup builds`
    );
  }
});

test('release merge installs the Flutter toolchain bun check:mobile needs', () => {
  // Release-please bumps apps/mobile/pubspec.yaml on every release, so
  // touchesMobile() in scripts/git-release-please.js is always true and the
  // merge runs dart-format, flutter-analyze and flutter-test. A runner with no
  // Flutter exits 127 on all three (run 30891619937).
  const flutterIndex = workflow.indexOf('- name: Setup Flutter');

  assert.ok(flutterIndex !== -1, 'the Flutter toolchain must be installed');
  assert.ok(
    flutterIndex < workflow.indexOf('- name: Merge release-please branch'),
    'Flutter must be installed before bun check:mobile runs'
  );
  assert.match(
    workflow,
    /- name: Install mobile dependencies\n {8}if: steps\.plan\.outputs\.should_merge == 'true'\n {8}working-directory: apps\/mobile\n {8}run: flutter pub get/,
    'flutter-analyze and flutter-test need pub get (and the gen-l10n it runs)'
  );
});

test('release merge pins the same Flutter version as the mobile workflow', () => {
  const mobileWorkflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'mobile.yaml'),
    'utf8'
  );
  const mobileVersion = mobileWorkflow.match(/flutter-version: "([^"]+)"/)?.[1];

  assert.ok(mobileVersion, 'mobile.yaml must pin a Flutter version');
  assert.match(
    workflow,
    new RegExp(`flutter-version: "${mobileVersion.replaceAll('.', '\\.')}"`),
    'the release merge must check mobile with the version mobile CI uses'
  );
});

test('release merge fails fast when it has no token that can push', () => {
  // main and production are covered by a ruleset whose only bypass actor is
  // OrganizationAdmin, so a run that falls back to github.token cannot push.
  // Finding that out after bun check has already run wastes ~40 minutes.
  const gateIndex = workflow.indexOf(
    '- name: Require a token that can push protected branches'
  );

  assert.ok(gateIndex !== -1, 'a run that cannot push must say so up front');
  assert.ok(
    gateIndex < workflow.indexOf('- name: Install dependencies'),
    'the token gate must run before the expensive steps'
  );
  assert.ok(
    gateIndex > workflow.indexOf('- name: Resolve work to do'),
    'a run with nothing to merge or sync must not need a token at all'
  );

  const gateStep = workflow.slice(
    gateIndex,
    workflow.indexOf('- name: Install dependencies')
  );

  assert.match(
    gateStep,
    /RELEASE_PLEASE_TOKEN: \$\{\{ secrets\.RELEASE_PLEASE_TOKEN \}\}/,
    'the secret must reach the script through the environment'
  );
  assert.match(
    gateStep,
    /inputs\.dry_run != true/,
    'a dry run pushes nothing, so it must not require the token'
  );
  assert.match(
    gateStep,
    /::error::RELEASE_PLEASE_TOKEN is not configured/,
    'the failure must name the secret to create'
  );
});

test('release merge deletes only the merged release branch', () => {
  const cleanupIndex = workflow.indexOf(
    '- name: Delete merged release-please branch'
  );

  assert.ok(
    cleanupIndex !== -1,
    'the merged release branches must be cleaned up'
  );

  const cleanupStep = workflow.slice(
    cleanupIndex,
    workflow.indexOf('- name: Write run summary')
  );

  assert.match(
    cleanupStep,
    /delete_remote_branch "\$\{branch\}"/,
    'the merged release branch must be deleted from origin'
  );
  assert.doesNotMatch(
    cleanupStep,
    /release-notes|autorelease: pending|delete_remote_branch "\$\{notes\}"/,
    'overflow notes remain live until Release Please has created the tags'
  );
  assert.ok(
    cleanupIndex >
      workflow.indexOf(
        '- name: Verify main and production point at the same commit'
      ),
    'branches may only be deleted after main and production are verified aligned'
  );
});

test('release merge treats an already-deleted branch as success', () => {
  // Pushing production closes the release PR and GitHub deletes the head
  // branch itself, moments after this step's fetch. Run 31070227736 failed on
  // exactly that: `cannot lock ref ... unable to resolve reference`. Checking
  // first cannot close the race, so the delete has to be tolerant instead.
  const cleanupStep = workflow.slice(
    workflow.indexOf('- name: Delete merged release-please branch'),
    workflow.indexOf('- name: Write run summary')
  );

  assert.match(
    cleanupStep,
    /git ls-remote --exit-code --heads origin "\$\{target\}"/,
    'a failed delete must be re-checked against origin rather than assumed fatal'
  );
  assert.match(
    cleanupStep,
    /::error::Could not delete origin\/\$\{target\}; it is still on origin\./,
    'a delete that failed while the branch still exists is a real error'
  );
  assert.match(
    cleanupStep,
    /was already deleted, most likely by the merged pull request/,
    'a branch that is already gone must not fail the run'
  );
});

test('release merge never deletes an unmerged release branch', () => {
  const cleanupStep = workflow.slice(
    workflow.indexOf('- name: Delete merged release-please branch'),
    workflow.indexOf('- name: Write run summary')
  );

  assert.match(
    cleanupStep,
    /merge-base --is-ancestor "origin\/\$\{branch\}" origin\/main/,
    'deleting a branch whose commits are not on main would lose the release'
  );
  assert.match(
    cleanupStep,
    /if: inputs\.dry_run != true/,
    'a dry run must not delete anything'
  );
  assert.doesNotMatch(
    cleanupStep,
    /run: \|[\s\S]*\$\{\{ steps\.plan\.outputs\.branch \}\}/,
    'ref names must reach the script through the environment'
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

// Release admission (release-relevant-ci.mjs) treats a green, executed main
// run of Type Check, Test or Oxc as proof of the whole tree at that commit.
// The CI planner (ci-plan.mjs) may narrow or skip work on pull requests; these
// checks keep main pushes whole-tree, so a narrowed main run can never stand in
// for an app's slice. A skipped run fails runExecuted, so skips stay safe.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { selectorOutput } from './ci-plan.mjs';
import { EQUIVALENT_WORKFLOWS } from './release-relevant-ci.mjs';

const workflow = (file) =>
  readFileSync(
    new URL(`../../.github/workflows/${file}`, import.meta.url),
    'utf8'
  );
const FULL = '--filter=!@tuturuuu/tanstack-web';
const mainPush = { EVENT_NAME: 'push', REF: 'refs/heads/main' };

test('equivalence covers exactly the whole-tree workflows fenced here', () => {
  assert.deepEqual([...EQUIVALENT_WORKFLOWS].sort(), [
    'oxc-check.yaml',
    'turbo-unit-tests.yaml',
    'type-check.yaml',
  ]);
});

test('main pushes type-check the full tree whatever the plan narrows', () => {
  const narrowed = {
    version: 1,
    uncertain: false,
    reason: 'affected',
    typecheck: { run: false, narrow: true, filters: '--filter=@tuturuuu/meet' },
  };
  const selected = selectorOutput(narrowed, 'typecheck', mainPush);
  assert.equal(selected.run, true);
  assert.equal(selected.narrow, false);
  assert.equal(selected.filters, FULL);
  const source = workflow('type-check.yaml');
  // Both Type Check jobs pin the full filter on main pushes.
  const pinned = source.match(
    /TYPECHECK_FILTERS: "\$\{\{ \(github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\) && '--filter=!@tuturuuu\/tanstack-web' \|\|/gu
  );
  assert.equal(pinned?.length, 2);
});

test('unit shards and Oxc take no planner filter', () => {
  const tests = workflow('turbo-unit-tests.yaml');
  const shardCommands = tests.match(
    /command: node scripts\/ci\/run-test-shard\.js .*/gu
  );
  assert.ok(shardCommands?.length >= 2);
  for (const command of shardCommands)
    assert.equal(
      command,
      'command: node scripts/ci/run-test-shard.js ${{ matrix.shard }} 4 --coverage'
    );
  const shardRunner = readFileSync(
    new URL('./run-test-shard.js', import.meta.url),
    'utf8'
  );
  assert.match(
    shardRunner,
    /planShards\(discoverPackages\(root\), Number\(total\)\)/u
  );
  const oxc = workflow('oxc-check.yaml');
  assert.match(oxc, /oxfmt@[\d.]+ --check \. 2>&1/u);
  assert.match(
    oxc,
    /oxlint@[\d.]+ --deny-warnings (?:--threads \d+ )?\. 2>&1/u
  );
});

test('planner outputs other than run reach these workflows only main-pinned', () => {
  for (const file of EQUIVALENT_WORKFLOWS) {
    for (const line of workflow(file).split('\n')) {
      const uses = [...line.matchAll(/needs\.plan\.outputs\.([a-z_]+)/gu)].map(
        ([, name]) => name
      );
      if (uses.every((name) => name === 'run')) continue;
      // Any narrowing output sits behind the main-push full-filter pin.
      assert.match(
        line,
        /TYPECHECK_FILTERS: "\$\{\{ \(github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\) && '--filter=!@tuturuuu\/tanstack-web' \|\|/u,
        `${file}: ${line.trim()}`
      );
    }
  }
});

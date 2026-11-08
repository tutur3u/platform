import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fullSprintFixtures, taskBoardContractFixtures } from './task-board-contract-profile.mjs';

const repositoryRoot = process.cwd();
const barrier = 'apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/sprints/_lib.ts';
const barrierTest = barrier.replace('_lib.ts', 'release-barrier.test.ts');
const files = [
  ...fullSprintFixtures.map((file) => `apps/database/supabase/tests/${file}`),
  'apps/database/supabase/tests/task-board-retained-cycles.sql',
  'apps/database/supabase/tests/task-cycle-workspace-guard.sql',
  'apps/database/supabase/migrations/20261105223308_assign_task_cycle_legacy_schema.sql',
  'apps/database/supabase/migrations/20261029050300_guard_task_cycle_task_workspace.sql',
];
const readSource = (file) => readFileSync(resolve(repositoryRoot, file));
const retained = (overrides = {}) => taskBoardContractFixtures({
  args: ['--profile=retained-workspace-cycles'], trackedFiles: files, readSource, ...overrides,
});

test('default retains all full sprint and ticket fixtures', () => {
  assert.deepEqual(taskBoardContractFixtures({ args: [] }), [
    'task-board-sprints.sql', 'task-board-sprint-transitions.sql',
    'task-board-sprint-horizon.sql', 'task-project-ticket-keys.sql',
  ]);
});
test('explicit retained profile covers cycles, guards and unchanged ticket contract', () => {
  assert.deepEqual(retained(), ['task-board-retained-cycles.sql', 'task-cycle-workspace-guard.sql', 'task-project-ticket-keys.sql']);
});
test('unknown or additional arguments fail closed', () => {
  for (const args of [['--profile=retained'], ['--profile=retained-workspace-cycles', '--skip']]) {
    assert.throws(() => taskBoardContractFixtures({ args }), /Unknown/);
  }
});
test('release flag opening is rejected before database setup', () => {
  assert.throws(() => retained({ readSource: (file) => file === barrier
    ? readSource(file).toString().replace('BOARD_CYCLES_RELEASE_ENABLED = false', 'BOARD_CYCLES_RELEASE_ENABLED = true')
    : readSource(file) }), /release barrier changed/);
});
test('removing source barrier checks is rejected', () => {
  assert.throws(() => retained({ readSource: (file) => file === barrier
    ? readSource(file).toString().replace("if (!BOARD_CYCLES_RELEASE_ENABLED && level !== 'view')", 'if (false)')
    : readSource(file) }), /release barrier changed/);
});
test('weakening the release-barrier negative tests is rejected', () => {
  assert.throws(() => retained({ readSource: (file) => file === barrierTest
    ? readSource(file).toString().replace('expect(mocks.rpc).not.toHaveBeenCalled();', '')
    : readSource(file) }), /release barrier changed/);
});
test('each held sprint forward or rollback version is rejected', () => {
  for (const version of ['20261101100000', '20261101100010', '20261101100020', '20261101100030', '20261105082000', '20261105082010']) {
    for (const directory of ['supabase/migrations', 'rollbacks']) {
      assert.throws(() => retained({ trackedFiles: [...files, `apps/database/${directory}/${version}_fixture.sql`] }), /held sprint/);
    }
  }
});
test('missing contract dependency or original future fixture is rejected', () => {
  for (const file of files) {
    assert.throws(() => retained({ trackedFiles: files.filter((entry) => entry !== file) }), /Missing contract source/);
  }
});

test('tracked contract files must also be readable before database setup', () => {
  for (const unavailable of files) {
    assert.throws(() => retained({
      readSource: (file) => {
        if (file === unavailable) {
          throw Object.assign(new Error(`Unreadable contract source: ${file}`), { code: 'ENOENT' });
        }
        return readSource(file);
      },
    }), /Unreadable contract source/);
  }
});

import { createHash } from 'node:crypto';

export const fullSprintFixtures = [
  'task-board-sprints.sql',
  'task-board-sprint-transitions.sql',
  'task-board-sprint-horizon.sql',
  'task-project-ticket-keys.sql',
];

const retainedBarrierSources = {
  "apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/sprints/_lib.ts": "7d06cbe344c1f84ca3a5bfc19464c8e811474debf702ddc048ece9e27fc830e9",
  "apps/tasks/src/app/api/v1/workspaces/[wsId]/task-boards/[boardId]/sprints/release-barrier.test.ts": "8977c1f6671a8504918d803c4a91777ff944bcdac0951d449aae6533a075e5c7"
};
const heldSprintVersions = [
  '20261101100000', '20261101100010', '20261101100020',
  '20261101100030', '20261105082000', '20261105082010',
];

export function taskBoardContractFixtures({ args, trackedFiles, readSource }) {
  if (args.length === 0) return [...fullSprintFixtures];
  if (args.length !== 1 || args[0] !== '--profile=retained-workspace-cycles') {
    throw new Error('Unknown task-board database contract profile');
  }
  for (const [file, expected] of Object.entries(retainedBarrierSources)) {
    const actual = createHash('sha256').update(readSource(file)).digest('hex');
    if (actual !== expected) {
      throw new Error(`Retained board-cycle release barrier changed: ${file}`);
    }
  }
  if (trackedFiles.some((file) =>
    /\/(migrations|rollbacks)\//.test(file) &&
    heldSprintVersions.some((version) => file.split('/').at(-1).startsWith(version))
  )) {
    throw new Error('Retained profile contains a held sprint migration or rollback');
  }
  const fixtures = [
    'task-board-retained-cycles.sql',
    'task-cycle-workspace-guard.sql',
    'task-project-ticket-keys.sql',
  ];
  const required = [
    ...fullSprintFixtures.map((file) => `apps/database/supabase/tests/${file}`),
    ...fixtures.map((file) => `apps/database/supabase/tests/${file}`),
    'apps/database/supabase/migrations/20261105223308_assign_task_cycle_legacy_schema.sql',
    'apps/database/supabase/migrations/20261029050300_guard_task_cycle_task_workspace.sql',
  ];
  for (const file of required) {
    if (!trackedFiles.includes(file)) throw new Error(`Missing contract source: ${file}`);
    readSource(file);
  }
  return fixtures;
}

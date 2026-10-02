import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import planner from './e2e-result-plan.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

test('invite account-shape E2E has an isolated matrix runner', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'e2e-tests.yaml'),
    'utf8'
  );

  const matrix = planner.DEFAULT_MATRIX;
  assert.match(workflow, /fromJSON\(needs\.relevance\.outputs\.matrix\)/u);
  for (const suite of [
    'workspace-invite-api',
    'workspace-invite-contacts',
    'workspace-invite-finance',
    'workspace-invite-mail',
    'workspace-invite-tasks',
  ]) {
    assert.ok(
      matrix.some((entry) => entry.label === suite && entry.mode === suite)
    );
  }
  const shards = matrix.filter((entry) => entry.mode === 'shard');
  assert.deepEqual(
    shards.map((entry) => entry.shard),
    [1, 2, 3, 4]
  );
  assert.ok(shards.every((entry) => entry.total_shards === 4));
  assert.match(
    workflow,
    /--grep-invert "workspace invitation\|Workspace invitation"/u,
    'the general shards must exclude both dedicated workspace-invite suites'
  );
  for (const spec of [
    'workspace-invitations.noauth.spec.ts',
    'workspace-invite-cross-app-access.noauth.spec.ts',
    'workspace-invite-finance-access.noauth.spec.ts',
    'workspace-invite-mail-access.noauth.spec.ts',
    'workspace-invite-tasks-access.noauth.spec.ts',
    'workspace-invite-account-shapes.noauth.spec.ts',
  ]) {
    assert.ok(
      matrix.some((entry) => entry.spec === spec),
      `the dedicated matrix must register ${spec}`
    );
  }
  assert.ok(
    workflow.includes(
      ['bun test:e2e -- "e2e/$', '{{ matrix.spec }}', '" --reporter=line'].join(
        ''
      )
    ),
    'the dedicated runner must execute its selected full spec with readable diagnostics'
  );
  assert.match(
    workflow,
    /DOCKER_WEB_COMPOSE_PROJECT_NAME: ttr-e2e-\$\{\{ github\.run_id \}\}-\$\{\{ matrix\.id \}\}/u,
    'every matrix entry must use an isolated Docker Compose project'
  );
});

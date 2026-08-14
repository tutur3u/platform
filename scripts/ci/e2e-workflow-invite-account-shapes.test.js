import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

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

  assert.match(workflow, /label: invite-account-shapes/u);
  assert.match(workflow, /mode: invite-account-shapes/u);
  assert.match(
    workflow,
    /--grep-invert "workspace invitation account-shape resilience"/u,
    'the general shards must exclude the dedicated account-shape suite'
  );
  assert.match(
    workflow,
    /bun test:e2e -- e2e\/workspace-invite-account-shapes\.noauth\.spec\.ts --reporter=line/u,
    'the dedicated runner must execute the full account-shape spec with readable diagnostics'
  );
  assert.match(
    workflow,
    /DOCKER_WEB_COMPOSE_PROJECT_NAME: ttr-e2e-\$\{\{ github\.run_id \}\}-\$\{\{ matrix\.id \}\}/u,
    'every matrix entry must use an isolated Docker Compose project'
  );
});

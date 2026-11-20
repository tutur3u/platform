import assert from 'node:assert/strict';
import test from 'node:test';
import { decide } from './affected-gate.mjs';
import {
  SECURITY_WORKFLOWS,
  fileSelectsWorkflow,
  loadPullRequestWorkflows,
  parsePullRequestFilters,
  runsAvoided,
  workflowsForChanges,
} from './pr-blast-radius.mjs';

const inventory = loadPullRequestWorkflows();
const CALENDAR_FILE = 'apps/calendar/src/app/page.tsx';
const CALENDAR_STARTS = [
  'app-builds-affected.yaml',
  'calendar-cloudflare.yaml',
  'mail-calendar-tasks-builds.yaml',
  'pr-checks.yaml',
  'security-checks.yaml',
  'turbo-unit-tests.yaml',
  'type-check.yaml',
];

test('a flow path list and a block path list select the same file', () => {
  const flow = parsePullRequestFilters(`on:
  pull_request:
    paths:
      [
        'apps/calendar/**',
        '!**/*.md',
      ]
`);
  const block = parsePullRequestFilters(`on:
  pull_request:
    paths:
      - 'apps/calendar/**'
      - '!**/*.md'
`);
  assert.deepEqual(flow, block);
  assert.equal(fileSelectsWorkflow(flow, CALENDAR_FILE), true);
  assert.equal(fileSelectsWorkflow(flow, 'apps/calendar/README.md'), false);
  assert.equal(
    fileSelectsWorkflow(flow, 'apps/finance/src/app/page.tsx'),
    false
  );
});

test('calendar-only page avoids 83 of 90 pull_request workflows', () => {
  const result = runsAvoided(inventory, [CALENDAR_FILE]);
  assert.equal(result.total, 90);
  assert.deepEqual(result.started, CALENDAR_STARTS);
  assert.equal(result.avoided, 83);
  for (const unrelated of [
    'ai-cloudflare.yaml',
    'finance-cloudflare.yaml',
    'pay-cloudflare.yaml',
    'teach-cloudflare.yaml',
  ])
    assert.equal(result.started.includes(unrelated), false, unrelated);
});

test('security workflows stay selected: Security Checks always, CodeQL for sensitive paths', () => {
  const started = workflowsForChanges(inventory, [CALENDAR_FILE]);
  const security = inventory.find(
    (item) => item.file === 'security-checks.yaml'
  );
  assert.deepEqual(
    security.paths.filter((pattern) => !pattern.startsWith('!')),
    []
  );
  assert.equal(started.includes('security-checks.yaml'), true);
  // A plain page change waits for the nightly CodeQL scan.
  assert.equal(started.includes('codeql.yml'), false);
  for (const file of [
    'apps/web/src/app/api/v1/workspaces/[wsId]/route.ts',
    'apps/database/supabase/migrations/20990101000000_example.sql',
    'packages/auth/src/index.ts',
    'packages/internal-api/src/tasks.ts',
    'apps/calendar/src/proxy.ts',
    'packages/utils/src/session-token.ts',
    '.github/workflows/pr-checks.yaml',
  ])
    assert.equal(
      workflowsForChanges(inventory, [file]).includes('codeql.yml'),
      true,
      file
    );
  const prose = runsAvoided(inventory, ['README.md']);
  assert.equal(prose.started.includes('security-checks.yaml'), true);
  assert.equal(prose.started.includes('codeql.yml'), false);
});

const FULL_SUITE = [
  'app-builds-affected.yaml',
  'pr-checks.yaml',
  'security-checks.yaml',
  'turbo-unit-tests.yaml',
  'type-check.yaml',
];

test('lockfile, root config, workflow and test files keep the full suite', () => {
  for (const file of [
    'bun.lock',
    'package.json',
    'turbo.json',
    'tsconfig.json',
    '.github/workflows/pr-checks.yaml',
    'apps/calendar/src/app/page.test.tsx',
  ]) {
    const started = workflowsForChanges(inventory, [file]);
    for (const workflow of FULL_SUITE)
      assert.equal(
        started.includes(workflow),
        true,
        `${file} dropped ${workflow}`
      );
  }
  const closed = { paths: ['apps/calendar/**'], ignore: [] };
  assert.equal(fileSelectsWorkflow(closed, 'bun.lock'), false);
  assert.equal(
    fileSelectsWorkflow(closed, 'apps/calendar/src/app/page.test.tsx'),
    true
  );
});

test('a shared utils file still creates app runs the gate can skip', () => {
  const result = runsAvoided(inventory, [
    'packages/utils/src/internal-domains.ts',
  ]);
  assert.equal(result.started.includes('finance-cloudflare.yaml'), true);
  assert.ok(result.started.length > CALENDAR_STARTS.length);
  assert.equal(
    decide({
      eventName: 'pull_request',
      apps: 'finance',
      result: {
        mode: 'affected',
        apps: ['apps/calendar'],
        reason: 'app-local closure',
      },
    }).run,
    false
  );
});

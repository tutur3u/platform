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
  'codeql.yml',
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

test('calendar-only page avoids 76 of 84 pull_request workflows', () => {
  const result = runsAvoided(inventory, [CALENDAR_FILE]);
  assert.equal(result.total, 84);
  assert.deepEqual(result.started, CALENDAR_STARTS);
  assert.equal(result.avoided, 76);
  for (const unrelated of [
    'ai-cloudflare.yaml',
    'finance-cloudflare.yaml',
    'pay-cloudflare.yaml',
    'teach-cloudflare.yaml',
  ])
    assert.equal(result.started.includes(unrelated), false, unrelated);
});

test('security workflows stay selected for an app source file', () => {
  const started = workflowsForChanges(inventory, [CALENDAR_FILE]);
  for (const file of SECURITY_WORKFLOWS) {
    const workflow = inventory.find((item) => item.file === file);
    assert.ok(workflow, file);
    assert.deepEqual(
      workflow.paths.filter((pattern) => !pattern.startsWith('!')),
      []
    );
    assert.equal(started.includes(file), true, file);
  }
  const prose = runsAvoided(inventory, ['README.md']);
  assert.equal(prose.started.includes('security-checks.yaml'), true);
  assert.equal(prose.started.includes('codeql.yml'), false);
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

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  events,
  workflows,
} = require('./protected-workflow-concurrency-helpers.js');

test('CodeQL push and PR scans share one security-sensitive path list; the nightly scan is complete', () => {
  const { push, pull_request: pull } = events(workflows['codeql.yml']);
  assert.deepEqual(push.branches, ['main']);
  assert.ok(push.paths.length > 0);
  assert.deepEqual(push.paths, pull.paths);
  assert.equal(pull['paths-ignore'], undefined);
  for (const pattern of [
    'apps/database/**',
    'packages/auth*/**',
    'packages/internal-api/**',
    'packages/supabase/**',
    '**/app/api/**',
    '**/middleware.ts',
    '**/*.sql',
    '.github/workflows/**',
  ])
    assert.ok(push.paths.includes(pattern), pattern);
  // The nightly baseline is unfiltered: security-checks.yaml schedules the
  // reusable workflow, which has no path filter on workflow_call.
  const security = workflows['security-checks.yaml'];
  assert.ok(events(security).schedule.length > 0);
  assert.equal(security.jobs.codeql.uses, './.github/workflows/codeql.yml');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  lastGreenMainBase,
  SUPERSEDING_MAIN_WORKFLOWS,
  supersedesOnMain,
  topLevelWorkflowFile,
} from './main-supersession.mjs';

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const OTHER = 'c'.repeat(40);
const REPO = 'tutur3u/platform';
const env = (overrides = {}) => ({
  MAIN_SUPERSESSION_CHECK: 'true',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_REPOSITORY: REPO,
  GITHUB_SHA: HEAD,
  GITHUB_TOKEN: 'token',
  GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/ai-cloudflare.yaml@refs/heads/main`,
  ...overrides,
});
const run = (overrides = {}) => ({
  id: 1,
  conclusion: 'success',
  event: 'push',
  head_branch: 'main',
  head_sha: OLD,
  head_repository: { full_name: REPO },
  ...overrides,
});
const answer =
  (runs, status = 200) =>
  async (url, init) => {
    answer.calls.push({ url, init });
    return {
      ok: status === 200,
      status,
      json: async () => ({ workflow_runs: runs }),
    };
  };
answer.calls = [];

test('the list names only existing workflow files and excludes per-SHA Test and Type Check', () => {
  assert.equal(
    SUPERSEDING_MAIN_WORKFLOWS.includes('turbo-unit-tests.yaml'),
    false
  );
  assert.equal(SUPERSEDING_MAIN_WORKFLOWS.includes('type-check.yaml'), false);
  assert.deepEqual([...SUPERSEDING_MAIN_WORKFLOWS].sort(), [
    ...SUPERSEDING_MAIN_WORKFLOWS,
  ]);
});

test('the top-level workflow comes from the caller ref, also in reusable jobs', () => {
  assert.equal(
    topLevelWorkflowFile(
      `${REPO}/.github/workflows/chat-cloudflare.yaml@refs/heads/main`
    ),
    'chat-cloudflare.yaml'
  );
  assert.equal(topLevelWorkflowFile(''), '');
});

test('no main push supersedes while the policy inventory is empty', () => {
  assert.deepEqual([...SUPERSEDING_MAIN_WORKFLOWS], []);
  assert.equal(supersedesOnMain(env()), false);
  // Scripts and tests inheriting a main push environment are unaffected.
  assert.equal(
    supersedesOnMain(env({ MAIN_SUPERSESSION_CHECK: undefined })),
    false
  );
  assert.equal(
    supersedesOnMain(env({ GITHUB_REF: 'refs/heads/production' })),
    false
  );
  assert.equal(
    supersedesOnMain(env({ GITHUB_EVENT_NAME: 'workflow_dispatch' })),
    false
  );
  assert.equal(
    supersedesOnMain(
      env({
        GITHUB_WORKFLOW_REF: `${REPO}/.github/workflows/oxc-check.yaml@refs/heads/main`,
      })
    ),
    false
  );
});

test('the base is the newest green main run that is an ancestor', async () => {
  answer.calls = [];
  const result = await lastGreenMainBase({
    env: env(),
    fetch: answer([
      run({ id: 9, head_sha: OTHER }),
      run({ id: 8, head_branch: 'release-candidate/x' }),
      run({ id: 7, event: 'pull_request' }),
      run({ id: 6, head_repository: { full_name: 'fork/platform' } }),
      run({ id: 5, conclusion: 'failure' }),
      run({ id: 4 }),
    ]),
    isAncestor: (_root, base) => base === OLD,
  });
  assert.deepEqual(result, { base: OLD, runId: 4 });
  assert.equal(answer.calls.length, 1);
  assert.match(
    answer.calls[0].url,
    /\/actions\/workflows\/ai-cloudflare\.yaml\/runs\?branch=main&status=success&per_page=20$/
  );
  assert.equal(answer.calls[0].init.headers.Authorization, 'Bearer token');
});

test('a manual main dispatch never counts as a validated base', async () => {
  const result = await lastGreenMainBase({
    env: env(),
    fetch: answer([run({ event: 'workflow_dispatch' })]),
    isAncestor: () => true,
  });
  assert.equal(result.base, null);
});

test('every unknown base fails open', async () => {
  const cases = [
    { env: env({ GITHUB_TOKEN: '' }) },
    { env: env({ GITHUB_SHA: 'short' }) },
    { env: env(), fetch: answer([], 403) },
    { env: env(), fetch: answer([]) },
    { env: env(), fetch: answer([run()]), isAncestor: () => false },
    {
      env: env(),
      fetch: async () => {
        throw new Error('offline');
      },
    },
    { env: env(), fetch: async () => ({ ok: true, json: async () => ({}) }) },
  ];
  for (const input of cases) {
    const result = await lastGreenMainBase({
      fetch: answer([run()]),
      isAncestor: () => true,
      ...input,
    });
    assert.equal(result.base, null);
    assert.ok(result.reason);
  }
});

test('ci-plan follows the supersession decision its workflow step passes', async () => {
  const { resolveBase } = await import('./ci-plan.mjs');
  const before = 'd'.repeat(40);
  const push = {
    EVENT_NAME: 'push',
    REF: 'refs/heads/main',
    BEFORE_SHA: before,
    MAIN_SUPERSESSION_CHECK: 'true',
  };
  assert.deepEqual(
    resolveBase({
      ...push,
      MAIN_SUPERSESSION_ACTIVE: 'true',
      MAIN_SUPERSESSION_BASE: OLD,
    }),
    { base: OLD }
  );
  // A superseding run without a known base, or an unknown decision, runs all.
  for (const extra of [
    { MAIN_SUPERSESSION_ACTIVE: 'true', MAIN_SUPERSESSION_BASE: '' },
    { MAIN_SUPERSESSION_ACTIVE: 'unknown' },
    {},
  ])
    assert.equal(resolveBase({ ...push, ...extra }).uncertain, true);
  // Non-superseding workflows, other refs and plain callers keep before..after.
  assert.deepEqual(
    resolveBase({ ...push, MAIN_SUPERSESSION_ACTIVE: 'false' }),
    { base: before }
  );
  assert.deepEqual(resolveBase({ ...push, REF: 'refs/heads/production' }), {
    base: before,
  });
  assert.deepEqual(
    resolveBase({
      EVENT_NAME: 'push',
      REF: 'refs/heads/main',
      BEFORE_SHA: before,
    }),
    { base: before }
  );
});

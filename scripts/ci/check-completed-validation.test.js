const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  completedValidationProof,
  main,
} = require('./check-completed-validation');

const sha = 'a'.repeat(40);
const input = {
  repository: 'example/repo',
  sha,
  event: 'push',
  ref: 'refs/heads/release-please--branches--production',
  workflow: 'turbo-unit-tests.yaml',
};
const run = {
  id: 7,
  run_attempt: 1,
  repository: { full_name: input.repository },
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
};
const unitNames = [
  ...Array.from({ length: 4 }, (_, i) => `Unit test shard (${i})`),
  'Unit Tests (24)',
];
function fixture({ candidate = run, jobs, current = candidate } = {}) {
  const calls = [];
  const result =
    jobs ??
    unitNames.map((name) => ({
      name,
      status: 'completed',
      conclusion: 'success',
    }));
  return {
    calls,
    readApi: async (url) => {
      calls.push(url);
      if (url.includes('/workflows/'))
        return { workflow_runs: [candidate], total_count: 1 };
      if (url.includes('/jobs?'))
        return { jobs: result, total_count: result.length };
      return current;
    },
  };
}

test('generated exact-SHA duplicate skips only after actual shard/aggregate proof', async () => {
  const api = fixture();
  assert.equal(await completedValidationProof({ ...input, ...api }), 7);
  assert.equal(api.calls.length, 3);
  assert.match(api.calls[1], /\/attempts\/1\/jobs/);
});

for (const ref of [
  'refs/heads/main',
  'refs/heads/production',
  'refs/heads/fix/example',
]) {
  test(`${ref} always runs independently without querying duplicate proof`, async () => {
    const api = fixture();
    assert.equal(
      await completedValidationProof({ ...input, ...api, ref }),
      null
    );
    assert.equal(api.calls.length, 0);
  });
}

for (const patch of [
  { head_sha: 'b'.repeat(40) },
  { head_branch: 'feature/example' },
  { event: 'pull_request' },
  { repository: { full_name: 'other/repo' } },
  { status: 'in_progress' },
  { conclusion: 'failure' },
  { conclusion: 'cancelled' },
  { conclusion: 'skipped' },
  { conclusion: 'neutral' },
  { run_attempt: 0 },
]) {
  test(`untrusted/incomplete candidate does not skip: ${JSON.stringify(patch)}`, async () => {
    assert.equal(
      await completedValidationProof({
        ...input,
        ...fixture({ candidate: { ...run, ...patch } }),
      }),
      null
    );
  });
}

for (const conclusion of ['cancelled', 'skipped', 'neutral', 'failure', null]) {
  test(`one ${conclusion} actual shard cannot justify success`, async () => {
    const jobs = unitNames.map((name, i) => ({
      name,
      status: 'completed',
      conclusion: i === 0 ? conclusion : 'success',
    }));
    assert.equal(
      await completedValidationProof({ ...input, ...fixture({ jobs }) }),
      null
    );
  });
}

test('missing/duplicate job or unfinished aggregate is not proof', async () => {
  const jobs = unitNames.map((name) => ({
    name,
    status: 'completed',
    conclusion: 'success',
  }));
  for (const invalid of [
    jobs.slice(1),
    [...jobs, jobs[0]],
    [...jobs.slice(0, -1), { ...jobs.at(-1), status: 'queued' }],
  ]) {
    assert.equal(
      await completedValidationProof({
        ...input,
        ...fixture({ jobs: invalid }),
      }),
      null
    );
  }
});

for (const patch of [
  { status: 'completed', conclusion: 'failure' },
  { status: 'queued', conclusion: null },
  { status: 'in_progress', conclusion: null },
]) {
  test(`newer canonical run vetoes older success: ${patch.status}/${patch.conclusion}`, async () => {
    for (const head_branch of ['main', 'production']) {
      const calls = [];
      assert.equal(
        await completedValidationProof({
          ...input,
          readApi: async (url) => {
            calls.push(url);
            return {
              // Deliberately oldest first: do not depend on API ordering.
              workflow_runs: [run, { ...run, id: 8, head_branch, ...patch }],
              total_count: 2,
            };
          },
        }),
        null
      );
      assert.equal(calls.length, 1);
      assert.doesNotMatch(calls[0], /status=completed/);
    }
  });
}

test('latest canonical jobs from either branch can veto the other success', async () => {
  const calls = [];
  assert.equal(
    await completedValidationProof({
      ...input,
      readApi: async (url) => {
        calls.push(url);
        if (url.includes('/workflows/'))
          return {
            workflow_runs: [run, { ...run, id: 8, head_branch: 'production' }],
            total_count: 2,
          };
        if (url.includes('/jobs?'))
          return {
            total_count: unitNames.length,
            jobs: unitNames.map((name) => ({
              name,
              status: 'completed',
              conclusion: url.includes('/runs/8/') ? 'failure' : 'success',
            })),
          };
        return run;
      },
    }),
    null
  );
  assert.equal(calls.length, 4);
});

test('truncated canonical history cannot prove the newest run', async () => {
  assert.equal(
    await completedValidationProof({
      ...input,
      readApi: async () => ({ workflow_runs: [run], total_count: 101 }),
    }),
    null
  );
});

test('rerun racing the job lookup invalidates previous success', async () => {
  for (const current of [
    { ...run, run_attempt: 2 },
    { ...run, status: 'queued' },
    { ...run, conclusion: 'failure' },
  ]) {
    assert.equal(
      await completedValidationProof({ ...input, ...fixture({ current }) }),
      null
    );
  }
});

test('Coverage and Biome require their own actual successful jobs', async () => {
  for (const [workflow, names] of [
    [
      'codecov.yaml',
      [
        ...Array.from({ length: 4 }, (_, i) => `Coverage shard (${i})`),
        'Run tests and collect coverage',
      ],
    ],
    ['biome-check.yaml', ['Biome Format Check', 'Biome Lint Check']],
  ]) {
    assert.equal(
      await completedValidationProof({ ...input, workflow, ...fixture() }),
      null
    );
    assert.equal(
      await completedValidationProof({
        ...input,
        workflow,
        ...fixture({
          candidate: { ...run, head_branch: 'production' },
          jobs: names.map((name) => ({
            name,
            status: 'completed',
            conclusion: 'success',
          })),
        }),
      }),
      7
    );
  }
});

test('unavailable proof fails open and logs no raw token/error data', async () => {
  // Unsupported events/inputs are also fail-open without touching the API.
  const api = fixture();
  assert.equal(
    await completedValidationProof({
      ...input,
      ...api,
      workflow: 'e2e-tests.yaml',
    }),
    null
  );
  assert.equal(api.calls.length, 0);
  // main catches fetch errors; a missing repository needs no network.
  assert.deepEqual(await main({}), { runChecks: true, sourceRun: null });
});

for (const workflow of [
  'codecov.yaml',
  'turbo-unit-tests.yaml',
  'biome-check.yaml',
]) {
  test(`${workflow} isolates immutable refs and gates validation on proof`, () => {
    const text = fs.readFileSync(
      path.join(__dirname, '../../.github/workflows', workflow),
      'utf8'
    );
    assert.match(text, /group:.*github\.workflow.*github\.ref.*github\.sha/);
    assert.match(
      text,
      /cancel-in-progress:.*github\.ref != 'refs\/heads\/main'.*github\.ref != 'refs\/heads\/production'.*!startsWith/
    );
    assert.match(text, /actions: read/);
    assert.match(
      text,
      /needs\.duplicate-validation\.result != 'success' \|\| needs\.duplicate-validation\.outputs\.run_checks != 'false'/
    );
    assert.doesNotMatch(text, /actions: write|\/cancel/);
  });
}

test('overall proof deadline fails open before the job deadline', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  let calls = 0;
  const result = await main(
    {
      GITHUB_REPOSITORY: input.repository,
      GITHUB_SHA: sha,
      GITHUB_REF: input.ref,
      GITHUB_EVENT_NAME: input.event,
      WORKFLOW_NAME: input.workflow,
      GITHUB_TOKEN: 'synthetic-secret',
    },
    {
      proofTimeoutMs: 20,
      fetchApi: async (_, { signal }) => {
        calls++;
        if (calls === 1)
          return {
            ok: true,
            json: async () => ({ workflow_runs: [run], total_count: 1 }),
          };
        return await new Promise((_, reject) => {
          const keepAlive = setTimeout(
            () => reject(new Error('mock stalled')),
            1000
          );
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(keepAlive);
              reject(new Error('private-provider-detail'));
            },
            { once: true }
          );
        });
      },
    }
  );
  assert.deepEqual(result, { runChecks: true, sourceRun: null });
  assert.equal(calls, 2);
  assert.deepEqual(warnings, [
    'Completed validation proof unavailable; running checks.',
  ]);
});

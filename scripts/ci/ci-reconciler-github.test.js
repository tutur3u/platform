import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGithub } from './ci-reconciler-github.js';

const sha = 'a'.repeat(40);
const controlSha = 'b'.repeat(40);
const source = {
  id: 10,
  workflow_id: 20,
  head_branch: 'main',
  head_sha: controlSha,
  run_attempt: 1,
  path: '.github/workflows/ci-reconciler.yaml',
  head_repository: { full_name: 'tutur3u/platform' },
};
const operation = {
  workflow: 'test.yaml',
  attempt: 1,
  plannedAt: '2026-11-17T12:00:00Z',
  status: 'planned',
};
const receipt = (kind = 'intent') => ({
  schema: 1,
  kind,
  repository: 'tutur3u/platform',
  branch: 'main',
  sha,
  producerRunId: 10,
  producerAttempt: 1,
  controlSha,
  operations: [{ ...operation }],
});
const artifact = (kind = 'intent') => ({
  id: kind === 'intent' ? 1 : 2,
  name: `ci-reconcile-${kind}-main-${sha}`,
  expired: false,
  size_in_bytes: 100,
  workflow_run: { id: 10, head_branch: 'main', head_sha: controlSha },
});
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });
const input = { branch: 'main', sha, excludeRunId: 99, workflowId: 20 };
const guard = (phase) => (error) =>
  error.code === 'CI_RECONCILER_GITHUB_GUARD' &&
  error.phase === phase &&
  error.message === `CI_RECONCILER_GITHUB_GUARD:${phase}`;
function fixture({
  changeArtifact,
  changeSource,
  changeReceipt,
  listing,
} = {}) {
  const calls = [];
  return {
    calls,
    github: createGithub({
      token: 'test-token',
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes('actions/runs/'))
          return json({ ...source, ...changeSource });
        const kind = url.includes('ci-reconcile-result-') ? 'result' : 'intent';
        return json(
          listing ?? {
            total_count: 1,
            artifacts: [{ ...artifact(kind), ...changeArtifact }],
          }
        );
      },
      decodeArtifact: async (item) => ({
        ...receipt(item.name.includes('-result-') ? 'result' : 'intent'),
        ...changeReceipt,
      }),
    }),
  };
}

test('fixed API and permitted GET/POST routes with 204 support', async () => {
  const calls = [];
  const github = createGithub({
    token: 'test-token',
    fetchImpl: async (...args) => {
      calls.push(args);
      return new Response(null, { status: 204 });
    },
  });
  for (const path of [
    'git/ref/heads/main',
    'git/ref/heads/production',
    'actions/runs?per_page=100',
  ]) {
    assert.equal(await github.request(path), null);
  }
  for (const path of [
    'actions/runs/42/rerun',
    'actions/workflows/test.yaml/dispatches',
  ]) {
    assert.equal(
      await github.request(path, { method: 'POST', body: { ref: 'main' } }),
      null
    );
  }
  assert.ok(
    calls.every(
      ([url, options]) =>
        url.startsWith('https://api.github.com/repos/tutur3u/platform/') &&
        options.redirect === 'error'
    )
  );
});

test('invalid methods, hosts, traversal, refs and write routes never reach fetch', async () => {
  let calls = 0;
  const github = createGithub({
    token: 'test-token',
    fetchImpl: async () => {
      calls++;
    },
  });
  for (const [path, method] of [
    ['https://evil.test/actions/runs', 'GET'],
    ['//evil.test/actions', 'GET'],
    ['actions/../issues', 'GET'],
    ['actions/%2e%2e/issues', 'GET'],
    ['git/ref/heads/other', 'GET'],
    ['issues', 'GET'],
    ['actions/runs/42/cancel', 'POST'],
    ['actions/runs/42/rerun?x=1', 'POST'],
    ['actions/workflows/../test.yaml/dispatches', 'POST'],
    ['actions/runs/42', 'DELETE'],
    ['actions/runs/0/rerun', 'POST'],
  ])
    await assert.rejects(github.request(path, { method }), guard('route'));
  assert.equal(calls, 0);
  for (const token of ['', undefined, '\nsecret'])
    assert.throws(() => createGithub({ token }), guard('token'));
});

test('HTTP errors and thrown secrets are sanitized and writes never retried', async () => {
  for (const fetchImpl of [
    async () => {
      throw new Error('SECRET https://private');
    },
    async () => new Response('SECRET', { status: 503 }),
  ]) {
    let count = 0;
    const github = createGithub({
      token: 'test-token',
      fetchImpl: (...args) => {
        count++;
        return fetchImpl(...args);
      },
    });
    await assert.rejects(
      github.request('actions/runs/42/rerun', { method: 'POST' }),
      (error) => guard(error.phase)(error) && !error.message.includes('SECRET')
    );
    assert.equal(count, 1);
  }
});

test('JSON type, malformed, truncated and oversized HTTP responses fail closed', async () => {
  const cases = [
    [new Response('{}'), 'response-type'],
    [
      new Response('{', { headers: { 'content-type': 'application/json' } }),
      'response-json',
    ],
    [
      new Response('{}', {
        headers: { 'content-type': 'application/json', 'content-length': '8' },
      }),
      'response-truncated',
    ],
    [
      new Response('{}', {
        headers: {
          'content-type': 'application/json',
          'content-length': '4194305',
        },
      }),
      'response-size',
    ],
    [
      new Response(' '.repeat(4194305), {
        headers: { 'content-type': 'application/json' },
      }),
      'response-size',
    ],
  ];
  for (const [response, phase] of cases) {
    const github = createGithub({
      token: 'test-token',
      fetchImpl: async () => response,
    });
    await assert.rejects(github.request('actions/runs'), guard(phase));
  }
});

test('valid intent and result receipts retain their producer identities', async () => {
  const { github, calls } = fixture();
  assert.deepEqual(await github.readReceipts(input), [
    receipt(),
    receipt('result'),
  ]);
  assert.equal(calls.length, 4);
  assert.ok(
    calls
      .filter((url) => url.includes('artifacts?'))
      .every((url) => url.endsWith('&per_page=100'))
  );
});

test('current producer excluded before source lookup or artifact decoding', async () => {
  const { github, calls } = fixture();
  assert.deepEqual(
    await github.readReceipts({ ...input, excludeRunId: 10 }),
    []
  );
  assert.equal(calls.length, 2);
});

test('artifact metadata, count and incomplete listings fail closed', async () => {
  for (const changeArtifact of [
    { expired: true },
    { size_in_bytes: 131073 },
    { size_in_bytes: 0 },
    { name: 'wrong' },
    { workflow_run: { id: 0 } },
  ]) {
    await assert.rejects(
      fixture({ changeArtifact }).github.readReceipts(input),
      guard('artifact')
    );
  }
  for (const listing of [
    { total_count: 37, artifacts: [] },
    { total_count: 1, artifacts: [] },
    { total_count: 0 },
    { total_count: 2, artifacts: [artifact(), artifact()] },
  ]) {
    await assert.rejects(fixture({ listing }).github.readReceipts(input));
  }
});

test('producer workflow, repository, path, branch and artifact head are fenced', async () => {
  for (const changeSource of [
    { workflow_id: 21 },
    { id: 11 },
    { head_branch: 'production' },
    { path: '.github/workflows/other.yaml' },
    { head_repository: { full_name: 'other/platform' } },
    { head_sha: 'c'.repeat(40) },
    { run_attempt: 0 },
  ]) {
    await assert.rejects(
      fixture({ changeSource }).github.readReceipts(input),
      guard('artifact-producer')
    );
  }
});

test('receipt identities, schemas, operation bounds and duplicates are rejected', async () => {
  for (const changeReceipt of [
    { schema: 2 },
    { repository: 'other/platform' },
    { branch: 'production' },
    { sha: controlSha },
    { kind: 'result' },
    { producerRunId: 11 },
    { producerAttempt: 2 },
    { controlSha: sha },
    { operations: Array.from({ length: 13 }, () => operation) },
  ]) {
    await assert.rejects(
      fixture({ changeReceipt }).github.readReceipts(input),
      guard('receipt-identity')
    );
  }
  await assert.rejects(
    fixture({
      changeReceipt: { operations: [operation, operation] },
    }).github.readReceipts(input),
    guard('receipt-duplicate')
  );
  for (const invalid of [
    { workflow: '../bad.yaml' },
    { attempt: 4 },
    { status: 'success' },
    { plannedAt: 'bad' },
    { runId: -1 },
    { baselineAttempt: 1 },
  ]) {
    await assert.rejects(
      fixture({
        changeReceipt: { operations: [{ ...operation, ...invalid }] },
      }).github.readReceipts(input),
      guard('receipt-operation')
    );
  }
});

test('default archive reader bounds commands and rejects extra archive entries', async () => {
  const invocations = [];
  const { calls } = fixture();
  const github = createGithub({
    token: 'test-token',
    fetchImpl: async (url) => {
      calls.push(url);
      return url.includes('/runs/')
        ? json(source)
        : json({ total_count: 1, artifacts: [artifact()] });
    },
    spawnImpl: (command, args, options) => {
      invocations.push({ command, args, options });
      return {
        status: 0,
        stdout: Buffer.from(
          command === 'gh' ? 'zip' : 'receipt.json\nother.json\n'
        ),
      };
    },
  });
  await assert.rejects(github.readReceipts(input), guard('artifact-decode'));
  assert.equal(invocations.length, 2);
  assert.equal(invocations[0].options.timeout, 10000);
  assert.equal(invocations[0].options.maxBuffer, 524288);
  assert.equal(invocations[0].options.env.GH_TOKEN, 'test-token');
  assert.ok(
    invocations.every(
      ({ args, options }) =>
        !args.includes('test-token') && options.shell === false
    )
  );
});

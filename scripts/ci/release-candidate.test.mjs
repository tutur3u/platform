import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  CandidateRefusal,
  DISPATCHED_WORKFLOWS,
  MAX_ACTIVE_CANDIDATES,
  MAX_CANDIDATE_REFS,
  OBSERVED_WORKFLOWS,
  REQUIRED_WORKFLOWS,
  candidateBranch,
  classifyRun,
  isEvidenceRun,
  parseCandidateRefs,
  planNomination,
  planPrune,
  planRecovery,
  renderSummary,
  summarize,
} from './release-candidate-core.mjs';
import { createGitHub, nominate, status } from './release-candidate.mjs';

const require = createRequire(import.meta.url);
const helpers = require('./protected-workflow-concurrency-helpers.js');

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const REPO_ID = 42;

function run(file, overrides = {}) {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 1e9),
    path: `.github/workflows/${file}`,
    head_sha: SHA,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    run_started_at: '2026-11-24T04:00:00Z',
    html_url: `https://github.com/tutur3u/platform/actions/runs/1`,
    repository: { id: REPO_ID },
    head_repository: { id: REPO_ID },
    ...overrides,
  };
}
const allGreen = () => REQUIRED_WORKFLOWS.map((file) => run(file));

test('candidate refs must name their own 40-hex SHA', () => {
  assert.deepEqual(
    parseCandidateRefs([
      { ref: `refs/heads/release-candidate/${SHA}`, object: { sha: SHA } },
      { ref: `refs/heads/release-candidate/${SHA}`, object: { sha: OTHER } },
      { ref: `refs/heads/release-candidate/${SHA}/x`, object: { sha: SHA } },
      {
        ref: `refs/heads/release-candidate/${'A'.repeat(40)}`,
        object: { sha: 'A'.repeat(40) },
      },
      { ref: `refs/heads/other/${OTHER}`, object: { sha: OTHER } },
      null,
    ]),
    [SHA]
  );
  assert.deepEqual(parseCandidateRefs({}), []);
  assert.throws(() => candidateBranch('main'), CandidateRefusal);
});

test('only main pushes and dispatches on the own candidate ref are evidence', () => {
  assert.equal(isEvidenceRun(run('i18n-check.yaml'), SHA, REPO_ID), true);
  const dispatched = {
    event: 'workflow_dispatch',
    head_branch: `release-candidate/${SHA}`,
  };
  assert.equal(
    isEvidenceRun(run('i18n-check.yaml', dispatched), SHA, REPO_ID),
    true
  );
  for (const bad of [
    { event: 'workflow_dispatch', head_branch: 'main' },
    { event: 'workflow_dispatch', head_branch: `release-candidate/${OTHER}` },
    { event: 'pull_request', head_branch: 'feature/x' },
    { event: 'push', head_branch: `release-candidate/${SHA}` },
    { head_sha: OTHER },
    { head_repository: { id: 7 } },
  ])
    assert.equal(
      isEvidenceRun(run('i18n-check.yaml', bad), SHA, REPO_ID),
      false
    );
});

test('classification and verdicts', () => {
  assert.equal(classifyRun({ status: 'in_progress' }), 'pending');
  assert.equal(
    classifyRun({ status: 'completed', conclusion: 'skipped' }),
    'success'
  );
  assert.equal(
    classifyRun({ status: 'completed', conclusion: 'cancelled' }),
    'cancelled'
  );
  assert.equal(
    classifyRun({ status: 'completed', conclusion: 'timed_out' }),
    'failed'
  );
  assert.equal(
    summarize({ sha: SHA, runs: allGreen(), repositoryId: REPO_ID }).verdict,
    'green'
  );
  const missing = allGreen().filter(
    (r) => !r.path.endsWith('cron-control-cloudflare.yaml')
  );
  assert.equal(
    summarize({ sha: SHA, runs: missing, repositoryId: REPO_ID }).verdict,
    'pending'
  );
  const red = [
    ...allGreen(),
    run('type-check.yaml', {
      conclusion: 'failure',
      run_started_at: '2026-11-24T05:00:00Z',
    }),
  ];
  // A green run of the same workflow outranks a newer red one.
  assert.equal(
    summarize({ sha: SHA, runs: red, repositoryId: REPO_ID }).verdict,
    'green'
  );
  const onlyRed = allGreen().map((r) =>
    r.path.endsWith('type-check.yaml') ? { ...r, conclusion: 'failure' } : r
  );
  assert.equal(
    summarize({ sha: SHA, runs: onlyRed, repositoryId: REPO_ID }).verdict,
    'red'
  );
});

test('recovery reruns a cancelled run once and dispatches missing candidates', () => {
  const runs = allGreen()
    .map((r) => {
      if (r.path.endsWith('i18n-check.yaml'))
        return { ...r, conclusion: 'cancelled', id: 11 };
      if (r.path.endsWith('codex-plugin.yaml'))
        return { ...r, conclusion: 'cancelled', id: 12, run_attempt: 2 };
      if (r.path.endsWith('type-check.yaml'))
        return { ...r, conclusion: 'cancelled', id: 13, run_attempt: 2 };
      return r;
    })
    .filter((r) => !r.path.endsWith('cron-control-cloudflare.yaml'));
  const plan = planRecovery(
    summarize({ sha: SHA, runs, repositoryId: REPO_ID })
  );
  assert.deepEqual(plan.rerun, [11]);
  assert.deepEqual(plan.dispatch.sort(), [
    'codex-plugin.yaml',
    'cron-control-cloudflare.yaml',
  ]);
});

test('nomination requires main ancestry and bounds active candidates', () => {
  assert.throws(
    () =>
      planNomination({ sha: SHA, inMain: false, existing: [], activeShas: [] }),
    /CANDIDATE_NOT_IN_MAIN/
  );
  const busy = Array.from({ length: MAX_ACTIVE_CANDIDATES }, (_, i) =>
    String(i).repeat(40)
  );
  assert.throws(
    () =>
      planNomination({
        sha: SHA,
        inMain: true,
        existing: busy,
        activeShas: busy,
      }),
    /CANDIDATE_LIMIT/
  );
  assert.deepEqual(
    planNomination({
      sha: SHA,
      inMain: true,
      existing: [SHA],
      activeShas: [SHA],
    }),
    { createRef: false }
  );
});

test('pruning keeps the newest three and drops week-old candidates', () => {
  const now = Date.parse('2026-11-24T00:00:00Z');
  const day = (d) => new Date(now - d * 86_400_000).toISOString();
  const candidates = ['1', '2', '3', '4', '5'].map((c, i) => ({
    sha: c.repeat(40),
    committedAt: day(i),
  }));
  candidates.push({ sha: '9'.repeat(40), committedAt: day(30) });
  assert.deepEqual(planPrune({ candidates, keep: '1'.repeat(40), now }), [
    '4'.repeat(40),
    '5'.repeat(40),
    '9'.repeat(40),
  ]);
  assert.deepEqual(
    planPrune({
      candidates: [{ sha: SHA, committedAt: day(30) }],
      keep: SHA,
      now,
    }),
    []
  );
});

test('the dispatched list covers every always-on main workflow a later push supersedes', () => {
  const shared = [];
  for (const [file, workflow] of Object.entries(helpers.workflows)) {
    if (!helpers.pushesMain(workflow) || helpers.mainExceptions[file]) continue;
    const push = helpers.events(workflow).push ?? {};
    if (push.paths || push['paths-ignore']) continue;
    const group = workflow.concurrency?.group;
    if (!group) continue;
    const first = helpers.render(
      group,
      helpers.context('refs/heads/main', 'first', 1)
    );
    const next = helpers.render(
      group,
      helpers.context('refs/heads/main', 'next', 2)
    );
    if (first === next) shared.push(file);
  }
  const forced = DISPATCHED_WORKFLOWS.filter(
    (file) => file !== 'cron-control-cloudflare.yaml'
  );
  assert.deepEqual(shared.sort(), forced);
  for (const file of OBSERVED_WORKFLOWS) {
    const workflow = helpers.workflows[file];
    // Oxc keeps its locks on jobs. A `queue: max` lock never drops a pending
    // run; every other group must be per SHA.
    const groups = [
      workflow.concurrency,
      ...Object.values(workflow.jobs).map((job) => job.concurrency),
    ]
      .filter((c) => c?.group && c.queue !== 'max')
      .map((c) => c.group);
    assert.ok(groups.length > 0, file);
    for (const group of groups)
      assert.notEqual(
        helpers.render(group, helpers.context('refs/heads/main', 'first', 1)),
        helpers.render(group, helpers.context('refs/heads/main', 'next', 2)),
        `${file} must keep a per-SHA main group`
      );
  }
});

test('dispatched candidate runs have their own non-cancelling groups', () => {
  const ref = `refs/heads/${candidateBranch(SHA)}`;
  for (const file of DISPATCHED_WORKFLOWS) {
    const workflow = helpers.workflows[file];
    assert.ok(
      Object.hasOwn(helpers.events(workflow), 'workflow_dispatch'),
      file
    );
    const c = workflow.concurrency;
    const dispatch = helpers.context(ref, SHA, 1, 'workflow_dispatch');
    const main = helpers.context('refs/heads/main', 'next', 2);
    assert.notEqual(
      helpers.render(c.group, dispatch),
      helpers.render(c.group, main),
      file
    );
    assert.notEqual(
      helpers.render(c['cancel-in-progress'], dispatch),
      true,
      file
    );
  }
});

test('the workflow only nominates from trusted main source', () => {
  const workflow = helpers.workflows['release-candidate.yaml'];
  assert.deepEqual(Object.keys(helpers.events(workflow)), [
    'workflow_dispatch',
  ]);
  const job = workflow.jobs.candidate;
  assert.match(job.if, /github\.ref == 'refs\/heads\/main'/);
  assert.deepEqual(job.permissions, { actions: 'write', contents: 'write' });
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
});

function fakeGitHub({ refs = [], runs = {}, inMain = true } = {}) {
  const calls = [];
  const state = { refs: [...refs] };
  return {
    calls,
    async repositoryId() {
      return REPO_ID;
    },
    async inMain() {
      return inMain;
    },
    async candidates() {
      return [...state.refs];
    },
    async committedAt(sha) {
      return sha === SHA ? '2026-11-24T00:00:00Z' : '2026-11-23T00:00:00Z';
    },
    async createRef(sha) {
      calls.push(['createRef', sha]);
      state.refs.push(sha);
    },
    async deleteRef(sha) {
      calls.push(['deleteRef', sha]);
    },
    async runs(sha) {
      return runs[sha] ?? [];
    },
    async dispatch(file, sha) {
      calls.push(['dispatch', file, sha]);
    },
    async rerun(id) {
      calls.push(['rerun', id]);
    },
  };
}

test('nominate creates the ref, dispatches each missing workflow once, and is idempotent', async () => {
  const github = fakeGitHub({ runs: { [SHA]: [run('type-check.yaml')] } });
  const result = await nominate({
    github,
    sha: SHA,
    now: Date.parse('2026-11-24T01:00:00Z'),
  });
  assert.equal(result.createdRef, true);
  assert.deepEqual(result.dispatched, [...DISPATCHED_WORKFLOWS]);
  const candidateRuns = DISPATCHED_WORKFLOWS.map((file) =>
    run(file, {
      event: 'workflow_dispatch',
      head_branch: candidateBranch(SHA),
      status: 'queued',
      conclusion: null,
    })
  );
  const again = fakeGitHub({ refs: [SHA], runs: { [SHA]: candidateRuns } });
  const second = await nominate({
    github: again,
    sha: SHA,
    now: Date.parse('2026-11-24T01:00:00Z'),
  });
  assert.equal(second.createdRef, false);
  assert.deepEqual(second.dispatched, []);
});

test('nominate refuses commits outside main before writing anything', async () => {
  const github = fakeGitHub({ inMain: false });
  await assert.rejects(nominate({ github, sha: SHA }), /CANDIDATE_NOT_IN_MAIN/);
  assert.deepEqual(github.calls, []);
});

test('status reruns once and never dispatches without the candidate ref', async () => {
  const runs = {
    [SHA]: [run('i18n-check.yaml', { conclusion: 'cancelled', id: 5 })],
  };
  const github = fakeGitHub({ runs });
  const { summary } = await status({ github, sha: SHA });
  assert.equal(summary.verdict, 'pending');
  assert.deepEqual(github.calls, [['rerun', 5]]);
  assert.match(renderSummary(summary), /i18n-check\.yaml \| cancelled/);
});

test('the GitHub client is pinned to this repository and checks ancestry via compare', async () => {
  assert.throws(
    () => createGitHub({ token: 't', repository: 'fork/platform' }),
    /CANDIDATE_REPOSITORY/
  );
  const seen = [];
  const github = createGitHub({
    token: 't',
    repository: 'tutur3u/platform',
    fetchImpl: async (url, init) => {
      seen.push([init.method, url]);
      return new Response(JSON.stringify({ status: 'ahead' }), { status: 200 });
    },
  });
  assert.equal(await github.inMain(SHA), false);
  assert.deepEqual(seen, [
    [
      'GET',
      `https://api.github.com/repos/tutur3u/platform/compare/main...${SHA}`,
    ],
  ]);
});

test('a SHA that is not a main ancestor is refused end to end, with no write', async () => {
  for (const compareStatus of ['ahead', 'diverged']) {
    const writes = [];
    const github = createGitHub({
      token: 't',
      repository: 'tutur3u/platform',
      fetchImpl: async (url, init) => {
        if (init.method !== 'GET') writes.push([init.method, url]);
        const body = url.includes('/compare/')
          ? { status: compareStatus }
          : url.includes('/matching-refs/')
            ? [
                {
                  ref: `refs/heads/release-candidate/${SHA}`,
                  object: { sha: SHA },
                },
              ]
            : { id: REPO_ID, workflow_runs: [] };
        return new Response(JSON.stringify(body), { status: 200 });
      },
    });
    // Even with an existing candidate ref, a branch-only commit is refused.
    await assert.rejects(
      nominate({ github, sha: SHA }),
      /CANDIDATE_NOT_IN_MAIN/
    );
    await assert.rejects(status({ github, sha: SHA }), /CANDIDATE_NOT_IN_MAIN/);
    assert.deepEqual(writes, [], compareStatus);
  }
});

test('too many candidate refs are refused before any per-candidate call', async () => {
  const many = Array.from({ length: MAX_CANDIDATE_REFS + 1 }, (_, i) =>
    i.toString(16).padStart(40, '0')
  );
  let runCalls = 0;
  const github = {
    ...fakeGitHub({ refs: many }),
    async runs() {
      runCalls += 1;
      return [];
    },
  };
  await assert.rejects(nominate({ github, sha: SHA }), /CANDIDATE_REF_LIMIT/);
  assert.equal(runCalls, 0);
});

test('the Admin panel judges the same required set', () => {
  const source = readFileSync(
    new URL(
      '../../apps/admin/src/lib/infrastructure/release-candidates.ts',
      import.meta.url
    ),
    'utf8'
  );
  const block =
    /REQUIRED_WORKFLOW_FILES = \[([^\]]*)\]/u.exec(source)?.[1] ?? '';
  const files = [...block.matchAll(/'([^']+)'/gu)].map((match) => match[1]);
  assert.deepEqual(files, [...REQUIRED_WORKFLOWS]);
});
